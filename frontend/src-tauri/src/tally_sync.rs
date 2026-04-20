use crate::db::AppState;
use crate::models::{UploadResult};
use quick_xml::events::Event;
use quick_xml::reader::Reader;
use rusqlite::params;
use std::collections::{HashMap, HashSet};
use tauri::State;

#[derive(Default, Debug)]
struct AggregatedInvoice {
    ledger_name: String,
    invoice_date: Option<String>,
    amount: f64,
}

#[tauri::command]
pub async fn fetch_tally_prime_local(state: State<'_, AppState>, port: u16) -> Result<UploadResult, String> {
    let url = format!("http://localhost:{}", port);
    let xml_request = r#"
        <ENVELOPE>
            <HEADER>
                <VERSION>1</VERSION>
                <TALLYREQUEST>Export</TALLYREQUEST>
                <TYPE>Data</TYPE>
                <ID>Bills Receivable</ID>
            </HEADER>
            <BODY>
                <DESC>
                    <STATICVARIABLES>
                        <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
                    </STATICVARIABLES>
                </DESC>
            </BODY>
        </ENVELOPE>
    "#;

    let client = reqwest::Client::new();
    let res = client.post(&url)
        .body(xml_request)
        .send()
        .await
        .map_err(|e| format!("Failed to connect to Tally Prime on {}: {}", url, e))?;

    let text = res.text().await.map_err(|e| e.to_string())?;

    process_tally_xml(state, text, "Tally_Prime_Sync.xml".to_string())
}

#[tauri::command]
pub fn process_tally_xml(state: State<'_, AppState>, xml_data: String, filename: String) -> Result<UploadResult, String> {
    let mut reader = Reader::from_str(&xml_data);
    let mut buf = Vec::new();

    let mut aggregated_invoices: HashMap<String, AggregatedInvoice> = HashMap::new();
    let mut current_tag = String::new();
    let mut current_party = String::new();
    let mut current_invoice_no = String::new();
    let mut current_date = String::new();
    let mut current_amount = 0.0;
    
    // Quick-XML parsing of VOUCHER or BILL details
    loop {
        match reader.read_event_into(&mut buf) {
            Err(e) => {
                log::warn!("XML Parsing warning: {}", e);
                break;
            }
            Ok(Event::Eof) => break,
            Ok(Event::Start(e)) => {
                current_tag = String::from_utf8_lossy(e.name().as_ref()).to_uppercase();
            }
            Ok(Event::Text(e)) => {
                let text = String::from_utf8_lossy(e.as_ref()).to_string().trim().to_string();
                
                if current_tag == "PARTYLEDGERNAME" || current_tag == "LEDGERNAME" || current_tag == "PARTYNAME" {
                    if !text.is_empty() {
                        current_party = text;
                    }
                } else if current_tag == "BILLNO" || current_tag == "VOUCHERNUMBER" || current_tag == "NAME" {
                    if !text.is_empty() {
                        current_invoice_no = text;
                    }
                } else if current_tag == "DATE" || current_tag == "BILLDATE" || current_tag == "VOUCHERDATE" {
                    // Try to format YYYYMMDD to YYYY-MM-DD
                    if text.len() == 8 && text.chars().all(char::is_numeric) {
                        current_date = format!("{}-{}-{}", &text[0..4], &text[4..6], &text[6..8]);
                    } else if !text.is_empty() {
                        // Sometimes dates are already clean
                        current_date = text;
                    }
                } else if current_tag == "OPENINGBALANCE" || current_tag == "AMOUNT" || current_tag == "CLOSINGBALANCE" {
                    let cleaned = text.replace(&[',', '₹', '$'][..], "").replace("Dr", "").replace("Cr", "").trim().to_string();
                    if let Ok(v) = cleaned.parse::<f64>() {
                        current_amount = v.abs();
                    }
                }
            }
            Ok(Event::End(e)) => {
                let tag = String::from_utf8_lossy(e.name().as_ref()).to_uppercase();
                if tag == "BILL" || tag == "VOUCHER" || tag == "BILLALLOCATIONS" {
                    if !current_party.is_empty() && !current_invoice_no.is_empty() {
                        // Aggregate it!
                        let entry = aggregated_invoices.entry(current_invoice_no.clone()).or_insert(AggregatedInvoice {
                            ledger_name: current_party.clone(),
                            invoice_date: None,
                            amount: 0.0,
                        });
                        entry.amount += current_amount;
                        if entry.invoice_date.is_none() && !current_date.is_empty() {
                            entry.invoice_date = Some(current_date.clone());
                        }
                    }
                    
                    // Reset some context but maybe not party if it's the same envelope
                    current_invoice_no.clear();
                    current_amount = 0.0;
                }
            }
            _ => (),
        }
        buf.clear();
    }

    // Now update database
    let mut db = state.db.lock().map_err(|e| e.to_string())?;
    
    let mut counters = UploadResult {
        debtors_created: 0,
        invoices_created: 0,
        invoices_updated: 0,
        invoices_reconciled: 0,
        errors: vec![],
    };
    
    let mut seen_invoices = HashSet::new();

    // Cache pre-fetching equivalents
    for (inv_no, data) in aggregated_invoices.iter() {
        // Upsert debtor
        let debtor_id: i64 = match db.query_row(
            "SELECT id FROM debtors WHERE tally_ledger_name = ?",
            params![data.ledger_name],
            |row| row.get(0),
        ) {
            Ok(id) => id,
            Err(_) => {
                db.execute("INSERT INTO debtors (tally_ledger_name) VALUES (?)", params![data.ledger_name]).unwrap_or_default();
                counters.debtors_created += 1;
                db.last_insert_rowid()
            }
        };

        // Upsert Invoice
        seen_invoices.insert(inv_no.clone());
        match db.query_row("SELECT invoice_no FROM invoices WHERE invoice_no = ?", params![inv_no], |row| row.get::<_, String>(0)) {
            Ok(_) => {
                // Exists => Update
                db.execute("UPDATE invoices SET pending_amount = ?, status = 'Open', invoice_date = COALESCE(?, invoice_date) WHERE invoice_no = ?", 
                     params![data.amount, data.invoice_date, inv_no]).unwrap_or_default();
                counters.invoices_updated += 1;
            }
            Err(_) => {
                // New
                db.execute("INSERT INTO invoices (invoice_no, debtor_id, invoice_date, pending_amount, status) VALUES (?, ?, ?, ?, 'Open')",
                     params![inv_no, debtor_id, data.invoice_date, data.amount]).unwrap_or_default();
                counters.invoices_created += 1;
            }
        }
    }

    // Auto-reconciliation
    let open_invoices: Vec<String> = db.prepare("SELECT invoice_no FROM invoices WHERE status = 'Open'")
        .map_err(|e| e.to_string())?
        .query_map([], |row| row.get(0))
        .map_err(|e| e.to_string())?
        .filter_map(Result::ok)
        .collect();

    for inv in open_invoices {
        if !seen_invoices.contains(&inv) {
            db.execute("UPDATE invoices SET status = 'Paid' WHERE invoice_no = ?", params![inv]).unwrap_or_default();
            counters.invoices_reconciled += 1;
        }
    }

    // Upload History
    db.execute("INSERT INTO upload_history (filename, file_size_bytes, debtors_created, invoices_created, invoices_updated, invoices_reconciled) VALUES (?, ?, ?, ?, ?, ?)",
        params![filename, xml_data.len() as i64, counters.debtors_created, counters.invoices_created, counters.invoices_updated, counters.invoices_reconciled]
    ).unwrap_or_default();

    Ok(counters)
}

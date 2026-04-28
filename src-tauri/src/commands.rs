use crate::db::AppState;
use crate::models::{Debtor, Invoice, UploadHistory, UploadResult};
use chrono::NaiveDate;
use rusqlite::params;
use tauri::State;

#[tauri::command]
pub fn get_debtors(state: State<'_, AppState>, missing_phone: Option<bool>) -> Result<Vec<Debtor>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let mut query = String::from("SELECT id, tally_ledger_name, contact_name, phone_number FROM debtors");
    
    if missing_phone == Some(true) {
        query.push_str(" WHERE phone_number IS NULL OR phone_number = ''");
    }
    query.push_str(" ORDER BY tally_ledger_name");

    let mut stmt = db.prepare(&query).map_err(|e| e.to_string())?;
    
    let debtors = stmt.query_map([], |row| {
        Ok(Debtor {
            id: row.get(0)?,
            tally_ledger_name: row.get(1)?,
            contact_name: row.get(2)?,
            phone_number: row.get(3)?,
        })
    }).map_err(|e| e.to_string())?
    .collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())?;

    Ok(debtors)
}

#[tauri::command]
pub fn update_debtor(state: State<'_, AppState>, debtor_id: i64, contact_name: Option<String>, phone_number: Option<String>) -> Result<Debtor, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    
    if contact_name.is_some() {
        db.execute("UPDATE debtors SET contact_name = ? WHERE id = ?", params![contact_name.as_ref(), debtor_id]).map_err(|e| e.to_string())?;
    }
    if phone_number.is_some() {
        db.execute("UPDATE debtors SET phone_number = ? WHERE id = ?", params![phone_number.as_ref(), debtor_id]).map_err(|e| e.to_string())?;
    }
    
    let mut stmt = db.prepare("SELECT id, tally_ledger_name, contact_name, phone_number FROM debtors WHERE id = ?").map_err(|e| e.to_string())?;
    let debtor = stmt.query_row(params![debtor_id], |row| {
        Ok(Debtor {
            id: row.get(0)?,
            tally_ledger_name: row.get(1)?,
            contact_name: row.get(2)?,
            phone_number: row.get(3)?,
        })
    }).map_err(|e| e.to_string())?;
    
    Ok(debtor)
}

#[tauri::command]
pub fn get_invoices(state: State<'_, AppState>, status: Option<String>) -> Result<Vec<Invoice>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let status_filter = status.unwrap_or_else(|| "Open".to_string());
    
    let mut query = String::from(
        "SELECT i.invoice_no, i.debtor_id, i.invoice_date, i.pending_amount, i.status, 
                i.manual_days_overdue, i.last_reminded_date, i.reminder_count,
                d.tally_ledger_name, d.contact_name, d.phone_number
         FROM invoices i
         LEFT JOIN debtors d ON i.debtor_id = d.id"
    );
    
    if status_filter.to_lowercase() != "all" {
        query.push_str(" WHERE i.status = ?1");
    }
    
    query.push_str(" ORDER BY i.invoice_date ASC");
    
    let mut stmt = db.prepare(&query).map_err(|e| e.to_string())?;

    let mut invoices: Vec<Invoice> = Vec::new();
    let today = chrono::Local::now().naive_local().date();

    let map_row = |row: &rusqlite::Row| -> rusqlite::Result<Invoice> {
        Ok(row_to_invoice(row)?)
    };

    if status_filter.to_lowercase() != "all" {
        let mut rows = stmt.query_map(params![status_filter], map_row).map_err(|e| e.to_string())?;
        for row in rows {
            if let Ok(mut inv) = row {
                let days_overdue = if let Some(manual) = inv.manual_days_overdue {
                    manual
                } else if let Some(date_str) = &inv.invoice_date {
                    if let Ok(inv_date) = NaiveDate::parse_from_str(date_str, "%Y-%m-%d") {
                        (today - inv_date).num_days()
                    } else {
                        0
                    }
                } else {
                    0
                };
                inv.days_overdue = days_overdue;
                if days_overdue >= 30 {
                    invoices.push(inv);
                }
            }
        }
    } else {
        let mut rows = stmt.query_map([], map_row).map_err(|e| e.to_string())?;
        for row in rows {
            if let Ok(mut inv) = row {
                let days_overdue = if let Some(manual) = inv.manual_days_overdue {
                    manual
                } else if let Some(date_str) = &inv.invoice_date {
                    if let Ok(inv_date) = NaiveDate::parse_from_str(date_str, "%Y-%m-%d") {
                        (today - inv_date).num_days()
                    } else {
                        0
                    }
                } else {
                    0
                };
                inv.days_overdue = days_overdue;
                if days_overdue >= 30 {
                    invoices.push(inv);
                }
            }
        }
    }
    
    invoices.sort_by(|a, b| b.days_overdue.cmp(&a.days_overdue));
    Ok(invoices)
}

fn row_to_invoice(row: &rusqlite::Row) -> rusqlite::Result<Invoice> {
    Ok(Invoice {
        invoice_no: row.get(0)?,
        debtor_id: row.get(1)?,
        invoice_date: row.get(2)?,
        pending_amount: row.get(3)?,
        status: row.get(4)?,
        manual_days_overdue: row.get(5)?,
        last_reminded_date: row.get(6)?,
        reminder_count: row.get(7)?,
        debtor_name: row.get(8)?,
        contact_name: row.get(9)?,
        phone_number: row.get(10)?,
        days_overdue: 0,
    })
}

#[tauri::command]
pub fn remind_invoice(state: State<'_, AppState>, invoice_no: String) -> Result<Invoice, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let now = chrono::Utc::now().to_rfc3339();
    
    db.execute(
        "UPDATE invoices SET reminder_count = reminder_count + 1, last_reminded_date = ? WHERE invoice_no = ?",
        params![now, invoice_no]
    ).map_err(|e| e.to_string())?;
    
    // Fetch it again just to be safe
    let mut stmt = db.prepare("SELECT i.invoice_no, i.debtor_id, i.invoice_date, i.pending_amount, i.status, 
                i.manual_days_overdue, i.last_reminded_date, i.reminder_count,
                d.tally_ledger_name, d.contact_name, d.phone_number
         FROM invoices i
         LEFT JOIN debtors d ON i.debtor_id = d.id WHERE i.invoice_no = ?").map_err(|e| e.to_string())?;
    
    let inv = stmt.query_row(params![invoice_no], |row| row_to_invoice(row)).map_err(|e| e.to_string())?;
    Ok(inv)
}

#[tauri::command]
pub fn mark_invoice_paid(state: State<'_, AppState>, invoice_no: String) -> Result<Invoice, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    
    db.execute("UPDATE invoices SET status = 'Paid' WHERE invoice_no = ?", params![invoice_no]).map_err(|e| e.to_string())?;
    
    let mut stmt = db.prepare("SELECT i.invoice_no, i.debtor_id, i.invoice_date, i.pending_amount, i.status, 
                i.manual_days_overdue, i.last_reminded_date, i.reminder_count,
                d.tally_ledger_name, d.contact_name, d.phone_number
         FROM invoices i
         LEFT JOIN debtors d ON i.debtor_id = d.id WHERE i.invoice_no = ?").map_err(|e| e.to_string())?;
    
    let inv = stmt.query_row(params![invoice_no], |row| row_to_invoice(row)).map_err(|e| e.to_string())?;
    Ok(inv)
}

#[tauri::command]
pub fn override_invoice_overdue(state: State<'_, AppState>, invoice_no: String, manual_days_overdue: Option<i64>) -> Result<Invoice, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    
    db.execute("UPDATE invoices SET manual_days_overdue = ? WHERE invoice_no = ?", params![manual_days_overdue, invoice_no]).map_err(|e| e.to_string())?;
    
    let mut stmt = db.prepare("SELECT i.invoice_no, i.debtor_id, i.invoice_date, i.pending_amount, i.status, 
                i.manual_days_overdue, i.last_reminded_date, i.reminder_count,
                d.tally_ledger_name, d.contact_name, d.phone_number
         FROM invoices i
         LEFT JOIN debtors d ON i.debtor_id = d.id WHERE i.invoice_no = ?").map_err(|e| e.to_string())?;
    
    let inv = stmt.query_row(params![invoice_no], |row| row_to_invoice(row)).map_err(|e| e.to_string())?;
    Ok(inv)
}

#[tauri::command]
pub fn get_uploads(state: State<'_, AppState>) -> Result<Vec<UploadHistory>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    
    let mut stmt = db.prepare("SELECT id, filename, uploaded_at, file_size_bytes, debtors_created, invoices_created, invoices_updated, invoices_reconciled FROM upload_history ORDER BY uploaded_at DESC").map_err(|e| e.to_string())?;
    
    let uploads = stmt.query_map([], |row| {
        Ok(UploadHistory {
            id: row.get(0)?,
            filename: row.get(1)?,
            uploaded_at: row.get(2)?,
            file_size_bytes: row.get(3)?,
            debtors_created: row.get(4)?,
            invoices_created: row.get(5)?,
            invoices_updated: row.get(6)?,
            invoices_reconciled: row.get(7)?,
        })
    }).map_err(|e| e.to_string())?
    .collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())?;
    
    Ok(uploads)
}

#[tauri::command]
pub fn delete_data(state: State<'_, AppState>) -> Result<String, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.execute("DELETE FROM invoices", []).map_err(|e| e.to_string())?;
    db.execute("DELETE FROM debtors", []).map_err(|e| e.to_string())?;
    db.execute("DELETE FROM upload_history", []).map_err(|e| e.to_string())?;
    Ok("Data deleted successfully".to_string())
}

#[tauri::command]
pub fn delete_upload(state: State<'_, AppState>, upload_id: i64) -> Result<String, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.execute("DELETE FROM upload_history WHERE id = ?", params![upload_id]).map_err(|e| e.to_string())?;
    Ok("Upload deleted successfully".to_string())
}

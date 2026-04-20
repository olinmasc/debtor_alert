use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Debug)]
pub struct Debtor {
    pub id: i64,
    pub tally_ledger_name: String,
    pub contact_name: Option<String>,
    pub phone_number: Option<String>,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct Invoice {
    pub invoice_no: String,
    pub debtor_id: i64,
    pub invoice_date: Option<String>,
    pub pending_amount: f64,
    pub status: String,
    pub manual_days_overdue: Option<i64>,
    pub last_reminded_date: Option<String>,
    pub reminder_count: i64,
    
    // Joined columns
    pub debtor_name: Option<String>,
    pub contact_name: Option<String>,
    pub phone_number: Option<String>,
    pub days_overdue: i64,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct UploadHistory {
    pub id: i64,
    pub filename: String,
    pub uploaded_at: Option<String>,
    pub file_size_bytes: Option<i64>,
    pub debtors_created: i64,
    pub invoices_created: i64,
    pub invoices_updated: i64,
    pub invoices_reconciled: i64,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct UploadResult {
    pub debtors_created: i64,
    pub invoices_created: i64,
    pub invoices_updated: i64,
    pub invoices_reconciled: i64,
    pub errors: Vec<String>,
}

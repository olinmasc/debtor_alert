use rusqlite::{Connection, Result};
use std::sync::Mutex;
use tauri::AppHandle;
use tauri::Manager;
use std::fs;
use std::path::PathBuf;

pub struct AppState {
    pub db: Mutex<Connection>,
}

pub fn init_db(app: &AppHandle) -> Result<Connection> {
    let app_dir = app.path().app_data_dir().unwrap_or_else(|_| PathBuf::from("."));
    fs::create_dir_all(&app_dir).unwrap_or(());
    
    let db_path = app_dir.join("debtor_alert.db");
    let conn = Connection::open(db_path)?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS debtors (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            tally_ledger_name TEXT UNIQUE NOT NULL,
            contact_name TEXT,
            phone_number TEXT
        )",
        [],
    )?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS invoices (
            invoice_no TEXT PRIMARY KEY,
            debtor_id INTEGER NOT NULL,
            invoice_date TEXT,
            pending_amount REAL NOT NULL DEFAULT 0,
            status TEXT NOT NULL DEFAULT 'Open',
            manual_days_overdue INTEGER,
            last_reminded_date TEXT,
            reminder_count INTEGER NOT NULL DEFAULT 0,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (debtor_id) REFERENCES debtors(id) ON DELETE CASCADE
        )",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS ix_invoices_debtor_status ON invoices (debtor_id, status)",
        [],
    )?;
    
    conn.execute(
        "CREATE TABLE IF NOT EXISTS upload_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            filename TEXT NOT NULL,
            uploaded_at TEXT DEFAULT CURRENT_TIMESTAMP,
            file_size_bytes INTEGER,
            debtors_created INTEGER NOT NULL DEFAULT 0,
            invoices_created INTEGER NOT NULL DEFAULT 0,
            invoices_updated INTEGER NOT NULL DEFAULT 0,
            invoices_reconciled INTEGER NOT NULL DEFAULT 0
        )",
        [],
    )?;

    Ok(conn)
}

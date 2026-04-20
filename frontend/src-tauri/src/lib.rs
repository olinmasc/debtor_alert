mod db;
mod models;
mod commands;
mod tally_sync;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      
      let conn = db::init_db(app.handle()).expect("Failed to initialize SQLite Database");
      app.manage(db::AppState { db: std::sync::Mutex::new(conn) });
      
      Ok(())
    })
    .invoke_handler(tauri::generate_handler![
        commands::get_debtors,
        commands::update_debtor,
        commands::get_invoices,
        commands::remind_invoice,
        commands::mark_invoice_paid,
        commands::override_invoice_overdue,
        commands::get_uploads,
        commands::delete_data,
        commands::delete_upload,
        tally_sync::fetch_tally_prime_local,
        tally_sync::process_tally_xml
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}

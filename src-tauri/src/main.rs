// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod ipc;
mod plugins;

use std::sync::Arc;
use tauri::State;
use ipc::EngineBridge;

#[tauri::command]
async fn call_engine(
    state: State<'_, Arc<EngineBridge>>,
    action: String,
    payload: serde_json::Value,
) -> Result<serde_json::Value, String> {
    state.call(&action, payload).await
}

#[tauri::command]
fn upload_temp_file(filename: String, bytes: Vec<u8>) -> Result<serde_json::Value, String> {
    let mut temp_dir = std::env::temp_dir();
    temp_dir.push("localpdf_workspace");
    std::fs::create_dir_all(&temp_dir).map_err(|e| e.to_string())?;

    let safe_name = std::path::Path::new(&filename)
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("uploaded_file.bin");

    let file_path = temp_dir.join(safe_name);
    let size = bytes.len();
    std::fs::write(&file_path, bytes).map_err(|e| e.to_string())?;

    Ok(serde_json::json!({
        "file_path": file_path.to_string_lossy().to_string(),
        "filename": safe_name,
        "size": size
    }))
}

#[tauri::command]
fn read_file_binary(file_path: String) -> Result<Vec<u8>, String> {
    std::fs::read(&file_path).map_err(|e| format!("Failed to read file '{file_path}': {e}"))
}

#[tauri::command]
fn check_plugins(
    custom_soffice: Option<String>,
    custom_tesseract: Option<String>,
) -> (plugins::PluginStatus, plugins::PluginStatus) {
    (
        plugins::detect_libreoffice(custom_soffice.as_deref()),
        plugins::detect_tesseract(custom_tesseract.as_deref()),
    )
}

fn main() {
    println!("[Tauri] Initializing LocalPDF Suite native desktop host...");

    // Initialize sidecar engine on Tauri's managed async runtime
    // without hijacking the main OS thread from WebView2
    let engine = Arc::new(tauri::async_runtime::block_on(EngineBridge::spawn()));
    let engine_cleanup = Arc::clone(&engine);

    tauri::Builder::default()
        .manage(engine)
        .invoke_handler(tauri::generate_handler![
            call_engine,
            upload_temp_file,
            read_file_binary,
            check_plugins
        ])
        .on_window_event(move |_window, event| {
            if let tauri::WindowEvent::Destroyed = event {
                println!("[Tauri] Window destroyed, terminating sidecar engine...");
                let cleanup = Arc::clone(&engine_cleanup);
                tauri::async_runtime::spawn(async move {
                    cleanup.terminate().await;
                });
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

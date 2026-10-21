// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod plugins;

use std::process::{Child, Command};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::{Manager, State};

struct SidecarState {
    child: Arc<Mutex<Option<Child>>>,
    port: u16,
}

#[tauri::command]
fn get_sidecar_port(state: State<'_, SidecarState>) -> u16 {
    state.port
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

fn spawn_sidecar(port: u16) -> Option<Child> {
    // 1. Try bundled binary if compiled
    let bundled_binary = if cfg!(target_os = "windows") {
        "binaries/sidecar-engine-x86_64-pc-windows-msvc.exe"
    } else {
        "binaries/sidecar-engine"
    };

    if std::path::Path::new(bundled_binary).is_file() {
        return Command::new(bundled_binary)
            .arg("--port")
            .arg(port.to_string())
            .spawn()
            .ok();
    }

    // 2. Fallback to local python venv
    let python_cmd = if cfg!(target_os = "windows") {
        r".\venv\Scripts\python.exe"
    } else {
        "./venv/bin/python"
    };

    Command::new(python_cmd)
        .arg("sidecar-engine/main.py")
        .arg("--port")
        .arg(port.to_string())
        .spawn()
        .ok()
}

fn wait_for_health(port: u16, max_retries: u32) -> bool {
    let url = format!("http://127.0.0.1:{port}/health");
    let client = reqwest::blocking::Client::builder()
        .timeout(Duration::from_millis(500))
        .build()
        .unwrap();

    for _ in 0..max_retries {
        if let Ok(resp) = client.get(&url).send() {
            if resp.status().is_success() {
                return true;
            }
        }
        std::thread::sleep(Duration::from_millis(250));
    }
    false
}

fn main() {
    let port = portpicker::pick_unused_port().unwrap_or(8765);
    println!("[Tauri] Selected sidecar port: {}", port);

    let child = spawn_sidecar(port);
    let child_arc = Arc::new(Mutex::new(child));

    // Wait for sidecar to become healthy
    let ready = wait_for_health(port, 20);
    if ready {
        println!("[Tauri] Sidecar successfully reported healthy on port {}", port);
    } else {
        eprintln!("[Tauri] Warning: Sidecar health check timed out or running externally.");
    }

    let child_cleanup = Arc::clone(&child_arc);

    tauri::Builder::default()
        .manage(SidecarState {
            child: child_arc,
            port,
        })
        .invoke_handler(tauri::generate_handler![get_sidecar_port, check_plugins])
        .on_window_event(move |_window, event| {
            if let tauri::WindowEvent::Destroyed = event {
                if let Ok(mut lock) = child_cleanup.lock() {
                    if let Some(mut proc) = lock.take() {
                        println!("[Tauri] Terminating sidecar child process...");
                        let _ = proc.kill();
                    }
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

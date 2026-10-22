use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, ChildStdin, Command};
use tokio::sync::{oneshot, Mutex};
use serde::{Deserialize, Serialize};

#[derive(Serialize)]
pub struct IpcRequest<'a> {
    pub id: String,
    pub action: &'a str,
    pub payload: serde_json::Value,
}

#[derive(Deserialize)]
pub struct IpcResponse {
    pub id: String,
    pub status: String,
    pub data: Option<serde_json::Value>,
    pub error: Option<String>,
}

pub struct EngineBridge {
    stdin_tx: Option<Arc<Mutex<ChildStdin>>>,
    pending: Arc<Mutex<HashMap<String, oneshot::Sender<Result<serde_json::Value, String>>>>>,
    req_counter: AtomicU64,
    child_handle: Arc<Mutex<Option<Child>>>,
    init_error: Option<String>,
}

impl EngineBridge {
    pub async fn spawn() -> Self {
        let (cmd_bin, args) = match Self::resolve_sidecar_command() {
            Ok(pair) => pair,
            Err(err) => {
                eprintln!("[Tauri IPC] CRITICAL: Could not resolve sidecar binary: {err}");
                return Self {
                    stdin_tx: None,
                    pending: Arc::new(Mutex::new(HashMap::new())),
                    req_counter: AtomicU64::new(1),
                    child_handle: Arc::new(Mutex::new(None)),
                    init_error: Some(err),
                };
            }
        };

        println!("[Tauri IPC] Spawning sidecar process: {} {:?}", cmd_bin, args);

        let mut cmd = Command::new(&cmd_bin);
        for arg in &args {
            cmd.arg(arg);
        }

        // Set child process working directory to the directory containing the binary
        if let Some(parent) = Path::new(&cmd_bin).parent() {
            if parent.exists() && parent != Path::new("") {
                cmd.current_dir(parent);
            }
        }

        cmd.stdin(Stdio::piped());
        cmd.stdout(Stdio::piped());
        cmd.stderr(Stdio::null());

        #[cfg(windows)]
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW: Prevents black console window on Windows

        let mut child = match cmd.spawn() {
            Ok(c) => c,
            Err(e) => {
                let err_msg = format!("Failed to spawn sidecar process ({cmd_bin}): {e}");
                eprintln!("[Tauri IPC] {err_msg}");
                return Self {
                    stdin_tx: None,
                    pending: Arc::new(Mutex::new(HashMap::new())),
                    req_counter: AtomicU64::new(1),
                    child_handle: Arc::new(Mutex::new(None)),
                    init_error: Some(err_msg),
                };
            }
        };

        let stdin = match child.stdin.take() {
            Some(s) => s,
            None => {
                let err_msg = "Failed to capture sidecar child stdin".to_string();
                eprintln!("[Tauri IPC] {err_msg}");
                return Self {
                    stdin_tx: None,
                    pending: Arc::new(Mutex::new(HashMap::new())),
                    req_counter: AtomicU64::new(1),
                    child_handle: Arc::new(Mutex::new(Some(child))),
                    init_error: Some(err_msg),
                };
            }
        };

        let stdout = match child.stdout.take() {
            Some(s) => s,
            None => {
                let err_msg = "Failed to capture sidecar child stdout".to_string();
                eprintln!("[Tauri IPC] {err_msg}");
                return Self {
                    stdin_tx: None,
                    pending: Arc::new(Mutex::new(HashMap::new())),
                    req_counter: AtomicU64::new(1),
                    child_handle: Arc::new(Mutex::new(Some(child))),
                    init_error: Some(err_msg),
                };
            }
        };

        let pending: Arc<Mutex<HashMap<String, oneshot::Sender<Result<serde_json::Value, String>>>>> =
            Arc::new(Mutex::new(HashMap::new()));
        let pending_clone = Arc::clone(&pending);

        // Background reader loop for stdout lines
        tokio::spawn(async move {
            let mut reader = BufReader::new(stdout).lines();
            while let Ok(Some(line)) = reader.next_line().await {
                let trimmed = line.trim();
                if trimmed.is_empty() {
                    continue;
                }

                if let Ok(resp) = serde_json::from_str::<IpcResponse>(trimmed) {
                    let mut lock = pending_clone.lock().await;
                    if let Some(tx) = lock.remove(&resp.id) {
                        if resp.status == "success" {
                            let _ = tx.send(Ok(resp.data.unwrap_or(serde_json::Value::Null)));
                        } else {
                            let err_msg = resp.error.unwrap_or_else(|| "Unknown error from sidecar".into());
                            let _ = tx.send(Err(err_msg));
                        }
                    }
                } else {
                    eprintln!("[Tauri IPC] Non-JSON line from sidecar: {}", trimmed);
                }
            }
            eprintln!("[Tauri IPC] Sidecar stdout stream ended.");
        });

        let bridge = Self {
            stdin_tx: Some(Arc::new(Mutex::new(stdin))),
            pending,
            req_counter: AtomicU64::new(1),
            child_handle: Arc::new(Mutex::new(Some(child))),
            init_error: None,
        };

        // Non-blocking health verification ping on startup with a strict 3-second timeout
        let health_fut = bridge.call("health", serde_json::json!({}));
        match tokio::time::timeout(std::time::Duration::from_secs(3), health_fut).await {
            Ok(Ok(v)) => println!("[Tauri IPC] Sidecar engine verified healthy via Stdio IPC: {:?}", v),
            Ok(Err(e)) => eprintln!("[Tauri IPC] Initial health check warning: {e}"),
            Err(_) => eprintln!("[Tauri IPC] Health check timed out (engine may still be initializing)"),
        }

        bridge
    }

    fn resolve_sidecar_command() -> Result<(String, Vec<String>), String> {
        let candidate_names: Vec<&str> = if cfg!(target_os = "windows") {
            vec![
                "sidecar-engine.exe",
                "sidecar-engine-x86_64-pc-windows-msvc.exe",
            ]
        } else {
            vec![
                "sidecar-engine",
                "sidecar-engine-x86_64-unknown-linux-gnu",
                "sidecar-engine-x86_64-apple-darwin",
                "sidecar-engine-aarch64-apple-darwin",
            ]
        };

        // 1. Search alongside current executable directory (Packaged / NSIS Installed Application)
        if let Ok(curr_exe) = std::env::current_exe() {
            if let Some(parent) = curr_exe.parent() {
                for name in &candidate_names {
                    let direct = parent.join(name);
                    if direct.is_file() {
                        return Ok((direct.to_string_lossy().to_string(), vec![]));
                    }

                    let in_bin = parent.join("binaries").join(name);
                    if in_bin.is_file() {
                        return Ok((in_bin.to_string_lossy().to_string(), vec![]));
                    }

                    let in_resources = parent.join("resources").join(name);
                    if in_resources.is_file() {
                        return Ok((in_resources.to_string_lossy().to_string(), vec![]));
                    }

                    let in_res_bin = parent.join("resources").join("binaries").join(name);
                    if in_res_bin.is_file() {
                        return Ok((in_res_bin.to_string_lossy().to_string(), vec![]));
                    }
                }
            }
        }

        // 2. Search common development and portable relative paths
        let rel_dirs = [
            ".",
            "binaries",
            "src-tauri/binaries",
            "../binaries",
            "../../binaries",
            "../../src-tauri/binaries",
            "release-portable",
        ];

        for dir in &rel_dirs {
            for name in &candidate_names {
                let p = PathBuf::from(dir).join(name);
                if p.is_file() {
                    return Ok((p.to_string_lossy().to_string(), vec![]));
                }
            }
        }

        // 3. Fallback to Python ONLY IF ipc_worker.py exists on disk (Development environment)
        let worker_candidates = [
            "sidecar-engine/ipc_worker.py",
            "../sidecar-engine/ipc_worker.py",
            "../../sidecar-engine/ipc_worker.py",
        ];

        for worker in &worker_candidates {
            if Path::new(worker).is_file() {
                let venv_python = if cfg!(target_os = "windows") {
                    r".\venv\Scripts\python.exe"
                } else {
                    "./venv/bin/python"
                };
                if Path::new(venv_python).is_file() {
                    return Ok((venv_python.to_string(), vec![worker.to_string()]));
                }

                let sys_py = if cfg!(target_os = "windows") { "python" } else { "python3" };
                return Ok((sys_py.to_string(), vec![worker.to_string()]));
            }
        }

        Err("Could not locate standalone sidecar-engine.exe or Python worker script".to_string())
    }

    pub async fn call(&self, action: &str, payload: serde_json::Value) -> Result<serde_json::Value, String> {
        if let Some(err) = &self.init_error {
            return Err(format!("Engine initialization error: {err}"));
        }

        let stdin_tx = match &self.stdin_tx {
            Some(tx) => Arc::clone(tx),
            None => return Err("Sidecar engine stdin is not connected".into()),
        };

        let num = self.req_counter.fetch_add(1, Ordering::SeqCst);
        let req_id = format!("req_{num}");

        let (tx, rx) = oneshot::channel();
        self.pending.lock().await.insert(req_id.clone(), tx);

        let req = IpcRequest {
            id: req_id.clone(),
            action,
            payload,
        };

        let mut json_str = serde_json::to_string(&req).map_err(|e| format!("Serialization error: {e}"))?;
        json_str.push('\n');

        {
            let mut stdin = stdin_tx.lock().await;
            stdin
                .write_all(json_str.as_bytes())
                .await
                .map_err(|e| format!("Failed to write to sidecar stdin: {e}"))?;
            stdin
                .flush()
                .await
                .map_err(|e| format!("Failed to flush sidecar stdin: {e}"))?;
        }

        // Generous timeout (5 minutes) for intensive OCR/compression operations
        match tokio::time::timeout(std::time::Duration::from_secs(300), rx).await {
            Ok(Ok(res)) => res,
            Ok(Err(_)) => Err("Sidecar process terminated unexpectedly or closed stream".into()),
            Err(_) => {
                self.pending.lock().await.remove(&req_id);
                Err(format!("Sidecar operation '{action}' timed out after 300 seconds"))
            }
        }
    }

    pub async fn terminate(&self) {
        let mut lock = self.child_handle.lock().await;
        if let Some(mut child) = lock.take() {
            println!("[Tauri IPC] Terminating sidecar child process...");
            let _ = child.kill().await;
        }
    }
}

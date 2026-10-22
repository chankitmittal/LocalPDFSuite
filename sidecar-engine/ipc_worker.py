"""
LocalPDF Stdio IPC Worker
Headless Python engine communicating with Tauri host via line-delimited JSON over stdin/stdout.
100% Offline, Zero Cloud Dependencies, Zero Localhost Network Ports.
"""

import sys
import os
import json
import traceback
import threading
from concurrent.futures import ThreadPoolExecutor

# Force unbuffered UTF-8 I/O across platforms (essential on Windows)
if sys.platform == "win32":
    import msvcrt
    msvcrt.setmode(sys.stdin.fileno(), os.O_BINARY)
    msvcrt.setmode(sys.stdout.fileno(), os.O_BINARY)

sys.stdin.reconfigure(encoding="utf-8")
sys.stdout.reconfigure(encoding="utf-8")
sys.stderr.reconfigure(encoding="utf-8")

# Safeguard protocol stream: redirect accidental library prints to stderr
_ipc_stdout = sys.stdout
sys.stdout = sys.stderr

# Thread-safe write lock for IPC output
_write_lock = threading.Lock()

# Add sidecar-engine directory to sys.path
_current_dir = os.path.dirname(os.path.abspath(__file__))
if _current_dir not in sys.path:
    sys.path.insert(0, _current_dir)

from dispatcher import dispatch_action
from workspace_utils import purge_expired_workspace_files

# Clean up stale files older than 24 hours on worker startup
purge_expired_workspace_files(24.0)


def send_response(response_dict: dict):
    """Encodes and writes a single-line JSON response to the raw IPC stdout."""
    line = json.dumps(response_dict, ensure_ascii=False) + "\n"
    with _write_lock:
        _ipc_stdout.write(line)
        _ipc_stdout.flush()


def execute_request(req_id: str, action: str, payload: dict):
    """Executes a single action in a worker thread and sends the response."""
    try:
        result = dispatch_action(action, payload)
        send_response({
            "id": req_id,
            "status": "success",
            "data": result,
        })
    except Exception as e:
        sys.stderr.write(f"[IPC Worker Error on '{action}']: {e}\n")
        sys.stderr.write(traceback.format_exc() + "\n")
        send_response({
            "id": req_id,
            "status": "error",
            "error": str(e),
        })


def main():
    sys.stderr.write("[LocalPDF IPC Worker] Started and listening on stdin...\n")
    # Thread pool prevents long operations (like OCR or compression) from blocking the loop
    executor = ThreadPoolExecutor(max_workers=4)

    # Initial ready notification over stderr
    sys.stderr.write("[LocalPDF IPC Worker] Stdio channel ready.\n")

    try:
        for line in sys.stdin:
            line = line.strip()
            if not line:
                continue

            try:
                req = json.loads(line)
                req_id = req.get("id")
                action = req.get("action", "")
                payload = req.get("payload", {})

                if not req_id:
                    sys.stderr.write(f"[LocalPDF IPC Worker] Dropping request with missing id: {line[:100]}\n")
                    continue

                executor.submit(execute_request, req_id, action, payload)

            except Exception as e:
                sys.stderr.write(f"[LocalPDF IPC Worker] Failed to parse input line: {e}\n")
    except (KeyboardInterrupt, SystemExit):
        sys.stderr.write("[LocalPDF IPC Worker] Terminating on signal...\n")
    finally:
        executor.shutdown(wait=False)
        sys.stderr.write("[LocalPDF IPC Worker] Stdio channel closed. Exiting.\n")


if __name__ == "__main__":
    main()

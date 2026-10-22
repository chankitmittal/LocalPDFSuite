"""
Unit tests for Stdio IPC Worker and Dispatcher.
Verifies asynchronous request-response over stdio pipes with zero HTTP networking.
"""

import sys
import os
import json
import subprocess
import pytest

from dispatcher import dispatch_action, normalize_action


def test_action_normalization():
    assert normalize_action("/api/compress") == "compress"
    assert normalize_action("/api/structural/merge") == "structural/merge"
    assert normalize_action("structural/merge") == "structural/merge"
    assert normalize_action("HEALTH") == "health"
    assert normalize_action("/system/status/") == "system/status"


def test_dispatch_health():
    res = dispatch_action("health")
    assert res["status"] == "ok"
    assert "Stdio IPC" in res["mode"]


def test_dispatch_system_status():
    res = dispatch_action("system/status")
    assert "libreoffice" in res
    assert "tesseract" in res
    assert "workspace_dir" in res


def test_dispatch_licenses():
    res = dispatch_action("licenses")
    assert isinstance(res, list)
    assert len(res) > 0


def test_dispatch_merge_and_compress(sample_pdf, image_pdf, temp_dir):
    # Test merge via dispatcher
    merge_res = dispatch_action("structural/merge", {
        "file_paths": [sample_pdf, sample_pdf],
        "output_filename": "ipc_merged.pdf",
    })
    assert merge_res["status"] == "success"
    assert merge_res["total_pages"] == 6
    assert os.path.exists(merge_res["output_path"])

    # Test compress via dispatcher
    comp_res = dispatch_action("compress", {
        "file_path": image_pdf,
        "level": "medium",
        "output_filename": "ipc_compressed.pdf",
    })
    assert comp_res["status"] == "success"
    assert os.path.exists(comp_res["output_path"])


def test_ipc_worker_process_stdio(sample_pdf):
    """Launches ipc_worker.py as a child process and communicates via stdin/stdout."""
    worker_script = os.path.join(os.path.dirname(__file__), "..", "ipc_worker.py")
    proc = subprocess.Popen(
        [sys.executable, worker_script],
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        encoding="utf-8",
        bufsize=1,
    )

    try:
        # Request 1: Health
        req1 = json.dumps({"id": "req_1", "action": "health", "payload": {}}) + "\n"
        proc.stdin.write(req1)
        proc.stdin.flush()

        resp1_line = proc.stdout.readline()
        assert resp1_line, "Expected response on stdout for req_1"
        resp1 = json.loads(resp1_line)
        assert resp1["id"] == "req_1"
        assert resp1["status"] == "success"
        assert resp1["data"]["status"] == "ok"

        # Request 2: Merge
        req2 = json.dumps({
            "id": "req_2",
            "action": "/api/structural/merge",
            "payload": {
                "file_paths": [sample_pdf, sample_pdf],
                "output_filename": "ipc_pipe_merged.pdf",
            },
        }) + "\n"
        proc.stdin.write(req2)
        proc.stdin.flush()

        resp2_line = proc.stdout.readline()
        assert resp2_line, "Expected response on stdout for req_2"
        resp2 = json.loads(resp2_line)
        assert resp2["id"] == "req_2"
        assert resp2["status"] == "success"
        assert resp2["data"]["total_pages"] == 6

        # Request 3: Error handling
        req3 = json.dumps({"id": "req_3", "action": "non_existent_action", "payload": {}}) + "\n"
        proc.stdin.write(req3)
        proc.stdin.flush()

        resp3_line = proc.stdout.readline()
        assert resp3_line, "Expected response on stdout for req_3"
        resp3 = json.loads(resp3_line)
        assert resp3["id"] == "req_3"
        assert resp3["status"] == "error"
        assert "Unknown action" in resp3["error"]

    finally:
        proc.stdin.close()
        proc.terminate()
        proc.wait(timeout=5)

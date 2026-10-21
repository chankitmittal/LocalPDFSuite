"""
Tests verifying remediation of Security Audit findings:
- CRIT-01: Path traversal protection on download
- CRIT-02: Output path containment and sanitization
- CRIT-04: Arbitrary host binary execution rejection
- HIGH-06: Zero-page PDF crash prevention
- MED-01: Tesseract CLI argument injection prevention
"""

import os
import pytest
from main import get_safe_workspace_path, WORKSPACE_DIR, purge_expired_workspace_files
from core.pdf_ocr import find_tesseract_binary, run_ocr_on_pdf
from core.office_to_pdf import find_libreoffice_binary
from core.pdf_structural import organize_pdf, merge_pdfs


def test_safe_workspace_path_containment():
    """Verify that path traversal attempts cannot escape WORKSPACE_DIR."""
    # Attempt directory traversal
    traversal_input = "../../../Windows/System32/evil.dll"
    safe_path = get_safe_workspace_path(traversal_input, "fallback.pdf")

    real_workspace = os.path.realpath(WORKSPACE_DIR)
    real_out = os.path.realpath(safe_path)

    # Must be inside WORKSPACE_DIR
    assert real_out.startswith(real_workspace + os.sep) or real_out == real_workspace
    assert "evil.dll" in os.path.basename(real_out)
    assert ".." not in safe_path


def test_safe_workspace_path_sanitization():
    """Verify that null bytes and empty inputs fallback safely."""
    path = get_safe_workspace_path("test\0bad.pdf", "fallback.pdf")
    assert "\0" not in path

    empty_path = get_safe_workspace_path("   ", "fallback.pdf")
    assert os.path.basename(empty_path) == "fallback.pdf"

    dot_path = get_safe_workspace_path("..", "fallback.pdf")
    assert os.path.basename(dot_path) == "fallback.pdf"


def test_arbitrary_binary_execution_rejection():
    """Verify that custom binary paths not matching the approved binary names are rejected."""
    # Attempt to supply cmd.exe or calc.exe as tesseract or soffice
    calc_path = r"C:\Windows\System32\calc.exe"
    if os.path.isfile(calc_path):
        assert find_tesseract_binary(calc_path) is None
        assert find_libreoffice_binary(calc_path) is None


def test_tesseract_language_injection_rejection(sample_pdf, temp_dir):
    """Verify that flags like --tessdata-dir are blocked in language parameter."""
    out_pdf = os.path.join(temp_dir, "ocr_out.pdf")
    with pytest.raises(ValueError, match="Invalid Tesseract language"):
        run_ocr_on_pdf(
            input_pdf_path=sample_pdf,
            output_pdf_path=out_pdf,
            language="--tessdata-dir /tmp",
        )


def test_zero_page_organize_pdf_rejection(sample_pdf, temp_dir):
    """Verify that deleting all pages in organize_pdf raises ValueError instead of crashing with QPDF error."""
    out_pdf = os.path.join(temp_dir, "zero_page.pdf")
    actions = [
        {"page_index": 0, "deleted": True},
        {"page_index": 1, "deleted": True},
        {"page_index": 2, "deleted": True},
    ]
    with pytest.raises(ValueError, match="must contain at least 1 page"):
        organize_pdf(sample_pdf, out_pdf, actions)


def test_zero_page_merge_pdfs_rejection(temp_dir):
    """Verify that merging empty file list raises ValueError."""
    out_pdf = os.path.join(temp_dir, "zero_merge.pdf")
    with pytest.raises(ValueError, match="At least one PDF file path must be provided"):
        merge_pdfs([], out_pdf)


def test_download_endpoint_resolution_and_content_types():
    """Verify that download_file resolves file/filename/path and sets correct content-types."""
    from main import download_file
    from fastapi import HTTPException

    # Create dummy files in WORKSPACE_DIR
    xlsx_path = os.path.join(WORKSPACE_DIR, "audit_test.xlsx")
    csv_path = os.path.join(WORKSPACE_DIR, "audit_test.csv")
    pdf_path = os.path.join(WORKSPACE_DIR, "audit_test.pdf")

    with open(xlsx_path, "wb") as f:
        f.write(b"dummy xlsx")
    with open(csv_path, "wb") as f:
        f.write(b"dummy csv")
    with open(pdf_path, "wb") as f:
        f.write(b"%PDF-1.4 dummy")

    try:
        # Test 1: Resolve by file query param
        resp_xlsx = download_file(file="audit_test.xlsx")
        assert resp_xlsx.media_type == "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        assert resp_xlsx.filename == "audit_test.xlsx"

        # Test 2: Resolve by csv query param
        resp_csv = download_file(file="audit_test.csv")
        assert "csv" in resp_csv.media_type

        # Test 3: Resolve by path
        resp_pdf = download_file(path=pdf_path)
        assert resp_pdf.media_type == "application/pdf"

        # Test 4: Traversal attempt blocked
        with pytest.raises(HTTPException) as exc_info:
            download_file(path=r"C:\Windows\System32\cmd.exe")
        assert exc_info.value.status_code == 403

        # Test 5: Missing file returns 404
        with pytest.raises(HTTPException) as exc_404:
            download_file(file="non_existent_file_12345.pdf")
        assert exc_404.value.status_code == 404
    finally:
        for p in (xlsx_path, csv_path, pdf_path):
            if os.path.exists(p):
                os.remove(p)


def test_purge_expired_workspace_files():
    """Verify that temporary files older than 24 hours are cleanly purged."""
    import time
    old_file = os.path.join(WORKSPACE_DIR, "old_test_temp_file.tmp")
    with open(old_file, "w") as f:
        f.write("temporary file from 2 days ago")

    # Set mtime to 48 hours ago
    past_time = time.time() - (48 * 3600)
    os.utime(old_file, (past_time, past_time))

    # Also create a fresh file that shouldn't be purged
    fresh_file = os.path.join(WORKSPACE_DIR, "fresh_test_temp_file.tmp")
    with open(fresh_file, "w") as f:
        f.write("brand new file")

    try:
        purged = purge_expired_workspace_files(max_age_hours=24.0)
        assert purged >= 1
        assert not os.path.exists(old_file)
        assert os.path.exists(fresh_file)
    finally:
        if os.path.exists(fresh_file):
            os.remove(fresh_file)
        if os.path.exists(old_file):
            os.remove(old_file)


@pytest.mark.anyio
async def test_session_token_middleware_validation():
    """Verify that LOCALPDF_SESSION_TOKEN enforces loopback authorization when set."""
    import main
    import httpx
    from httpx import ASGITransport

    original_token = main.SESSION_TOKEN
    main.SESSION_TOKEN = "secret_audit_token_xyz"
    try:
        async with httpx.AsyncClient(transport=ASGITransport(app=main.app), base_url="http://test") as client:
            # Health is exempt
            h_resp = await client.get("/health")
            assert h_resp.status_code == 200

            # Protected endpoint without token -> 401
            unauth_resp = await client.get("/system/status")
            assert unauth_resp.status_code == 401
            assert "Unauthorized" in unauth_resp.json()["detail"]

            # Protected endpoint with wrong token -> 401
            wrong_resp = await client.get("/system/status", headers={"X-LocalPDF-Token": "wrong_val"})
            assert wrong_resp.status_code == 401

            # Protected endpoint with valid header token -> 200
            ok_header_resp = await client.get("/system/status", headers={"X-LocalPDF-Token": "secret_audit_token_xyz"})
            assert ok_header_resp.status_code == 200

            # Protected endpoint with valid query token -> 200
            ok_query_resp = await client.get("/system/status?token=secret_audit_token_xyz")
            assert ok_query_resp.status_code == 200
    finally:
        main.SESSION_TOKEN = original_token

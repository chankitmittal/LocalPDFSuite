"""
Office to PDF Conversion Module
Implements:
- Subprocess execution of headless LibreOffice (soffice).
- Isolated per-process UserInstallation profiles to prevent concurrency deadlocks.
- Automatic binary discovery across standard installation and portable locations.
"""

import os
import shutil
import subprocess
import tempfile
from typing import Dict, Any, Optional, List


def find_libreoffice_binary(custom_path: Optional[str] = None) -> Optional[str]:
    """
    Discovers LibreOffice executable (soffice/soffice.exe) in:
    1. Custom path if provided
    2. PATH environment variable
    3. Common Windows/Linux/macOS locations
    4. Portable app folders inside app data
    """
    if custom_path and os.path.isfile(custom_path):
        base = os.path.basename(custom_path).lower()
        if base in ("soffice.exe", "soffice", "libreoffice"):
            return custom_path
        return None

    # Check PATH
    which_soffice = shutil.which("soffice") or shutil.which("soffice.exe") or shutil.which("libreoffice")
    if which_soffice:
        return which_soffice

    # Common Windows paths
    win_candidates = [
        r"C:\Program Files\LibreOffice\program\soffice.exe",
        r"C:\Program Files (x86)\LibreOffice\program\soffice.exe",
        os.path.expandvars(r"%LOCALAPPDATA%\Programs\LibreOffice\program\soffice.exe"),
        os.path.expandvars(r"%USERPROFILE%\AppData\Local\Programs\LibreOffice\program\soffice.exe"),
        # Portable apps folder
        os.path.expandvars(r"%USERPROFILE%\.localpdf\plugins\libreoffice\program\soffice.exe"),
    ]
    for c in win_candidates:
        if os.path.isfile(c):
            return c

    # Common Linux / macOS paths
    nix_candidates = [
        "/usr/bin/soffice",
        "/usr/bin/libreoffice",
        "/usr/local/bin/soffice",
        "/Applications/LibreOffice.app/Contents/MacOS/soffice",
    ]
    for c in nix_candidates:
        if os.path.isfile(c):
            return c

    return None


def convert_office_to_pdf(
    input_file: str,
    output_dir: str,
    custom_soffice_path: Optional[str] = None,
    timeout_seconds: int = 120,
) -> Dict[str, Any]:
    """
    Converts .docx, .doc, .xlsx, .xls, .pptx, .ppt, .odt, .ods, .odp to PDF using
    isolated headless LibreOffice.
    """
    if not os.path.exists(input_file):
        raise FileNotFoundError(f"Input file not found: {input_file}")

    soffice_bin = find_libreoffice_binary(custom_soffice_path)
    if not soffice_bin:
        return {
            "status": "error",
            "error": "LibreOffice binary not found. Please install LibreOffice or configure its path in Settings.",
            "is_missing_dependency": True,
            "dependency": "LibreOffice",
        }

    os.makedirs(output_dir, exist_ok=True)
    base_name = os.path.splitext(os.path.basename(input_file))[0]
    expected_output = os.path.join(output_dir, f"{base_name}.pdf")

    # Create temporary isolated user profile to prevent LibreOffice locks & deadlock
    temp_profile_dir = tempfile.mkdtemp(prefix="libreoffice_profile_")
    # File URI for UserInstallation requires forward slashes
    profile_uri = "file:///" + os.path.abspath(temp_profile_dir).replace("\\", "/")

    cmd = [
        soffice_bin,
        "--headless",
        "--invisible",
        "--nologo",
        "--nodefault",
        f"-env:UserInstallation={profile_uri}",
        "--convert-to",
        "pdf",
        "--outdir",
        output_dir,
        os.path.abspath(input_file),
    ]

    try:
        proc = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=timeout_seconds,
            check=False,
        )
        if proc.returncode != 0:
            return {
                "status": "error",
                "error": f"LibreOffice failed with exit code {proc.returncode}: {proc.stderr}",
            }

        if not os.path.exists(expected_output):
            return {
                "status": "error",
                "error": f"Expected output file not generated: {expected_output}",
                "stdout": proc.stdout,
                "stderr": proc.stderr,
            }

        return {
            "status": "success",
            "output_path": expected_output,
            "file_size": os.path.getsize(expected_output),
        }
    finally:
        shutil.rmtree(temp_profile_dir, ignore_errors=True)

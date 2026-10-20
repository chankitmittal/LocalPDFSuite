"""
Strict License Compliance Test
Verifies:
1. ZERO GPL / AGPL dependencies are installed.
2. None of the explicitly forbidden packages (PyMuPDF, fitz, ghostscript, pdf2docx, etc.) exist.
3. All dependencies use permissive or weak-copyleft licenses (MIT, Apache, BSD, MPL, PSF, etc.)
"""
import json
import subprocess
import sys
import pytest

FORBIDDEN_PACKAGES = {
    "pymupdf",
    "fitz",
    "ghostscript",
    "pdf2docx",
    "itext",
    "pdftk",
    "unoconv",
    "pyqt5",
    "pyqt6",
    "pyside2",
    "pyside6",
}

FORBIDDEN_LICENSE_KEYWORDS = [
    "gpl",
    "agpl",
    "gnu general public",
    "affero",
]

ALLOWED_EXCEPTIONS_LGPL = [
    # Any allowed dynamic weak-copyleft if explicitly authorized
]


def test_no_forbidden_packages_installed():
    """Verify none of the forbidden AGPL/GPL packages are present in the environment."""
    result = subprocess.run(
        [sys.executable, "-m", "pip", "list", "--format=json"],
        capture_output=True,
        text=True,
        check=True,
    )
    installed_packages = json.loads(result.stdout)
    installed_names = {pkg["name"].lower() for pkg in installed_packages}

    violations = installed_names.intersection(FORBIDDEN_PACKAGES)
    assert not violations, f"CRITICAL: Forbidden packages detected: {violations}"


def test_no_gpl_or_agpl_licenses():
    """Verify that pip-licenses reports ZERO GPL or AGPL licenses."""
    result = subprocess.run(
        [sys.executable, "-m", "piplicenses", "--format=json"],
        capture_output=True,
        text=True,
        check=True,
    )
    license_data = json.loads(result.stdout)

    violations = []
    for item in license_data:
        pkg_name = item.get("Name", "")
        license_str = item.get("License", "").lower()

        # Check if license contains GPL/AGPL while not being LGPL
        is_gpl = False
        for kw in FORBIDDEN_LICENSE_KEYWORDS:
            if kw in license_str:
                # LGPL check (LGPL contains 'gpl')
                if "lgpl" in license_str or "lesser" in license_str:
                    continue
                is_gpl = True
                break

        if is_gpl:
            violations.append(f"{pkg_name} ({item.get('License')})")

    assert not violations, f"CRITICAL LICENSE AUDIT FAILED: GPL/AGPL packages found: {violations}"

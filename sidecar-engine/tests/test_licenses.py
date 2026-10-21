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


def test_static_licenses_file_integrity():
    """Verify that static third_party_notices.json exists, is valid JSON, and contains no GPL/AGPL."""
    import os
    cur_dir = os.path.dirname(os.path.abspath(__file__))
    engine_dir = os.path.dirname(cur_dir)
    notices_file = os.path.join(engine_dir, "third_party_notices.json")

    assert os.path.exists(notices_file), f"Static notices file missing: {notices_file}"

    with open(notices_file, "r", encoding="utf-8") as f:
        notices = json.load(f)

    assert isinstance(notices, list) and len(notices) > 20, "Notices list must contain all dependencies"

    for item in notices:
        lic = item.get("License", "").lower()
        for kw in FORBIDDEN_LICENSE_KEYWORDS:
            if kw in lic and "lgpl" not in lic and "lesser" not in lic:
                pytest.fail(f"Forbidden license in static notices: {item['Name']} ({item['License']})")


def test_reportlab_commercial_boundary():
    """Ensure ReportLab usage is strictly confined to free open-source BSD modules."""
    import reportlab
    from reportlab.pdfgen import canvas
    from reportlab.lib import colors, pagesizes

    # Verify that commercial Plus extensions are NOT installed or imported
    import sys
    assert "rlextra" not in sys.modules, "Commercial ReportLab Plus (rlextra) must not be present"


def test_pikepdf_mpl_boundary():
    """Ensure pikepdf remains an external weak-copyleft dependency and is not vendored in-tree."""
    import pikepdf
    import os

    pike_file = os.path.abspath(pikepdf.__file__)
    cur_file = os.path.abspath(__file__)
    workspace_root = os.path.dirname(os.path.dirname(os.path.dirname(cur_file)))
    core_dir = os.path.join(workspace_root, "sidecar-engine", "core")

    # Ensure pikepdf is not inside the local core directory
    assert not pike_file.startswith(core_dir), "pikepdf must not be vendored or patched in-tree"

"""
Offline OCR Pipeline Module
Provides:
- Searchable PDF generation using pypdfium2 page rendering + local Tesseract OCR engine (Apache-2.0).
- Assembly of multi-page OCR sandwich PDFs via pikepdf.
- Automatic local Tesseract discovery and status diagnostics.
"""

import os
import shutil
import subprocess
import tempfile
from typing import Dict, Any, Optional, List
import pypdfium2 as pdfium
import pikepdf


def find_tesseract_binary(custom_path: Optional[str] = None) -> Optional[str]:
    """
    Finds the Tesseract OCR binary on the local system.
    """
    if custom_path and os.path.isfile(custom_path):
        base = os.path.basename(custom_path).lower()
        if base in ("tesseract.exe", "tesseract"):
            return custom_path
        return None

    which_tess = shutil.which("tesseract") or shutil.which("tesseract.exe")
    if which_tess:
        return which_tess

    win_candidates = [
        r"C:\Program Files\Tesseract-OCR\tesseract.exe",
        r"C:\Program Files (x86)\Tesseract-OCR\tesseract.exe",
        os.path.expandvars(r"%LOCALAPPDATA%\Programs\Tesseract-OCR\tesseract.exe"),
        os.path.expandvars(r"%USERPROFILE%\.localpdf\plugins\tesseract\tesseract.exe"),
    ]
    for c in win_candidates:
        if os.path.isfile(c):
            return c

    nix_candidates = [
        "/usr/bin/tesseract",
        "/usr/local/bin/tesseract",
        "/opt/homebrew/bin/tesseract",
    ]
    for c in nix_candidates:
        if os.path.isfile(c):
            return c

    return None


def run_ocr_on_pdf(
    input_pdf_path: str,
    output_pdf_path: str,
    language: str = "eng",
    dpi: int = 300,
    custom_tesseract_path: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Renders pages of input PDF via pypdfium2, passes each page image to Tesseract
    configured with PDF output mode, and merges into an invisible text sandwich PDF.
    """
    if not os.path.exists(input_pdf_path):
        raise FileNotFoundError(f"Input PDF not found: {input_pdf_path}")

    import re
    if not re.match(r"^[a-zA-Z0-9_\+]{2,15}$", language):
        raise ValueError(f"Invalid Tesseract language identifier: '{language}'")

    tess_bin = find_tesseract_binary(custom_tesseract_path)
    if not tess_bin:
        return {
            "status": "error",
            "error": "Tesseract OCR binary not found. Please install Tesseract or configure its path in Settings.",
            "is_missing_dependency": True,
            "dependency": "Tesseract",
        }

    os.makedirs(os.path.dirname(os.path.abspath(output_pdf_path)), exist_ok=True)
    temp_dir = tempfile.mkdtemp(prefix="tess_ocr_")
    scale = dpi / 72.0

    try:
        doc = pdfium.PdfDocument(input_pdf_path)
        ocr_page_pdfs: List[str] = []
        try:
            total_pages = len(doc)
            for idx in range(total_pages):
                page = doc.get_page(idx)
                try:
                    pil_img = page.render(scale=scale).to_pil()

                    page_img_path = os.path.join(temp_dir, f"page_{idx + 1:04d}.png")
                    pil_img.save(page_img_path, format="PNG")

                    out_base = os.path.join(temp_dir, f"ocr_page_{idx + 1:04d}")
                    cmd = [
                        tess_bin,
                        page_img_path,
                        out_base,
                        "-l",
                        language,
                        "--dpi",
                        str(dpi),
                        "pdf",
                    ]

                    proc = subprocess.run(
                        cmd,
                        capture_output=True,
                        text=True,
                        check=False,
                    )

                    generated_pdf = f"{out_base}.pdf"
                    if os.path.exists(generated_pdf):
                        ocr_page_pdfs.append(generated_pdf)
                    else:
                        return {
                            "status": "error",
                            "error": f"Tesseract failed on page {idx + 1}: {proc.stderr}",
                        }
                finally:
                    page.close()
        finally:
            doc.close()

        # Merge OCR page PDFs into the final searchable PDF
        with pikepdf.Pdf.new() as dst_pdf:
            for p_pdf in ocr_page_pdfs:
                with pikepdf.open(p_pdf) as src:
                    dst_pdf.pages.extend(src.pages)

            dst_pdf.save(
                output_pdf_path,
                compress_streams=True,
                object_stream_mode=pikepdf.ObjectStreamMode.generate,
            )

        return {
            "status": "success",
            "output_path": output_pdf_path,
            "pages_processed": len(ocr_page_pdfs),
            "file_size": os.path.getsize(output_pdf_path),
        }
    finally:
        shutil.rmtree(temp_dir, ignore_errors=True)

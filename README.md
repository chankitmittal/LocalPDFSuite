# LocalPDF Suite — 100% Offline PDF & Image Workstation

LocalPDF Suite is a 100% offline desktop application providing all core capabilities of **iLovePDF** and **iLoveIMG** (structural PDF operations, Ghostscript-free compression, true coordinate redaction, Office conversions, cryptographic PAdES digital signing, OCR, and bulk image processing).

---

## Strict Compliance & Permissive License Guardrail

This codebase strictly adheres to permissive and weak-copyleft licensing (**ZERO AGPL / GPL**):
- **Approved licenses only:** MIT, Apache-2.0, BSD-3-Clause, MPL-2.0, PSF, and MIT-CMU.
- **Strictly excluded:** `PyMuPDF` (`fitz`), `Ghostscript`, `pdf2docx`, `iText`, `PDFtk`, `unoconv`, `PyQt`, `PySide`.
- **License compliance audit test:** Verified automatically via `pytest sidecar-engine/tests/test_licenses.py` with `pip-licenses`. Full audited notices are generated in [`THIRD-PARTY-NOTICES.txt`](THIRD-PARTY-NOTICES.txt).

---

## Implemented Feature Highlights

1. **Structural PDF Engine (`core/pdf_structural.py`):**
   - **Merge & Split:** Combines multi-document PDFs, splits by custom page ranges (e.g., `1-3, 5, 7-10`), fixed page chunks, or extracts all pages into individual files.
   - **Organize & Rotate:** Interactive `@dnd-kit/core` + `pdfjs-dist` thumbnail grid with visual page drag-and-drop reordering, 90°/180°/270° rotation, and page deletion.
   - **Security & Repair:** AES-256 standard encryption (`pikepdf.Encryption`), password decryption/removal, and QPDF cross-reference table recovery.

2. **Ghostscript-Free PDF Compression (`core/pdf_compress.py`):**
   - In-place XObject downsampling and Pillow JPEG re-encoding.
   - High Quality (200 DPI), Recommended (144 DPI), and Smallest Size (72 DPI) presets.
   - **Benchmark:** Achieves **81% file size reduction in 0.24 seconds** without Ghostscript.

3. **Overlays & True Irreversible Redaction (`core/pdf_overlays.py`):**
   - **Watermarks:** Text overlays with custom opacity, rotation, hex color, and repeated page tiling.
   - **Page Numbers:** Dynamic `Page X of Y` numbering with multi-position support (bottom-center, bottom-right, etc.).
   - **True Redaction:** Irreversible pixel raster sanitization (`pypdfium2`). Text underneath redacted bounding boxes is destroyed, rendering it 100% immune to `Ctrl+F` and `pdfplumber` recovery.

4. **Document & Office Conversions (`core/office_to_pdf.py`, `core/pdf_to_office.py`):**
   - **PDF to Word (.docx):** Reconstructs headings, paragraphs, and tables via `pdfplumber` and `python-docx` without AGPL libraries.
   - **PDF to Excel (.xlsx):** Vector line and grid detection writing into multi-sheet workbooks via `openpyxl`.
   - **PDF to PowerPoint (.pptx):** Renders crisp background slides with editable text overlays via `pypdfium2` and `python-pptx`.
   - **Office to PDF:** Headless LibreOffice worker using isolated temporary user profiles (`-env:UserInstallation`) to prevent lock deadlocks.

5. **Image Processing Suite (`core/image_suite.py`):**
   - PDF to images (PNG, JPEG, WebP at 150/200/300 DPI).
   - Multi-image compilation to single PDF with auto-rotation.
   - Bulk image conversion (WebP, JPEG, PNG, TIFF), percentage/dimension resizing, and privacy EXIF stripping.

6. **Offline OCR & Cryptographic Signing (`core/pdf_ocr.py`, `core/pdf_sign.py`):**
   - **Offline OCR:** Searchable invisible text sandwich PDF generation via local Tesseract OCR v5 engine.
   - **Visual Signature Stamping:** Interactive mouse/stylus drawing canvas and stamp positioning.
   - **Cryptographic Signatures:** PAdES digital signatures via `pyHanko` using PKCS#12 (`.pfx`/`.p12`) certificates, plus offline RSA test certificate generator.

7. **Tauri v2 Host & Plugin Manager (`src-tauri/`):**
   - Tauri v2 Rust host spawning and managing Python sidecar lifecycle.
   - Offline Module Manager for external binary detection (LibreOffice & Tesseract).
   - In-app Open Source Licenses viewer.

---

## Quick Start

### 1. Run Tests in Virtual Environment
```bash
.\venv\Scripts\pytest sidecar-engine\tests
```
All 25 tests across structural, compression, overlays, redaction security, office, images, cryptographic signing, and license compliance pass cleanly.

### 2. Launch the Application
Double-click `start.bat` or run:
```bash
# Terminal 1: Launch Python Sidecar Engine
.\venv\Scripts\python sidecar-engine\main.py --port 8765

# Terminal 2: Launch Vite Desktop UI
npm run dev
```
Open [http://localhost:5173](http://localhost:5173) in your browser or run via Tauri desktop shell.

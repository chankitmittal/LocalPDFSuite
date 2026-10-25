# LocalPDF Suite — 100% Offline PDF & Image Workstation

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE.md)
[![Platform: Windows](https://img.shields.io/badge/Platform-Windows-0078D6.svg)](https://microsoft.com)
[![Privacy: 100% Offline](https://img.shields.io/badge/Privacy-100%25_Offline-10B981.svg)](#privacy--security-guarantee)
[![Compliance: Zero AGPL/GPL](https://img.shields.io/badge/Compliance-Zero_AGPL%2FGPL-8B5CF6.svg)](#strict-compliance--permissive-licensing)

**LocalPDF Suite** is a high-performance, 100% offline desktop application designed as a private, secure replacement for web-based tools like *iLovePDF* and *iLoveIMG*. 

It combines **Tauri v2 (Rust)**, **React 18 + TypeScript + Tailwind CSS**, and a high-speed **Python sidecar engine** communicating over stdio IPC and local REST APIs.

---

## Key Highlights

- 🔒 **100% Offline & Private:** Zero external telemetry, zero cloud uploads. All document operations execute entirely on your local machine.
- ⚡ **Ghostscript-Free Performance:** Blazing-fast PDF compression and manipulation without heavy or restrictive third-party runtimes.
- 🛡️ **True Irreversible Redaction:** Renders pixel raster sanitization at the engine level to ensure redacted content cannot be recovered via text extraction or reverse engineering.
- ⚖️ **Permissive Licensing (Zero AGPL/GPL):** Strictly audited for enterprise and commercial compliance.

---

## Feature Matrix

### 1. Organize
- **Merge PDF:** Combine multiple PDF files in custom sequence.
- **Split PDF:** Extract page ranges (e.g. `1-3, 5, 7-10`), split into equal chunks, or extract every page into separate files.
- **Organize & Rotate:** Interactive drag-and-drop page thumbnail organizer (`@dnd-kit/core`), per-page 90°/180°/270° rotation, and page deletion.
- **Compress PDF:** Ghostscript-free XObject stream downsampling and JPEG re-encoding with *Smallest*, *Recommended*, and *High Quality* presets (achieving over 80% reduction).

### 2. Edit & Forms
- **Edit PDF:** Full canvas editor to place text, geometric shapes, whiteout patches, freehand brush strokes, and images onto documents.
- **Prepare Form (Form Builder):** Visual drag-and-drop interactive form designer to place text fields, checkboxes, dropdowns, and date pickers.
- **Fill Form:** Auto-detect and fill AcroForm interactive fields, export form data to JSON/CSV, and flatten forms to permanent print-ready PDFs.
- **Watermark & Page Numbers:** Text and image stamps with configurable opacity, rotation, hex color, tiling, and `Page X of Y` numbering.
- **Bates Stamping:** Legal litigation indexing with customizable prefix, suffix, digit padding, starting numbers, and page positioning.

### 3. Security & Review
- **True Redaction:** Irreversible pixel rasterization (`pypdfium2`) ensuring blacked-out sensitive text/graphics can never be recovered.
- **Digital Signatures (PAdES):** Cryptographic PAdES signing using PKCS#12 (`.pfx`/`.p12`) certificates and self-signed certificate generator, plus interactive visual signature drawing stamps.
- **Document Sanitization:** Strip metadata, document author info, revision history, embedded thumbnails, JavaScript actions, and annotations.
- **Visual PDF Compare:** Side-by-side comparison engine highlighting visual and structural differences between document revisions.
- **Security & Permissions:** AES-256 standard encryption, password protection, permissions locking, and cross-reference repair for corrupted files.

### 4. Convert & Utilities
- **Office to PDF:** Headless LibreOffice integration converting `.docx`, `.xlsx`, and `.pptx` documents into PDF.
- **PDF to Office:** Reconstruct PDFs into editable `.docx` (Word), `.xlsx` (Excel), and `.pptx` (PowerPoint) using `pdfplumber`, `python-docx`, and `openpyxl`.
- **Image Suite:** Convert PDF pages into PNG, JPEG, WebP, bulk convert image formats, resize, strip EXIF metadata, and compile images to PDF.
- **Offline OCR:** Generate searchable text-sandwich PDFs with local Tesseract OCR integration.
- **Action Wizard (Batch Pipelines):** Chain multiple operations (e.g., *Sanitize -> Compress -> Watermark -> Encrypt*) into automated batch workflows.

---

## Privacy & Security Guarantee

LocalPDF Suite was built from the ground up for strict confidentiality:
1. **No Outbound Network Calls:** The application binds strictly to local loops (`127.0.0.1` / stdio pipes).
2. **Local Processing:** Your tax forms, contracts, medical records, and legal briefs never leave your device.
3. **True Redaction:** Strips raw text and vector operators under redacted regions rather than merely drawing black rectangles on top.

---

## Strict Compliance & Permissive Licensing

LocalPDF Suite enforces a strict license compliance guardrail (**ZERO AGPL / GPL**):
- **Permissive licenses only:** MIT, Apache-2.0, BSD-2/3-Clause, MPL-2.0, PSF, and MIT-CMU.
- **Forbidden packages strictly excluded:** `PyMuPDF` (`fitz`), `Ghostscript`, `pdf2docx`, `iText`, `PDFtk`, `unoconv`, `PyQt`, `PySide`.
- **Audit Verification:** Tested automatically via `pytest sidecar-engine/tests/test_licenses.py`. Full third-party notices are maintained in [`THIRD-PARTY-NOTICES.txt`](THIRD-PARTY-NOTICES.txt) and [`sidecar-engine/third_party_notices.json`](sidecar-engine/third_party_notices.json).

---

## Getting Started

### Prerequisites
- **Node.js** (v18 or higher) and npm
- **Python** (v3.11 or higher)
- **Rust & Cargo** (for building Tauri desktop executable)
- *(Optional)* **LibreOffice** & **Tesseract OCR** (for Office conversion and OCR features)

### Local Development Setup

1. **Clone the repository:**
   ```bash
   git clone https://github.com/chankitmittal/LocalPDFSuite.git
   cd LocalPDFSuite
   ```

2. **Setup Python environment:**
   ```powershell
   python -m venv venv
   .\venv\Scripts\activate
   pip install -r sidecar-engine\requirements.txt
   ```

3. **Install Frontend Dependencies:**
   ```bash
   npm install
   ```

4. **Run Automated Test Suite:**
   ```powershell
   .\venv\Scripts\pytest sidecar-engine\tests
   ```

5. **Start Development Server:**
   ```powershell
   # Quick start script (launches sidecar + frontend dev server):
   .\start.bat
   ```
   Or launch individually:
   - Backend: `.\venv\Scripts\python sidecar-engine\main.py --port 8765`
   - Frontend: `npm run dev` (Access at `http://localhost:5173`)

---

## Building Desktop Application

To package LocalPDF Suite into a standalone Windows desktop executable:

```powershell
.\build-desktop.bat
```

This compiles:
1. The standalone Python sidecar executable via PyInstaller (`src-tauri/binaries/`).
2. The optimized Vite production frontend bundle (`dist/`).
3. The Tauri desktop binary with custom window management and stdio IPC integration.

---

## License

This project is licensed under the [MIT License](LICENSE.md) — see the LICENSE file for details.

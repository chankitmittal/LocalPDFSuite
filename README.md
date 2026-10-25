# LocalPDF Suite

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE.md)
[![Platform: Windows](https://img.shields.io/badge/Platform-Windows-0078D6.svg)](https://microsoft.com)
[![Privacy: 100% Offline](https://img.shields.io/badge/Privacy-100%25_Offline-10B981.svg)](#privacy--security)
[![License Model: Permissive](https://img.shields.io/badge/Compliance-Permissive_Licenses-8B5CF6.svg)](#license-compliance)

**LocalPDF Suite** is a high-performance, 100% offline desktop workstation for viewing, editing, organizing, converting, and securing PDF documents and images.

Built with **Tauri v2 (Rust)**, **React 18 + TypeScript**, and a high-speed **Python sidecar engine**, LocalPDF Suite delivers full desktop power directly on your machine without requiring cloud uploads, subscriptions, or external network access.

---

## Core Capabilities

### 📄 Organize & Optimize
- **Merge PDF:** Combine multiple PDF documents in any custom order.
- **Split PDF:** Extract page ranges (e.g. `1-3, 5, 7-10`), split into even chunks, or export individual pages.
- **Organize & Rotate:** Visual thumbnail grid with drag-and-drop page reordering, 90°/180°/270° rotation, and page deletion.
- **Compress PDF:** High-efficiency stream downsampling and JPEG re-encoding with *Smallest Size*, *Recommended*, and *High Quality* presets.

### ✏️ Edit & Interactive Forms
- **Visual PDF Editor:** Canvas tools to insert text, geometric shapes, whiteout patches, freehand brush drawings, and images.
- **Form Builder:** Drag-and-drop interactive form designer to place text fields, checkboxes, dropdown menus, and date pickers.
- **Form Fill & Flatten:** Automatically detect and fill interactive PDF form fields, export values to JSON/CSV, and flatten forms for permanent archiving.
- **Watermark & Page Numbers:** Customizable text and image stamps with opacity, rotation, hex colors, tiling, and dynamic `Page X of Y` numbering.
- **Bates Stamping:** Legal litigation indexing with configurable prefixes, suffixes, digit padding, starting counters, and page placement.

### 🔒 Security & Privacy
- **True Redaction:** Irreversible pixel raster sanitization destroying underlying vector data and text layers so sensitive content can never be extracted or recovered.
- **Digital Signatures (PAdES):** Cryptographic signatures using PKCS#12 (`.pfx`/`.p12`) certificates and self-signed certificate generation, alongside freehand visual signature stamps.
- **Document Sanitization:** Deep-clean PDF files by stripping document metadata, author information, revision history, embedded thumbnails, JavaScript actions, and hidden annotations.
- **Visual PDF Compare:** Side-by-side diff engine that highlights visual and structural differences between document revisions.
- **Encryption & Repair:** AES-256 standard encryption, password-based access control, granular permissions locking, and cross-reference table repair for damaged files.

### 🔄 Convert & Utilities
- **Document Conversion:** Convert Word (`.docx`), Excel (`.xlsx`), and PowerPoint (`.pptx`) documents to PDF, and export PDFs to editable Office formats.
- **Image Suite:** Convert PDF pages into PNG, JPEG, or WebP images, bulk convert image formats, resize by dimensions or percentage, and strip EXIF data.
- **Offline OCR:** Generate searchable text-sandwich PDFs with local optical character recognition.
- **Action Wizard (Batch Pipelines):** Chain multiple operations (e.g., *Sanitize -> Compress -> Watermark -> Encrypt*) into automated batch processing workflows.

---

## Architecture & Technology Stack

LocalPDF Suite uses a multi-process desktop architecture:

```
┌────────────────────────────────────────────────────────┐
│                   Desktop UI (Vite + React)            │
│       React 18 • TypeScript • Tailwind CSS • Lucide    │
└───────────────────────────┬────────────────────────────┘
                            │
               Tauri v2 IPC (Rust Backend)
                            │
┌───────────────────────────┴────────────────────────────┐
│                  Local Processing Engine               │
│         FastAPI / Stdio IPC Sidecar (Python 3.11+)     │
│   pikepdf • pypdf • pypdfium2 • pyHanko • ReportLab    │
└────────────────────────────────────────────────────────┘
```

- **Frontend:** React 18, TypeScript, Tailwind CSS, Lucide icons, `@dnd-kit` for drag-and-drop interactions, and `pdfjs-dist` for client-side rendering.
- **Desktop Shell:** Tauri v2 in Rust providing native windowing, secure system dialogs, and robust process supervision.
- **Sidecar Engine:** Python worker handling PDF cryptography, rasterization, document parsing, and batch transformation via bidirectional stdio IPC and local REST services.

---

## Privacy & Security

LocalPDF Suite was designed from the ground up for confidential, privacy-sensitive environments:
- **Zero Network Transmission:** All operations are executed locally. The application makes no external internet calls and collects zero analytics or telemetry.
- **Local Storage Only:** Documents and intermediate scratch files remain solely within your local environment.
- **Irreversible Redaction:** Redacted regions are permanently destroyed at the raster level, guaranteeing that erased data cannot be restored.

---

## License Compliance

LocalPDF Suite relies exclusively on permissive and weak-copyleft open-source licenses (MIT, Apache 2.0, BSD, MPL 2.0, PSF):
- Complete license notices for all runtime dependencies are documented in [`THIRD-PARTY-NOTICES.txt`](THIRD-PARTY-NOTICES.txt) and [`sidecar-engine/third_party_notices.json`](sidecar-engine/third_party_notices.json).
- Automated license compliance is verified via continuous test suites (`sidecar-engine/tests/test_licenses.py`).

---

## Getting Started

### Prerequisites
- **Node.js** (v18 or higher) and npm
- **Python** (v3.11 or higher)
- **Rust & Cargo** (for building the native desktop binary)
- *(Optional)* **LibreOffice** & **Tesseract OCR** (for Office conversion and OCR features)

### Local Development

1. **Clone the repository:**
   ```bash
   git clone https://github.com/chankitmittal/LocalPDFSuite.git
   cd LocalPDFSuite
   ```

2. **Set up the Python backend:**
   ```powershell
   python -m venv venv
   .\venv\Scripts\activate
   pip install -r sidecar-engine\requirements.txt
   ```

3. **Install frontend dependencies:**
   ```bash
   npm install
   ```

4. **Run test suite:**
   ```powershell
   .\venv\Scripts\pytest sidecar-engine\tests
   ```

5. **Start development mode:**
   ```powershell
   .\start.bat
   ```
   Or run the services manually:
   - Backend: `.\venv\Scripts\python sidecar-engine\main.py --port 8765`
   - Frontend: `npm run dev` (available at `http://localhost:5173`)

---

## Building Standalone Desktop App

To create an optimized, standalone Windows desktop application:

```powershell
.\build-desktop.bat
```

This script:
1. Packages the Python sidecar engine into a standalone binary using PyInstaller.
2. Compiles the production frontend bundle via Vite.
3. Builds the native Tauri desktop executable.

---

## License

This project is licensed under the [MIT License](LICENSE.md).

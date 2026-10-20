# Project Implementation Plan: Offline PDF & Image Suite ("LocalPDF")

## 1. Project Overview & Core Directives
Build a 100% offline, cross-platform desktop application providing all core features of **iLovePDF** and **iLoveIMG** (PDF manipulation, compression, Office conversion, OCR, signing, and bulk image processing).

### Strict Agent Guardrails (CRITICAL)
1. **ZERO AGPL / GPL Dependencies:** Never install or import `PyMuPDF` (`fitz`), `Ghostscript`, `pdf2docx` (vanilla), `iText`, `PDFtk`, `unoconv`, or `PyQt`/`PySide`.
2. **Permissive & Weak-Copyleft Only:** Strictly use MIT, Apache-2.0, BSD-3-Clause, ISC, MPL-2.0, or dynamically linked LGPLv2.1 libraries.
3. **100% Offline Execution:** Zero external API calls, telemetry, or cloud dependencies at runtime.
4. **Non-Blocking UI:** All file I/O and document/image processing must execute asynchronously inside the Python sidecar worker or Rust backend thread pool.

---

## 2. Technology Stack & Approved Dependency Manifest

### Frontend & Desktop Shell
- **Desktop Shell:** Tauri v2 (`MIT / Apache-2.0`)
- **UI Framework:** React 18+ with TypeScript, Vite, Tailwind CSS (`MIT`)
- **State & Drag-and-Drop:** Zustand (`MIT`), `@dnd-kit/core` (`MIT`)
- **Client PDF Canvas/Preview:** `pdfjs-dist` / Mozilla PDF.js (`Apache-2.0`)

### Backend Sidecar (Python 3.11+ compiled via PyInstaller/Nuitka)
- **IPC / Local RPC Server:** FastAPI (`MIT`) + Uvicorn (`BSD-3-Clause`) bound to an ephemeral localhost port or stdio IPC.
- **PDF Structural Engine:** `pikepdf` (`MPL-2.0`, powered by C++ `QPDF` `Apache-2.0`) & `pypdf` (`BSD-3-Clause`)
- **PDF Rendering & Text Extraction:** `pypdfium2` (`Apache-2.0 / BSD-3-Clause`)
- **PDF Table & Layout Analysis:** `pdfplumber` (`MIT`, built on `pdfminer.six` `MIT`)
- **PDF Generation & Overlays:** `reportlab` (Open Source BSD edition, `BSD-3-Clause`) & `img2pdf` (`LGPL-3.0` dynamic / fallback to `Pillow` `MIT-CMU`)
- **Digital Signatures:** `pyHanko` (`MIT`)
- **Office Reconstruction:** `python-docx` (`MIT`), `openpyxl` (`MIT`), `python-pptx` (`MIT`)
- **Image Processing Engine:** `Pillow` (`MIT-CMU`), `pyvips` (`MIT` wrapper over `libvips` `LGPL-2.1`)

### Bundled External CLI Binaries (Subprocess Execution Only)
- **Office to PDF:** LibreOffice Headless (`soffice` — `MPL-2.0`)
- **OCR Engine:** Tesseract OCR v5 (`tesseract` — `Apache-2.0`)

---

## 3. Target Repository Structure

```text
local-pdf-suite/
├── PLAN.md
├── package.json
├── src/                          # React + TypeScript Frontend
│   ├── components/
│   │   ├── dropzone/             # Multi-file drag & drop intake
│   │   ├── pdf-canvas/           # PDF.js thumbnail grid, crop & sign UI
│   │   └── tool-panels/          # Feature-specific configuration sidebars
│   ├── hooks/                    # IPC/Sidecar communication hooks
│   ├── store/                    # Job queue & application state
│   └── App.tsx
├── src-tauri/                    # Tauri v2 Rust Host
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   └── src/
│       ├── main.rs               # Spawns & manages Python sidecar lifecycle
│       └── plugins.rs            # Offline module manager (LibreOffice/Tesseract)
└── sidecar-engine/               # Python Processing Engine
    ├── requirements.txt
    ├── main.py                   # FastAPI / IPC entrypoint
    ├── core/
    │   ├── pdf_structural.py     # Merge, split, rotate, unlock, protect, repair
    │   ├── pdf_compress.py       # Custom XObject downsampling + QPDF stream opt
    │   ├── pdf_overlays.py       # Watermarks, page numbers, stamps, redaction
    │   ├── pdf_to_office.py      # PDFium + pdfplumber -> docx/xlsx/pptx
    │   ├── office_to_pdf.py      # Isolated LibreOffice headless worker pool
    │   ├── pdf_ocr.py            # PDFium + Tesseract sandwich PDF pipeline
    │   ├── pdf_sign.py           # pyHanko cryptographic signing
    │   └── image_suite.py        # Compress, resize, crop, convert images
    └── tests/                    # Pytest unit & license compliance tests
```

---

## 4. Phased Implementation Checklist

### Milestone 1: Workspace Scaffolding & Sidecar Bridge
- [ ] **Task 1.1:** Initialize Vite + React + TypeScript + Tailwind CSS frontend and Tauri v2 (`src-tauri`) project.
- [ ] **Task 1.2:** Create `sidecar-engine/` Python virtual environment and `requirements.txt` with pinned permissive dependencies (`fastapi`, `uvicorn`, `pikepdf`, `pypdf`, `pypdfium2`, `pdfplumber`, `reportlab`, `python-docx`, `openpyxl`, `python-pptx`, `pyHanko`, `Pillow`).
- [ ] **Task 1.3:** Implement a license verification test (`tests/test_licenses.py`) using `pip-licenses` that fails if any `GPL` or `AGPL` package is present in the environment.
- [ ] **Task 1.4:** Build the Rust sidecar manager in `src-tauri/src/main.rs` to launch the Python FastAPI server on a random free local port, validate `/health`, and cleanly terminate the process on app exit.

### Milestone 2: Structural PDF Operations (`core/pdf_structural.py`)
- [ ] **Task 2.1 (Merge & Split):** Implement `merge_pdfs(file_paths, output_path)` and `split_pdf(file_path, ranges, mode)` using `pikepdf`. Support splitting by custom page ranges, fixed N-page intervals, and extracting every page into individual PDFs.
- [ ] **Task 2.2 (Organize):** Implement page reordering, rotation (90/180/270 degrees), and page deletion accepting a JSON array of page transformations from the frontend.
- [ ] **Task 2.3 (Security & Repair):** Implement AES-256 encryption (`pikepdf.Encryption`), password removal (when owner/user password is provided), and QPDF cross-reference table recovery for corrupted PDFs.
- [ ] **Task 2.4 (Frontend UI):** Build the interactive page grid using `pdfjs-dist` and `@dnd-kit/core` allowing users to visually drag, rotate, select, and delete pages before executing structural tasks.

### Milestone 3: Ghostscript-Free Compression & Overlays (`core/pdf_compress.py`, `core/pdf_overlays.py`)
- [ ] **Task 3.1 (Custom PDF Compressor):** Implement `compress_pdf(input_path, output_path, level)` using `pikepdf` and `Pillow`:
  - `level="low"` (High Quality): 200 DPI threshold, JPEG quality 85.
  - `level="medium"` (Recommended): 144 DPI threshold, JPEG quality 70.
  - `level="extreme"` (Smallest Size): 72 DPI threshold, JPEG quality 50, monochrome conversion where applicable.
  - Strip unreferenced resources and save with `compress_streams=True` and `ObjectStreamMode.generate`.
- [ ] **Task 3.2 (Watermarks & Page Numbers):** Generate transparent overlay PDFs in memory using `reportlab` (supporting custom fonts, opacity, rotation, diagonal/grid tiling, and dynamic `Page X of Y` numbering) and stamp them onto target pages via `pypdf`.
- [ ] **Task 3.3 (True PDF Redaction):** Build coordinate-based redaction that rasterizes the redacted page region via `pypdfium2` (or strips underlying text operators via `pikepdf`) so redacted text cannot be copied or recovered from the content stream.

### Milestone 4: Image Suite & PDF-to-Image (`core/image_suite.py`)
- [ ] **Task 4.1 (PDF <-> Image):** Implement high-speed `pdf_to_images()` using `pypdfium2` (outputting JPG, PNG, or WebP at configurable DPI) and lossless `images_to_pdf()` using `Pillow` / `img2pdf`.
- [ ] **Task 4.2 (Bulk Image Tools):** Build bulk image compression, resizing (by dimensions or percentage), cropping, and format conversion (`JPG`, `PNG`, `WebP`, `AVIF`, `TIFF`) with EXIF stripping options.

### Milestone 5: Office Conversions (`core/office_to_pdf.py`, `core/pdf_to_office.py`)
- [ ] **Task 5.1 (Office to PDF Worker):** Implement a Python subprocess wrapper for `soffice --headless --convert-to pdf`. Use temporary isolated user profiles (`-env:UserInstallation=file:///...`) so concurrent conversions do not deadlock.
- [ ] **Task 5.2 (PDF to Excel):** Use `pdfplumber` to detect explicit vector lines and implicit text-aligned columns across pages, writing extracted tables into multi-sheet `.xlsx` files via `openpyxl`.
- [ ] **Task 5.3 (PDF to Word):** Build an MIT-compliant layout reconstruction pipeline:
  - Extract character bounding boxes, font metrics, and styles via `pdfplumber` / `pypdfium2`.
  - Extract embedded images and bounding coordinates via `pikepdf`.
  - Group text lines into paragraphs, detect multi-column layouts and tables, and synthesize a structured `.docx` document via `python-docx`.
- [ ] **Task 5.4 (PDF to PowerPoint):** Render background graphical layers via `pypdfium2` and overlay editable text boxes at matching coordinates using `python-pptx`.

### Milestone 6: Offline OCR & Cryptographic Signing (`core/pdf_ocr.py`, `core/pdf_sign.py`)
- [ ] **Task 6.1 (Searchable PDF OCR):** Implement an offline OCR pipeline that renders scanned pages via `pypdfium2`, invokes the local `tesseract` binary (`pdf` output mode) to generate an invisible searchable text layer, and merges/optimizes the output via `pikepdf`.
- [ ] **Task 6.2 (Digital Signatures):** Integrate `pyHanko` to support both visual signature stamping (hand-drawn canvas or uploaded image) and cryptographic PAdES signing using user-supplied `.pfx`/`.p12` certificates.

### Milestone 7: Packaging, Plugin Manager & Compliance
- [ ] **Task 7.1 (Sidecar Compilation):** Configure PyInstaller (`sidecar.spec`) to compile `sidecar-engine` into a standalone executable placed in `src-tauri/binaries/` following Tauri's target-triple naming convention.
- [ ] **Task 7.2 (Modular Offline Plugin Manager):** Build a Settings screen that detects whether portable LibreOffice and Tesseract binaries are present in the local app data directory, allowing users to import or install offline `.zip` packs on demand.
- [ ] **Task 7.3 (Third-Party Attribution):** Auto-generate `THIRD-PARTY-NOTICES.txt` from both `npm` and `pip` dependency trees and expose an offline "Open Source Licenses" view inside the desktop UI.

---

## 5. Verification & Acceptance Criteria
1. **License Audit Gate:** `pytest sidecar-engine/tests/test_licenses.py` passes with zero GPL/AGPL packages detected.
2. **Air-Gapped Functional Test:** All conversion, compression, and OCR workflows succeed with the system network interface disabled.
3. **Compression Benchmark:** A 10 MB mixed text-and-image PDF compresses by at least 50% under the `medium` preset in under 3 seconds without Ghostscript.
4. **Redaction Security Check:** Text underneath a redacted bounding box cannot be found via `Ctrl+F` or extracted via `pdfplumber` on the output file.
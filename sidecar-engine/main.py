"""
LocalPDF Sidecar Engine Entrypoint
Provides high-performance local REST & IPC API for Tauri host & React frontend.
100% Offline, Zero Cloud Dependencies.
"""

import os
import shutil
import tempfile
from typing import List, Optional, Dict, Any
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel
import uvicorn

# Core functional imports
from core.pdf_structural import (
    merge_pdfs,
    split_pdf,
    organize_pdf,
    protect_pdf,
    unlock_pdf,
    repair_pdf,
)
from core.pdf_compress import compress_pdf
from core.pdf_overlays import (
    add_text_watermark,
    add_page_numbers,
    redact_pdf,
    search_redaction_boxes,
)
from core.image_suite import (
    pdf_to_images,
    images_to_pdf,
    process_single_image,
    bulk_process_images,
)
from core.office_to_pdf import (
    convert_office_to_pdf,
    find_libreoffice_binary,
)
from core.pdf_to_office import (
    pdf_to_excel,
    pdf_to_word,
    pdf_to_powerpoint,
)
from core.pdf_ocr import (
    run_ocr_on_pdf,
    find_tesseract_binary,
)
from core.pdf_sign import (
    sign_pdf_visual,
    sign_pdf_cryptographic,
    generate_self_signed_cert,
)
from core.pdf_forms import (
    get_pdf_form_fields,
    fill_pdf_form,
)
from core.pdf_edit import (
    apply_pdf_edits,
)
from core.pdf_compare import (
    analyze_document_comparison,
    render_page_diff_view,
    generate_diff_report_pdf,
)
from core.pdf_bates import (
    apply_bates_stamping,
)
from core.pdf_forms_batch import (
    batch_extract_forms_to_spreadsheet,
)
from core.pdf_sanitize import (
    inspect_pdf_privacy,
    sanitize_pdf_document,
)
from core.pdf_pipeline import (
    WORKFLOW_PRESETS,
    batch_execute_pipeline,
)
from core.pdf_form_builder import (
    auto_detect_form_fields,
    create_interactive_form_pdf,
)

from workspace_utils import (
    WORKSPACE_DIR,
    purge_expired_workspace_files,
    get_safe_workspace_path,
)

# Clean up stale files older than 24 hours on sidecar startup
purge_expired_workspace_files(24.0)


app = FastAPI(
    title="LocalPDF Sidecar Engine",
    description="Offline PDF & Image processing engine",
    version="1.0.0",
)

# CORS restricted to Tauri desktop webview and local Vite development ports
ALLOWED_ORIGINS = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:4173",
    "http://127.0.0.1:4173",
    "tauri://localhost",
    "https://tauri.localhost",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

SESSION_TOKEN = os.environ.get("LOCALPDF_SESSION_TOKEN", "").strip()


@app.middleware("http")
async def verify_session_token_middleware(request: Request, call_next):
    # Enforce loopback session token check if LOCALPDF_SESSION_TOKEN is configured in environment
    if SESSION_TOKEN:
        # Exempt health check and CORS OPTIONS preflights
        if request.method != "OPTIONS" and request.url.path not in ("/health", "/docs", "/openapi.json"):
            token_header = request.headers.get("X-LocalPDF-Token", "")
            token_query = request.query_params.get("token", "")
            if token_header != SESSION_TOKEN and token_query != SESSION_TOKEN:
                return JSONResponse(
                    status_code=401,
                    content={"detail": "Unauthorized: Missing or invalid LocalPDF session token"},
                )
    return await call_next(request)


# ==================== Health & Diagnostics ====================

@app.get("/health")
def health():
    return {
        "status": "ok",
        "version": "1.0.0",
        "engine": "LocalPDF Sidecar Engine",
        "mode": "100% Offline",
    }


@app.get("/system/status")
def system_status(
    custom_soffice: Optional[str] = None,
    custom_tesseract: Optional[str] = None,
):
    soffice_path = find_libreoffice_binary(custom_soffice)
    tess_path = find_tesseract_binary(custom_tesseract)
    return {
        "libreoffice": {
            "installed": soffice_path is not None,
            "path": soffice_path,
        },
        "tesseract": {
            "installed": tess_path is not None,
            "path": tess_path,
        },
        "workspace_dir": WORKSPACE_DIR,
    }


# ==================== File Management ====================

@app.post("/api/files/upload")
async def upload_file(file: UploadFile = File(...)):
    """Saves uploaded file into local temporary workspace and returns file path."""
    import re
    raw_name = file.filename or "uploaded_file"
    safe_name = os.path.basename(raw_name)
    safe_name = re.sub(r'[\0\r\n\t]', '', safe_name)
    if not safe_name or safe_name in ('.', '..'):
        safe_name = "uploaded_file"

    dest_path = os.path.join(WORKSPACE_DIR, safe_name)
    # Ensure unique filename if collision
    base, ext = os.path.splitext(safe_name)
    counter = 1
    while os.path.exists(dest_path):
        dest_path = os.path.join(WORKSPACE_DIR, f"{base}_{counter}{ext}")
        counter += 1

    with open(dest_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    return {
        "status": "success",
        "filename": os.path.basename(dest_path),
        "file_path": os.path.abspath(dest_path),
        "size": os.path.getsize(dest_path),
    }


@app.get("/api/download")
@app.get("/api/files/download")
def download_file(
    path: Optional[str] = Query(None),
    file: Optional[str] = Query(None),
    filename: Optional[str] = Query(None),
):
    chosen = None
    for param in (path, file, filename):
        if isinstance(param, str) and param.strip():
            chosen = param.strip()
            break

    if not chosen:
        raise HTTPException(status_code=400, detail="Missing required 'file' or 'path' query parameter.")

    real_workspace = os.path.realpath(WORKSPACE_DIR)

    # If absolute path was passed, verify boundary; otherwise resolve inside WORKSPACE_DIR
    if os.path.isabs(chosen):
        real_path = os.path.realpath(chosen)
    else:
        # Strip directory traversal characters
        safe_name = os.path.basename(chosen.replace("\\", "/"))
        real_path = os.path.realpath(os.path.join(real_workspace, safe_name))

    # Security check: ensure target is strictly inside WORKSPACE_DIR
    if not (real_path == real_workspace or real_path.startswith(real_workspace + os.sep)):
        raise HTTPException(status_code=403, detail="Access denied: Path is outside workspace boundary.")

    if not os.path.isfile(real_path):
        raise HTTPException(status_code=404, detail=f"File not found: {os.path.basename(real_path)}")

    download_name = os.path.basename(real_path)
    ext = os.path.splitext(download_name)[1].lower()

    media_type_map = {
        ".pdf": "application/pdf",
        ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        ".csv": "text/csv; charset=utf-8",
        ".zip": "application/zip",
        ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".webp": "image/webp",
    }
    media_type = media_type_map.get(ext, "application/octet-stream")

    return FileResponse(
        real_path,
        filename=download_name,
        media_type=media_type,
        headers={"Content-Disposition": f'attachment; filename="{download_name}"'},
    )


# ==================== Structural Operations ====================

class MergeRequest(BaseModel):
    file_paths: List[str]
    output_filename: str = "merged.pdf"


@app.post("/api/structural/merge")
def api_merge(req: MergeRequest):
    out_path = get_safe_workspace_path(req.output_filename, "merged.pdf")
    try:
        return merge_pdfs(req.file_paths, out_path)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


class SplitRequest(BaseModel):
    file_path: str
    mode: str = "extract_all"  # 'extract_all', 'range', 'fixed'
    ranges: Optional[str] = None
    fixed_interval: int = 1


@app.post("/api/structural/split")
def api_split(req: SplitRequest):
    safe_base = os.path.splitext(os.path.basename(req.file_path))[0] or "split_doc"
    split_dir = os.path.join(WORKSPACE_DIR, f"split_{safe_base}")
    try:
        return split_pdf(
            file_path=req.file_path,
            output_dir=split_dir,
            mode=req.mode,
            ranges=req.ranges,
            fixed_interval=req.fixed_interval,
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


class PageAction(BaseModel):
    page_index: int
    rotation: int = 0
    deleted: bool = False


class OrganizeRequest(BaseModel):
    file_path: str
    output_filename: str = "organized.pdf"
    page_actions: List[PageAction]


@app.post("/api/structural/organize")
def api_organize(req: OrganizeRequest):
    out_path = get_safe_workspace_path(req.output_filename, "organized.pdf")
    try:
        actions = [a.model_dump() for a in req.page_actions]
        return organize_pdf(req.file_path, out_path, actions)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


class ProtectRequest(BaseModel):
    file_path: str
    user_password: str
    owner_password: Optional[str] = None
    output_filename: str = "protected.pdf"


@app.post("/api/structural/protect")
def api_protect(req: ProtectRequest):
    out_path = get_safe_workspace_path(req.output_filename, "protected.pdf")
    try:
        return protect_pdf(req.file_path, out_path, req.user_password, req.owner_password)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


class UnlockRequest(BaseModel):
    file_path: str
    password: str
    output_filename: str = "unlocked.pdf"


@app.post("/api/structural/unlock")
def api_unlock(req: UnlockRequest):
    out_path = get_safe_workspace_path(req.output_filename, "unlocked.pdf")
    try:
        return unlock_pdf(req.file_path, out_path, req.password)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


class RepairRequest(BaseModel):
    file_path: str
    output_filename: str = "repaired.pdf"


@app.post("/api/structural/repair")
def api_repair(req: RepairRequest):
    out_path = get_safe_workspace_path(req.output_filename, "repaired.pdf")
    try:
        return repair_pdf(req.file_path, out_path)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


# ==================== Compression ====================

class CompressRequest(BaseModel):
    file_path: str
    level: str = "medium"  # low, medium, extreme
    output_filename: str = "compressed.pdf"


@app.post("/api/compress")
def api_compress(req: CompressRequest):
    out_path = get_safe_workspace_path(req.output_filename, "compressed.pdf")
    try:
        return compress_pdf(req.file_path, out_path, req.level)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


# ==================== Overlays & Redaction ====================

class WatermarkRequest(BaseModel):
    file_path: str
    text: str
    font_size: int = 48
    opacity: float = 0.25
    rotation: float = 45.0
    hex_color: str = "#888888"
    tiled: bool = False
    page_numbers: Optional[List[int]] = None
    output_filename: str = "watermarked.pdf"


@app.post("/api/overlays/watermark")
def api_watermark(req: WatermarkRequest):
    out_path = get_safe_workspace_path(req.output_filename, "watermarked.pdf")
    try:
        return add_text_watermark(
            input_path=req.file_path,
            output_path=out_path,
            text=req.text,
            font_size=req.font_size,
            opacity=req.opacity,
            rotation=req.rotation,
            hex_color=req.hex_color,
            tiled=req.tiled,
            page_numbers=req.page_numbers,
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


class PageNumberRequest(BaseModel):
    file_path: str
    format_str: str = "Page {n} of {total}"
    position: str = "bottom-center"
    font_size: int = 10
    hex_color: str = "#333333"
    start_offset: int = 0
    output_filename: str = "numbered.pdf"


@app.post("/api/overlays/page-numbers")
def api_page_numbers(req: PageNumberRequest):
    out_path = get_safe_workspace_path(req.output_filename, "numbered.pdf")
    try:
        return add_page_numbers(
            input_path=req.file_path,
            output_path=out_path,
            format_str=req.format_str,
            position=req.position,
            font_size=req.font_size,
            hex_color=req.hex_color,
            start_offset=req.start_offset,
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


class RedactionBox(BaseModel):
    x: float
    y: float
    width: float
    height: float


class PageRedaction(BaseModel):
    page_number: int
    boxes: List[RedactionBox]


class RedactRequest(BaseModel):
    file_path: str
    redactions: List[PageRedaction]
    fill_color: str = "#000000"
    output_filename: str = "redacted.pdf"


@app.post("/api/overlays/redact")
def api_redact(req: RedactRequest):
    out_path = get_safe_workspace_path(req.output_filename, "redacted.pdf")
    try:
        payload = [
            {"page_number": r.page_number, "boxes": [b.model_dump() for b in r.boxes]}
            for r in req.redactions
        ]
        return redact_pdf(req.file_path, out_path, payload, req.fill_color)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


class SearchRedactionRequest(BaseModel):
    file_path: str
    query: Optional[str] = None
    pattern_type: Optional[str] = None


@app.post("/api/overlays/search-redaction")
def api_search_redaction(req: SearchRedactionRequest):
    try:
        return search_redaction_boxes(
            pdf_path=req.file_path,
            query=req.query,
            pattern_type=req.pattern_type,
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


# ==================== Image Suite ====================

class PdfToImagesRequest(BaseModel):
    file_path: str
    image_format: str = "PNG"
    dpi: int = 200


@app.post("/api/images/pdf-to-images")
def api_pdf_to_images(req: PdfToImagesRequest):
    import zipfile
    safe_base = os.path.splitext(os.path.basename(req.file_path))[0] or "pdf_images"
    out_dir = os.path.join(WORKSPACE_DIR, f"images_{safe_base}")
    try:
        res = pdf_to_images(req.file_path, out_dir, req.image_format, req.dpi)
        # Package rendered pages into ZIP for convenient download if multiple pages
        out_files = res.get("output_files", [])
        if len(out_files) > 1:
            zip_path = os.path.join(WORKSPACE_DIR, f"{safe_base}_images.zip")
            with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
                for f in out_files:
                    zf.write(f, os.path.basename(f))
            res["output_path"] = zip_path
            res["zip_path"] = zip_path
        elif len(out_files) == 1:
            res["output_path"] = out_files[0]
        return res
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


class ImagesToPdfRequest(BaseModel):
    image_paths: List[str]
    output_filename: str = "images_to_pdf.pdf"


@app.post("/api/images/images-to-pdf")
def api_images_to_pdf(req: ImagesToPdfRequest):
    out_path = get_safe_workspace_path(req.output_filename, "images_to_pdf.pdf")
    try:
        return images_to_pdf(req.image_paths, out_path)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


class BulkImageRequest(BaseModel):
    file_paths: List[str]
    target_format: Optional[str] = None
    quality: int = 85
    resize_mode: Optional[str] = None
    width: Optional[int] = None
    height: Optional[int] = None
    percentage: Optional[float] = None
    strip_exif: bool = True


@app.post("/api/images/bulk-process")
def api_bulk_images(req: BulkImageRequest):
    out_dir = os.path.join(WORKSPACE_DIR, "processed_images")
    try:
        return bulk_process_images(
            file_paths=req.file_paths,
            output_dir=out_dir,
            target_format=req.target_format,
            quality=req.quality,
            resize_mode=req.resize_mode,
            width=req.width,
            height=req.height,
            percentage=req.percentage,
            strip_exif=req.strip_exif,
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


# ==================== Office Conversions ====================

class OfficeToPdfRequest(BaseModel):
    file_path: str
    custom_soffice_path: Optional[str] = None


@app.post("/api/office/office-to-pdf")
def api_office_to_pdf(req: OfficeToPdfRequest):
    out_dir = WORKSPACE_DIR
    res = convert_office_to_pdf(req.file_path, out_dir, req.custom_soffice_path)
    if res.get("status") != "success":
        raise HTTPException(status_code=400, detail=res)
    return res


class PdfToOfficeRequest(BaseModel):
    file_path: str
    output_filename: Optional[str] = None


@app.post("/api/office/pdf-to-excel")
def api_pdf_to_excel(req: PdfToOfficeRequest):
    base = os.path.splitext(os.path.basename(req.file_path))[0]
    out_filename = req.output_filename or f"{base}.xlsx"
    out_path = get_safe_workspace_path(out_filename, f"{base}.xlsx")
    try:
        return pdf_to_excel(req.file_path, out_path)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/api/office/pdf-to-word")
def api_pdf_to_word(req: PdfToOfficeRequest):
    base = os.path.splitext(os.path.basename(req.file_path))[0]
    out_filename = req.output_filename or f"{base}.docx"
    out_path = get_safe_workspace_path(out_filename, f"{base}.docx")
    try:
        return pdf_to_word(req.file_path, out_path)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/api/office/pdf-to-powerpoint")
def api_pdf_to_powerpoint(req: PdfToOfficeRequest):
    base = os.path.splitext(os.path.basename(req.file_path))[0]
    out_filename = req.output_filename or f"{base}.pptx"
    out_path = get_safe_workspace_path(out_filename, f"{base}.pptx")
    try:
        return pdf_to_powerpoint(req.file_path, out_path)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


# ==================== OCR Pipeline ====================

class OcrRequest(BaseModel):
    file_path: str
    language: str = "eng"
    dpi: int = 300
    custom_tesseract_path: Optional[str] = None
    output_filename: str = "ocr_searchable.pdf"


@app.post("/api/ocr/run")
def api_ocr(req: OcrRequest):
    out_path = get_safe_workspace_path(req.output_filename, "ocr_searchable.pdf")
    res = run_ocr_on_pdf(
        input_pdf_path=req.file_path,
        output_pdf_path=out_path,
        language=req.language,
        dpi=req.dpi,
        custom_tesseract_path=req.custom_tesseract_path,
    )
    if res.get("status") != "success":
        raise HTTPException(status_code=400, detail=res)
    return res


# ==================== Digital Signatures ====================

class VisualSignRequest(BaseModel):
    file_path: str
    signature_image_path: str
    page_number: int = 1
    x: float = 100.0
    y: float = 100.0
    width: float = 150.0
    height: float = 50.0
    output_filename: str = "signed_visual.pdf"


@app.post("/api/sign/visual")
def api_sign_visual(req: VisualSignRequest):
    out_path = get_safe_workspace_path(req.output_filename, "signed_visual.pdf")
    try:
        return sign_pdf_visual(
            input_path=req.file_path,
            output_path=out_path,
            signature_image_path=req.signature_image_path,
            page_number=req.page_number,
            x=req.x,
            y=req.y,
            width=req.width,
            height=req.height,
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


class CryptoSignRequest(BaseModel):
    file_path: str
    pfx_path: str
    passphrase: str
    reason: str = "Digitally signed with LocalPDF"
    location: str = "Local Desktop"
    contact_info: Optional[str] = None
    visible: bool = True
    page_number: int = 1
    x: float = 350.0
    y: float = 50.0
    width: float = 220.0
    height: float = 70.0
    output_filename: str = "signed_crypto.pdf"


@app.post("/api/sign/crypto")
def api_sign_crypto(req: CryptoSignRequest):
    out_path = get_safe_workspace_path(req.output_filename, "signed_crypto.pdf")
    try:
        box = (req.x, req.y, req.x + req.width, req.y + req.height) if req.visible else None
        return sign_pdf_cryptographic(
            input_path=req.file_path,
            output_path=out_path,
            pfx_path=req.pfx_path,
            passphrase=req.passphrase,
            reason=req.reason,
            location=req.location,
            contact_info=req.contact_info,
            visible=req.visible,
            page_number=req.page_number,
            box=box,
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


class GenerateCertRequest(BaseModel):
    passphrase: str
    common_name: str = "LocalPDF Signer"
    organization: str = "LocalPDF Suite"
    days_valid: int = 365
    output_filename: str = "local_certificate.pfx"


@app.post("/api/sign/generate-cert")
def api_generate_cert(req: GenerateCertRequest):
    out_path = get_safe_workspace_path(req.output_filename, "local_certificate.pfx")
    try:
        return generate_self_signed_cert(
            output_pfx_path=out_path,
            passphrase=req.passphrase,
            common_name=req.common_name,
            organization=req.organization,
            days_valid=req.days_valid,
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


# ==================== PDF Form Filling ====================

class FormFieldsRequest(BaseModel):
    file_path: str


@app.post("/api/forms/fields")
def api_form_fields(req: FormFieldsRequest):
    try:
        return get_pdf_form_fields(req.file_path)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


class FillFormRequest(BaseModel):
    file_path: str
    field_values: Optional[Dict[str, Any]] = None
    text_annotations: Optional[List[Dict[str, Any]]] = None
    flatten: bool = True
    lock_permissions: bool = False
    permissions_password: Optional[str] = None
    output_filename: str = "filled_form.pdf"


@app.post("/api/forms/fill")
def api_fill_form(req: FillFormRequest):
    out_path = get_safe_workspace_path(req.output_filename, "filled_form.pdf")
    try:
        return fill_pdf_form(
            input_path=req.file_path,
            output_path=out_path,
            field_values=req.field_values,
            text_annotations=req.text_annotations,
            flatten=req.flatten,
            lock_permissions=req.lock_permissions,
            permissions_password=req.permissions_password,
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


class BatchFormExportRequest(BaseModel):
    file_paths: List[str]
    output_base_name: Optional[str] = "batch_form_data"


@app.post("/api/forms/batch-export")
def api_batch_form_export(req: BatchFormExportRequest):
    if not req.file_paths:
        raise HTTPException(status_code=400, detail="No PDF files provided for batch form extraction")
    
    base_name = req.output_base_name or "batch_form_data"
    # Ensure safe filename
    base_name = os.path.splitext(os.path.basename(base_name))[0]
    
    try:
        res = batch_extract_forms_to_spreadsheet(
            pdf_paths=req.file_paths,
            output_dir=WORKSPACE_DIR,
            base_filename=base_name,
        )
        res["xlsx_url"] = f"/api/download?file={res['xlsx_filename']}"
        res["csv_url"] = f"/api/download?file={res['csv_filename']}"
        return res
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


# ==================== Prepare a Form (Form Designer & Builder) ====================

class DetectFieldsRequest(BaseModel):
    file_path: str


@app.post("/api/forms/builder/detect")
def api_form_builder_detect(req: DetectFieldsRequest):
    try:
        return auto_detect_form_fields(req.file_path)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


class SaveFormBuilderRequest(BaseModel):
    file_path: str
    fields: List[Dict[str, Any]]
    output_filename: Optional[str] = None


@app.post("/api/forms/builder/save")
def api_form_builder_save(req: SaveFormBuilderRequest):
    base = os.path.splitext(os.path.basename(req.file_path))[0]
    out_name = req.output_filename or f"fillable_{base}.pdf"
    out_path = get_safe_workspace_path(out_name, f"fillable_{base}.pdf")
    try:
        res = create_interactive_form_pdf(
            input_path=req.file_path,
            output_path=out_path,
            fields=req.fields,
        )
        res["download_url"] = f"/api/download?file={res['output_filename']}"
        return res
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


# ==================== PDF Direct Editing ====================

class ApplyEditsRequest(BaseModel):
    file_path: str
    edits: List[Dict[str, Any]]
    flatten: bool = True
    output_filename: str = "edited_document.pdf"


@app.post("/api/edit/apply")
def api_apply_edits(req: ApplyEditsRequest):
    out_path = get_safe_workspace_path(req.output_filename, "edited_document.pdf")
    try:
        return apply_pdf_edits(
            input_path=req.file_path,
            output_path=out_path,
            edits=req.edits,
            flatten=req.flatten,
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


# ==================== Document Comparison (Diff Engine) ====================

class CompareAnalyzeRequest(BaseModel):
    doc_a_path: str
    doc_b_path: str
    quick_visual_check: bool = True


class ComparePageRequest(BaseModel):
    doc_a_path: str
    doc_b_path: str
    page_number: int
    dpi: int = 150


class CompareExportReportRequest(BaseModel):
    doc_a_path: str
    doc_b_path: str
    output_filename: str = "comparison_report.pdf"


@app.post("/api/compare/analyze")
def api_compare_analyze(req: CompareAnalyzeRequest):
    try:
        return analyze_document_comparison(
            doc_a_path=req.doc_a_path,
            doc_b_path=req.doc_b_path,
            quick_visual_check=req.quick_visual_check,
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/api/compare/render-page")
def api_compare_render_page(req: ComparePageRequest):
    try:
        return render_page_diff_view(
            doc_a_path=req.doc_a_path,
            doc_b_path=req.doc_b_path,
            page_number=req.page_number,
            dpi=req.dpi,
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/api/compare/export-report")
def api_compare_export_report(req: CompareExportReportRequest):
    out_path = get_safe_workspace_path(req.output_filename, "comparison_report.pdf")
    try:
        return generate_diff_report_pdf(
            doc_a_path=req.doc_a_path,
            doc_b_path=req.doc_b_path,
            output_path=out_path,
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


# ==================== Bates Numbering & Legal Stamping ====================

class BatesStampRequest(BaseModel):
    file_paths: List[str]
    prefix: str = "CASE-"
    suffix: str = ""
    start_number: int = 1
    padding_digits: int = 6
    bates_position: str = "bottom-right"
    exhibit_text: Optional[str] = None
    exhibit_position: str = "top-right"
    font_family: str = "Helvetica"
    font_size: int = 10
    hex_color: str = "#000000"
    margin: float = 36.0
    shrink_content: bool = True
    target_pages: str = "all"
    custom_range: str = ""
    generate_csv_index: bool = True
    generate_zip: bool = True


@app.post("/api/bates/apply")
def api_bates_apply(req: BatesStampRequest):
    try:
        return apply_bates_stamping(
            input_paths=req.file_paths,
            output_dir=WORKSPACE_DIR,
            prefix=req.prefix,
            suffix=req.suffix,
            start_number=req.start_number,
            padding_digits=req.padding_digits,
            bates_position=req.bates_position,
            exhibit_text=req.exhibit_text,
            exhibit_position=req.exhibit_position,
            font_family=req.font_family,
            font_size=req.font_size,
            hex_color=req.hex_color,
            margin=req.margin,
            shrink_content=req.shrink_content,
            target_pages=req.target_pages,
            custom_range=req.custom_range,
            generate_csv_index=req.generate_csv_index,
            generate_zip=req.generate_zip,
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


# ==================== Deep Metadata Sanitizer & Privacy Purge ====================

class PrivacyInspectRequest(BaseModel):
    file_path: str


@app.post("/api/sanitize/inspect")
def api_sanitize_inspect(req: PrivacyInspectRequest):
    try:
        return inspect_pdf_privacy(req.file_path)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


class SanitizeRequest(BaseModel):
    file_path: str
    strip_metadata: bool = True
    strip_xmp: bool = True
    strip_attachments: bool = True
    strip_javascript: bool = True
    strip_actions: bool = True
    strip_annotations: bool = True
    keep_form_widgets: bool = True
    strip_hidden_layers: bool = True
    strip_bookmarks: bool = False
    strip_thumbnails: bool = True
    linearize: bool = True
    output_filename: Optional[str] = None


@app.post("/api/sanitize/run")
def api_sanitize_run(req: SanitizeRequest):
    base = os.path.splitext(os.path.basename(req.file_path))[0]
    out_filename = req.output_filename or f"sanitized_{base}.pdf"
    out_path = get_safe_workspace_path(out_filename, f"sanitized_{base}.pdf")
    try:
        res = sanitize_pdf_document(
            input_path=req.file_path,
            output_path=out_path,
            strip_metadata=req.strip_metadata,
            strip_xmp=req.strip_xmp,
            strip_attachments=req.strip_attachments,
            strip_javascript=req.strip_javascript,
            strip_actions=req.strip_actions,
            strip_annotations=req.strip_annotations,
            keep_form_widgets=req.keep_form_widgets,
            strip_hidden_layers=req.strip_hidden_layers,
            strip_bookmarks=req.strip_bookmarks,
            strip_thumbnails=req.strip_thumbnails,
            linearize=req.linearize,
        )
        res["download_url"] = f"/api/download?file={res['output_filename']}"
        return res
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


class BatchSanitizeRequest(BaseModel):
    file_paths: List[str]
    strip_metadata: bool = True
    strip_xmp: bool = True
    strip_attachments: bool = True
    strip_javascript: bool = True
    strip_actions: bool = True
    strip_annotations: bool = True
    keep_form_widgets: bool = True
    strip_hidden_layers: bool = True
    strip_bookmarks: bool = False
    strip_thumbnails: bool = True
    linearize: bool = True


@app.post("/api/sanitize/batch")
def api_sanitize_batch(req: BatchSanitizeRequest):
    if not req.file_paths:
        raise HTTPException(status_code=400, detail="No PDF files provided for batch sanitization")

    import zipfile
    results = []
    output_files = []
    total_saved_bytes = 0

    for path in req.file_paths:
        base = os.path.splitext(os.path.basename(path))[0]
        out_name = f"sanitized_{base}.pdf"
        out_path = get_safe_workspace_path(out_name, f"sanitized_{base}.pdf")
        try:
            r = sanitize_pdf_document(
                input_path=path,
                output_path=out_path,
                strip_metadata=req.strip_metadata,
                strip_xmp=req.strip_xmp,
                strip_attachments=req.strip_attachments,
                strip_javascript=req.strip_javascript,
                strip_actions=req.strip_actions,
                strip_annotations=req.strip_annotations,
                keep_form_widgets=req.keep_form_widgets,
                strip_hidden_layers=req.strip_hidden_layers,
                strip_bookmarks=req.strip_bookmarks,
                strip_thumbnails=req.strip_thumbnails,
                linearize=req.linearize,
            )
            r["filename"] = os.path.basename(path)
            r["download_url"] = f"/api/download?file={r['output_filename']}"
            results.append(r)
            output_files.append(out_path)
            total_saved_bytes += r.get("bytes_saved", 0)
        except Exception as e:
            results.append({"filename": os.path.basename(path), "error": str(e), "status": "error"})

    # Create ZIP bundle
    zip_name = f"sanitized_bundle_{len(output_files)}_docs.zip"
    zip_path = get_safe_workspace_path(zip_name, "sanitized_bundle.zip")
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
        for f in output_files:
            zf.write(f, os.path.basename(f))

    return {
        "status": "success",
        "total_documents": len(req.file_paths),
        "successful_count": len(output_files),
        "total_bytes_saved": total_saved_bytes,
        "results": results,
        "zip_filename": zip_name,
        "zip_url": f"/api/download?file={zip_name}",
    }


# ==================== Batch Action Wizard & Automation Pipeline ====================

@app.get("/api/pipeline/presets")
def api_pipeline_presets():
    return WORKFLOW_PRESETS


class PipelineExecuteRequest(BaseModel):
    file_paths: List[str]
    steps: List[Dict[str, Any]]
    output_prefix: str = "pipelined_"
    bundle_zip: bool = True


@app.post("/api/pipeline/run")
def api_pipeline_run(req: PipelineExecuteRequest):
    if not req.file_paths:
        raise HTTPException(status_code=400, detail="No PDF files provided for automation pipeline")
    if not req.steps:
        raise HTTPException(status_code=400, detail="No pipeline steps configured")

    try:
        res = batch_execute_pipeline(
            file_paths=req.file_paths,
            output_dir=WORKSPACE_DIR,
            steps=req.steps,
            output_prefix=req.output_prefix or "pipelined_",
            bundle_zip=req.bundle_zip,
        )
        if res.get("zip_filename"):
            res["zip_url"] = f"/api/download?file={res['zip_filename']}"

        for r in res.get("results", []):
            if "output_filename" in r:
                r["download_url"] = f"/api/download?file={r['output_filename']}"

        return res
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


# ==================== Third-Party Attribution ====================

@app.get("/api/licenses")
def get_licenses():
    import json
    # 1. Prefer static pre-generated notices file to eliminate PyInstaller fork bombs
    cur_dir = os.path.dirname(os.path.abspath(__file__))
    candidates = [
        os.path.join(cur_dir, "third_party_notices.json"),
        os.path.join(os.path.dirname(cur_dir), "third_party_notices.json"),
        os.path.join(os.path.dirname(cur_dir), "public", "third_party_notices.json"),
    ]
    for c in candidates:
        if os.path.isfile(c):
            try:
                with open(c, "r", encoding="utf-8") as f:
                    return json.load(f)
            except Exception:
                pass

    # 2. Development fallback
    import sys
    if getattr(sys, "frozen", False):
        return [
            {
                "Name": "LocalPDF Suite",
                "Version": "1.0.0",
                "License": "MIT",
                "Notice": "Bundled offline application binaries.",
            }
        ]

    try:
        import subprocess
        result = subprocess.run(
            [sys.executable, "-m", "piplicenses", "--format=json"],
            capture_output=True,
            text=True,
            check=True,
            timeout=5,
        )
        return json.loads(result.stdout)
    except Exception:
        return [
            {
                "Name": "LocalPDF Suite",
                "Version": "1.0.0",
                "License": "MIT",
                "Notice": "Offline application dependencies.",
            }
        ]


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="LocalPDF Sidecar Server")
    parser.add_argument("--port", type=int, default=8765, help="Port to bind to")
    parser.add_argument("--host", type=str, default="127.0.0.1", help="Host interface")
    args = parser.parse_args()

    print(f"[LocalPDF] Starting offline sidecar server on {args.host}:{args.port}")
    uvicorn.run(app, host=args.host, port=args.port, log_level="info")

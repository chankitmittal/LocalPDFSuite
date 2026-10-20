"""
LocalPDF Sidecar Engine Entrypoint
Provides high-performance local REST & IPC API for Tauri host & React frontend.
100% Offline, Zero Cloud Dependencies.
"""

import os
import shutil
import tempfile
from typing import List, Optional, Dict, Any
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Query
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

# Shared temp workspace for file uploads/downloads
WORKSPACE_DIR = os.path.join(tempfile.gettempdir(), "localpdf_workspace")
os.makedirs(WORKSPACE_DIR, exist_ok=True)

app = FastAPI(
    title="LocalPDF Sidecar Engine",
    description="Offline PDF & Image processing engine",
    version="1.0.0",
)

# CORS enabled for Tauri webview and Vite dev server
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


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
    dest_path = os.path.join(WORKSPACE_DIR, file.filename)
    # Ensure unique filename if collision
    base, ext = os.path.splitext(file.filename)
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


@app.get("/api/files/download")
def download_file(path: str = Query(...)):
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(
        path,
        filename=os.path.basename(path),
        media_type="application/octet-stream",
    )


# ==================== Structural Operations ====================

class MergeRequest(BaseModel):
    file_paths: List[str]
    output_filename: str = "merged.pdf"


@app.post("/api/structural/merge")
def api_merge(req: MergeRequest):
    out_path = os.path.join(WORKSPACE_DIR, req.output_filename)
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
    split_dir = os.path.join(WORKSPACE_DIR, f"split_{os.path.basename(req.file_path)}")
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
    out_path = os.path.join(WORKSPACE_DIR, req.output_filename)
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
    out_path = os.path.join(WORKSPACE_DIR, req.output_filename)
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
    out_path = os.path.join(WORKSPACE_DIR, req.output_filename)
    try:
        return unlock_pdf(req.file_path, out_path, req.password)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


class RepairRequest(BaseModel):
    file_path: str
    output_filename: str = "repaired.pdf"


@app.post("/api/structural/repair")
def api_repair(req: RepairRequest):
    out_path = os.path.join(WORKSPACE_DIR, req.output_filename)
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
    out_path = os.path.join(WORKSPACE_DIR, req.output_filename)
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
    out_path = os.path.join(WORKSPACE_DIR, req.output_filename)
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
    out_path = os.path.join(WORKSPACE_DIR, req.output_filename)
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
    out_path = os.path.join(WORKSPACE_DIR, req.output_filename)
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
    out_dir = os.path.join(WORKSPACE_DIR, f"images_{os.path.basename(req.file_path)}")
    try:
        return pdf_to_images(req.file_path, out_dir, req.image_format, req.dpi)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


class ImagesToPdfRequest(BaseModel):
    image_paths: List[str]
    output_filename: str = "images_to_pdf.pdf"


@app.post("/api/images/images-to-pdf")
def api_images_to_pdf(req: ImagesToPdfRequest):
    out_path = os.path.join(WORKSPACE_DIR, req.output_filename)
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
    out_path = os.path.join(WORKSPACE_DIR, out_filename)
    try:
        return pdf_to_excel(req.file_path, out_path)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/api/office/pdf-to-word")
def api_pdf_to_word(req: PdfToOfficeRequest):
    base = os.path.splitext(os.path.basename(req.file_path))[0]
    out_filename = req.output_filename or f"{base}.docx"
    out_path = os.path.join(WORKSPACE_DIR, out_filename)
    try:
        return pdf_to_word(req.file_path, out_path)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/api/office/pdf-to-powerpoint")
def api_pdf_to_powerpoint(req: PdfToOfficeRequest):
    base = os.path.splitext(os.path.basename(req.file_path))[0]
    out_filename = req.output_filename or f"{base}.pptx"
    out_path = os.path.join(WORKSPACE_DIR, out_filename)
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
    out_path = os.path.join(WORKSPACE_DIR, req.output_filename)
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
    out_path = os.path.join(WORKSPACE_DIR, req.output_filename)
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
    out_path = os.path.join(WORKSPACE_DIR, req.output_filename)
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
    out_path = os.path.join(WORKSPACE_DIR, req.output_filename)
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
    output_filename: str = "filled_form.pdf"


@app.post("/api/forms/fill")
def api_fill_form(req: FillFormRequest):
    out_path = os.path.join(WORKSPACE_DIR, req.output_filename)
    try:
        return fill_pdf_form(
            input_path=req.file_path,
            output_path=out_path,
            field_values=req.field_values,
            text_annotations=req.text_annotations,
            flatten=req.flatten,
            lock_permissions=req.lock_permissions,
        )
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
    out_path = os.path.join(WORKSPACE_DIR, req.output_filename)
    try:
        return apply_pdf_edits(
            input_path=req.file_path,
            output_path=out_path,
            edits=req.edits,
            flatten=req.flatten,
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


# ==================== Third-Party Attribution ====================

@app.get("/api/licenses")
def get_licenses():
    import subprocess, sys, json
    try:
        result = subprocess.run(
            [sys.executable, "-m", "piplicenses", "--format=json"],
            capture_output=True,
            text=True,
            check=True,
        )
        return json.loads(result.stdout)
    except Exception as e:
        return {"error": str(e)}


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="LocalPDF Sidecar Server")
    parser.add_argument("--port", type=int, default=8765, help="Port to bind to")
    parser.add_argument("--host", type=str, default="127.0.0.1", help="Host interface")
    args = parser.parse_args()

    print(f"[LocalPDF] Starting offline sidecar server on {args.host}:{args.port}")
    uvicorn.run(app, host=args.host, port=args.port, log_level="info")

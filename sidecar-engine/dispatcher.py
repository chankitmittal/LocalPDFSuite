"""
Action Dispatcher for LocalPDF Suite
Maps all REST/IPC actions to their respective core processing functions.
100% Offline, Zero Web Framework Dependencies.
"""

import os
import json
import base64
import zipfile
from typing import Dict, Any, Optional

from workspace_utils import WORKSPACE_DIR, get_safe_workspace_path, purge_expired_workspace_files

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


def normalize_action(action: str) -> str:
    """Normalizes an action route (e.g. '/api/structural/merge' -> 'structural/merge')."""
    if not action:
        return ""
    act = action.strip().replace("\\", "/")
    act = act.lstrip("/")
    if act.lower().startswith("api/"):
        act = act[4:]
    return act.rstrip("/").lower()


# ==================== Action Handlers ====================

def handle_health(payload: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "status": "ok",
        "version": "1.0.0",
        "engine": "LocalPDF Sidecar IPC Engine",
        "mode": "100% Offline Stdio IPC",
    }


def handle_system_status(payload: Dict[str, Any]) -> Dict[str, Any]:
    soffice_path = find_libreoffice_binary(payload.get("custom_soffice"))
    tesseract_path = find_tesseract_binary(payload.get("custom_tesseract"))
    return {
        "libreoffice": {
            "installed": soffice_path is not None,
            "path": soffice_path,
        },
        "tesseract": {
            "installed": tesseract_path is not None,
            "path": tesseract_path,
        },
        "workspace_dir": WORKSPACE_DIR,
    }


def handle_merge(payload: Dict[str, Any]) -> Dict[str, Any]:
    file_paths = payload.get("file_paths", [])
    out_filename = payload.get("output_filename", "merged.pdf")
    out_path = get_safe_workspace_path(out_filename, "merged.pdf")
    return merge_pdfs(file_paths, out_path)


def handle_split(payload: Dict[str, Any]) -> Dict[str, Any]:
    file_path = payload["file_path"]
    safe_base = os.path.splitext(os.path.basename(file_path))[0] or "split_doc"
    split_dir = os.path.join(WORKSPACE_DIR, f"split_{safe_base}")
    return split_pdf(
        file_path=file_path,
        output_dir=split_dir,
        mode=payload.get("mode", "extract_all"),
        ranges=payload.get("ranges"),
        fixed_interval=int(payload.get("fixed_interval", 1)),
    )


def handle_organize(payload: Dict[str, Any]) -> Dict[str, Any]:
    file_path = payload["file_path"]
    out_filename = payload.get("output_filename", "organized.pdf")
    out_path = get_safe_workspace_path(out_filename, "organized.pdf")
    page_actions = payload.get("page_actions", [])
    return organize_pdf(file_path, out_path, page_actions)


def handle_protect(payload: Dict[str, Any]) -> Dict[str, Any]:
    file_path = payload["file_path"]
    user_password = payload["user_password"]
    owner_password = payload.get("owner_password")
    out_filename = payload.get("output_filename", "protected.pdf")
    out_path = get_safe_workspace_path(out_filename, "protected.pdf")
    return protect_pdf(file_path, out_path, user_password, owner_password)


def handle_unlock(payload: Dict[str, Any]) -> Dict[str, Any]:
    file_path = payload["file_path"]
    password = payload.get("password", "")
    out_filename = payload.get("output_filename", "unlocked.pdf")
    out_path = get_safe_workspace_path(out_filename, "unlocked.pdf")
    return unlock_pdf(file_path, out_path, password)


def handle_repair(payload: Dict[str, Any]) -> Dict[str, Any]:
    file_path = payload["file_path"]
    out_filename = payload.get("output_filename", "repaired.pdf")
    out_path = get_safe_workspace_path(out_filename, "repaired.pdf")
    return repair_pdf(file_path, out_path)


def handle_compress(payload: Dict[str, Any]) -> Dict[str, Any]:
    file_path = payload["file_path"]
    level = payload.get("level", "medium")
    out_filename = payload.get("output_filename", "compressed.pdf")
    out_path = get_safe_workspace_path(out_filename, "compressed.pdf")
    return compress_pdf(file_path, out_path, level)


def handle_watermark(payload: Dict[str, Any]) -> Dict[str, Any]:
    file_path = payload["file_path"]
    out_filename = payload.get("output_filename", "watermarked.pdf")
    out_path = get_safe_workspace_path(out_filename, "watermarked.pdf")
    return add_text_watermark(
        input_path=file_path,
        output_path=out_path,
        text=payload.get("text", "CONFIDENTIAL"),
        font_size=int(payload.get("font_size", 48)),
        opacity=float(payload.get("opacity", 0.25)),
        rotation=float(payload.get("rotation", 45.0)),
        hex_color=payload.get("hex_color", "#888888"),
        tiled=bool(payload.get("tiled", False)),
        page_numbers=payload.get("page_numbers"),
    )


def handle_page_numbers(payload: Dict[str, Any]) -> Dict[str, Any]:
    file_path = payload["file_path"]
    out_filename = payload.get("output_filename", "numbered.pdf")
    out_path = get_safe_workspace_path(out_filename, "numbered.pdf")
    return add_page_numbers(
        input_path=file_path,
        output_path=out_path,
        format_str=payload.get("format_str", "Page {n} of {total}"),
        position=payload.get("position", "bottom-center"),
        font_size=int(payload.get("font_size", 10)),
        hex_color=payload.get("hex_color", "#333333"),
        start_offset=int(payload.get("start_offset", 0)),
    )


def handle_redact(payload: Dict[str, Any]) -> Dict[str, Any]:
    file_path = payload["file_path"]
    redactions = payload.get("redactions", [])
    fill_color = payload.get("fill_color", "#000000")
    out_filename = payload.get("output_filename", "redacted.pdf")
    out_path = get_safe_workspace_path(out_filename, "redacted.pdf")
    return redact_pdf(file_path, out_path, redactions, fill_color)


def handle_search_redaction(payload: Dict[str, Any]) -> Dict[str, Any]:
    return search_redaction_boxes(
        pdf_path=payload["file_path"],
        query=payload.get("query"),
        pattern_type=payload.get("pattern_type"),
    )


def handle_pdf_to_images(payload: Dict[str, Any]) -> Dict[str, Any]:
    file_path = payload["file_path"]
    image_format = payload.get("image_format", "PNG")
    dpi = int(payload.get("dpi", 200))

    safe_base = os.path.splitext(os.path.basename(file_path))[0] or "pdf_images"
    out_dir = os.path.join(WORKSPACE_DIR, f"images_{safe_base}")
    res = pdf_to_images(file_path, out_dir, image_format, dpi)

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


def handle_images_to_pdf(payload: Dict[str, Any]) -> Dict[str, Any]:
    image_paths = payload.get("image_paths", [])
    out_filename = payload.get("output_filename", "images_to_pdf.pdf")
    out_path = get_safe_workspace_path(out_filename, "images_to_pdf.pdf")
    return images_to_pdf(image_paths, out_path)


def handle_bulk_images(payload: Dict[str, Any]) -> Dict[str, Any]:
    file_paths = payload.get("file_paths", [])
    out_dir = os.path.join(WORKSPACE_DIR, "processed_images")
    return bulk_process_images(
        file_paths=file_paths,
        output_dir=out_dir,
        target_format=payload.get("target_format"),
        quality=int(payload.get("quality", 85)),
        resize_mode=payload.get("resize_mode"),
        width=payload.get("width"),
        height=payload.get("height"),
        percentage=payload.get("percentage"),
        strip_exif=bool(payload.get("strip_exif", True)),
    )


def handle_office_to_pdf(payload: Dict[str, Any]) -> Dict[str, Any]:
    file_path = payload["file_path"]
    custom_soffice = payload.get("custom_soffice_path")
    res = convert_office_to_pdf(file_path, WORKSPACE_DIR, custom_soffice)
    if res.get("status") != "success":
        err_msg = res.get("error", "Office to PDF conversion failed")
        raise RuntimeError(str(err_msg))
    return res


def handle_pdf_to_excel(payload: Dict[str, Any]) -> Dict[str, Any]:
    file_path = payload["file_path"]
    base = os.path.splitext(os.path.basename(file_path))[0]
    out_filename = payload.get("output_filename") or f"{base}.xlsx"
    out_path = get_safe_workspace_path(out_filename, f"{base}.xlsx")
    return pdf_to_excel(file_path, out_path)


def handle_pdf_to_word(payload: Dict[str, Any]) -> Dict[str, Any]:
    file_path = payload["file_path"]
    base = os.path.splitext(os.path.basename(file_path))[0]
    out_filename = payload.get("output_filename") or f"{base}.docx"
    out_path = get_safe_workspace_path(out_filename, f"{base}.docx")
    return pdf_to_word(file_path, out_path)


def handle_pdf_to_powerpoint(payload: Dict[str, Any]) -> Dict[str, Any]:
    file_path = payload["file_path"]
    base = os.path.splitext(os.path.basename(file_path))[0]
    out_filename = payload.get("output_filename") or f"{base}.pptx"
    out_path = get_safe_workspace_path(out_filename, f"{base}.pptx")
    return pdf_to_powerpoint(file_path, out_path)


def handle_ocr(payload: Dict[str, Any]) -> Dict[str, Any]:
    file_path = payload["file_path"]
    out_filename = payload.get("output_filename", "ocr_searchable.pdf")
    out_path = get_safe_workspace_path(out_filename, "ocr_searchable.pdf")
    res = run_ocr_on_pdf(
        input_pdf_path=file_path,
        output_pdf_path=out_path,
        language=payload.get("language", "eng"),
        dpi=int(payload.get("dpi", 300)),
        custom_tesseract_path=payload.get("custom_tesseract_path"),
    )
    if res.get("status") != "success":
        raise RuntimeError(str(res.get("error", "OCR failed")))
    return res


def handle_sign_visual(payload: Dict[str, Any]) -> Dict[str, Any]:
    file_path = payload["file_path"]
    out_filename = payload.get("output_filename", "signed_visual.pdf")
    out_path = get_safe_workspace_path(out_filename, "signed_visual.pdf")
    return sign_pdf_visual(
        input_path=file_path,
        output_path=out_path,
        signature_image_path=payload["signature_image_path"],
        page_number=int(payload.get("page_number", 1)),
        x=float(payload.get("x", 100.0)),
        y=float(payload.get("y", 100.0)),
        width=float(payload.get("width", 150.0)),
        height=float(payload.get("height", 50.0)),
    )


def handle_sign_crypto(payload: Dict[str, Any]) -> Dict[str, Any]:
    file_path = payload["file_path"]
    out_filename = payload.get("output_filename", "signed_crypto.pdf")
    out_path = get_safe_workspace_path(out_filename, "signed_crypto.pdf")
    visible = bool(payload.get("visible", True))
    box = None
    if visible:
        x = float(payload.get("x", 350.0))
        y = float(payload.get("y", 50.0))
        w = float(payload.get("width", 220.0))
        h = float(payload.get("height", 70.0))
        box = (x, y, x + w, y + h)

    return sign_pdf_cryptographic(
        input_path=file_path,
        output_path=out_path,
        pfx_path=payload["pfx_path"],
        passphrase=payload["passphrase"],
        reason=payload.get("reason", "Digitally signed with LocalPDF"),
        location=payload.get("location", "Local Desktop"),
        contact_info=payload.get("contact_info"),
        visible=visible,
        page_number=int(payload.get("page_number", 1)),
        box=box,
    )


def handle_generate_cert(payload: Dict[str, Any]) -> Dict[str, Any]:
    out_filename = payload.get("output_filename", "local_certificate.pfx")
    out_path = get_safe_workspace_path(out_filename, "local_certificate.pfx")
    return generate_self_signed_cert(
        output_pfx_path=out_path,
        passphrase=payload["passphrase"],
        common_name=payload.get("common_name", "LocalPDF Signer"),
        organization=payload.get("organization", "LocalPDF Suite"),
        days_valid=int(payload.get("days_valid", 365)),
    )


def handle_form_fields(payload: Dict[str, Any]) -> Dict[str, Any]:
    return get_pdf_form_fields(payload["file_path"])


def handle_form_fill(payload: Dict[str, Any]) -> Dict[str, Any]:
    file_path = payload["file_path"]
    out_filename = payload.get("output_filename", "filled_form.pdf")
    out_path = get_safe_workspace_path(out_filename, "filled_form.pdf")
    return fill_pdf_form(
        input_path=file_path,
        output_path=out_path,
        field_values=payload.get("field_values"),
        text_annotations=payload.get("text_annotations"),
        flatten=bool(payload.get("flatten", True)),
        lock_permissions=bool(payload.get("lock_permissions", False)),
        permissions_password=payload.get("permissions_password"),
    )


def handle_batch_form_export(payload: Dict[str, Any]) -> Dict[str, Any]:
    file_paths = payload.get("file_paths", [])
    if not file_paths:
        raise ValueError("No PDF files provided for batch form extraction")
    base_name = payload.get("output_base_name") or "batch_form_data"
    base_name = os.path.splitext(os.path.basename(base_name))[0]
    res = batch_extract_forms_to_spreadsheet(
        pdf_paths=file_paths,
        output_dir=WORKSPACE_DIR,
        base_filename=base_name,
    )
    return res


def handle_form_builder_detect(payload: Dict[str, Any]) -> Dict[str, Any]:
    return auto_detect_form_fields(payload["file_path"])


def handle_form_builder_save(payload: Dict[str, Any]) -> Dict[str, Any]:
    file_path = payload["file_path"]
    base = os.path.splitext(os.path.basename(file_path))[0]
    out_name = payload.get("output_filename") or f"fillable_{base}.pdf"
    out_path = get_safe_workspace_path(out_name, f"fillable_{base}.pdf")
    return create_interactive_form_pdf(
        input_path=file_path,
        output_path=out_path,
        fields=payload.get("fields", []),
    )


def handle_apply_edits(payload: Dict[str, Any]) -> Dict[str, Any]:
    file_path = payload["file_path"]
    out_filename = payload.get("output_filename", "edited_document.pdf")
    out_path = get_safe_workspace_path(out_filename, "edited_document.pdf")
    return apply_pdf_edits(
        input_path=file_path,
        output_path=out_path,
        edits=payload.get("edits", []),
        flatten=bool(payload.get("flatten", True)),
    )


def handle_compare_analyze(payload: Dict[str, Any]) -> Dict[str, Any]:
    return analyze_document_comparison(
        doc_a_path=payload["doc_a_path"],
        doc_b_path=payload["doc_b_path"],
        quick_visual_check=bool(payload.get("quick_visual_check", True)),
    )


def handle_compare_render_page(payload: Dict[str, Any]) -> Dict[str, Any]:
    return render_page_diff_view(
        doc_a_path=payload["doc_a_path"],
        doc_b_path=payload["doc_b_path"],
        page_number=int(payload.get("page_number", 1)),
        dpi=int(payload.get("dpi", 150)),
    )


def handle_compare_export_report(payload: Dict[str, Any]) -> Dict[str, Any]:
    out_filename = payload.get("output_filename", "comparison_report.pdf")
    out_path = get_safe_workspace_path(out_filename, "comparison_report.pdf")
    return generate_diff_report_pdf(
        doc_a_path=payload["doc_a_path"],
        doc_b_path=payload["doc_b_path"],
        output_path=out_path,
    )


def handle_bates_apply(payload: Dict[str, Any]) -> Dict[str, Any]:
    return apply_bates_stamping(
        input_paths=payload["file_paths"],
        output_dir=WORKSPACE_DIR,
        prefix=payload.get("prefix", "CASE-"),
        suffix=payload.get("suffix", ""),
        start_number=int(payload.get("start_number", 1)),
        padding_digits=int(payload.get("padding_digits", 6)),
        bates_position=payload.get("bates_position", "bottom-right"),
        exhibit_text=payload.get("exhibit_text"),
        exhibit_position=payload.get("exhibit_position", "top-right"),
        font_family=payload.get("font_family", "Helvetica"),
        font_size=int(payload.get("font_size", 10)),
        hex_color=payload.get("hex_color", "#000000"),
        margin=float(payload.get("margin", 36.0)),
        shrink_content=bool(payload.get("shrink_content", True)),
        target_pages=payload.get("target_pages", "all"),
        custom_range=payload.get("custom_range", ""),
        generate_csv_index=bool(payload.get("generate_csv_index", True)),
        generate_zip=bool(payload.get("generate_zip", True)),
    )


def handle_sanitize_inspect(payload: Dict[str, Any]) -> Dict[str, Any]:
    return inspect_pdf_privacy(payload["file_path"])


def handle_sanitize_run(payload: Dict[str, Any]) -> Dict[str, Any]:
    file_path = payload["file_path"]
    base = os.path.splitext(os.path.basename(file_path))[0]
    out_name = payload.get("output_filename") or f"sanitized_{base}.pdf"
    out_path = get_safe_workspace_path(out_name, f"sanitized_{base}.pdf")
    return sanitize_pdf_document(
        input_path=file_path,
        output_path=out_path,
        strip_metadata=bool(payload.get("strip_metadata", True)),
        strip_xmp=bool(payload.get("strip_xmp", True)),
        strip_attachments=bool(payload.get("strip_attachments", True)),
        strip_javascript=bool(payload.get("strip_javascript", True)),
        strip_actions=bool(payload.get("strip_actions", True)),
        strip_annotations=bool(payload.get("strip_annotations", True)),
        keep_form_widgets=bool(payload.get("keep_form_widgets", True)),
        strip_hidden_layers=bool(payload.get("strip_hidden_layers", True)),
        strip_bookmarks=bool(payload.get("strip_bookmarks", False)),
        strip_thumbnails=bool(payload.get("strip_thumbnails", True)),
        linearize=bool(payload.get("linearize", True)),
    )


def handle_sanitize_batch(payload: Dict[str, Any]) -> Dict[str, Any]:
    file_paths = payload.get("file_paths", [])
    if not file_paths:
        raise ValueError("No PDF files provided for batch sanitization")

    results = []
    output_files = []
    total_saved_bytes = 0

    for path in file_paths:
        base = os.path.splitext(os.path.basename(path))[0]
        out_name = f"sanitized_{base}.pdf"
        out_path = get_safe_workspace_path(out_name, f"sanitized_{base}.pdf")
        try:
            r = sanitize_pdf_document(
                input_path=path,
                output_path=out_path,
                strip_metadata=bool(payload.get("strip_metadata", True)),
                strip_xmp=bool(payload.get("strip_xmp", True)),
                strip_attachments=bool(payload.get("strip_attachments", True)),
                strip_javascript=bool(payload.get("strip_javascript", True)),
                strip_actions=bool(payload.get("strip_actions", True)),
                strip_annotations=bool(payload.get("strip_annotations", True)),
                keep_form_widgets=bool(payload.get("keep_form_widgets", True)),
                strip_hidden_layers=bool(payload.get("strip_hidden_layers", True)),
                strip_bookmarks=bool(payload.get("strip_bookmarks", False)),
                strip_thumbnails=bool(payload.get("strip_thumbnails", True)),
                linearize=bool(payload.get("linearize", True)),
            )
            r["filename"] = os.path.basename(path)
            results.append(r)
            output_files.append(out_path)
            total_saved_bytes += r.get("bytes_saved", 0)
        except Exception as e:
            results.append({"filename": os.path.basename(path), "error": str(e), "status": "error"})

    zip_name = f"sanitized_bundle_{len(output_files)}_docs.zip"
    zip_path = get_safe_workspace_path(zip_name, "sanitized_bundle.zip")
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
        for f in output_files:
            zf.write(f, os.path.basename(f))

    return {
        "status": "success",
        "total_documents": len(file_paths),
        "successful_count": len(output_files),
        "total_bytes_saved": total_saved_bytes,
        "results": results,
        "zip_filename": zip_name,
        "zip_path": zip_path,
        "output_path": zip_path,
    }


def handle_pipeline_presets(payload: Dict[str, Any]) -> Dict[str, Any]:
    return {"presets": WORKFLOW_PRESETS}


def handle_pipeline_run(payload: Dict[str, Any]) -> Dict[str, Any]:
    file_paths = payload.get("file_paths", [])
    steps = payload.get("steps", [])
    if not file_paths:
        raise ValueError("No PDF files provided for automation pipeline")
    if not steps:
        raise ValueError("No pipeline steps configured")

    return batch_execute_pipeline(
        file_paths=file_paths,
        output_dir=WORKSPACE_DIR,
        steps=steps,
        output_prefix=payload.get("output_prefix", "pipelined_"),
        bundle_zip=bool(payload.get("bundle_zip", True)),
    )


def handle_licenses(payload: Dict[str, Any]) -> Any:
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

    return [
        {
            "Name": "LocalPDF Suite",
            "Version": "1.0.0",
            "License": "MIT",
            "Notice": "Bundled offline application binaries.",
        }
    ]


def handle_file_upload(payload: Dict[str, Any]) -> Dict[str, Any]:
    filename = payload.get("filename", "uploaded_file.bin")
    content_b64 = payload.get("content_base64", "")
    dest_path = get_safe_workspace_path(filename, "uploaded_file.bin")
    data = base64.b64decode(content_b64)
    with open(dest_path, "wb") as f:
        f.write(data)
    return {
        "file_path": dest_path,
        "filename": os.path.basename(dest_path),
        "size": len(data),
    }


def handle_file_read(payload: Dict[str, Any]) -> Dict[str, Any]:
    file_path = payload.get("file_path", "")
    if not os.path.isfile(file_path):
        raise FileNotFoundError(f"File not found: {file_path}")
    with open(file_path, "rb") as f:
        data = f.read()
    return {
        "file_path": file_path,
        "filename": os.path.basename(file_path),
        "size": len(data),
        "content_base64": base64.b64encode(data).decode("ascii"),
    }


# ==================== Dispatch Registry ====================

ACTION_REGISTRY = {
    # System & Health
    "health": handle_health,
    "system/status": handle_system_status,
    "system_status": handle_system_status,
    "licenses": handle_licenses,

    # Structural
    "structural/merge": handle_merge,
    "merge": handle_merge,
    "structural/split": handle_split,
    "split": handle_split,
    "structural/organize": handle_organize,
    "organize": handle_organize,
    "structural/protect": handle_protect,
    "protect": handle_protect,
    "structural/unlock": handle_unlock,
    "unlock": handle_unlock,
    "structural/repair": handle_repair,
    "repair": handle_repair,

    # Compression
    "compress": handle_compress,

    # Overlays & Redaction
    "overlays/watermark": handle_watermark,
    "watermark": handle_watermark,
    "overlays/page-numbers": handle_page_numbers,
    "page-numbers": handle_page_numbers,
    "page_numbers": handle_page_numbers,
    "overlays/redact": handle_redact,
    "redact": handle_redact,
    "overlays/search-redaction": handle_search_redaction,
    "search-redaction": handle_search_redaction,
    "search_redaction": handle_search_redaction,

    # Image Suite
    "images/pdf-to-images": handle_pdf_to_images,
    "pdf-to-images": handle_pdf_to_images,
    "images/images-to-pdf": handle_images_to_pdf,
    "images-to-pdf": handle_images_to_pdf,
    "images/bulk-process": handle_bulk_images,
    "bulk-process": handle_bulk_images,

    # Office Conversions
    "office/office-to-pdf": handle_office_to_pdf,
    "office-to-pdf": handle_office_to_pdf,
    "office/pdf-to-excel": handle_pdf_to_excel,
    "pdf-to-excel": handle_pdf_to_excel,
    "office/pdf-to-word": handle_pdf_to_word,
    "pdf-to-word": handle_pdf_to_word,
    "office/pdf-to-powerpoint": handle_pdf_to_powerpoint,
    "pdf-to-powerpoint": handle_pdf_to_powerpoint,

    # OCR
    "ocr/run": handle_ocr,
    "ocr": handle_ocr,

    # Signatures
    "sign/visual": handle_sign_visual,
    "sign-visual": handle_sign_visual,
    "sign/crypto": handle_sign_crypto,
    "sign-crypto": handle_sign_crypto,
    "sign/generate-cert": handle_generate_cert,
    "generate-cert": handle_generate_cert,

    # Forms
    "forms/fields": handle_form_fields,
    "form-fields": handle_form_fields,
    "forms/fill": handle_form_fill,
    "form-fill": handle_form_fill,
    "forms/batch-export": handle_batch_form_export,
    "form-batch-export": handle_batch_form_export,
    "forms/builder/detect": handle_form_builder_detect,
    "form-builder-detect": handle_form_builder_detect,
    "forms/builder/save": handle_form_builder_save,
    "form-builder-save": handle_form_builder_save,

    # Edit & Compare
    "edit/apply": handle_apply_edits,
    "edit-apply": handle_apply_edits,
    "compare/analyze": handle_compare_analyze,
    "compare-analyze": handle_compare_analyze,
    "compare/render-page": handle_compare_render_page,
    "compare-render-page": handle_compare_render_page,
    "compare/export-report": handle_compare_export_report,
    "compare-export-report": handle_compare_export_report,

    # Bates
    "bates/apply": handle_bates_apply,
    "bates-apply": handle_bates_apply,

    # Privacy & Sanitize
    "sanitize/inspect": handle_sanitize_inspect,
    "sanitize-inspect": handle_sanitize_inspect,
    "sanitize/run": handle_sanitize_run,
    "sanitize-run": handle_sanitize_run,
    "sanitize/batch": handle_sanitize_batch,
    "sanitize-batch": handle_sanitize_batch,

    # Automation Pipeline
    "pipeline/presets": handle_pipeline_presets,
    "pipeline-presets": handle_pipeline_presets,
    "pipeline/run": handle_pipeline_run,
    "pipeline-run": handle_pipeline_run,

    # File Operations
    "files/upload": handle_file_upload,
    "files/read": handle_file_read,
}


def dispatch_action(action: str, payload: Optional[Dict[str, Any]] = None) -> Any:
    """
    Dispatches a normalized action string with payload to the matching handler function.
    Raises ValueError on unknown action, or bubbles exceptions from core engine.
    """
    if payload is None:
        payload = {}
    norm = normalize_action(action)
    handler = ACTION_REGISTRY.get(norm)
    if not handler:
        raise ValueError(f"Unknown action: '{action}' (normalized: '{norm}')")
    return handler(payload)

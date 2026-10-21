"""
Batch Action Wizard & Automation Pipeline Engine
Provides sequential multi-step workflow execution modeled after Adobe Acrobat Pro
'Action Wizard' and Nitro Pro Workflow Pipelines.

Supported Step Actions:
1. compress: Downsamples images and optimizes PDF streams.
2. watermark: Stamps diagonal or horizontal status/confidentiality text overlays.
3. bates: Applies litigation running Bates indexing with margin scaling.
4. sanitize: Deep DoD/NSA metadata purge, JavaScript stripping, and linearization.
5. flatten: Burns annotations and form fields permanently into page content streams.
6. protect: Encrypts with user/owner passwords and restricts editing permissions.

Includes ready-to-run enterprise presets:
- courtroom_filing: Anti-collision + Bates + Flatten + Deep Sanitization
- confidential_review: Watermark ("CONFIDENTIAL") + Compress + Deep Sanitization
- archival_prep: Flatten + Strip JS & Attachments + Linearize
- public_disclosure: Deep Metadata Wipe + Flatten + Strip Hidden Layers + Compress
"""

import os
import shutil
import tempfile
import logging
from typing import List, Dict, Any, Optional

from core.pdf_compress import compress_pdf
from core.pdf_overlays import add_text_watermark
from core.pdf_bates import apply_bates_stamping
from core.pdf_sanitize import sanitize_pdf_document
from core.pdf_forms import fill_pdf_form
from core.pdf_structural import protect_pdf

logger = logging.getLogger(__name__)

# Predefined Enterprise Workflow Presets
WORKFLOW_PRESETS: Dict[str, Dict[str, Any]] = {
    "courtroom_filing": {
        "id": "courtroom_filing",
        "name": "Courtroom Legal Filing Bundle",
        "description": "Applies Bates numbering with anti-collision margin protection, flattens all annotations, and runs deep DoD metadata sanitization for court submission.",
        "steps": [
            {
                "type": "bates",
                "params": {
                    "prefix": "EXHIBIT-",
                    "start_number": 1,
                    "zero_pad": 6,
                    "position": "bottom-right",
                    "shrink_content": True,
                },
            },
            {
                "type": "flatten",
                "params": {"lock_permissions": True},
            },
            {
                "type": "sanitize",
                "params": {
                    "strip_metadata": True,
                    "strip_xmp": True,
                    "strip_javascript": True,
                    "strip_attachments": True,
                    "strip_annotations": True,
                    "linearize": True,
                },
            },
        ],
    },
    "confidential_review": {
        "id": "confidential_review",
        "name": "Confidential External Review",
        "description": "Stamps prominent diagonal 'CONFIDENTIAL' watermark, applies balanced compression for email distribution, and purges revision history.",
        "steps": [
            {
                "type": "watermark",
                "params": {
                    "text": "CONFIDENTIAL - DO NOT DISTRIBUTE",
                    "font_size": 36,
                    "opacity": 0.25,
                    "rotation": 45,
                    "color": "#ef4444",
                },
            },
            {
                "type": "compress",
                "params": {"mode": "balanced"},
            },
            {
                "type": "sanitize",
                "params": {
                    "strip_metadata": True,
                    "strip_xmp": True,
                    "strip_javascript": True,
                    "linearize": True,
                },
            },
        ],
    },
    "archival_prep": {
        "id": "archival_prep",
        "name": "Archival & Long-Term Preservation",
        "description": "Permanently flattens dynamic form fields, purges all active JavaScript and embedded files, and linearizes object streams for archiving.",
        "steps": [
            {
                "type": "flatten",
                "params": {"lock_permissions": False},
            },
            {
                "type": "sanitize",
                "params": {
                    "strip_metadata": False,  # Preserve archival author/title
                    "strip_xmp": False,
                    "strip_javascript": True,
                    "strip_attachments": True,
                    "strip_annotations": True,
                    "linearize": True,
                },
            },
            {
                "type": "compress",
                "params": {"mode": "balanced"},
            },
        ],
    },
    "public_disclosure": {
        "id": "public_disclosure",
        "name": "Public Disclosure & FOIA Release",
        "description": "Completely purges all DocInfo, Adobe XMP lineage, reviewer margin comments, hidden CAD layers, and optimizes file size for public web download.",
        "steps": [
            {
                "type": "sanitize",
                "params": {
                    "strip_metadata": True,
                    "strip_xmp": True,
                    "strip_javascript": True,
                    "strip_attachments": True,
                    "strip_annotations": True,
                    "keep_form_widgets": False,
                    "strip_hidden_layers": True,
                    "linearize": True,
                },
            },
            {
                "type": "compress",
                "params": {"mode": "balanced"},
            },
        ],
    },
}


def execute_pipeline_step(
    input_path: str,
    output_path: str,
    step_type: str,
    params: Dict[str, Any],
) -> Dict[str, Any]:
    """
    Executes a single workflow step on input_path writing to output_path.
    """
    step_type = step_type.lower().strip()

    if step_type == "compress":
        raw_level = params.get("level") or params.get("mode") or "medium"
        level_map = {
            "balanced": "medium",
            "medium": "medium",
            "extreme": "extreme",
            "low": "low",
            "screen": "low",
            "high": "low",
        }
        level = level_map.get(str(raw_level).lower(), "medium")
        return compress_pdf(input_path, output_path, level=level)

    elif step_type == "watermark":
        text = params.get("text", "CONFIDENTIAL")
        font_size = int(params.get("font_size", 42))
        opacity = float(params.get("opacity", 0.3))
        rotation = float(params.get("rotation", 45))
        color = params.get("hex_color") or params.get("color") or "#ef4444"
        tiled = bool(params.get("tiled", False))
        page_numbers = params.get("page_numbers")
        return add_text_watermark(
            input_path,
            output_path,
            text=text,
            font_size=font_size,
            opacity=opacity,
            rotation=rotation,
            hex_color=color,
            tiled=tiled,
            page_numbers=page_numbers,
        )

    elif step_type == "bates":
        prefix = params.get("prefix", "DOC-")
        suffix = params.get("suffix", "")
        start_number = int(params.get("start_number", 1))
        padding_digits = int(params.get("padding_digits", params.get("zero_pad", 6)))
        bates_position = params.get("bates_position", params.get("position", "bottom-right"))
        exhibit_text = params.get("exhibit_text")
        exhibit_position = params.get("exhibit_position", "top-right")
        font_family = params.get("font_family", "Helvetica")
        font_size = int(params.get("font_size", 10))
        hex_color = params.get("hex_color", "#000000")
        shrink_content = bool(params.get("shrink_content", True))
        target_pages = params.get("target_pages", "all")
        custom_range = params.get("custom_range", "")
        return apply_bates_stamping(
            input_paths=[input_path],
            output_dir=os.path.dirname(output_path),
            prefix=prefix,
            suffix=suffix,
            start_number=start_number,
            padding_digits=padding_digits,
            bates_position=bates_position,
            exhibit_text=exhibit_text,
            exhibit_position=exhibit_position,
            font_family=font_family,
            font_size=font_size,
            hex_color=hex_color,
            shrink_content=shrink_content,
            target_pages=target_pages,
            custom_range=custom_range,
            generate_csv_index=False,
            generate_zip=False,
        )

    elif step_type == "sanitize":
        return sanitize_pdf_document(
            input_path=input_path,
            output_path=output_path,
            strip_metadata=params.get("strip_metadata", True),
            strip_xmp=params.get("strip_xmp", True),
            strip_attachments=params.get("strip_attachments", True),
            strip_javascript=params.get("strip_javascript", True),
            strip_actions=params.get("strip_actions", True),
            strip_annotations=params.get("strip_annotations", True),
            keep_form_widgets=params.get("keep_form_widgets", True),
            strip_hidden_layers=params.get("strip_hidden_layers", True),
            strip_thumbnails=params.get("strip_thumbnails", True),
            linearize=params.get("linearize", True),
        )

    elif step_type == "flatten":
        lock_permissions = bool(params.get("lock_permissions", False))
        return fill_pdf_form(
            input_path=input_path,
            output_path=output_path,
            flatten=True,
            lock_permissions=lock_permissions,
        )

    elif step_type == "protect":
        user_password = params.get("user_password", "")
        owner_password = params.get("owner_password", "")
        return protect_pdf(
            file_path=input_path,
            output_path=output_path,
            user_password=user_password,
            owner_password=owner_password,
        )

    else:
        raise ValueError(f"Unsupported pipeline step type: {step_type}")


def run_pipeline_on_file(
    input_path: str,
    output_path: str,
    steps: List[Dict[str, Any]],
) -> Dict[str, Any]:
    """
    Executes a sequence of steps sequentially on a single document using temporary files.
    """
    if not os.path.exists(input_path):
        raise FileNotFoundError(f"Source file not found: {input_path}")

    if not steps:
        shutil.copy2(input_path, output_path)
        return {
            "status": "success",
            "filename": os.path.basename(input_path),
            "steps_executed": 0,
            "step_logs": [],
        }

    temp_dir = tempfile.mkdtemp(prefix="pipeline_temp_")
    step_logs: List[Dict[str, Any]] = []

    try:
        current_in = input_path
        total_steps = len(steps)

        for idx, step in enumerate(steps, start=1):
            stype = step.get("type", "")
            sparams = step.get("params", {})
            current_out = os.path.join(temp_dir, f"step_{idx}_{stype}.pdf")

            # If bates step, it generates files into a directory, handle specifically
            if stype == "bates":
                bates_out_dir = os.path.join(temp_dir, f"bates_step_{idx}")
                os.makedirs(bates_out_dir, exist_ok=True)
                step_res = apply_bates_stamping(
                    input_paths=[current_in],
                    output_dir=bates_out_dir,
                    prefix=sparams.get("prefix", "DOC-"),
                    suffix=sparams.get("suffix", ""),
                    start_number=int(sparams.get("start_number", 1)),
                    padding_digits=int(sparams.get("padding_digits", sparams.get("zero_pad", 6))),
                    bates_position=sparams.get("bates_position", sparams.get("position", "bottom-right")),
                    exhibit_text=sparams.get("exhibit_text"),
                    exhibit_position=sparams.get("exhibit_position", "top-right"),
                    font_family=sparams.get("font_family", "Helvetica"),
                    font_size=int(sparams.get("font_size", 10)),
                    hex_color=sparams.get("hex_color", "#000000"),
                    shrink_content=bool(sparams.get("shrink_content", True)),
                    target_pages=sparams.get("target_pages", "all"),
                    custom_range=sparams.get("custom_range", ""),
                    generate_csv_index=False,
                    generate_zip=False,
                )
                if step_res.get("output_files"):
                    shutil.copy2(step_res["output_files"][0], current_out)
                else:
                    raise RuntimeError("Bates step produced no output")
            else:
                step_res = execute_pipeline_step(
                    input_path=current_in,
                    output_path=current_out,
                    step_type=stype,
                    params=sparams,
                )

            step_logs.append({
                "step_index": idx,
                "step_type": stype,
                "status": "success",
                "details": str(step_res.get("status", "ok")),
            })

            current_in = current_out

        # Final move to destination
        os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)
        shutil.copy2(current_in, output_path)

        return {
            "status": "success",
            "filename": os.path.basename(input_path),
            "output_filename": os.path.basename(output_path),
            "output_path": output_path,
            "steps_executed": total_steps,
            "step_logs": step_logs,
            "original_size": os.path.getsize(input_path),
            "final_size": os.path.getsize(output_path),
        }

    finally:
        shutil.rmtree(temp_dir, ignore_errors=True)


def batch_execute_pipeline(
    file_paths: List[str],
    output_dir: str,
    steps: List[Dict[str, Any]],
    output_prefix: str = "pipelined_",
    bundle_zip: bool = True,
) -> Dict[str, Any]:
    """
    Executes a multi-step automation workflow across a batch of PDF documents.
    """
    os.makedirs(output_dir, exist_ok=True)
    results: List[Dict[str, Any]] = []
    output_paths: List[str] = []

    for path in file_paths:
        base = os.path.basename(path)
        out_name = f"{output_prefix}{base}"
        out_path = os.path.join(output_dir, out_name)
        try:
            res = run_pipeline_on_file(input_path=path, output_path=out_path, steps=steps)
            results.append(res)
            output_paths.append(out_path)
        except Exception as e:
            logger.error(f"Pipeline error on {path}: {e}")
            results.append({
                "status": "error",
                "filename": base,
                "error": str(e),
            })

    zip_path = None
    zip_name = None
    if bundle_zip and output_paths:
        import zipfile
        zip_name = f"pipeline_bundle_{len(output_paths)}_files.zip"
        zip_path = os.path.join(output_dir, zip_name)
        with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
            for p in output_paths:
                zf.write(p, os.path.basename(p))

    return {
        "status": "success",
        "total_documents": len(file_paths),
        "successful_documents": len(output_paths),
        "results": results,
        "zip_path": zip_path,
        "zip_filename": zip_name,
    }

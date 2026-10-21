"""
PDF Direct Editing Module
Provides:
- In-place text editing / text replacement with background patching
- Adding new text boxes with custom font, size, color, weight, alignment
- Whiteout / Erasing of existing content
- Adding images, stamps, and logos
- Drawing shapes (rectangles, lines) and highlighters
- Lossless flattening via PDFium into permanent page graphics
"""

import io
import os
import re
import base64
import logging
import tempfile

logger = logging.getLogger("pdf_edit")
from typing import Dict, Any, List, Optional
from PIL import Image
from reportlab.pdfgen import canvas
from reportlab.lib.colors import HexColor
from reportlab.lib.utils import ImageReader
from pypdf import PdfReader, PdfWriter
import pypdfium2 as pdfium
import pypdfium2.raw as pdfium_c
import pikepdf


def resolve_reportlab_font(family: str = "Helvetica", bold: bool = False, italic: bool = False) -> str:
    """
    Maps font family and style variants to standard 14 PostScript fonts
    guaranteed to be supported across all PDF viewers without external font files.
    """
    f = (family or "Helvetica").lower()
    if "times" in f or "serif" in f:
        if bold and italic:
            return "Times-BoldItalic"
        if bold:
            return "Times-Bold"
        if italic:
            return "Times-Italic"
        return "Times-Roman"
    elif "courier" in f or "mono" in f:
        if bold and italic:
            return "Courier-BoldOblique"
        if bold:
            return "Courier-Bold"
        if italic:
            return "Courier-Oblique"
        return "Courier"
    else:
        # Default: Helvetica (Sans-serif)
        if bold and italic:
            return "Helvetica-BoldOblique"
        if bold:
            return "Helvetica-Bold"
        if italic:
            return "Helvetica-Oblique"
        return "Helvetica"


def apply_pdf_edits(
    input_path: str,
    output_path: str,
    edits: List[Dict[str, Any]],
    flatten: bool = True,
) -> Dict[str, Any]:
    """
    Applies direct edits to a PDF document:
    - Text replacements (with background patching)
    - New text boxes
    - Whiteout / Erase boxes
    - Image stamps / logos
    - Shapes & Highlighters

    Permanently burns edits into the page stream when flatten=True.
    """
    if not os.path.exists(input_path):
        raise FileNotFoundError(f"Input PDF not found: {input_path}")

    os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)

    reader = PdfReader(input_path)
    writer = PdfWriter()
    writer.append(reader)

    # Group edits by 1-based page number
    page_edits_map: Dict[int, List[Dict[str, Any]]] = {}
    for item in edits:
        p_num = int(item.get("page_number", 1))
        page_edits_map.setdefault(p_num, []).append(item)

    for p_idx, page in enumerate(writer.pages):
        page_num = p_idx + 1
        if page_num not in page_edits_map or not page_edits_map[page_num]:
            continue

        pw = float(page.mediabox.width)
        ph = float(page.mediabox.height)

        overlay_buf = io.BytesIO()
        c = canvas.Canvas(overlay_buf, pagesize=(pw, ph))

        for edit in page_edits_map[page_num]:
            edit_type = str(edit.get("type", "text")).lower()

            # -----------------------------------------------------------
            # 1. Whiteout / Eraser Box
            # -----------------------------------------------------------
            if edit_type == "whiteout":
                x = float(edit.get("x", 0))
                y = float(edit.get("y", 0))
                w = float(edit.get("width", 50))
                h = float(edit.get("height", 20))
                color_hex = str(edit.get("color", "#FFFFFF"))

                c.saveState()
                try:
                    c.setFillColor(HexColor(color_hex))
                    c.setStrokeColor(HexColor(color_hex))
                except Exception:
                    c.setFillColorRGB(1.0, 1.0, 1.0)
                    c.setStrokeColorRGB(1.0, 1.0, 1.0)
                c.rect(x, y, w, h, fill=1, stroke=0)
                c.restoreState()

            # -----------------------------------------------------------
            # 2. Text (In-Place Replacement or New Text)
            # -----------------------------------------------------------
            elif edit_type in ("text", "text_replacement"):
                # Optional background patch to cover original text
                bg = edit.get("background_patch")
                if bg:
                    bx = float(bg.get("x", 0))
                    by = float(bg.get("y", 0))
                    bw = float(bg.get("width", 50))
                    bh = float(bg.get("height", 20))
                    b_color = str(bg.get("color", "#FFFFFF"))

                    c.saveState()
                    try:
                        c.setFillColor(HexColor(b_color))
                        c.setStrokeColor(HexColor(b_color))
                    except Exception:
                        c.setFillColorRGB(1.0, 1.0, 1.0)
                        c.setStrokeColorRGB(1.0, 1.0, 1.0)
                    c.rect(bx, by, bw, bh, fill=1, stroke=0)
                    c.restoreState()

                # Text rendering
                text = str(edit.get("text", "")).strip()
                if text:
                    x = float(edit.get("x", 0))
                    y = float(edit.get("baseline_y", edit.get("y", 0)))
                    font_size = float(edit.get("font_size", 12))
                    font_family = str(edit.get("font_family", "Helvetica"))
                    is_bold = bool(edit.get("bold", False))
                    is_italic = bool(edit.get("italic", False))
                    color_hex = str(edit.get("hex_color", "#0f172a"))
                    opacity = float(edit.get("opacity", 1.0))

                    font_name = resolve_reportlab_font(font_family, is_bold, is_italic)

                    c.saveState()
                    try:
                        c.setFillColor(HexColor(color_hex), alpha=opacity)
                    except Exception:
                        c.setFillColorRGB(0.1, 0.1, 0.1, alpha=opacity)

                    c.setFont(font_name, font_size)

                    # Multi-line text support
                    lines = text.split("\n")
                    line_height = font_size * 1.2
                    curr_y = y
                    for line in lines:
                        c.drawString(x, curr_y, line)
                        curr_y -= line_height

                    c.restoreState()

            # -----------------------------------------------------------
            # 3. Image / Logo / Stamp
            # -----------------------------------------------------------
            elif edit_type == "image":
                x = float(edit.get("x", 0))
                y = float(edit.get("y", 0))
                w = float(edit.get("width", 100))
                h = float(edit.get("height", 100))
                opacity = float(edit.get("opacity", 1.0))
                img_data = edit.get("image_data") or edit.get("image_path")

                if img_data:
                    c.saveState()
                    try:
                        # Case A: Base64 data URI
                        if isinstance(img_data, str) and img_data.startswith("data:"):
                            header, b64_str = img_data.split(",", 1)
                            raw_bytes = base64.b64decode(b64_str)
                            pil_img = Image.open(io.BytesIO(raw_bytes))
                        # Case B: Raw base64 string
                        elif isinstance(img_data, str) and len(img_data) > 100 and not os.path.exists(img_data):
                            raw_bytes = base64.b64decode(img_data)
                            pil_img = Image.open(io.BytesIO(raw_bytes))
                        # Case C: Local file path
                        elif isinstance(img_data, str) and os.path.exists(img_data):
                            pil_img = Image.open(img_data)
                        else:
                            pil_img = None

                        if pil_img:
                            if pil_img.mode not in ("RGB", "RGBA"):
                                pil_img = pil_img.convert("RGBA")

                            img_buf = io.BytesIO()
                            pil_img.save(img_buf, format="PNG")
                            img_buf.seek(0)

                            reader_img = ImageReader(img_buf)
                            c.setFillAlpha(opacity)
                            c.drawImage(reader_img, x, y, width=w, height=h, mask="auto")
                    except Exception as err:
                        logger.warning(f"Failed to render image edit on page {page_num}: {err}")
                    finally:
                        c.restoreState()

            # -----------------------------------------------------------
            # 4. Highlighter Box (Semi-transparent overlay)
            # -----------------------------------------------------------
            elif edit_type == "highlight":
                x = float(edit.get("x", 0))
                y = float(edit.get("y", 0))
                w = float(edit.get("width", 50))
                h = float(edit.get("height", 15))
                color_hex = str(edit.get("color", "#FDE047"))
                opacity = float(edit.get("opacity", 0.4))

                c.saveState()
                try:
                    c.setFillColor(HexColor(color_hex), alpha=opacity)
                except Exception:
                    c.setFillColorRGB(0.99, 0.88, 0.28, alpha=opacity)
                c.rect(x, y, w, h, fill=1, stroke=0)
                c.restoreState()

            # -----------------------------------------------------------
            # 5. Shape: Rectangle or Line
            # -----------------------------------------------------------
            elif edit_type in ("shape", "rect", "rectangle"):
                x = float(edit.get("x", 0))
                y = float(edit.get("y", 0))
                w = float(edit.get("width", 50))
                h = float(edit.get("height", 30))
                stroke_color = str(edit.get("stroke_color", "#2563EB"))
                stroke_width = float(edit.get("stroke_width", 2))
                fill_color = edit.get("fill_color")
                opacity = float(edit.get("opacity", 1.0))

                c.saveState()
                try:
                    c.setStrokeColor(HexColor(stroke_color), alpha=opacity)
                except Exception:
                    c.setStrokeColorRGB(0.1, 0.4, 0.9, alpha=opacity)
                c.setLineWidth(stroke_width)

                if fill_color:
                    fill_opacity = float(edit.get("fill_opacity", 0.2))
                    try:
                        c.setFillColor(HexColor(fill_color), alpha=fill_opacity)
                    except Exception:
                        c.setFillColorRGB(0.1, 0.4, 0.9, alpha=fill_opacity)
                    c.rect(x, y, w, h, fill=1, stroke=1)
                else:
                    c.rect(x, y, w, h, fill=0, stroke=1)
                c.restoreState()

        c.showPage()
        c.save()
        overlay_buf.seek(0)

        overlay_reader = PdfReader(overlay_buf)
        if len(overlay_reader.pages) > 0:
            page.merge_page(overlay_reader.pages[0])

    # Write merged PDF to a temporary file
    with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp_f:
        temp_merged_path = tmp_f.name

    try:
        with open(temp_merged_path, "wb") as f_out:
            writer.write(f_out)

        if flatten:
            # Burn edits permanently into static page vector stream using PDFium
            doc = pdfium.PdfDocument(temp_merged_path)
            try:
                for idx in range(len(doc)):
                    page = doc.get_page(idx)
                    try:
                        pdfium_c.FPDFPage_Flatten(page.raw, 0)
                    finally:
                        page.close()
                doc.save(output_path)
            finally:
                doc.close()
        else:
            with open(temp_merged_path, "rb") as src, open(output_path, "wb") as dst:
                dst.write(src.read())
    finally:
        if os.path.exists(temp_merged_path):
            try:
                os.remove(temp_merged_path)
            except Exception:
                pass

    return {
        "status": "success",
        "output_path": output_path,
        "file_size": os.path.getsize(output_path),
        "edits_applied": len(edits),
        "flattened": flatten,
    }

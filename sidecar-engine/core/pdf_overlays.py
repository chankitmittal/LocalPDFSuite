"""
PDF Overlays and Redaction Module
Provides:
- add_text_watermark: Transparent rotated/tiled text watermark overlay.
- add_image_watermark: Watermark using external image file.
- add_page_numbers: Dynamic 'Page X of Y' or 'X' numbering.
- redact_pdf: True irreversible coordinate redaction (pixels wiped via raster sanitization).
"""

import io
import os
from typing import List, Dict, Any, Optional
from reportlab.pdfgen import canvas
from reportlab.lib.colors import HexColor
from pypdf import PdfReader, PdfWriter
import re
import pdfplumber
import pypdfium2 as pdfium
from PIL import Image, ImageDraw
import pikepdf


def _create_text_watermark_page(
    width: float,
    height: float,
    text: str,
    font_name: str = "Helvetica-Bold",
    font_size: int = 48,
    opacity: float = 0.25,
    rotation: float = 45.0,
    hex_color: str = "#888888",
    tiled: bool = False,
) -> io.BytesIO:
    """Generates an in-memory PDF page with the desired text watermark."""
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=(width, height))
    c.saveState()

    color = HexColor(hex_color)
    c.setFillColor(color, alpha=opacity)
    c.setStrokeColor(color, alpha=opacity)
    c.setFont(font_name, font_size)

    if tiled:
        # Tile across page with spacing
        step_x = max(150.0, font_size * 5)
        step_y = max(120.0, font_size * 3)
        x = -width
        while x < width * 2:
            y = -height
            while y < height * 2:
                c.saveState()
                c.translate(x, y)
                c.rotate(rotation)
                c.drawCentredString(0, 0, text)
                c.restoreState()
                y += step_y
            x += step_x
    else:
        # Single centered watermark
        c.translate(width / 2.0, height / 2.0)
        c.rotate(rotation)
        c.drawCentredString(0, 0, text)

    c.restoreState()
    c.showPage()
    c.save()
    buf.seek(0)
    return buf


def _create_page_number_page(
    width: float,
    height: float,
    current_page: int,
    total_pages: int,
    format_str: str = "Page {n} of {total}",
    position: str = "bottom-center",
    font_name: str = "Helvetica",
    font_size: int = 10,
    margin_bottom: float = 30.0,
    margin_top: float = 30.0,
    margin_x: float = 40.0,
    hex_color: str = "#333333",
) -> io.BytesIO:
    """Generates an in-memory PDF page with page number text."""
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=(width, height))
    c.saveState()

    text = format_str.format(n=current_page, total=total_pages)
    color = HexColor(hex_color)
    c.setFillColor(color)
    c.setFont(font_name, font_size)

    # Calculate coordinates based on position
    if position == "bottom-center":
        x = width / 2.0
        y = margin_bottom
        c.drawCentredString(x, y, text)
    elif position == "bottom-right":
        x = width - margin_x
        y = margin_bottom
        c.drawRightString(x, y, text)
    elif position == "bottom-left":
        x = margin_x
        y = margin_bottom
        c.drawString(x, y, text)
    elif position == "top-center":
        x = width / 2.0
        y = height - margin_top
        c.drawCentredString(x, y, text)
    elif position == "top-right":
        x = width - margin_x
        y = height - margin_top
        c.drawRightString(x, y, text)
    elif position == "top-left":
        x = margin_x
        y = height - margin_top
        c.drawString(x, y, text)
    else:
        # Default bottom-center
        c.drawCentredString(width / 2.0, margin_bottom, text)

    c.restoreState()
    c.showPage()
    c.save()
    buf.seek(0)
    return buf


def add_text_watermark(
    input_path: str,
    output_path: str,
    text: str,
    font_size: int = 48,
    opacity: float = 0.25,
    rotation: float = 45.0,
    hex_color: str = "#888888",
    tiled: bool = False,
    page_numbers: Optional[List[int]] = None,
) -> Dict[str, Any]:
    """Applies a text watermark across all or selected pages."""
    if not os.path.exists(input_path):
        raise FileNotFoundError(f"File not found: {input_path}")

    os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)
    with open(input_path, "rb") as in_f:
        reader = PdfReader(in_f)
        writer = PdfWriter()
        total_pages = len(reader.pages)

        selected = set(page_numbers) if page_numbers is not None else set(range(1, total_pages + 1))

        for idx, page in enumerate(reader.pages):
            page_num = idx + 1
            writer_page = writer.add_page(page)
            if page_num in selected:
                w = float(page.mediabox.width)
                h = float(page.mediabox.height)
                wm_buf = _create_text_watermark_page(
                    width=w,
                    height=h,
                    text=text,
                    font_size=font_size,
                    opacity=opacity,
                    rotation=rotation,
                    hex_color=hex_color,
                    tiled=tiled,
                )
                wm_reader = PdfReader(wm_buf)
                writer_page.merge_page(wm_reader.pages[0])

        with open(output_path, "wb") as f_out:
            writer.write(f_out)

    return {
        "status": "success",
        "output_path": output_path,
        "pages_watermarked": len(selected),
        "total_pages": total_pages,
        "file_size": os.path.getsize(output_path),
    }


def add_page_numbers(
    input_path: str,
    output_path: str,
    format_str: str = "Page {n} of {total}",
    position: str = "bottom-center",
    font_size: int = 10,
    hex_color: str = "#333333",
    start_offset: int = 0,
) -> Dict[str, Any]:
    """Applies dynamic page numbers to all pages of the PDF."""
    if not os.path.exists(input_path):
        raise FileNotFoundError(f"File not found: {input_path}")

    os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)
    with open(input_path, "rb") as in_f:
        reader = PdfReader(in_f)
        writer = PdfWriter()
        total_pages = len(reader.pages)

        for idx, page in enumerate(reader.pages):
            page_num = idx + 1 + start_offset
            w = float(page.mediabox.width)
            h = float(page.mediabox.height)

            pn_buf = _create_page_number_page(
                width=w,
                height=h,
                current_page=page_num,
                total_pages=total_pages + start_offset,
                format_str=format_str,
                position=position,
                font_size=font_size,
                hex_color=hex_color,
            )
            pn_reader = PdfReader(pn_buf)
            page.merge_page(pn_reader.pages[0])
            writer.add_page(page)

        with open(output_path, "wb") as f_out:
            writer.write(f_out)

    return {
        "status": "success",
        "output_path": output_path,
        "total_pages": total_pages,
        "file_size": os.path.getsize(output_path),
    }


def redact_pdf(
    input_path: str,
    output_path: str,
    redactions: List[Dict[str, Any]],
    fill_color: str = "#000000",
    render_dpi: int = 200,
) -> Dict[str, Any]:
    """
    True irreversible coordinate redaction.
    For each target page containing redaction boxes, renders the page to an image
    via pypdfium2, overwrites the pixel bounding boxes with fill_color (default black),
    and rebuilds the PDF page as pure raster pixels.
    This guarantees that underlying text, fonts, and operators are 100% destroyed
    and cannot be searched, copied, or extracted via pdfplumber/Ctrl+F.

    redactions format:
    [
      {
        "page_number": 1,  # 1-based
        "boxes": [
          {"x": 100, "y": 200, "width": 150, "height": 30} # PDF 72 DPI point coords (bottom-left origin)
        ]
      }
    ]
    """
    if not os.path.exists(input_path):
        raise FileNotFoundError(f"File not found: {input_path}")

    os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)

    # Group redactions by page number (1-based)
    page_redaction_map: Dict[int, List[Dict[str, float]]] = {}
    for item in redactions:
        p_num = int(item["page_number"])
        page_redaction_map.setdefault(p_num, []).extend(item.get("boxes", []))

    # Open with pypdfium2 for raster rendering and pikepdf for final assembly
    doc = pdfium.PdfDocument(input_path)
    try:
        total_pages = len(doc)
        scale_factor = render_dpi / 72.0

        with pikepdf.Pdf.new() as dst_pdf:
            with pikepdf.open(input_path) as orig_pdf:
                for idx in range(total_pages):
                    p_num = idx + 1
                    if p_num in page_redaction_map and page_redaction_map[p_num]:
                        # Render page to high-res image
                        page = doc.get_page(idx)
                        try:
                            orig_w_pt, orig_h_pt = page.get_size()
                            pil_image = page.render(scale=scale_factor).to_pil()

                            # Parse fill color
                            color_hex = fill_color.lstrip("#")
                            color_rgb = tuple(int(color_hex[i : i + 2], 16) for i in (0, 2, 4))
                            draw = ImageDraw.Draw(pil_image)

                            # Draw rectangles over redacted areas
                            # Note: In PDF coordinates, origin is bottom-left. In PIL, origin is top-left.
                            img_w, img_h = pil_image.size
                            for box in page_redaction_map[p_num]:
                                bx = float(box["x"]) * scale_factor
                                by_pdf = float(box["y"])
                                bw = float(box["width"]) * scale_factor
                                bh = float(box["height"]) * scale_factor

                                pil_y0 = (orig_h_pt - (by_pdf + float(box["height"]))) * scale_factor
                                pil_y1 = pil_y0 + bh
                                pil_x0 = bx
                                pil_x1 = bx + bw

                                draw.rectangle([pil_x0, pil_y0, pil_x1, pil_y1], fill=color_rgb)

                            # Save sanitized image directly to a 1-page PDF in memory
                            sanitized_pdf_buf = io.BytesIO()
                            if pil_image.mode != "RGB":
                                pil_image = pil_image.convert("RGB")
                            pil_image.save(sanitized_pdf_buf, format="PDF", resolution=float(render_dpi))
                            sanitized_pdf_buf.seek(0)

                            with pikepdf.open(sanitized_pdf_buf) as sanitized_pdf:
                                dst_pdf.pages.append(sanitized_pdf.pages[0])
                        finally:
                            page.close()
                    else:
                        # Unredacted page: keep untouched
                        dst_pdf.pages.append(orig_pdf.pages[idx])

                dst_pdf.save(output_path, compress_streams=True)
    finally:
        doc.close()

    return {
        "status": "success",
        "output_path": output_path,
        "redacted_pages": list(page_redaction_map.keys()),
        "file_size": os.path.getsize(output_path),
    }


def search_redaction_boxes(
    pdf_path: str,
    query: Optional[str] = None,
    pattern_type: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Scans a PDF using pdfplumber to locate exact character and word bounding boxes
    matching either:
    1. A text query / phrase (case-insensitive)
    2. A predefined regex pattern: 'ssn', 'email', 'credit_card', 'phone'

    Returns coordinates normalized in standard PDF points (bottom-left origin).
    """
    if not os.path.exists(pdf_path):
        raise FileNotFoundError(f"PDF not found: {pdf_path}")

    patterns = {
        "ssn": r"\b\d{3}[-\s]?\d{2}[-\s]?\d{4}\b",
        "email": r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b",
        "credit_card": r"\b(?:\d{4}[-\s]?){3}\d{4}\b",
        "phone": r"\b(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b",
    }

    regex = None
    if pattern_type and pattern_type in patterns:
        regex = re.compile(patterns[pattern_type], re.IGNORECASE)
    elif query and query.strip():
        regex = re.compile(re.escape(query.strip()), re.IGNORECASE)
    else:
        raise ValueError("Either 'query' or a valid 'pattern_type' must be provided.")

    results: List[Dict[str, Any]] = []
    total_matches = 0

    with pdfplumber.open(pdf_path) as pdf:
        for idx, page in enumerate(pdf.pages):
            words = page.extract_words()
            p_height = float(page.height)
            page_boxes = []

            # 1. Search single words
            for w in words:
                text = w["text"]
                if regex.search(text):
                    # Add 2pt safety padding around coordinates
                    x0 = max(0.0, float(w["x0"]) - 2.0)
                    top = float(w["top"]) - 1.5
                    x1 = float(w["x1"]) + 2.0
                    bottom = float(w["bottom"]) + 1.5
                    y = max(0.0, p_height - bottom)
                    width = x1 - x0
                    height = bottom - top

                    page_boxes.append({
                        "x": round(x0, 1),
                        "y": round(y, 1),
                        "width": round(width, 1),
                        "height": round(height, 1),
                        "matched_text": text,
                    })

            # 2. Multi-word phrases if query has multiple words
            if query and " " in query.strip():
                clean_q = " ".join(query.strip().split()).lower()
                for i in range(len(words)):
                    accum = []
                    for j in range(i, min(i + 12, len(words))):
                        accum.append(words[j])
                        combined = " ".join(w["text"] for w in accum).lower()
                        if clean_q == combined:
                            x0 = max(0.0, min(float(w["x0"]) for w in accum) - 2.0)
                            x1 = max(float(w["x1"]) for w in accum) + 2.0
                            top = min(float(w["top"]) for w in accum) - 1.5
                            bottom = max(float(w["bottom"]) for w in accum) + 1.5
                            y = max(0.0, p_height - bottom)

                            page_boxes.append({
                                "x": round(x0, 1),
                                "y": round(y, 1),
                                "width": round(x1 - x0, 1),
                                "height": round(bottom - top, 1),
                                "matched_text": query.strip(),
                            })
                            break

            if page_boxes:
                total_matches += len(page_boxes)
                results.append({
                    "page_number": idx + 1,
                    "boxes": page_boxes,
                })

    return {
        "status": "success",
        "total_matches": total_matches,
        "results": results,
    }

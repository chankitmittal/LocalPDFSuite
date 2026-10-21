"""
PDF Bates Numbering & Legal Stamping Module
Provides:
- Continuous multi-document running sequence counters (e.g. CASE-000001 to CASE-000150)
- Configurable prefix, suffix, start number, and zero-padding (3 to 9 digits)
- 6 standard placement zones (Top Left/Center/Right, Bottom Left/Center/Right)
- Exhibit & Confidentiality header/footer stamps
- Anti-collision page scaling (shrinks page content inwards by 4% to prevent overwriting existing text/signatures)
- Page range targeting (all pages, exclude cover page, custom intervals)
- Automated e-Discovery Bates Index CSV and ZIP bundle export
"""

import io
import os
import csv
import zipfile
from datetime import datetime
from typing import List, Dict, Any, Optional, Tuple
from reportlab.pdfgen import canvas
from reportlab.lib.colors import HexColor
import pypdf
from pypdf import PdfReader, PdfWriter, Transformation


def _parse_page_ranges(range_str: str, max_pages: int) -> set:
    """Parses range strings like '1,3-5,8' into a set of 1-based page numbers."""
    pages = set()
    if not range_str or not range_str.strip():
        return set(range(1, max_pages + 1))

    parts = range_str.split(",")
    for part in parts:
        part = part.strip()
        if not part:
            continue
        if "-" in part:
            bounds = part.split("-")
            try:
                start = max(1, int(bounds[0].strip()))
                end = min(max_pages, int(bounds[1].strip())) if len(bounds) > 1 and bounds[1].strip() else max_pages
                if start <= end:
                    pages.update(range(start, end + 1))
            except ValueError:
                continue
        else:
            try:
                p = int(part)
                if 1 <= p <= max_pages:
                    pages.add(p)
            except ValueError:
                continue

    return pages


def _get_zone_coordinates(
    zone: str,
    page_w: float,
    page_h: float,
    margin: float = 36.0,
    font_size: int = 10,
) -> Tuple[float, float, str]:
    """
    Returns (x, y, text_anchor) for the given zone.
    text_anchor is 'left', 'center', or 'right'.
    """
    z = zone.lower().replace("_", "-")
    top_y = page_h - margin - font_size
    bot_y = margin

    if z == "top-left":
        return margin, top_y, "left"
    elif z == "top-center":
        return page_w / 2.0, top_y, "center"
    elif z == "top-right":
        return page_w - margin, top_y, "right"
    elif z == "bottom-left":
        return margin, bot_y, "left"
    elif z == "bottom-center":
        return page_w / 2.0, bot_y, "center"
    else:  # default bottom-right
        return page_w - margin, bot_y, "right"


def _create_bates_stamp_page(
    page_w: float,
    page_h: float,
    bates_text: str,
    bates_zone: str = "bottom-right",
    exhibit_text: Optional[str] = None,
    exhibit_zone: str = "top-right",
    font_family: str = "Helvetica",
    font_size: int = 10,
    hex_color: str = "#000000",
    margin: float = 36.0,
) -> io.BytesIO:
    """Generates an in-memory PDF page containing the Bates and optional exhibit stamps."""
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=(page_w, page_h))

    font_name = "Helvetica-Bold" if "bold" in font_family.lower() else "Helvetica"
    if "times" in font_family.lower():
        font_name = "Times-Bold" if "bold" in font_family.lower() else "Times-Roman"
    elif "courier" in font_family.lower():
        font_name = "Courier-Bold" if "bold" in font_family.lower() else "Courier"

    c.setFont(font_name, font_size)
    c.setFillColor(HexColor(hex_color))

    # 1. Draw Bates Number
    bx, by, b_anchor = _get_zone_coordinates(bates_zone, page_w, page_h, margin, font_size)
    if b_anchor == "left":
        c.drawString(bx, by, bates_text)
    elif b_anchor == "center":
        c.drawCentredString(bx, by, bates_text)
    else:
        c.drawRightString(bx, by, bates_text)

    # 2. Draw Exhibit / Confidentiality Stamp if provided
    if exhibit_text and exhibit_text.strip():
        ex, ey, e_anchor = _get_zone_coordinates(exhibit_zone, page_w, page_h, margin, font_size)
        if e_anchor == "left":
            c.drawString(ex, ey, exhibit_text.strip())
        elif e_anchor == "center":
            c.drawCentredString(ex, ey, exhibit_text.strip())
        else:
            c.drawRightString(ex, ey, exhibit_text.strip())

    c.save()
    buf.seek(0)
    return buf


def apply_bates_stamping(
    input_paths: List[str],
    output_dir: str,
    prefix: str = "CASE-",
    suffix: str = "",
    start_number: int = 1,
    padding_digits: int = 6,
    bates_position: str = "bottom-right",
    exhibit_text: Optional[str] = None,
    exhibit_position: str = "top-right",
    font_family: str = "Helvetica",
    font_size: int = 10,
    hex_color: str = "#000000",
    margin: float = 36.0,
    shrink_content: bool = True,
    target_pages: str = "all",  # 'all', 'exclude_first', 'custom'
    custom_range: str = "",
    generate_csv_index: bool = True,
    generate_zip: bool = True,
) -> Dict[str, Any]:
    """
    Applies continuous Bates Numbering across one or more PDF files.
    """
    if not input_paths:
        raise ValueError("No input PDF files provided for Bates numbering.")

    os.makedirs(output_dir, exist_ok=True)

    running_counter = max(1, start_number)
    output_file_items: List[Dict[str, Any]] = []
    audit_records: List[Dict[str, Any]] = []
    total_pages_stamped = 0
    first_bates = f"{prefix}{str(running_counter).zfill(padding_digits)}{suffix}"
    last_bates = first_bates

    # Anti-collision transformation (shrink page content inwards by 4% to create a safe margin gutter)
    SHRINK_FACTOR = 0.95

    for doc_idx, file_path in enumerate(input_paths):
        if not os.path.isfile(file_path):
            continue

        base_name = os.path.basename(file_path)
        name_root, _ = os.path.splitext(base_name)
        out_filename = f"{name_root}_bates.pdf"
        out_path = os.path.join(output_dir, out_filename)

        with open(file_path, "rb") as f_in:
            reader = PdfReader(f_in)
            writer = PdfWriter()
            num_pages = len(reader.pages)

            # Determine target pages
            if target_pages == "exclude_first":
                pages_to_stamp = set(range(2, num_pages + 1))
            elif target_pages == "custom":
                pages_to_stamp = _parse_page_ranges(custom_range, num_pages)
            else:
                pages_to_stamp = set(range(1, num_pages + 1))

            file_start_bates = ""
            file_end_bates = ""
            file_stamped_count = 0

            for p_idx, page in enumerate(reader.pages):
                p_num = p_idx + 1
                pw = float(page.mediabox.width)
                ph = float(page.mediabox.height)
                writer_page = writer.add_page(page)

                if p_num in pages_to_stamp:
                    bates_code = f"{prefix}{str(running_counter).zfill(padding_digits)}{suffix}"
                    if not file_start_bates:
                        file_start_bates = bates_code
                    file_end_bates = bates_code
                    last_bates = bates_code

                    # Anti-collision: shrink content inwards if requested
                    if shrink_content:
                        tx = pw * (1.0 - SHRINK_FACTOR) / 2.0
                        ty = ph * (1.0 - SHRINK_FACTOR) / 2.0
                        transform = Transformation().scale(SHRINK_FACTOR, SHRINK_FACTOR).translate(tx, ty)
                        writer_page.add_transformation(transform)

                    # Generate vector stamp page
                    stamp_buf = _create_bates_stamp_page(
                        page_w=pw,
                        page_h=ph,
                        bates_text=bates_code,
                        bates_zone=bates_position,
                        exhibit_text=exhibit_text,
                        exhibit_zone=exhibit_position,
                        font_family=font_family,
                        font_size=font_size,
                        hex_color=hex_color,
                        margin=margin,
                    )

                    stamp_reader = PdfReader(stamp_buf)
                    writer_page.merge_page(stamp_reader.pages[0])

                    running_counter += 1
                    file_stamped_count += 1
                    total_pages_stamped += 1

            with open(out_path, "wb") as f_out:
                writer.write(f_out)

        output_file_items.append({
            "name": out_filename,
            "path": out_path,
            "size": os.path.getsize(out_path),
            "start_bates": file_start_bates or "N/A",
            "end_bates": file_end_bates or "N/A",
            "pages_stamped": file_stamped_count,
            "total_pages": num_pages,
        })

        audit_records.append({
            "document": base_name,
            "output_file": out_filename,
            "start_bates": file_start_bates or "N/A",
            "end_bates": file_end_bates or "N/A",
            "pages_stamped": file_stamped_count,
            "total_pages": num_pages,
            "date": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        })

    # Generate companion e-Discovery Bates Index CSV
    index_csv_path = None
    if generate_csv_index and audit_records:
        index_csv_filename = f"bates_index_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"
        index_csv_path = os.path.join(output_dir, index_csv_filename)
        with open(index_csv_path, "w", newline="", encoding="utf-8-sig") as f_csv:
            writer = csv.DictWriter(
                f_csv,
                fieldnames=["document", "output_file", "start_bates", "end_bates", "pages_stamped", "total_pages", "date"],
            )
            writer.writeheader()
            for row in audit_records:
                writer.writerow(row)

    # Generate ZIP bundle if requested
    zip_path = None
    if generate_zip and (len(output_file_items) > 1 or index_csv_path):
        zip_filename = f"bates_bundle_{datetime.now().strftime('%Y%m%d_%H%M%S')}.zip"
        zip_path = os.path.join(output_dir, zip_filename)
        with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
            for item in output_file_items:
                if os.path.isfile(item["path"]):
                    zf.write(item["path"], arcname=item["name"])
            if index_csv_path and os.path.isfile(index_csv_path):
                zf.write(index_csv_path, arcname=os.path.basename(index_csv_path))

    return {
        "status": "success",
        "output_files": [item["path"] for item in output_file_items],
        "file_items": output_file_items,
        "index_csv_path": index_csv_path,
        "zip_path": zip_path,
        "total_documents": len(output_file_items),
        "total_pages_stamped": total_pages_stamped,
        "start_bates": first_bates,
        "end_bates": last_bates,
        "audit_records": audit_records,
    }

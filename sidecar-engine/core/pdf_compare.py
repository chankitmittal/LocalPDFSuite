"""
PDF Document Comparison Module
Provides:
- Precise word-level bounding-box comparison (Draftable / Acrobat Pro DC standard)
- Elimination of cascade text shift false positives
- Dual-document synchronized visual rendering
- High-performance visual difference / pixel heatmap overlay (100% offline via pypdfium2 & Pillow)
- Structured change items with exact page coordinate percentages
- Automated comparison report PDF generation with executive summary and visual diff renders
"""

import io
import os
import base64
import difflib
from datetime import datetime
from typing import Dict, Any, List, Optional, Tuple
from PIL import Image, ImageChops, ImageDraw, ImageEnhance
import pypdfium2 as pdfium
from reportlab.lib.pagesizes import letter, A4
from reportlab.platypus import (
    SimpleDocTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
    Image as RLImage,
    PageBreak,
    KeepTogether,
)
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib import colors


def _image_to_base64_data_uri(img: Image.Image, format: str = "PNG") -> str:
    """Converts a PIL Image to a base64 Data URI."""
    buf = io.BytesIO()
    img.save(buf, format=format, optimize=True)
    b64 = base64.b64encode(buf.getvalue()).decode("ascii")
    return f"data:image/{format.lower()};base64,{b64}"


def _get_pixel_list(img: Image.Image) -> list:
    """Safely extracts flattened pixel list without deprecation warnings across Pillow versions."""
    if hasattr(img, "get_flattened_data"):
        return list(img.get_flattened_data())
    return list(img.getdata())


def render_page_image(doc: pdfium.PdfDocument, page_index: int, dpi: int = 150) -> Image.Image:
    """Renders a single page from a PdfDocument at the target DPI as a PIL RGB Image."""
    scale = dpi / 72.0
    page = doc.get_page(page_index)
    bitmap = page.render(scale=scale)
    pil_img = bitmap.to_pil()
    if pil_img.mode != "RGB":
        pil_img = pil_img.convert("RGB")
    return pil_img


def extract_page_text(doc: pdfium.PdfDocument, page_index: int) -> str:
    """Extracts text for a given page index."""
    try:
        page = doc.get_page(page_index)
        textpage = page.get_textpage()
        return textpage.get_text_range() or ""
    except Exception:
        return ""


def extract_page_words_with_boxes(page: pdfium.PdfPage) -> Tuple[float, float, List[Dict[str, Any]]]:
    """
    Extracts all individual words on a page along with their exact bounding box in PDF points.
    Returns: (page_width, page_height, words_list)
    where each word is {'text': str, 'box': (min_l, min_b, max_r, max_t), 'pct': {'x', 'y', 'w', 'h'}}
    """
    pw, ph = page.get_size()
    tp = page.get_textpage()
    n_chars = tp.count_chars()

    words: List[Dict[str, Any]] = []
    curr_chars: List[str] = []
    curr_boxes: List[Tuple[float, float, float, float]] = []

    for i in range(n_chars):
        ch = tp.get_text_range(i, 1)
        b = tp.get_charbox(i)  # (left, bottom, right, top)

        if ch.isspace() or ch in ('\r', '\n', '\t'):
            if curr_chars:
                min_l = min(cb[0] for cb in curr_boxes)
                min_b = min(cb[1] for cb in curr_boxes)
                max_r = max(cb[2] for cb in curr_boxes)
                max_t = max(cb[3] for cb in curr_boxes)
                text = "".join(curr_chars).strip()
                if text:
                    words.append({
                        "text": text,
                        "box": (min_l, min_b, max_r, max_t),
                        "pct": {
                            "x": round((min_l / pw) * 100, 2),
                            "y": round(((ph - max_t) / ph) * 100, 2),
                            "w": round(max(0.5, ((max_r - min_l) / pw) * 100), 2),
                            "h": round(max(0.5, ((max_t - min_b) / ph) * 100), 2),
                        },
                    })
                curr_chars = []
                curr_boxes = []
        else:
            curr_chars.append(ch)
            curr_boxes.append(b)

    if curr_chars:
        min_l = min(cb[0] for cb in curr_boxes)
        min_b = min(cb[1] for cb in curr_boxes)
        max_r = max(cb[2] for cb in curr_boxes)
        max_t = max(cb[3] for cb in curr_boxes)
        text = "".join(curr_chars).strip()
        if text:
            words.append({
                "text": text,
                "box": (min_l, min_b, max_r, max_t),
                "pct": {
                    "x": round((min_l / pw) * 100, 2),
                    "y": round(((ph - max_t) / ph) * 100, 2),
                    "w": round(max(0.5, ((max_r - min_l) / pw) * 100), 2),
                    "h": round(max(0.5, ((max_t - min_b) / ph) * 100), 2),
                },
            })

    return pw, ph, words


def merge_consecutive_boxes(
    word_items: List[Dict[str, Any]],
    pw: float,
    ph: float,
    max_gap_x: float = 24.0,
) -> List[Dict[str, Any]]:
    """
    Merges words that appear sequentially on the same text line into one clean continuous box.
    """
    if not word_items:
        return []

    merged: List[Dict[str, Any]] = []
    curr: Optional[Dict[str, Any]] = None

    for item in word_items:
        b = item["box"]
        if curr is None:
            curr = {
                "text": [item["text"]],
                "box": list(b),
            }
        else:
            prev_b = curr["box"]
            same_line = abs(prev_b[1] - b[1]) < 6 and abs(prev_b[3] - b[3]) < 6
            close_x = (b[0] - prev_b[2]) < max_gap_x
            if same_line and close_x:
                curr["text"].append(item["text"])
                curr["box"][0] = min(curr["box"][0], b[0])
                curr["box"][1] = min(curr["box"][1], b[1])
                curr["box"][2] = max(curr["box"][2], b[2])
                curr["box"][3] = max(curr["box"][3], b[3])
            else:
                bx = tuple(curr["box"])
                merged.append({
                    "text": " ".join(curr["text"]),
                    "box": bx,
                    "pct": {
                        "x": round((bx[0] / pw) * 100, 2),
                        "y": round(((ph - bx[3]) / ph) * 100, 2),
                        "w": round(max(0.5, ((bx[2] - bx[0]) / pw) * 100), 2),
                        "h": round(max(0.5, ((bx[3] - bx[1]) / ph) * 100), 2),
                    },
                })
                curr = {
                    "text": [item["text"]],
                    "box": list(b),
                }

    if curr:
        bx = tuple(curr["box"])
        merged.append({
            "text": " ".join(curr["text"]),
            "box": bx,
            "pct": {
                "x": round((bx[0] / pw) * 100, 2),
                "y": round(((ph - bx[3]) / ph) * 100, 2),
                "w": round(max(0.5, ((bx[2] - bx[0]) / pw) * 100), 2),
                "h": round(max(0.5, ((bx[3] - bx[1]) / ph) * 100), 2),
            },
        })

    return merged


def draw_word_annotations(
    img: Image.Image,
    boxes: List[Tuple[float, float, float, float]],
    page_w: float,
    page_h: float,
    mode: str = "deleted",  # "deleted" (red) or "added" (green) or "graphic" (amber)
) -> Image.Image:
    """
    Renders high-precision vector highlight capsules over words on the page image.
    - Deleted words: Soft red capsule + solid red border + strike-through line
    - Added words: Soft emerald capsule + solid green border
    - Graphic differences: Amber dashed outline
    """
    if not boxes:
        return img.copy()

    scale_x = img.width / page_w
    scale_y = img.height / page_h

    annotated = img.convert("RGBA").copy()
    overlay = Image.new("RGBA", img.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)

    if mode == "deleted":
        fill_color = (239, 68, 68, 75)       # Red-500 @ ~30% alpha
        stroke_color = (220, 38, 38, 230)    # Red-600
        line_color = (185, 28, 28, 240)      # Red-700
    elif mode == "added":
        fill_color = (16, 185, 129, 75)      # Emerald-500 @ ~30% alpha
        stroke_color = (5, 150, 105, 230)    # Emerald-600
        line_color = None
    else:
        fill_color = (245, 158, 11, 60)      # Amber-500 @ ~25% alpha
        stroke_color = (217, 119, 6, 230)    # Amber-600
        line_color = None

    for b in boxes:
        # b is (left, bottom, right, top) in PDF coordinates
        x0 = max(0, b[0] * scale_x - 2)
        x1 = min(img.width, b[2] * scale_x + 2)
        y0 = max(0, (page_h - b[3]) * scale_y - 2)
        y1 = min(img.height, (page_h - b[1]) * scale_y + 2)

        if x1 > x0 and y1 > y0:
            draw.rounded_rectangle([x0, y0, x1, y1], radius=3, fill=fill_color, outline=stroke_color, width=1)
            if line_color and mode == "deleted":
                mid_y = (y0 + y1) / 2
                draw.line([x0 + 1, mid_y, x1 - 1, mid_y], fill=line_color, width=2)

    result = Image.alpha_composite(annotated, overlay)
    return result.convert("RGB")


def compute_visual_diff(
    img_a: Image.Image,
    img_b: Image.Image,
    threshold: int = 20,
) -> Tuple[Image.Image, float, bool, Tuple[int, int, int, int]]:
    """
    Generates a clean visual diff overlay.
    - Background: Full-fidelity Document B (clean and readable)
    - Red highlights for deleted ink
    - Green highlights for added ink
    - Amber highlights for color/layout shifts
    """
    target_w = max(img_a.width, img_b.width)
    target_h = max(img_a.height, img_b.height)

    if img_a.size != (target_w, target_h):
        img_a = img_a.resize((target_w, target_h), Image.Resampling.LANCZOS)
    if img_b.size != (target_w, target_h):
        img_b = img_b.resize((target_w, target_h), Image.Resampling.LANCZOS)

    gray_a = img_a.convert("L")
    gray_b = img_b.convert("L")

    color_diff = ImageChops.difference(img_a, img_b).convert("L")
    binary_diff = color_diff.point(lambda p: 255 if p > threshold else 0)

    del_mask_data = []
    add_mask_data = []
    ga_data = _get_pixel_list(gray_a)
    gb_data = _get_pixel_list(gray_b)
    diff_data = _get_pixel_list(binary_diff)

    for pa, pb, pd in zip(ga_data, gb_data, diff_data):
        if pd > 0:
            if pa < pb - threshold:
                del_mask_data.append(255)
                add_mask_data.append(0)
            elif pb < pa - threshold:
                del_mask_data.append(0)
                add_mask_data.append(255)
            else:
                del_mask_data.append(128)
                add_mask_data.append(128)
        else:
            del_mask_data.append(0)
            add_mask_data.append(0)

    del_mask = Image.new("L", (target_w, target_h))
    del_mask.putdata(del_mask_data)
    add_mask = Image.new("L", (target_w, target_h))
    add_mask.putdata(add_mask_data)

    bbox = binary_diff.getbbox()
    has_diff = bbox is not None
    total_pixels = target_w * target_h
    diff_pixels = sum(1 for p in diff_data if p > 0)
    diff_percentage = round((diff_pixels / total_pixels) * 100.0, 2) if has_diff else 0.0

    output = img_b.copy().convert("RGBA")

    # Deleted → semi-transparent RED
    red_fill = Image.new("RGBA", (target_w, target_h), (220, 38, 38, 150))
    del_mask_alpha = del_mask.point(lambda p: p if p == 255 else 0)
    output = Image.composite(red_fill, output, del_mask_alpha)

    # Added → semi-transparent GREEN
    green_fill = Image.new("RGBA", (target_w, target_h), (16, 185, 129, 150))
    add_mask_alpha = add_mask.point(lambda p: p if p == 255 else 0)
    output = Image.composite(green_fill, output, add_mask_alpha)

    # Modified → semi-transparent AMBER
    mod_mask = Image.new("L", (target_w, target_h))
    mod_data = [255 if (d == 128 and a == 128) else 0 for d, a in zip(del_mask_data, add_mask_data)]
    mod_mask.putdata(mod_data)
    amber_fill = Image.new("RGBA", (target_w, target_h), (245, 158, 11, 130))
    output = Image.composite(amber_fill, output, mod_mask)

    return output.convert("RGB"), diff_percentage, has_diff, bbox or (0, 0, 0, 0)


def _internal_analyze(
    doc_a: pdfium.PdfDocument,
    doc_b: pdfium.PdfDocument,
    doc_a_path: str,
    doc_b_path: str,
    include_text_diff: bool = True,
    quick_visual_check: bool = True,
) -> Dict[str, Any]:
    len_a = len(doc_a)
    len_b = len(doc_b)
    max_pages = max(len_a, len_b)

    pages_summary: List[Dict[str, Any]] = []
    total_added_words = 0
    total_deleted_words = 0
    modified_pages_count = 0
    identical_pages_count = 0
    added_pages_count = 0
    deleted_pages_count = 0

    for p_idx in range(max_pages):
        page_num = p_idx + 1
        page_res: Dict[str, Any] = {
            "page_number": page_num,
            "status": "identical",  # identical, modified, added, deleted
            "has_visual_diff": False,
            "diff_percentage": 0.0,
            "added_words_count": 0,
            "deleted_words_count": 0,
            "diff_entries": [],
            "changes": [],
        }

        in_a = p_idx < len_a
        in_b = p_idx < len_b

        if in_a and in_b:
            pw_a, ph_a, words_a = extract_page_words_with_boxes(doc_a.get_page(p_idx))
            pw_b, ph_b, words_b = extract_page_words_with_boxes(doc_b.get_page(p_idx))

            str_words_a = [w["text"] for w in words_a]
            str_words_b = [w["text"] for w in words_b]

            matcher = difflib.SequenceMatcher(None, str_words_a, str_words_b)
            p_added_words = 0
            p_deleted_words = 0
            changes: List[Dict[str, Any]] = []
            diff_entries: List[Dict[str, Any]] = []

            change_counter = 1
            for tag, i1, i2, j1, j2 in matcher.get_opcodes():
                if tag == "equal":
                    continue
                elif tag == "delete":
                    del_sub = words_a[i1:i2]
                    merged_del = merge_consecutive_boxes(del_sub, pw_a, ph_a)
                    w_count = len(del_sub)
                    p_deleted_words += w_count

                    for m in merged_del:
                        change_id = f"ch_p{page_num}_{change_counter}"
                        change_counter += 1
                        changes.append({
                            "id": change_id,
                            "page_number": page_num,
                            "type": "delete",
                            "old_text": m["text"],
                            "new_text": "",
                            "box_a": m["pct"],
                            "box_b": None,
                        })

                    diff_entries.append({
                        "type": "delete",
                        "old_text": " ".join(str_words_a[i1:i2]),
                        "new_text": "",
                        "words_deleted": w_count,
                        "words_added": 0,
                    })

                elif tag == "insert":
                    ins_sub = words_b[j1:j2]
                    merged_ins = merge_consecutive_boxes(ins_sub, pw_b, ph_b)
                    w_count = len(ins_sub)
                    p_added_words += w_count

                    for m in merged_ins:
                        change_id = f"ch_p{page_num}_{change_counter}"
                        change_counter += 1
                        changes.append({
                            "id": change_id,
                            "page_number": page_num,
                            "type": "insert",
                            "old_text": "",
                            "new_text": m["text"],
                            "box_a": None,
                            "box_b": m["pct"],
                        })

                    diff_entries.append({
                        "type": "insert",
                        "old_text": "",
                        "new_text": " ".join(str_words_b[j1:j2]),
                        "words_deleted": 0,
                        "words_added": w_count,
                    })

                elif tag == "replace":
                    del_sub = words_a[i1:i2]
                    ins_sub = words_b[j1:j2]
                    merged_del = merge_consecutive_boxes(del_sub, pw_a, ph_a)
                    merged_ins = merge_consecutive_boxes(ins_sub, pw_b, ph_b)

                    d_cnt = len(del_sub)
                    a_cnt = len(ins_sub)
                    p_deleted_words += d_cnt
                    p_added_words += a_cnt

                    old_str = " ".join(str_words_a[i1:i2])
                    new_str = " ".join(str_words_b[j1:j2])

                    change_id = f"ch_p{page_num}_{change_counter}"
                    change_counter += 1
                    changes.append({
                        "id": change_id,
                        "page_number": page_num,
                        "type": "replace",
                        "old_text": old_str,
                        "new_text": new_str,
                        "box_a": merged_del[0]["pct"] if merged_del else None,
                        "box_b": merged_ins[0]["pct"] if merged_ins else None,
                    })

                    diff_entries.append({
                        "type": "replace",
                        "old_text": old_str,
                        "new_text": new_str,
                        "words_deleted": d_cnt,
                        "words_added": a_cnt,
                    })

            page_res["added_words_count"] = p_added_words
            page_res["deleted_words_count"] = p_deleted_words
            page_res["diff_entries"] = diff_entries
            page_res["changes"] = changes
            total_added_words += p_added_words
            total_deleted_words += p_deleted_words

            has_vis_diff = False
            diff_pct = 0.0
            if quick_visual_check:
                try:
                    thumb_a = render_page_image(doc_a, p_idx, dpi=72)
                    thumb_b = render_page_image(doc_b, p_idx, dpi=72)
                    _, diff_pct, has_vis_diff, _ = compute_visual_diff(thumb_a, thumb_b, threshold=20)
                except Exception:
                    pass

            page_res["has_visual_diff"] = has_vis_diff
            page_res["diff_percentage"] = diff_pct

            if p_added_words > 0 or p_deleted_words > 0 or has_vis_diff:
                page_res["status"] = "modified"
                modified_pages_count += 1
            else:
                page_res["status"] = "identical"
                identical_pages_count += 1

        elif in_b and not in_a:
            page_res["status"] = "added"
            text_b = extract_page_text(doc_b, p_idx)
            w_count = len(text_b.split())
            page_res["added_words_count"] = w_count
            total_added_words += w_count
            added_pages_count += 1
            page_res["diff_entries"] = [{
                "type": "insert",
                "old_text": "",
                "new_text": f"New page added in Document B ({w_count} words)",
                "words_deleted": 0,
                "words_added": w_count,
            }]
            page_res["changes"] = [{
                "id": f"ch_p{page_num}_1",
                "page_number": page_num,
                "type": "insert",
                "old_text": "",
                "new_text": f"New page added in Document B ({w_count} words)",
                "box_a": None,
                "box_b": {"x": 5, "y": 5, "w": 90, "h": 90},
            }]
        elif in_a and not in_b:
            page_res["status"] = "deleted"
            text_a = extract_page_text(doc_a, p_idx)
            w_count = len(text_a.split())
            page_res["deleted_words_count"] = w_count
            total_deleted_words += w_count
            deleted_pages_count += 1
            page_res["diff_entries"] = [{
                "type": "delete",
                "old_text": f"Page deleted from Document A ({w_count} words)",
                "new_text": "",
                "words_deleted": w_count,
                "words_added": 0,
            }]
            page_res["changes"] = [{
                "id": f"ch_p{page_num}_1",
                "page_number": page_num,
                "type": "delete",
                "old_text": f"Page deleted from Document A ({w_count} words)",
                "new_text": "",
                "box_a": {"x": 5, "y": 5, "w": 90, "h": 90},
                "box_b": None,
            }]

        pages_summary.append(page_res)

    total_changes = modified_pages_count + added_pages_count + deleted_pages_count
    similarity_score = round((identical_pages_count / max_pages) * 100.0, 1) if max_pages > 0 else 100.0

    return {
        "status": "success",
        "doc_a": {
            "path": doc_a_path,
            "filename": os.path.basename(doc_a_path),
            "page_count": len_a,
        },
        "doc_b": {
            "path": doc_b_path,
            "filename": os.path.basename(doc_b_path),
            "page_count": len_b,
        },
        "max_pages": max_pages,
        "identical_pages_count": identical_pages_count,
        "modified_pages_count": modified_pages_count,
        "added_pages_count": added_pages_count,
        "deleted_pages_count": deleted_pages_count,
        "total_changes": total_changes,
        "similarity_score": similarity_score,
        "total_added_words": total_added_words,
        "total_deleted_words": total_deleted_words,
        "pages": pages_summary,
    }


def analyze_document_comparison(
    doc_a_path: str,
    doc_b_path: str,
    include_text_diff: bool = True,
    quick_visual_check: bool = True,
) -> Dict[str, Any]:
    """
    Performs full document comparison analysis between Document A (Baseline) and Document B (Revised).
    Returns comprehensive summary metrics and per-page difference metadata with exact word coordinates.
    Guarantees native PDFium C++ handles are closed via try...finally.
    """
    if not os.path.isfile(doc_a_path):
        raise FileNotFoundError(f"Document A not found: {doc_a_path}")
    if not os.path.isfile(doc_b_path):
        raise FileNotFoundError(f"Document B not found: {doc_b_path}")

    doc_a = pdfium.PdfDocument(doc_a_path)
    doc_b = pdfium.PdfDocument(doc_b_path)
    try:
        return _internal_analyze(
            doc_a=doc_a,
            doc_b=doc_b,
            doc_a_path=doc_a_path,
            doc_b_path=doc_b_path,
            include_text_diff=include_text_diff,
            quick_visual_check=quick_visual_check,
        )
    finally:
        try:
            doc_a.close()
        except Exception:
            pass
        try:
            doc_b.close()
        except Exception:
            pass


def _internal_render_diff(
    doc_a: pdfium.PdfDocument,
    doc_b: pdfium.PdfDocument,
    page_number: int,
    dpi: int = 150,
) -> Dict[str, Any]:
    p_idx = page_number - 1
    has_a = 0 <= p_idx < len(doc_a)
    has_b = 0 <= p_idx < len(doc_b)

    img_a: Optional[Image.Image] = None
    img_b: Optional[Image.Image] = None
    img_a_annotated: Optional[Image.Image] = None
    img_b_annotated: Optional[Image.Image] = None
    diff_img: Optional[Image.Image] = None
    diff_pct = 0.0
    has_diff = False
    page_changes: List[Dict[str, Any]] = []

    if has_a and has_b:
        page_a = doc_a.get_page(p_idx)
        page_b = doc_b.get_page(p_idx)

        pw_a, ph_a, words_a = extract_page_words_with_boxes(page_a)
        pw_b, ph_b, words_b = extract_page_words_with_boxes(page_b)

        img_a = render_page_image(doc_a, p_idx, dpi=dpi)
        img_b = render_page_image(doc_b, p_idx, dpi=dpi)

        # 1. Word sequence matching
        str_a = [w["text"] for w in words_a]
        str_b = [w["text"] for w in words_b]
        matcher = difflib.SequenceMatcher(None, str_a, str_b)

        deleted_boxes_a: List[Tuple[float, float, float, float]] = []
        added_boxes_b: List[Tuple[float, float, float, float]] = []

        change_counter = 1
        for tag, i1, i2, j1, j2 in matcher.get_opcodes():
            if tag == "equal":
                continue
            elif tag == "delete":
                del_sub = words_a[i1:i2]
                merged_del = merge_consecutive_boxes(del_sub, pw_a, ph_a)
                for m in merged_del:
                    deleted_boxes_a.append(m["box"])
                    page_changes.append({
                        "id": f"ch_p{page_number}_{change_counter}",
                        "page_number": page_number,
                        "type": "delete",
                        "old_text": m["text"],
                        "new_text": "",
                        "box_a": m["pct"],
                        "box_b": None,
                    })
                    change_counter += 1
            elif tag == "insert":
                ins_sub = words_b[j1:j2]
                merged_ins = merge_consecutive_boxes(ins_sub, pw_b, ph_b)
                for m in merged_ins:
                    added_boxes_b.append(m["box"])
                    page_changes.append({
                        "id": f"ch_p{page_number}_{change_counter}",
                        "page_number": page_number,
                        "type": "insert",
                        "old_text": "",
                        "new_text": m["text"],
                        "box_a": None,
                        "box_b": m["pct"],
                    })
                    change_counter += 1
            elif tag == "replace":
                del_sub = words_a[i1:i2]
                ins_sub = words_b[j1:j2]
                merged_del = merge_consecutive_boxes(del_sub, pw_a, ph_a)
                merged_ins = merge_consecutive_boxes(ins_sub, pw_b, ph_b)

                for m in merged_del:
                    deleted_boxes_a.append(m["box"])
                for m in merged_ins:
                    added_boxes_b.append(m["box"])

                page_changes.append({
                    "id": f"ch_p{page_number}_{change_counter}",
                    "page_number": page_number,
                    "type": "replace",
                    "old_text": " ".join(str_a[i1:i2]),
                    "new_text": " ".join(str_b[j1:j2]),
                    "box_a": merged_del[0]["pct"] if merged_del else None,
                    "box_b": merged_ins[0]["pct"] if merged_ins else None,
                })
                change_counter += 1

        # 2. Draw clean, vector word highlights on Doc A and Doc B
        img_a_annotated = draw_word_annotations(img_a, deleted_boxes_a, pw_a, ph_a, mode="deleted")
        img_b_annotated = draw_word_annotations(img_b, added_boxes_b, pw_b, ph_b, mode="added")

        # 3. Visual diff calculation
        diff_img, diff_pct, has_diff, _ = compute_visual_diff(img_a, img_b)

        if len(page_changes) > 0 or has_diff:
            has_diff = True

    elif has_a and not has_b:
        img_a = render_page_image(doc_a, p_idx, dpi=dpi)
        img_a_annotated = img_a.copy()
        diff_img = Image.blend(img_a, Image.new("RGB", img_a.size, (254, 226, 226)), 0.6)
        has_diff = True
        diff_pct = 100.0
        page_changes.append({
            "id": f"ch_p{page_number}_1",
            "page_number": page_number,
            "type": "delete",
            "old_text": "Page deleted from Document A",
            "new_text": "",
            "box_a": {"x": 5, "y": 5, "w": 90, "h": 90},
            "box_b": None,
        })
    elif has_b and not has_a:
        img_b = render_page_image(doc_b, p_idx, dpi=dpi)
        img_b_annotated = img_b.copy()
        diff_img = Image.blend(img_b, Image.new("RGB", img_b.size, (224, 242, 254)), 0.6)
        has_diff = True
        diff_pct = 100.0
        page_changes.append({
            "id": f"ch_p{page_number}_1",
            "page_number": page_number,
            "type": "insert",
            "old_text": "",
            "new_text": "New page added in Document B",
            "box_a": None,
            "box_b": {"x": 5, "y": 5, "w": 90, "h": 90},
        })

    return {
        "status": "success",
        "page_number": page_number,
        "has_diff": has_diff,
        "diff_percentage": diff_pct,
        "img_a": _image_to_base64_data_uri(img_a) if img_a else None,
        "img_b": _image_to_base64_data_uri(img_b) if img_b else None,
        "img_a_annotated": _image_to_base64_data_uri(img_a_annotated) if img_a_annotated else None,
        "img_b_annotated": _image_to_base64_data_uri(img_b_annotated) if img_b_annotated else None,
        "diff_img": _image_to_base64_data_uri(diff_img) if diff_img else None,
        "changes": page_changes,
    }


def render_page_diff_view(
    doc_a_path: str,
    doc_b_path: str,
    page_number: int,
    dpi: int = 150,
) -> Dict[str, Any]:
    """
    Renders high-resolution comparison view for a specific page using exact word bounding boxes.
    Guarantees native PDFium C++ handles are closed via try...finally.
    """
    if not os.path.isfile(doc_a_path):
        raise FileNotFoundError(f"Document A not found: {doc_a_path}")
    if not os.path.isfile(doc_b_path):
        raise FileNotFoundError(f"Document B not found: {doc_b_path}")

    doc_a = pdfium.PdfDocument(doc_a_path)
    doc_b = pdfium.PdfDocument(doc_b_path)
    try:
        return _internal_render_diff(
            doc_a=doc_a,
            doc_b=doc_b,
            page_number=page_number,
            dpi=dpi,
        )
    finally:
        try:
            doc_a.close()
        except Exception:
            pass
        try:
            doc_b.close()
        except Exception:
            pass


def generate_diff_report_pdf(
    doc_a_path: str,
    doc_b_path: str,
    output_path: str,
    analysis_data: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """
    Generates a PDF comparison report complete with:
    - Executive summary cover page
    - Metric overview table
    - High-resolution visual diff renders for every changed page
    - Detailed clause additions and deletions breakdown
    """
    if analysis_data is None:
        analysis_data = analyze_document_comparison(doc_a_path, doc_b_path, quick_visual_check=True)

    os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)

    doc_a = pdfium.PdfDocument(doc_a_path)
    doc_b = pdfium.PdfDocument(doc_b_path)

    pdf_doc = SimpleDocTemplate(
        output_path,
        pagesize=A4,
        leftMargin=36,
        rightMargin=36,
        topMargin=36,
        bottomMargin=36,
    )

    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        "ReportTitle",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=22,
        leading=26,
        textColor=colors.HexColor("#0f172a"),
        spaceAfter=6,
    )
    subtitle_style = ParagraphStyle(
        "ReportSubtitle",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=11,
        leading=14,
        textColor=colors.HexColor("#64748b"),
        spaceAfter=18,
    )
    h2_style = ParagraphStyle(
        "H2",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=13,
        leading=16,
        textColor=colors.HexColor("#1e293b"),
        spaceBefore=12,
        spaceAfter=8,
    )
    body_style = ParagraphStyle(
        "Body",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=9,
        leading=12,
        textColor=colors.HexColor("#334155"),
    )
    delete_style = ParagraphStyle(
        "DeleteStyle",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=8,
        leading=11,
        textColor=colors.HexColor("#b91c1c"),
    )
    insert_style = ParagraphStyle(
        "InsertStyle",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=8,
        leading=11,
        textColor=colors.HexColor("#0369a1"),
    )

    story = []

    # 1. Executive Summary Title
    story.append(Paragraph("DOCUMENT COMPARISON REPORT", title_style))
    story.append(
        Paragraph(
            f"Generated on {datetime.now().strftime('%Y-%m-%d %H:%M:%S')} &bull; LocalPDF Enterprise Offline Suite",
            subtitle_style,
        )
    )

    # 2. Metadata Comparison Table
    table_data = [
        [
            Paragraph("<b>Target</b>", body_style),
            Paragraph("<b>Baseline Document (A)</b>", body_style),
            Paragraph("<b>Revised Document (B)</b>", body_style),
        ],
        [
            Paragraph("<b>File Name</b>", body_style),
            Paragraph(analysis_data["doc_a"]["filename"], body_style),
            Paragraph(analysis_data["doc_b"]["filename"], body_style),
        ],
        [
            Paragraph("<b>Total Pages</b>", body_style),
            Paragraph(str(analysis_data["doc_a"]["page_count"]), body_style),
            Paragraph(str(analysis_data["doc_b"]["page_count"]), body_style),
        ],
        [
            Paragraph("<b>Comparison Result</b>", body_style),
            Paragraph(
                f"<b>{analysis_data['similarity_score']}% Match</b> ({analysis_data['identical_pages_count']} identical pages)",
                body_style,
            ),
            Paragraph(
                f"<b>{analysis_data['total_changes']} changed pages</b> (+{analysis_data['total_added_words']} / -{analysis_data['total_deleted_words']} words)",
                body_style,
            ),
        ],
    ]

    t = Table(table_data, colWidths=[120, 200, 200])
    t.setStyle(
        TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#f1f5f9")),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.HexColor("#0f172a")),
            ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e1")),
            ("PADDING", (0, 0), (-1, -1), 6),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ])
    )
    story.append(t)
    story.append(Spacer(1, 16))

    # 3. Legend Box
    legend_data = [
        [
            Paragraph("<font color='#b91c1c'>■ <b>Red Highlighting (Doc A):</b></font> Text or graphics present in Document A but removed in B", body_style),
            Paragraph("<font color='#0284c7'>■ <b>Blue/Green Highlighting (Doc B):</b></font> Text or graphics newly introduced in Document B", body_style),
        ]
    ]
    t_leg = Table(legend_data, colWidths=[260, 260])
    t_leg.setStyle(
        TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#f8fafc")),
            ("BOX", (0, 0), (-1, -1), 1, colors.HexColor("#e2e8f0")),
            ("PADDING", (0, 0), (-1, -1), 6),
        ])
    )
    story.append(t_leg)
    story.append(Spacer(1, 20))

    # 4. Detailed Changed Pages Renders (Side-by-Side Comparison Standard)
    temp_img_files = []
    try:
        modified_pages = [p for p in analysis_data["pages"] if p["status"] != "identical"]

        if not modified_pages:
            story.append(
                Paragraph(
                    "<b>Result: Documents are 100% Identical!</b> Zero textual or graphical discrepancies detected.",
                    h2_style,
                )
            )
        else:
            story.append(Paragraph(f"Detailed Discrepancy Breakdown ({len(modified_pages)} pages)", h2_style))

            for page_item in modified_pages:
                p_num = page_item["page_number"]
                p_idx = p_num - 1
                story.append(Spacer(1, 10))
                story.append(
                    Paragraph(
                        f"<b>Page {p_num} &bull; Status: {page_item['status'].upper()}</b> "
                        f"(Visual Diff: {page_item['diff_percentage']}% | +{page_item['added_words_count']} words, -{page_item['deleted_words_count']} words)",
                        h2_style,
                    )
                )

                # Render Side-by-Side Dual Document View (Clear, non-overlapping)
                has_a = p_idx < len(doc_a)
                has_b = p_idx < len(doc_b)
                if has_a and has_b:
                    page_a_obj = doc_a.get_page(p_idx)
                    page_b_obj = doc_b.get_page(p_idx)
                    pw_a, ph_a, _ = extract_page_words_with_boxes(page_a_obj)
                    pw_b, ph_b, _ = extract_page_words_with_boxes(page_b_obj)

                    boxes_del = []
                    boxes_ins = []
                    for ch in page_item.get("changes", []):
                        if ch.get("box_a"):
                            ba = ch["box_a"]
                            l = (ba["x"] / 100.0) * pw_a
                            r = ((ba["x"] + ba["w"]) / 100.0) * pw_a
                            t = ph_a - (ba["y"] / 100.0) * ph_a
                            b = ph_a - ((ba["y"] + ba["h"]) / 100.0) * ph_a
                            boxes_del.append((l, b, r, t))
                        if ch.get("box_b"):
                            bb = ch["box_b"]
                            l = (bb["x"] / 100.0) * pw_b
                            r = ((bb["x"] + bb["w"]) / 100.0) * pw_b
                            t = ph_b - (bb["y"] / 100.0) * ph_b
                            b = ph_b - ((bb["y"] + bb["h"]) / 100.0) * ph_b
                            boxes_ins.append((l, b, r, t))

                    img_a = render_page_image(doc_a, p_idx, dpi=120)
                    img_b = render_page_image(doc_b, p_idx, dpi=120)

                    ann_a = draw_word_annotations(img_a, boxes_del, pw_a, ph_a, mode="deleted")
                    ann_b = draw_word_annotations(img_b, boxes_ins, pw_b, ph_b, mode="added")

                    tmp_path_a = output_path + f"_tmp_p{p_num}_a.png"
                    tmp_path_b = output_path + f"_tmp_p{p_num}_b.png"
                    ann_a.save(tmp_path_a, format="PNG")
                    ann_b.save(tmp_path_b, format="PNG")
                    temp_img_files.extend([tmp_path_a, tmp_path_b])

                    max_w = 250.0
                    max_h = 240.0
                    sf_a = min(max_w / ann_a.width, max_h / ann_a.height)
                    sf_b = min(max_w / ann_b.width, max_h / ann_b.height)

                    sbs_table = Table(
                        [
                            [
                                Paragraph("<font color='#b91c1c'><b>Original Document (A)</b> [Deletions Marked]</font>", body_style),
                                Paragraph("<font color='#0369a1'><b>Revised Document (B)</b> [Additions Marked]</font>", body_style),
                            ],
                            [
                                RLImage(tmp_path_a, width=ann_a.width * sf_a, height=ann_a.height * sf_a),
                                RLImage(tmp_path_b, width=ann_b.width * sf_b, height=ann_b.height * sf_b),
                            ],
                        ],
                        colWidths=[260, 260],
                    )
                    sbs_table.setStyle(
                        TableStyle([
                            ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#f8fafc")),
                            ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e1")),
                            ("INNERGRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#e2e8f0")),
                            ("PADDING", (0, 0), (-1, -1), 6),
                            ("VALIGN", (0, 0), (-1, -1), "TOP"),
                            ("ALIGN", (0, 0), (-1, -1), "CENTER"),
                        ])
                    )
                    story.append(sbs_table)
                    story.append(Spacer(1, 8))
                elif has_a and not has_b:
                    img_a = render_page_image(doc_a, p_idx, dpi=120)
                    tmp_path_a = output_path + f"_tmp_p{p_num}_del.png"
                    img_a.save(tmp_path_a, format="PNG")
                    temp_img_files.append(tmp_path_a)
                    story.append(Paragraph("<font color='#b91c1c'><b>Full Page Deleted in Document B</b></font>", body_style))
                    story.append(RLImage(tmp_path_a, width=240, height=310))
                    story.append(Spacer(1, 8))
                elif has_b and not has_a:
                    img_b = render_page_image(doc_b, p_idx, dpi=120)
                    tmp_path_b = output_path + f"_tmp_p{p_num}_add.png"
                    img_b.save(tmp_path_b, format="PNG")
                    temp_img_files.append(tmp_path_b)
                    story.append(Paragraph("<font color='#0369a1'><b>Full Page Added in Document B</b></font>", body_style))
                    story.append(RLImage(tmp_path_b, width=240, height=310))
                    story.append(Spacer(1, 8))

                # Text Changes List
                entries = page_item.get("diff_entries", [])
                if entries:
                    text_rows = []
                    for entry in entries[:6]:  # Show top 6 changes per page in the report
                        e_type = entry.get("type")
                        if e_type == "delete":
                            text_rows.append([
                                Paragraph("<font color='#b91c1c'><b>DELETED:</b></font>", delete_style),
                                Paragraph(entry.get("old_text", "")[:200], delete_style),
                            ])
                        elif e_type == "insert":
                            text_rows.append([
                                Paragraph("<font color='#0369a1'><b>ADDED:</b></font>", insert_style),
                                Paragraph(entry.get("new_text", "")[:200], insert_style),
                            ])
                        elif e_type == "replace":
                            text_rows.append([
                                Paragraph("<font color='#b91c1c'><b>REPLACED:</b></font>", delete_style),
                                Paragraph(entry.get("old_text", "")[:120], delete_style),
                            ])
                            text_rows.append([
                                Paragraph("<font color='#0369a1'><b>WITH:</b></font>", insert_style),
                                Paragraph(entry.get("new_text", "")[:120], insert_style),
                            ])

                    if text_rows:
                        t_text = Table(text_rows, colWidths=[70, 450])
                        t_text.setStyle(
                            TableStyle([
                                ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#f8fafc")),
                                ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e1")),
                                ("INNERGRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#e2e8f0")),
                                ("PADDING", (0, 0), (-1, -1), 4),
                            ])
                        )
                        story.append(t_text)

                story.append(Spacer(1, 14))

        # Build Document
        pdf_doc.build(story)

    finally:
        doc_a.close()
        doc_b.close()
        for tmp_p in temp_img_files:
            if os.path.exists(tmp_p):
                try:
                    os.remove(tmp_p)
                except Exception:
                    pass

    return {
        "status": "success",
        "output_path": output_path,
        "file_size": os.path.getsize(output_path),
        "total_changes": analysis_data["total_changes"],
        "similarity_score": analysis_data["similarity_score"],
    }

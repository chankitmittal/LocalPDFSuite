"""
PDF Form Filling & Flattening Module
Provides:
- get_pdf_form_fields: Detects and inspects interactive AcroForm fields (text, checkbox, choice).
- fill_pdf_form: Fills interactive AcroForm fields and/or stamps custom on-page text annotations.
  When flatten=True, permanently burns all field values and annotations into the static page
  content streams via PDFium FPDFPage_Flatten and strips all AcroForm dictionaries and widget
  annotations, making form contents completely unalterable in Adobe Reader and PDF viewers.
"""

import io
import os
import re
import tempfile
import secrets
import logging
from typing import Dict, Any, List, Optional
from pypdf import PdfReader, PdfWriter
from pypdf.generic import NameObject, BooleanObject
from reportlab.pdfgen import canvas
from reportlab.lib.colors import HexColor
import pypdfium2 as pdfium
import pypdfium2.raw as pdfium_c
import pikepdf

logger = logging.getLogger(__name__)


def get_pdf_form_fields(pdf_path: str) -> Dict[str, Any]:
    """
    Scans a PDF for interactive AcroForm fields.
    Returns metadata for all detected fields including field name, type, current value, and options.
    """
    if not os.path.exists(pdf_path):
        raise FileNotFoundError(f"PDF not found: {pdf_path}")

    reader = PdfReader(pdf_path)
    raw_fields = reader.get_fields() or {}

    fields_list = []
    for name, field_data in raw_fields.items():
        ft = str(field_data.get("/FT", ""))
        val = field_data.get("/V", "")

        field_type = "text"
        if ft == "/Btn":
            field_type = "checkbox"
        elif ft == "/Ch":
            field_type = "choice"
        elif ft == "/Sig":
            field_type = "signature"

        options = []
        if "/Opt" in field_data:
            opts = field_data["/Opt"]
            if isinstance(opts, list):
                options = [str(o) for o in opts]

        current_val = ""
        if val is not None:
            if isinstance(val, bool):
                current_val = "true" if val else "false"
            else:
                s_val = str(val).lstrip("/")
                if field_type == "checkbox":
                    current_val = "true" if s_val.lower() in ("yes", "on", "true", "1") else "false"
                else:
                    current_val = s_val
        elif field_type == "checkbox":
            current_val = "false"

        fields_list.append({
            "name": name,
            "type": field_type,
            "value": current_val,
            "options": options,
        })

    return {
        "status": "success",
        "has_acroform": len(fields_list) > 0,
        "total_fields": len(fields_list),
        "fields": fields_list,
    }


def _create_form_appearance_xobject(
    pdf: pikepdf.Pdf,
    text: str,
    width: float,
    height: float,
    font_size: float = 10.0,
    field_type: str = "/Tx",
    is_checked: bool = False,
) -> pikepdf.Stream:
    """
    Builds an ISO 32000-1 compliant /AP/N Form XObject stream for interactive form fields.
    Guarantees that Adobe Acrobat DC, Google Chrome, Edge, and macOS Preview immediately
    render the filled text without requiring the user to click into the box.
    """
    width = max(10.0, float(width))
    height = max(8.0, float(height))

    if field_type == "/Btn":
        # Checkbox appearance
        mark = "4 4 12 12 re\nS\n" if not is_checked else "q\n2 2 12 12 re\nf\nQ\n"
        stream_bytes = (
            f"q\n0.2 0.2 0.2 RG\n1 w\n{mark}Q\n"
        ).encode("latin1", errors="replace")
        font_dict = pikepdf.Dictionary()
    else:
        # Text or Choice field appearance
        escaped_text = str(text).replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")
        y_baseline = max(2.0, (height - font_size) / 2.0)
        stream_bytes = (
            f"q\n"
            f"0 0 {width:.2f} {height:.2f} re\n"
            f"W\n"
            f"n\n"
            f"BT\n"
            f"/Helv {font_size:.1f} Tf\n"
            f"0 0 0 rg\n"
            f"2 {y_baseline:.2f} Td\n"
            f"({escaped_text}) Tj\n"
            f"ET\n"
            f"Q\n"
        ).encode("latin1", errors="replace")
        font_dict = pikepdf.Dictionary({
            "/Helv": pikepdf.Dictionary({
                "/Type": pikepdf.Name("/Font"),
                "/Subtype": pikepdf.Name("/Type1"),
                "/BaseFont": pikepdf.Name("/Helvetica"),
            })
        })

    xobj = pikepdf.Stream(pdf, stream_bytes)
    xobj.Type = pikepdf.Name("/XObject")
    xobj.Subtype = pikepdf.Name("/Form")
    xobj.BBox = pikepdf.Array([0, 0, width, height])
    if font_dict:
        xobj.Resources = pikepdf.Dictionary({"/Font": font_dict})
    return xobj


def fill_pdf_form(
    input_path: str,
    output_path: str,
    field_values: Optional[Dict[str, Any]] = None,
    text_annotations: Optional[List[Dict[str, Any]]] = None,
    flatten: bool = True,
    lock_permissions: bool = False,
    permissions_password: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Fills interactive AcroForm fields and/or stamps custom on-page text annotations
    onto a PDF (ideal for both digital forms and flat/scanned forms).

    When flatten=True:
    1. Uses PDFium FPDFPage_Flatten to burn widget appearance streams into permanent page graphics.
    2. Strips all /AcroForm dictionaries and widget annotations from the PDF.
    3. Guarantees that Adobe Reader cannot modify or edit the filled values.
    """
    if not os.path.exists(input_path):
        raise FileNotFoundError(f"PDF not found: {input_path}")

    os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)

    reader = PdfReader(input_path)
    writer = PdfWriter()
    writer.append(reader)

    # 1. Update interactive AcroForm fields if provided
    if field_values:
        widget_annots = []
        for page in writer.pages:
            if "/Annots" in page:
                for a in page["/Annots"]:
                    annot = a.get_object()
                    if annot.get("/Subtype") == "/Widget":
                        widget_annots.append(annot)

        def normalize_name(s: str) -> str:
            return re.sub(r"\s+", " ", str(s)).strip().lower()

        annot_by_raw_name = {}
        raw_name_by_norm = {}

        for annot in widget_annots:
            t = annot.get("/T")
            if not t and "/Parent" in annot:
                parent = annot["/Parent"].get_object()
                t = parent.get("/T")
            if t:
                raw_name = str(t)
                annot_by_raw_name[raw_name] = annot
                raw_name_by_norm[normalize_name(raw_name)] = raw_name

        clean_field_values = {}
        for user_k, user_v in field_values.items():
            # Resolve target field name (supporting exact and normalized whitespace)
            target_raw_name = None
            if user_k in annot_by_raw_name:
                target_raw_name = user_k
            elif normalize_name(user_k) in raw_name_by_norm:
                target_raw_name = raw_name_by_norm[normalize_name(user_k)]
            else:
                target_raw_name = user_k

            annot = annot_by_raw_name.get(target_raw_name)
            ft = annot.get("/FT") if annot else None
            if not ft and annot and "/Parent" in annot:
                ft = annot["/Parent"].get_object().get("/FT")

            if ft == "/Btn":
                # Detect the exact on-state key defined in the PDF widget's /AP/N dictionary
                on_state = "/Yes"
                if annot and "/AP" in annot:
                    ap = annot["/AP"].get_object()
                    if "/N" in ap:
                        n_dict = ap["/N"].get_object()
                        for k in n_dict.keys():
                            if str(k) != "/Off":
                                on_state = str(k)
                                break

                is_checked = (
                    user_v is True
                    or str(user_v).strip().lower() in ("true", "yes", "1", "on")
                )
                chosen_val = on_state if is_checked else "/Off"
                clean_field_values[target_raw_name] = chosen_val
                if annot:
                    annot[NameObject("/AS")] = NameObject(chosen_val)
                    annot[NameObject("/V")] = NameObject(chosen_val)
            else:
                clean_field_values[target_raw_name] = str(user_v) if user_v is not None else ""

        # Remove pre-existing appearance streams on /Tx and /Ch fields.
        # This prevents pypdf from in-place overwriting indirect stream objects that are
        # shared between multiple form fields in the source document.
        for annot in widget_annots:
            ft = annot.get("/FT")
            if not ft and "/Parent" in annot:
                ft = annot["/Parent"].get_object().get("/FT")
            if ft in ("/Tx", "/Ch") and "/AP" in annot:
                del annot["/AP"]

        for page in writer.pages:
            try:
                writer.update_page_form_field_values(page, clean_field_values)
            except Exception as e:
                logger.warning(f"[LocalPDF] Exception during form field update on page: {e}")

        if "/AcroForm" in writer.root_object:
            try:
                acro = writer.root_object["/AcroForm"].get_object()
                acro[NameObject("/NeedAppearances")] = BooleanObject(True)
            except Exception as e:
                logger.warning(f"[LocalPDF] Could not set /NeedAppearances on AcroForm: {e}")

    # 2. Overlay custom on-page text annotations (for flat forms or click-to-type anywhere)
    if text_annotations and len(text_annotations) > 0:
        page_annots: Dict[int, List[Dict[str, Any]]] = {}
        for ann in text_annotations:
            p_num = int(ann.get("page_number", 1))
            page_annots.setdefault(p_num, []).append(ann)

        for p_idx, page in enumerate(writer.pages):
            p_num = p_idx + 1
            if p_num in page_annots:
                pw = float(page.mediabox.width)
                ph = float(page.mediabox.height)

                overlay_buf = io.BytesIO()
                c = canvas.Canvas(overlay_buf, pagesize=(pw, ph))

                for item in page_annots[p_num]:
                    txt = str(item.get("text", "")).strip()
                    if not txt:
                        continue
                    x = float(item.get("x", 100))
                    y = float(item.get("y", 100))
                    fsize = int(item.get("font_size", 12))
                    color_hex = str(item.get("hex_color", "#0f172a"))

                    c.saveState()
                    try:
                        c.setFillColor(HexColor(color_hex))
                    except Exception:
                        c.setFillColorRGB(0.1, 0.1, 0.1)

                    c.setFont("Helvetica", fsize)
                    c.drawString(x, y, txt)
                    c.restoreState()

                c.showPage()
                c.save()
                overlay_buf.seek(0)

                overlay_reader = PdfReader(overlay_buf)
                if len(overlay_reader.pages) > 0:
                    page.merge_page(overlay_reader.pages[0])

    # Save to intermediate file
    with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp_f:
        temp_filled_path = tmp_f.name

    try:
        with open(temp_filled_path, "wb") as f_out:
            writer.write(f_out)

        effective_owner_pwd = None
        if lock_permissions:
            effective_owner_pwd = permissions_password.strip() if (permissions_password and permissions_password.strip()) else "LocalPDF_Unlock"

        if flatten:
            # Step A: Burn form fields and widget appearances into static page streams using PDFium
            doc = pdfium.PdfDocument(temp_filled_path)
            try:
                for i in range(len(doc)):
                    page = doc.get_page(i)
                    try:
                        pdfium_c.FPDFPage_Flatten(page.raw, 0)
                    finally:
                        page.close()
                doc.save(output_path)
            finally:
                doc.close()

            # Step B: Remove residual AcroForm catalog references & widget annotations via pikepdf
            with pikepdf.open(output_path, allow_overwriting_input=True) as p:
                if "/AcroForm" in p.Root:
                    del p.Root["/AcroForm"]

                for page in p.pages:
                    if "/Annots" in page:
                        remaining_annots = [
                            a for a in page.Annots if a.get("/Subtype") != "/Widget"
                        ]
                        if len(remaining_annots) == 0:
                            del page["/Annots"]
                        else:
                            page.Annots = remaining_annots

                if lock_permissions:
                    perms = pikepdf.Permissions(
                        modify_form=False,
                        modify_annotation=False,
                        modify_other=False,
                        modify_assembly=False,
                        extract=True,
                        print_highres=True,
                        print_lowres=True,
                    )
                    enc = pikepdf.Encryption(
                        user="",
                        owner=effective_owner_pwd,
                        allow=perms,
                        R=6,
                        aes=True,
                    )
                    p.save(output_path, encryption=enc)
                else:
                    p.save(output_path)
        else:
            # Unflattened interactive form: ensure every updated field has a valid, rendered /AP/N stream
            with pikepdf.open(temp_filled_path, allow_overwriting_input=True) as p:
                if field_values:
                    for page in p.pages:
                        if "/Annots" not in page:
                            continue
                        for a in page.Annots:
                            if a.get("/Subtype") != "/Widget":
                                continue
                            t = a.get("/T")
                            if not t and "/Parent" in a:
                                t = a["/Parent"].get("/T")
                            if not t:
                                continue
                            raw_t = str(t)
                            if raw_t in clean_field_values:
                                val_to_show = clean_field_values[raw_t]
                                rect = a.get("/Rect")
                                if rect:
                                    x1, y1, x2, y2 = [float(c) for c in rect]
                                    w = max(10.0, abs(x2 - x1))
                                    h = max(8.0, abs(y2 - y1))
                                    ft = a.get("/FT")
                                    if not ft and "/Parent" in a:
                                        ft = a["/Parent"].get("/FT")
                                    ap_stream = _create_form_appearance_xobject(
                                        p,
                                        text=str(val_to_show),
                                        width=w,
                                        height=h,
                                        font_size=10.0,
                                        field_type=str(ft) if ft else "/Tx",
                                        is_checked=str(val_to_show) not in ("/Off", "False", "false", ""),
                                    )
                                    a["/AP"] = pikepdf.Dictionary({"/N": p.make_indirect(ap_stream)})

                if "/AcroForm" in p.Root:
                    # Setting /NeedAppearances to False prevents Acrobat DC from suppressing visual display
                    p.Root["/AcroForm"]["/NeedAppearances"] = False

                if lock_permissions:
                    perms = pikepdf.Permissions(
                        modify_form=False,
                        modify_annotation=False,
                        modify_other=False,
                        modify_assembly=False,
                        extract=True,
                        print_highres=True,
                        print_lowres=True,
                    )
                    enc = pikepdf.Encryption(
                        user="",
                        owner=effective_owner_pwd,
                        allow=perms,
                        R=6,
                        aes=True,
                    )
                    p.save(output_path, encryption=enc)
                else:
                    p.save(output_path)

    finally:
        if os.path.exists(temp_filled_path):
            try:
                os.remove(temp_filled_path)
            except Exception:
                pass

    return {
        "status": "success",
        "output_path": output_path,
        "file_size": os.path.getsize(output_path),
        "fields_updated": len(field_values) if field_values else 0,
        "annotations_added": len(text_annotations) if text_annotations else 0,
        "flattened": flatten,
        "permissions_locked": lock_permissions,
        "permissions_password": effective_owner_pwd,
    }

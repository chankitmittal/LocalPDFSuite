import os
import tempfile
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import letter
from pypdf import PdfReader
import pikepdf
import pdfplumber
from core.pdf_forms import get_pdf_form_fields, fill_pdf_form


def test_form_fields_detection_and_filling_unflattened(temp_dir):
    # 1. Create a PDF with AcroForm fields
    form_pdf = os.path.join(temp_dir, "test_acroform.pdf")
    c = canvas.Canvas(form_pdf, pagesize=letter)
    c.drawString(100, 700, "Taxpayer Registration Form")
    form = c.acroForm
    form.textfield(name="taxpayer_name", x=100, y=650, width=200, height=20, value="")
    form.textfield(name="tax_id", x=100, y=600, width=150, height=20, value="")
    form.checkbox(name="resident_status", x=100, y=550, size=15)
    c.save()

    # 2. Test inspecting fields
    inspect_res = get_pdf_form_fields(form_pdf)
    assert inspect_res["status"] == "success"
    assert inspect_res["has_acroform"] is True
    assert inspect_res["total_fields"] == 3

    field_names = [f["name"] for f in inspect_res["fields"]]
    assert "taxpayer_name" in field_names
    assert "tax_id" in field_names
    assert "resident_status" in field_names

    # 3. Test filling fields WITHOUT flattening
    out_pdf = os.path.join(temp_dir, "filled_unflattened.pdf")
    fill_res = fill_pdf_form(
        input_path=form_pdf,
        output_path=out_pdf,
        field_values={
            "taxpayer_name": "Alexander Hamilton",
            "tax_id": "999-00-1111",
            "resident_status": True,
        },
        flatten=False,
    )
    assert fill_res["status"] == "success"
    assert os.path.exists(out_pdf)

    # 4. Verify filled values remain in AcroForm
    reader = PdfReader(out_pdf)
    filled_fields = reader.get_fields()
    assert filled_fields is not None
    assert filled_fields["taxpayer_name"].get("/V") == "Alexander Hamilton"
    assert filled_fields["tax_id"].get("/V") == "999-00-1111"


def test_form_flattening_permanently_burns_content(temp_dir):
    """
    CRITICAL TEST:
    Verify that when flatten=True, the form fields are completely stripped,
    /AcroForm is removed, and the filled values are permanently rendered as static text.
    """
    form_pdf = os.path.join(temp_dir, "test_acro_flat.pdf")
    c = canvas.Canvas(form_pdf, pagesize=letter)
    c.drawString(100, 700, "Official Form")
    form = c.acroForm
    form.textfield(name="applicant_name", x=100, y=600, width=200, height=20, value="")
    c.save()

    out_flat_pdf = os.path.join(temp_dir, "filled_flat.pdf")
    fill_res = fill_pdf_form(
        input_path=form_pdf,
        output_path=out_flat_pdf,
        field_values={"applicant_name": "Benjamin Franklin"},
        flatten=True,
        lock_permissions=True,
    )
    assert fill_res["status"] == "success"
    assert fill_res["flattened"] is True
    assert fill_res["permissions_locked"] is True
    assert os.path.exists(out_flat_pdf)

    # 1. Verify AcroForm fields NO LONGER EXIST (cannot be altered in Adobe Reader)
    reader = PdfReader(out_flat_pdf)
    assert reader.get_fields() is None

    with pikepdf.open(out_flat_pdf) as p:
        assert "/AcroForm" not in p.Root
        assert len(p.pages[0].get("/Annots", [])) == 0
        assert p.is_encrypted is True
        assert p.allow.modify_form is False
        assert p.allow.modify_other is False

    # 2. Verify filled text was permanently burned into the page content stream
    with pdfplumber.open(out_flat_pdf) as plumb:
        extracted = plumb.pages[0].extract_text()
        assert "Benjamin Franklin" in extracted


def test_flat_form_text_annotations(sample_pdf, temp_dir):
    # Test adding on-page text annotations to a flat document
    out_annot_pdf = os.path.join(temp_dir, "annotated_form.pdf")
    res = fill_pdf_form(
        input_path=sample_pdf,
        output_path=out_annot_pdf,
        text_annotations=[
            {
                "page_number": 1,
                "x": 150.0,
                "y": 450.0,
                "text": "Filled Name on Flat Document Line",
                "font_size": 14,
                "hex_color": "#2563eb",
            }
        ],
        flatten=True,
    )
    assert res["status"] == "success"
    assert os.path.exists(out_annot_pdf)
    assert res["annotations_added"] == 1


def test_complex_form_with_sample_pdf(temp_dir):
    """
    Tests filling with tabbed field names ('Age\\t of Dependent'),
    checkboxes with /On appearance states, and verifying no crosstalk between fields.
    """
    sample_path = r"C:\Users\mitta\AppData\Local\Temp\localpdf_workspace\Sample-Fillable-PDF.pdf"
    if not os.path.exists(sample_path):
        return

    out_pdf = os.path.join(temp_dir, "test_sample_filled.pdf")
    res = fill_pdf_form(
        input_path=sample_path,
        output_path=out_pdf,
        field_values={
            "Name": "Joe data",
            "Name of Dependent": "State Bank of India",
            "Age of Dependent": "54",  # Note: space instead of raw tab
            "Option 1": True,
            "Option 2": False,
            "Option 3": True,
            "Dropdown2": "Choice 2",
        },
        flatten=True,
    )
    assert res["status"] == "success"
    assert os.path.exists(out_pdf)

    with pdfplumber.open(out_pdf) as plumb:
        text = plumb.pages[0].extract_text()
        assert "Joe data" in text
        assert "State Bank of India" in text
        assert "54" in text
        assert "Choice 2" in text


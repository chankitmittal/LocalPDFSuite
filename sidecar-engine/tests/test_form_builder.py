"""
Unit tests for Prepare a Form / Interactive Form Builder.
"""

import os
import pytest
from reportlab.pdfgen import canvas
from pypdf import PdfReader
import pikepdf

from core.pdf_form_builder import auto_detect_form_fields, create_interactive_form_pdf


def create_form_template_pdf(path: str):
    """Creates a flat PDF with text labels and lines."""
    c = canvas.Canvas(path)
    c.drawString(100, 750, "Membership Application")
    c.drawString(100, 700, "Full Name:")
    c.line(170, 700, 400, 700)
    c.drawString(100, 650, "Email Address:")
    c.line(190, 650, 400, 650)
    c.drawString(100, 600, "Signature:")
    c.line(170, 600, 350, 600)
    c.save()


def test_auto_detect_form_fields(tmp_path):
    pdf_in = str(tmp_path / "template.pdf")
    create_form_template_pdf(pdf_in)

    res = auto_detect_form_fields(pdf_in)
    assert res["status"] == "success"
    assert res["total_detected"] >= 2
    field_names = [f["name"] for f in res["fields"]]
    # Should identify at least some fields near the lines or labels
    assert len(field_names) > 0


def test_create_interactive_form_pdf(tmp_path):
    pdf_in = str(tmp_path / "template.pdf")
    pdf_out = str(tmp_path / "interactive_form.pdf")
    create_form_template_pdf(pdf_in)

    fields_to_add = [
        {
            "name": "full_name",
            "type": "text",
            "page_number": 1,
            "rect": [170, 695, 400, 715],
            "value": "John Doe",
            "required": True,
            "tooltip": "Enter your full name",
        },
        {
            "name": "email",
            "type": "text",
            "page_number": 1,
            "rect": [190, 645, 400, 665],
            "value": "",
            "required": True,
        },
        {
            "name": "plan_choice",
            "type": "choice",
            "page_number": 1,
            "rect": [100, 550, 250, 575],
            "options": ["Basic Plan", "Pro Plan", "Enterprise Plan"],
            "value": "Pro Plan",
        },
        {
            "name": "agree_terms",
            "type": "checkbox",
            "page_number": 1,
            "rect": [100, 500, 118, 518],
            "value": True,
        },
        {
            "name": "applicant_sig",
            "type": "signature",
            "page_number": 1,
            "rect": [170, 595, 350, 620],
        },
    ]

    res = create_interactive_form_pdf(pdf_in, pdf_out, fields_to_add)
    assert res["status"] == "success"
    assert res["total_fields"] == 5
    assert os.path.exists(pdf_out)

    # Verify that standard readers detect the newly minted AcroForm fields
    reader = PdfReader(pdf_out)
    detected = reader.get_fields()
    assert detected is not None
    assert "full_name" in detected
    assert "email" in detected
    assert "plan_choice" in detected
    assert "agree_terms" in detected
    assert "applicant_sig" in detected

    # Verify field values
    assert detected["full_name"]["/V"] == "John Doe"
    assert detected["plan_choice"]["/V"] == "Pro Plan"

import os
import pytest
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import letter
from core.pdf_compare import (
    analyze_document_comparison,
    render_page_diff_view,
    generate_diff_report_pdf,
)


def create_revised_pdf(base_pdf: str, output_path: str):
    """Creates a modified version of the test PDF with altered text on page 2 and an added page 4."""
    c = canvas.Canvas(output_path, pagesize=letter)

    # Page 1: Identical
    c.setFont("Helvetica-Bold", 24)
    c.drawString(100, 700, "LocalPDF Test Document - Page 1")
    c.setFont("Helvetica", 12)
    c.drawString(100, 650, "This is sample paragraph text on page 1 for unit testing.")
    c.drawString(100, 600, "CONFIDENTIAL_SECRET_TOKEN_12345")
    c.rect(100, 500, 200, 50)
    c.showPage()

    # Page 2: Modified (changed clause and added box)
    c.setFont("Helvetica-Bold", 24)
    c.drawString(100, 700, "LocalPDF Test Document - Page 2 (REVISED)")
    c.setFont("Helvetica", 12)
    c.drawString(100, 650, "This clause was heavily modified to include new contractual liabilities.")
    c.rect(150, 450, 250, 60, fill=1)
    c.showPage()

    # Page 3: Identical
    c.setFont("Helvetica-Bold", 24)
    c.drawString(100, 700, "LocalPDF Test Document - Page 3")
    c.setFont("Helvetica", 12)
    c.drawString(100, 650, "This is sample paragraph text on page 3 for unit testing.")
    c.drawString(100, 600, "CONFIDENTIAL_SECRET_TOKEN_12345")
    c.rect(100, 500, 200, 50)
    c.showPage()

    # Page 4: Newly added page
    c.setFont("Helvetica-Bold", 24)
    c.drawString(100, 700, "LocalPDF Test Document - Page 4 (NEW APPENDIX)")
    c.setFont("Helvetica", 12)
    c.drawString(100, 650, "Brand new appendix section attached to revision.")
    c.showPage()

    c.save()


def test_compare_identical_documents(sample_pdf):
    res = analyze_document_comparison(sample_pdf, sample_pdf)
    assert res["status"] == "success"
    assert res["max_pages"] == 3
    assert res["identical_pages_count"] == 3
    assert res["modified_pages_count"] == 0
    assert res["added_pages_count"] == 0
    assert res["deleted_pages_count"] == 0
    assert res["similarity_score"] == 100.0


def test_compare_revised_documents(sample_pdf, temp_dir):
    revised_pdf = os.path.join(temp_dir, "revised.pdf")
    create_revised_pdf(sample_pdf, revised_pdf)

    res = analyze_document_comparison(sample_pdf, revised_pdf)
    assert res["status"] == "success"
    assert res["max_pages"] == 4
    assert res["identical_pages_count"] == 2  # Pages 1 & 3
    assert res["modified_pages_count"] == 1   # Page 2
    assert res["added_pages_count"] == 1      # Page 4
    assert res["total_changes"] == 2

    # Check page 2 specifics
    p2 = res["pages"][1]
    assert p2["page_number"] == 2
    assert p2["status"] == "modified"
    assert p2["has_visual_diff"] is True

    # Test visual diff rendering for page 2
    view_res = render_page_diff_view(sample_pdf, revised_pdf, page_number=2, dpi=100)
    assert view_res["status"] == "success"
    assert view_res["has_diff"] is True
    assert view_res["diff_img"] is not None
    assert view_res["img_a"] is not None
    assert view_res["img_b"] is not None
    assert view_res["img_a_annotated"] is not None
    assert view_res["img_b_annotated"] is not None

    # Test report generation
    report_pdf = os.path.join(temp_dir, "comparison_report.pdf")
    rep_res = generate_diff_report_pdf(sample_pdf, revised_pdf, report_pdf, analysis_data=res)
    assert rep_res["status"] == "success"
    assert os.path.isfile(report_pdf)
    assert os.path.getsize(report_pdf) > 1000

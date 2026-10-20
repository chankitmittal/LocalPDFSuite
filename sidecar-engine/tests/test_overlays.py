import os
import pdfplumber
from core.pdf_overlays import (
    add_text_watermark,
    add_page_numbers,
    redact_pdf,
    search_redaction_boxes,
)


def test_add_text_watermark(sample_pdf, temp_dir):
    out_pdf = os.path.join(temp_dir, "watermarked.pdf")
    res = add_text_watermark(
        input_path=sample_pdf,
        output_path=out_pdf,
        text="INTERNAL USE ONLY",
        opacity=0.3,
        rotation=45,
    )
    assert res["status"] == "success"
    assert os.path.exists(out_pdf)


def test_add_page_numbers(sample_pdf, temp_dir):
    out_pdf = os.path.join(temp_dir, "numbered.pdf")
    res = add_page_numbers(
        input_path=sample_pdf,
        output_path=out_pdf,
        format_str="Page {n} of {total}",
        position="bottom-center",
    )
    assert res["status"] == "success"
    assert os.path.exists(out_pdf)


def test_redaction_security_check(sample_pdf, temp_dir):
    """
    CRITICAL ACCEPTANCE CRITERIA TEST:
    Verify that text underneath a redacted bounding box cannot be found
    or extracted via pdfplumber on the output file.
    """
    # Verify the secret token exists in original PDF
    with pdfplumber.open(sample_pdf) as orig_pdf:
        orig_text = orig_pdf.pages[0].extract_text()
        assert "CONFIDENTIAL_SECRET_TOKEN_12345" in orig_text

    # Redact coordinates covering the token (x=100, y=590 to 620, width=300, height=30)
    out_pdf = os.path.join(temp_dir, "redacted.pdf")
    redactions = [
        {
            "page_number": 1,
            "boxes": [
                {"x": 90, "y": 590, "width": 320, "height": 30}
            ],
        }
    ]

    res = redact_pdf(sample_pdf, out_pdf, redactions)
    assert res["status"] == "success"
    assert os.path.exists(out_pdf)

    # Verify secret token is completely wiped and CANNOT be extracted via pdfplumber
    with pdfplumber.open(out_pdf) as redacted_doc:
        redacted_text = redacted_doc.pages[0].extract_text() or ""
        assert "CONFIDENTIAL_SECRET_TOKEN_12345" not in redacted_text


def test_search_redaction_boxes(sample_pdf):
    # Search for confidential token in sample_pdf
    res = search_redaction_boxes(sample_pdf, query="CONFIDENTIAL_SECRET_TOKEN_12345")
    assert res["status"] == "success"
    assert res["total_matches"] == 3  # token exists on all 3 pages of sample_pdf
    assert len(res["results"]) == 3
    for page_res in res["results"]:
        assert len(page_res["boxes"]) == 1
        box = page_res["boxes"][0]
        assert box["width"] > 0
        assert box["height"] > 0

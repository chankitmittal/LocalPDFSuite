import os
import io
import base64
from PIL import Image
import pdfplumber
import pypdfium2 as pdfium
from core.pdf_edit import apply_pdf_edits


def test_pdf_direct_editing_text_and_whiteout(sample_pdf, temp_dir):
    """
    Test applying direct in-place text replacement, new text, and whiteout on a PDF.
    """
    output_pdf = os.path.join(temp_dir, "test_edited_output.pdf")

    edits = [
        # 1. Whiteout an area on page 1
        {
            "page_number": 1,
            "type": "whiteout",
            "x": 50,
            "y": 700,
            "width": 200,
            "height": 30,
            "color": "#FFFFFF",
        },
        # 2. Text replacement with background patch
        {
            "page_number": 1,
            "type": "text_replacement",
            "x": 60,
            "y": 620,
            "text": "CONFIDENTIAL REVISED AGREEMENT",
            "font_size": 14,
            "font_family": "Helvetica",
            "bold": True,
            "hex_color": "#DC2626",
            "background_patch": {
                "x": 55,
                "y": 615,
                "width": 300,
                "height": 25,
                "color": "#FFFFFF",
            },
        },
        # 3. Add brand new text
        {
            "page_number": 1,
            "type": "text",
            "x": 100,
            "y": 500,
            "text": "Directly Edited Without Word Conversion",
            "font_size": 16,
            "font_family": "Times",
            "bold": True,
            "hex_color": "#2563EB",
        },
        # 4. Highlighter box
        {
            "page_number": 1,
            "type": "highlight",
            "x": 100,
            "y": 450,
            "width": 150,
            "height": 18,
            "color": "#FDE047",
            "opacity": 0.4,
        },
    ]

    res = apply_pdf_edits(
        input_path=sample_pdf,
        output_path=output_pdf,
        edits=edits,
        flatten=True,
    )

    assert res["status"] == "success"
    assert os.path.exists(output_pdf)
    assert res["edits_applied"] == 4

    # Verify extracted text contains our edits
    with pdfplumber.open(output_pdf) as plumb:
        page_text = plumb.pages[0].extract_text()
        assert "CONFIDENTIAL REVISED AGREEMENT" in page_text
        assert "Directly Edited Without Word Conversion" in page_text


def test_pdf_direct_editing_with_image(sample_pdf, temp_dir):
    """
    Test placing an image stamp onto the PDF.
    """
    output_pdf = os.path.join(temp_dir, "test_edited_image.pdf")

    # Create dummy PNG image in base64
    img = Image.new("RGBA", (80, 80), color=(0, 180, 80, 255))
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    b64_data = "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode("ascii")

    edits = [
        {
            "page_number": 1,
            "type": "image",
            "x": 120,
            "y": 300,
            "width": 80,
            "height": 80,
            "image_data": b64_data,
            "opacity": 0.9,
        }
    ]

    res = apply_pdf_edits(
        input_path=sample_pdf,
        output_path=output_pdf,
        edits=edits,
        flatten=True,
    )

    assert res["status"] == "success"
    assert os.path.exists(output_pdf)
    assert os.path.getsize(output_pdf) > 0

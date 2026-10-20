"""
Pytest fixtures and test helpers for LocalPDF test suite.
"""

import io
import os
import tempfile
import pytest
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import letter
from PIL import Image


@pytest.fixture
def temp_dir():
    d = tempfile.mkdtemp(prefix="localpdf_test_")
    yield d
    import shutil
    shutil.rmtree(d, ignore_errors=True)


@pytest.fixture
def sample_pdf(temp_dir):
    """Generates a standard 3-page test PDF with text and geometry."""
    pdf_path = os.path.join(temp_dir, "sample.pdf")
    c = canvas.Canvas(pdf_path, pagesize=letter)

    for i in range(1, 4):
        c.setFont("Helvetica-Bold", 24)
        c.drawString(100, 700, f"LocalPDF Test Document - Page {i}")
        c.setFont("Helvetica", 12)
        c.drawString(100, 650, f"This is sample paragraph text on page {i} for unit testing.")
        c.drawString(100, 600, "CONFIDENTIAL_SECRET_TOKEN_12345")
        c.rect(100, 500, 200, 50)
        c.showPage()

    c.save()
    return pdf_path


@pytest.fixture
def image_pdf(temp_dir):
    """Generates a PDF containing large embedded images to test compression."""
    pdf_path = os.path.join(temp_dir, "large_image_doc.pdf")

    # Generate a large test image (1200x1200 RGB noise/gradient)
    img_path = os.path.join(temp_dir, "test_large.jpg")
    img = Image.new("RGB", (1200, 1200), color=(100, 150, 200))
    # Add some pattern
    from PIL import ImageDraw
    draw = ImageDraw.Draw(img)
    for x in range(0, 1200, 20):
        draw.line([(x, 0), (x, 1200)], fill=(200, 100, 50), width=2)
    img.save(img_path, format="JPEG", quality=95)

    c = canvas.Canvas(pdf_path, pagesize=letter)
    c.drawString(100, 700, "Document With High-Resolution Embedded Image")
    c.drawImage(img_path, 100, 200, width=400, height=400)
    c.showPage()
    c.save()

    return pdf_path

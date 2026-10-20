import os
from core.pdf_compress import compress_pdf


def test_compress_pdf(image_pdf, temp_dir):
    out_pdf = os.path.join(temp_dir, "compressed.pdf")
    orig_size = os.path.getsize(image_pdf)

    res = compress_pdf(image_pdf, out_pdf, level="medium")
    assert res["status"] == "success"
    assert os.path.exists(out_pdf)

    compressed_size = os.path.getsize(out_pdf)
    assert compressed_size < orig_size
    assert res["savings_percentage"] > 0

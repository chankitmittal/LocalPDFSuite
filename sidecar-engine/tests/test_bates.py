import os
import csv
import pytest
from pypdf import PdfReader
from core.pdf_bates import apply_bates_stamping


def test_single_document_bates_stamping(sample_pdf, temp_dir):
    out_dir = os.path.join(temp_dir, "bates_single")
    res = apply_bates_stamping(
        input_paths=[sample_pdf],
        output_dir=out_dir,
        prefix="CONF-",
        suffix="-EXH",
        start_number=1,
        padding_digits=6,
        bates_position="bottom-right",
        exhibit_text="CONFIDENTIAL - ATTORNEYS' EYES ONLY",
        exhibit_position="top-right",
        shrink_content=True,
        target_pages="all",
        generate_csv_index=True,
        generate_zip=False,
    )

    assert res["status"] == "success"
    assert res["total_documents"] == 1
    assert res["total_pages_stamped"] == 3
    assert res["start_bates"] == "CONF-000001-EXH"
    assert res["end_bates"] == "CONF-000003-EXH"

    # Check generated PDF
    out_pdf = res["output_files"][0]
    assert os.path.isfile(out_pdf)
    reader = PdfReader(out_pdf)
    assert len(reader.pages) == 3

    # Check CSV index
    csv_path = res["index_csv_path"]
    assert csv_path is not None
    assert os.path.isfile(csv_path)

    with open(csv_path, "r", encoding="utf-8-sig") as f:
        rows = list(csv.DictReader(f))
        assert len(rows) == 1
        assert rows[0]["start_bates"] == "CONF-000001-EXH"
        assert rows[0]["end_bates"] == "CONF-000003-EXH"
        assert rows[0]["pages_stamped"] == "3"


def test_multi_document_continuous_bates_stamping(sample_pdf, temp_dir):
    # Duplicate sample_pdf to simulate 2 distinct documents
    doc2_path = os.path.join(temp_dir, "sample_doc2.pdf")
    with open(sample_pdf, "rb") as f_in, open(doc2_path, "wb") as f_out:
        f_out.write(f_in.read())

    out_dir = os.path.join(temp_dir, "bates_multi")
    res = apply_bates_stamping(
        input_paths=[sample_pdf, doc2_path],
        output_dir=out_dir,
        prefix="STATE-",
        suffix="",
        start_number=101,
        padding_digits=5,
        bates_position="bottom-center",
        target_pages="all",
        generate_csv_index=True,
        generate_zip=True,
    )

    assert res["status"] == "success"
    assert res["total_documents"] == 2
    assert res["total_pages_stamped"] == 6

    # Doc 1: 101, 102, 103
    assert res["file_items"][0]["start_bates"] == "STATE-00101"
    assert res["file_items"][0]["end_bates"] == "STATE-00103"

    # Doc 2: 104, 105, 106 (continuous numbering!)
    assert res["file_items"][1]["start_bates"] == "STATE-00104"
    assert res["file_items"][1]["end_bates"] == "STATE-00106"

    # Verify ZIP bundle
    zip_path = res["zip_path"]
    assert zip_path is not None
    assert os.path.isfile(zip_path)
    assert os.path.getsize(zip_path) > 1000

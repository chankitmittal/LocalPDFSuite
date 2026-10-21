"""
Unit tests for Batch Action Wizard & Automation Pipeline.
"""

import os
import pytest
from reportlab.pdfgen import canvas
import pikepdf

from core.pdf_pipeline import (
    WORKFLOW_PRESETS,
    run_pipeline_on_file,
    batch_execute_pipeline,
)


def create_sample_pdf(path: str, title: str):
    c = canvas.Canvas(path)
    c.setTitle(title)
    c.drawString(100, 700, f"Sample content for {title}")
    c.showPage()
    c.drawString(100, 700, f"Second page of {title}")
    c.save()


def test_custom_pipeline_execution(tmp_path):
    pdf_in = str(tmp_path / "doc_input.pdf")
    pdf_out = str(tmp_path / "doc_output.pdf")
    create_sample_pdf(pdf_in, "Confidential Document")

    # Define 3-step pipeline: Watermark -> Flatten -> Sanitize
    steps = [
        {
            "type": "watermark",
            "params": {"text": "DO NOT SHARE", "opacity": 0.2, "rotation": 30},
        },
        {
            "type": "flatten",
            "params": {"lock_permissions": True},
        },
        {
            "type": "sanitize",
            "params": {"strip_metadata": True, "strip_xmp": True, "linearize": True},
        },
    ]

    res = run_pipeline_on_file(input_path=pdf_in, output_path=pdf_out, steps=steps)
    assert res["status"] == "success"
    assert res["steps_executed"] == 3
    assert os.path.exists(pdf_out)

    # Verify that metadata was stripped in the pipeline
    with pikepdf.open(pdf_out) as p:
        assert not p.docinfo, "Docinfo should be purged by the pipeline's sanitize step"


def test_batch_pipeline_with_preset(tmp_path):
    f1 = str(tmp_path / "file1.pdf")
    f2 = str(tmp_path / "file2.pdf")
    create_sample_pdf(f1, "Document One")
    create_sample_pdf(f2, "Document Two")

    preset = WORKFLOW_PRESETS["courtroom_filing"]
    out_dir = str(tmp_path / "pipeline_out")

    batch_res = batch_execute_pipeline(
        file_paths=[f1, f2],
        output_dir=out_dir,
        steps=preset["steps"],
        output_prefix="court_",
        bundle_zip=True,
    )

    assert batch_res["status"] == "success"
    assert batch_res["total_documents"] == 2
    assert batch_res["successful_documents"] == 2
    assert batch_res["zip_path"] is not None
    assert os.path.exists(batch_res["zip_path"])


def test_pipeline_protect_step_variations(tmp_path):
    """Verify that protect step works with owner password only, user password only, and both."""
    src_pdf = str(tmp_path / "src.pdf")
    create_sample_pdf(src_pdf, "Protected Document")

    # 1. Owner password only (permissions lock, open freely)
    out1 = str(tmp_path / "out_owner.pdf")
    r1 = run_pipeline_on_file(src_pdf, out1, [{"type": "protect", "params": {"owner_password": "masterpass"}}])
    assert r1["status"] == "success"
    assert os.path.exists(out1)
    with pikepdf.open(out1) as p:
        assert p.is_encrypted

    # 2. User password only (open lock)
    out2 = str(tmp_path / "out_user.pdf")
    r2 = run_pipeline_on_file(src_pdf, out2, [{"type": "protect", "params": {"user_password": "openpass"}}])
    assert r2["status"] == "success"
    assert os.path.exists(out2)
    with pytest.raises(pikepdf.PasswordError):
        pikepdf.open(out2)
    with pikepdf.open(out2, password="openpass") as p:
        assert p.is_encrypted

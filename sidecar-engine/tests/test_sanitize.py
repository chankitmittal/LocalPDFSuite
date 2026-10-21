"""
Unit tests for Deep Metadata Sanitizer & Privacy Purge.
Verifies detection and total purging of DocInfo, XMP, comments, and JavaScript.
"""

import os
import pytest
import pikepdf
from reportlab.pdfgen import canvas
from pypdf import PdfReader, PdfWriter
from pypdf.generic import DictionaryObject, NameObject, TextStringObject, ArrayObject

from core.pdf_sanitize import inspect_pdf_privacy, sanitize_pdf_document


def create_dirty_pdf(output_path: str):
    """
    Creates a PDF file packed with metadata, comments, and mock JS.
    """
    # 1. Base PDF with metadata via reportlab
    c = canvas.Canvas(output_path)
    c.setAuthor("Secret Agent 007")
    c.setTitle("Top Secret Project Bluebook")
    c.setSubject("Classified Briefing")
    c.drawString(100, 750, "Classified content that will be sanitized.")
    c.save()

    # 2. Add an annotation and XMP metadata stream using pikepdf
    with pikepdf.open(output_path, allow_overwriting_input=True) as pdf:
        # Add annotation to page 1
        page = pdf.pages[0]
        annot_dict = pikepdf.Dictionary({
            "/Type": pikepdf.Name("/Annot"),
            "/Subtype": pikepdf.Name("/Text"),
            "/Contents": "Reviewer note: Delete chapter 4 before filing!",
            "/Rect": [100, 700, 150, 750],
        })
        page["/Annots"] = pikepdf.Array([annot_dict])

        # Add XMP stream
        raw_xmp = b"<x:xmpmeta xmlns:x='adobe:ns:meta/'><rdf:RDF><rdf:Description><dc:creator>NSA Internal</dc:creator></rdf:Description></rdf:RDF></x:xmpmeta>"
        xmp_stream = pdf.make_stream(raw_xmp)
        pdf.Root["/Metadata"] = xmp_stream

        # Add JavaScript name tree
        js_dict = pikepdf.Dictionary({
            "/S": pikepdf.Name("/JavaScript"),
            "/JS": "app.alert('Confidential');",
        })
        names_dict = pikepdf.Dictionary({
            "/JavaScript": pikepdf.Dictionary({
                "/Names": pikepdf.Array(["AutoAlert", js_dict])
            })
        })
        pdf.Root["/Names"] = names_dict

        pdf.save(output_path)


def test_sanitize_and_privacy_inspection(tmp_path):
    dirty_pdf = str(tmp_path / "dirty.pdf")
    clean_pdf = str(tmp_path / "clean_sanitized.pdf")

    create_dirty_pdf(dirty_pdf)

    # 1. Inspect dirty PDF
    report = inspect_pdf_privacy(dirty_pdf)
    assert report["has_metadata"] is True
    assert "Author" in report["metadata_items"]
    assert report["has_xmp"] is True
    assert report["has_javascript"] is True
    assert report["annotations_count"] >= 1
    assert report["threat_level"] in ("HIGH_EXPOSURE", "MODERATE_EXPOSURE")

    # 2. Run Deep Sanitization
    res = sanitize_pdf_document(
        input_path=dirty_pdf,
        output_path=clean_pdf,
        strip_metadata=True,
        strip_xmp=True,
        strip_attachments=True,
        strip_javascript=True,
        strip_actions=True,
        strip_annotations=True,
        keep_form_widgets=False,
        strip_hidden_layers=True,
        strip_thumbnails=True,
        linearize=True,
    )

    assert res["status"] == "success"
    assert os.path.exists(clean_pdf)
    assert len(res["items_stripped"]) >= 3

    # 3. Post-inspection of cleaned PDF
    clean_report = inspect_pdf_privacy(clean_pdf)
    assert clean_report["has_metadata"] is False
    assert clean_report["has_xmp"] is False
    assert clean_report["has_javascript"] is False
    assert clean_report["annotations_count"] == 0
    assert clean_report["threat_level"] == "CLEAN"

import os
import pytest
import pikepdf
from core.pdf_structural import (
    merge_pdfs,
    split_pdf,
    organize_pdf,
    protect_pdf,
    unlock_pdf,
    repair_pdf,
    parse_page_ranges,
)


def test_parse_page_ranges():
    ranges = parse_page_ranges("1-3, 5, 7-10", 10)
    assert ranges == [[0, 1, 2], [4], [6, 7, 8, 9]]

    # Test with spaces like user input: "2 - 3, 5"
    ranges_spaced = parse_page_ranges("2 - 3, 5", 6)
    assert ranges_spaced == [[1, 2], [4]]


def test_merge_pdfs(sample_pdf, temp_dir):
    out_pdf = os.path.join(temp_dir, "merged.pdf")
    res = merge_pdfs([sample_pdf, sample_pdf], out_pdf)

    assert res["status"] == "success"
    assert os.path.exists(out_pdf)
    assert res["total_pages"] == 6

    with pikepdf.open(out_pdf) as pdf:
        assert len(pdf.pages) == 6


def test_split_pdf(sample_pdf, temp_dir):
    # Mode extract_all
    split_dir_all = os.path.join(temp_dir, "split_all")
    res_all = split_pdf(sample_pdf, split_dir_all, mode="extract_all")
    assert res_all["count"] == 3
    for f in res_all["output_files"]:
        assert os.path.exists(f)
    assert res_all["zip_path"] is not None
    assert os.path.exists(res_all["zip_path"])

    # Mode range with user scenario "2 - 3, 5" on a 6-page PDF
    six_page_pdf = os.path.join(temp_dir, "six_page.pdf")
    merge_pdfs([sample_pdf, sample_pdf], six_page_pdf)

    split_dir_range = os.path.join(temp_dir, "split_range")
    res_range = split_pdf(six_page_pdf, split_dir_range, mode="range", ranges="2 - 3, 5")
    assert res_range["count"] == 2
    # Verify range 1 has 2 pages (pages 2-3)
    with pikepdf.open(res_range["output_files"][0]) as p1:
        assert len(p1.pages) == 2
    # Verify range 2 has 1 page (page 5)
    with pikepdf.open(res_range["output_files"][1]) as p2:
        assert len(p2.pages) == 1

    # Mode fixed
    split_dir_fixed = os.path.join(temp_dir, "split_fixed")
    res_fixed = split_pdf(sample_pdf, split_dir_fixed, mode="fixed", fixed_interval=2)
    assert res_fixed["count"] == 2


def test_organize_pdf(sample_pdf, temp_dir):
    out_pdf = os.path.join(temp_dir, "organized.pdf")
    actions = [
        {"page_index": 2, "rotation": 90, "deleted": False},
        {"page_index": 0, "rotation": 180, "deleted": False},
        {"page_index": 1, "rotation": 0, "deleted": True},  # Deleted page 2
    ]
    res = organize_pdf(sample_pdf, out_pdf, actions)
    assert res["status"] == "success"

    with pikepdf.open(out_pdf) as pdf:
        assert len(pdf.pages) == 2
        assert pdf.pages[0].get("/Rotate", 0) == 90
        assert pdf.pages[1].get("/Rotate", 0) == 180


def test_protect_and_unlock_pdf(sample_pdf, temp_dir):
    protected_pdf = os.path.join(temp_dir, "protected.pdf")
    unlocked_pdf = os.path.join(temp_dir, "unlocked.pdf")
    password = "SecretPassword123!"

    # Encrypt with AES-256
    prot_res = protect_pdf(sample_pdf, protected_pdf, user_password=password)
    assert prot_res["status"] == "success"
    assert prot_res["encryption"] == "AES-256"

    # Verify locked
    with pytest.raises(pikepdf.PasswordError):
        pikepdf.open(protected_pdf)

    # Unlock
    unlock_res = unlock_pdf(protected_pdf, unlocked_pdf, password=password)
    assert unlock_res["status"] == "success"

    # Verify readable without password
    with pikepdf.open(unlocked_pdf) as pdf:
        assert len(pdf.pages) == 3


def test_repair_pdf(sample_pdf, temp_dir):
    repaired_pdf = os.path.join(temp_dir, "repaired.pdf")
    res = repair_pdf(sample_pdf, repaired_pdf)
    assert res["status"] == "success"
    assert os.path.exists(repaired_pdf)
    with pikepdf.open(repaired_pdf) as pdf:
        assert len(pdf.pages) == 3

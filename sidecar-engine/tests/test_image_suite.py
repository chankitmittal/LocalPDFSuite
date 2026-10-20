import os
from PIL import Image
from core.image_suite import (
    pdf_to_images,
    images_to_pdf,
    process_single_image,
    bulk_process_images,
)


def test_pdf_to_images(sample_pdf, temp_dir):
    out_dir = os.path.join(temp_dir, "pdf_images")
    res = pdf_to_images(sample_pdf, out_dir, image_format="PNG", dpi=150)

    assert res["status"] == "success"
    assert res["total_pages"] == 3
    assert len(res["output_files"]) == 3
    for f in res["output_files"]:
        assert os.path.exists(f)


def test_images_to_pdf(temp_dir):
    # Create two test images
    img1 = os.path.join(temp_dir, "img1.png")
    img2 = os.path.join(temp_dir, "img2.jpg")
    Image.new("RGB", (400, 300), color="blue").save(img1)
    Image.new("RGB", (500, 400), color="red").save(img2)

    out_pdf = os.path.join(temp_dir, "from_images.pdf")
    res = images_to_pdf([img1, img2], out_pdf)

    assert res["status"] == "success"
    assert res["image_count"] == 2
    assert os.path.exists(out_pdf)


def test_bulk_process_images(temp_dir):
    img1 = os.path.join(temp_dir, "b1.png")
    img2 = os.path.join(temp_dir, "b2.png")
    Image.new("RGB", (800, 600), color="green").save(img1)
    Image.new("RGB", (1000, 800), color="yellow").save(img2)

    out_dir = os.path.join(temp_dir, "bulk_out")
    res = bulk_process_images(
        file_paths=[img1, img2],
        output_dir=out_dir,
        target_format="JPEG",
        quality=80,
        resize_mode="percentage",
        percentage=50.0,
    )

    assert res["status"] == "success"
    assert res["processed_count"] == 2
    for item in res["results"]:
        assert os.path.exists(item["output_path"])

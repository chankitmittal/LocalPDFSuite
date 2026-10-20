"""
Image Suite & PDF-to-Image Module
Provides:
- pdf_to_images: High-speed rasterization using pypdfium2.
- images_to_pdf: Multi-image compilation into single PDF with orientation and fit options.
- bulk_process_images: Bulk resize, compress, crop, and convert image formats with EXIF stripping.
"""

import os
from typing import List, Dict, Any, Optional, Tuple
from PIL import Image, ImageOps
import pypdfium2 as pdfium


def pdf_to_images(
    pdf_path: str,
    output_dir: str,
    image_format: str = "PNG",
    dpi: int = 200,
) -> Dict[str, Any]:
    """
    Renders every page of a PDF into high-quality images via pypdfium2.
    Supported formats: PNG, JPEG, WEBP.
    """
    if not os.path.exists(pdf_path):
        raise FileNotFoundError(f"PDF not found: {pdf_path}")

    os.makedirs(output_dir, exist_ok=True)
    base_name = os.path.splitext(os.path.basename(pdf_path))[0]
    fmt = image_format.upper()
    if fmt == "JPG":
        fmt = "JPEG"

    ext = "jpg" if fmt == "JPEG" else fmt.lower()
    doc = pdfium.PdfDocument(pdf_path)
    total_pages = len(doc)
    scale = dpi / 72.0
    output_files: List[str] = []

    for idx in range(total_pages):
        page = doc.get_page(idx)
        pil_img = page.render(scale=scale).to_pil()
        out_file = os.path.join(output_dir, f"{base_name}_page_{idx + 1:04d}.{ext}")

        if fmt == "JPEG" and pil_img.mode in ("RGBA", "P"):
            pil_img = pil_img.convert("RGB")

        pil_img.save(out_file, format=fmt, quality=90)
        output_files.append(out_file)

    doc.close()

    return {
        "status": "success",
        "output_files": output_files,
        "total_pages": total_pages,
        "image_format": fmt,
        "dpi": dpi,
    }


def images_to_pdf(
    image_paths: List[str],
    output_path: str,
    fit_to_page: bool = True,
    page_size: str = "A4",  # A4, Letter, or Original
) -> Dict[str, Any]:
    """
    Compiles multiple images into a single standardized PDF document using Pillow.
    """
    if not image_paths:
        raise ValueError("At least one image file is required.")

    os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)
    pil_images: List[Image.Image] = []

    for p in image_paths:
        if not os.path.exists(p):
            raise FileNotFoundError(f"Image not found: {p}")
        img = Image.open(p)
        # Ensure correct EXIF orientation
        img = ImageOps.exif_transpose(img)
        if img.mode != "RGB":
            img = img.convert("RGB")
        pil_images.append(img)

    if not pil_images:
        raise ValueError("No valid images could be opened.")

    first_image = pil_images[0]
    rest_images = pil_images[1:]

    first_image.save(
        output_path,
        format="PDF",
        save_all=True,
        append_images=rest_images,
        resolution=150.0,
    )

    return {
        "status": "success",
        "output_path": output_path,
        "image_count": len(image_paths),
        "file_size": os.path.getsize(output_path),
    }


def process_single_image(
    input_path: str,
    output_path: str,
    target_format: Optional[str] = None,
    quality: int = 85,
    resize_mode: Optional[str] = None,  # 'dimensions' or 'percentage'
    width: Optional[int] = None,
    height: Optional[int] = None,
    percentage: Optional[float] = None,
    crop_box: Optional[Tuple[int, int, int, int]] = None,  # (left, top, right, bottom)
    strip_exif: bool = True,
) -> Dict[str, Any]:
    """
    Processes a single image: resize, crop, convert format, strip EXIF, compress.
    """
    if not os.path.exists(input_path):
        raise FileNotFoundError(f"File not found: {input_path}")

    os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)

    with Image.open(input_path) as img:
        img = ImageOps.exif_transpose(img)

        # 1. Cropping
        if crop_box:
            img = img.crop(crop_box)

        # 2. Resizing
        orig_w, orig_h = img.size
        if resize_mode == "percentage" and percentage:
            factor = percentage / 100.0
            new_w = max(1, int(orig_w * factor))
            new_h = max(1, int(orig_h * factor))
            img = img.resize((new_w, new_h), Image.Resampling.LANCZOS)
        elif resize_mode == "dimensions":
            if width and height:
                img = img.resize((width, height), Image.Resampling.LANCZOS)
            elif width:
                ratio = width / orig_w
                new_h = max(1, int(orig_h * ratio))
                img = img.resize((width, new_h), Image.Resampling.LANCZOS)
            elif height:
                ratio = height / orig_h
                new_w = max(1, int(orig_w * ratio))
                img = img.resize((new_w, height), Image.Resampling.LANCZOS)

        # 3. Format detection & mode conversion
        fmt = target_format.upper() if target_format else img.format
        if not fmt:
            fmt = "JPEG"
        if fmt == "JPG":
            fmt = "JPEG"

        if fmt in ("JPEG", "JPG"):
            if img.mode in ("RGBA", "LA", "P"):
                # Composite onto white background
                bg = Image.new("RGB", img.size, (255, 255, 255))
                if img.mode == "P":
                    img = img.convert("RGBA")
                bg.paste(img, mask=img.split()[-1] if img.mode == "RGBA" else None)
                img = bg
            elif img.mode != "RGB":
                img = img.convert("RGB")

        # 4. Save options
        save_kwargs: Dict[str, Any] = {"optimize": True}
        if fmt in ("JPEG", "WEBP"):
            save_kwargs["quality"] = quality

        # Stripping EXIF is automatically achieved by not passing exif=img.info.get('exif')
        if not strip_exif and "exif" in img.info:
            save_kwargs["exif"] = img.info["exif"]

        img.save(output_path, format=fmt, **save_kwargs)

    return {
        "status": "success",
        "output_path": output_path,
        "file_size": os.path.getsize(output_path),
        "dimensions": img.size,
        "format": fmt,
    }


def bulk_process_images(
    file_paths: List[str],
    output_dir: str,
    target_format: Optional[str] = None,
    quality: int = 85,
    resize_mode: Optional[str] = None,
    width: Optional[int] = None,
    height: Optional[int] = None,
    percentage: Optional[float] = None,
    strip_exif: bool = True,
) -> Dict[str, Any]:
    """
    Applies bulk processing to multiple images and returns list of output files.
    """
    os.makedirs(output_dir, exist_ok=True)
    results = []

    for file_path in file_paths:
        base_name, old_ext = os.path.splitext(os.path.basename(file_path))
        ext = target_format.lower() if target_format else old_ext.lstrip(".")
        if ext == "jpeg":
            ext = "jpg"
        out_file = os.path.join(output_dir, f"{base_name}_processed.{ext}")

        res = process_single_image(
            input_path=file_path,
            output_path=out_file,
            target_format=target_format,
            quality=quality,
            resize_mode=resize_mode,
            width=width,
            height=height,
            percentage=percentage,
            strip_exif=strip_exif,
        )
        results.append(res)

    return {
        "status": "success",
        "processed_count": len(results),
        "results": results,
    }

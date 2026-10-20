"""
Structural PDF Operations Module
Provides:
- merge_pdfs: Combines multiple PDFs into a single document.
- split_pdf: Splits by custom page ranges, fixed intervals, or extracts all pages.
- organize_pdf: Reorders, rotates, and deletes pages based on frontend specs.
- protect_pdf: Encrypts PDF using AES-256.
- unlock_pdf: Removes password protection from encrypted PDF.
- repair_pdf: Rebuilds corrupted PDF cross-reference tables via QPDF engine.
"""

import os
import zipfile
from typing import List, Dict, Any, Optional
import pikepdf


def parse_page_ranges(range_str: str, total_pages: int) -> List[List[int]]:
    """
    Parses strings like "1-3, 5, 7-10" or "2 - 3, 5" into lists of 0-based page index groups.
    Each comma-separated item is returned as its own list of 0-based indices.
    """
    groups: List[List[int]] = []
    tokens = [t.strip() for t in range_str.split(",") if t.strip()]

    for token in tokens:
        if "-" in token:
            parts = token.split("-")
            start = int(parts[0].strip())
            end = int(parts[1].strip())
            if start > end:
                start, end = end, start
            # Convert 1-based inclusive range to 0-based indices clamped to total_pages
            s = max(0, start - 1)
            e = min(total_pages, end)
            if s < e:
                groups.append(list(range(s, e)))
        else:
            page_num = int(token.strip())
            idx = page_num - 1
            if 0 <= idx < total_pages:
                groups.append([idx])
    return groups


def merge_pdfs(file_paths: List[str], output_path: str) -> Dict[str, Any]:
    """
    Merges multiple PDF files into one output file using pikepdf.
    """
    if not file_paths:
        raise ValueError("At least one PDF file path must be provided for merging.")

    os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)
    dst = pikepdf.Pdf.new()
    total_pages = 0

    for path in file_paths:
        if not os.path.exists(path):
            raise FileNotFoundError(f"Input file not found: {path}")
        with pikepdf.open(path) as src:
            dst.pages.extend(src.pages)
            total_pages += len(src.pages)

    dst.save(output_path)
    dst.close()

    return {
        "status": "success",
        "output_path": output_path,
        "input_files_count": len(file_paths),
        "total_pages": total_pages,
        "file_size": os.path.getsize(output_path),
    }


def split_pdf(
    file_path: str,
    output_dir: str,
    mode: str = "extract_all",
    ranges: Optional[str] = None,
    fixed_interval: int = 1,
) -> Dict[str, Any]:
    """
    Splits a PDF by mode:
    - 'extract_all': Each page is written to an individual PDF file.
    - 'range': Ranges like '1-3, 5, 7-10' are split into individual files or merged subsets.
    - 'fixed': Split every N pages.
    """
    if not os.path.exists(file_path):
        raise FileNotFoundError(f"File not found: {file_path}")

    os.makedirs(output_dir, exist_ok=True)
    base_name = os.path.splitext(os.path.basename(file_path))[0]
    output_files: List[str] = []

    with pikepdf.open(file_path) as src:
        total_pages = len(src.pages)

        if mode == "extract_all":
            for idx, page in enumerate(src.pages):
                out_path = os.path.join(output_dir, f"{base_name}_page_{idx + 1:04d}.pdf")
                dst = pikepdf.Pdf.new()
                dst.pages.append(page)
                dst.save(out_path)
                dst.close()
                output_files.append(out_path)

        elif mode == "fixed":
            if fixed_interval < 1:
                fixed_interval = 1
            chunk_idx = 1
            for start_idx in range(0, total_pages, fixed_interval):
                end_idx = min(start_idx + fixed_interval, total_pages)
                out_path = os.path.join(
                    output_dir, f"{base_name}_part_{chunk_idx:03d}_pages_{start_idx + 1}-{end_idx}.pdf"
                )
                dst = pikepdf.Pdf.new()
                for p in range(start_idx, end_idx):
                    dst.pages.append(src.pages[p])
                dst.save(out_path)
                dst.close()
                output_files.append(out_path)
                chunk_idx += 1

        elif mode == "range":
            if not ranges:
                raise ValueError("Page ranges string must be provided for 'range' split mode.")
            page_groups = parse_page_ranges(ranges, total_pages)
            for group_idx, page_indices in enumerate(page_groups):
                if not page_indices:
                    continue
                start_p = page_indices[0] + 1
                end_p = page_indices[-1] + 1
                out_path = os.path.join(
                    output_dir, f"{base_name}_range_{group_idx + 1}_{start_p}-{end_p}.pdf"
                )
                dst = pikepdf.Pdf.new()
                for p_idx in page_indices:
                    dst.pages.append(src.pages[p_idx])
                dst.save(out_path)
                dst.close()
                output_files.append(out_path)
        else:
            raise ValueError(f"Unknown split mode: {mode}")

    zip_path = None
    if len(output_files) > 1:
        zip_path = os.path.join(output_dir, f"{base_name}_split_all.zip")
        with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zipf:
            for f in output_files:
                zipf.write(f, os.path.basename(f))

    return {
        "status": "success",
        "output_files": output_files,
        "zip_path": zip_path,
        "count": len(output_files),
        "total_source_pages": total_pages,
        "files_meta": [
            {
                "name": os.path.basename(f),
                "path": f,
                "size": os.path.getsize(f),
            }
            for f in output_files
        ],
    }


def organize_pdf(
    file_path: str,
    output_path: str,
    page_actions: List[Dict[str, Any]],
) -> Dict[str, Any]:
    """
    Reorders, rotates, and deletes pages.
    page_actions: list of dicts:
      [
        {"page_index": 0, "rotation": 90, "deleted": False},
        {"page_index": 2, "rotation": 0, "deleted": False},
        ...
      ]
    page_index is 0-based index of the original page.
    """
    if not os.path.exists(file_path):
        raise FileNotFoundError(f"File not found: {file_path}")

    os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)

    with pikepdf.open(file_path) as src:
        total_orig_pages = len(src.pages)
        dst = pikepdf.Pdf.new()

        for action in page_actions:
            if action.get("deleted", False):
                continue
            orig_idx = int(action["page_index"])
            if not (0 <= orig_idx < total_orig_pages):
                continue

            page = src.pages[orig_idx]
            rotation = int(action.get("rotation", 0))
            if rotation:
                current_rot = int(page.get("/Rotate", 0))
                page.Rotate = (current_rot + rotation) % 360

            dst.pages.append(page)

        dst.save(output_path)
        dst.close()

    return {
        "status": "success",
        "output_path": output_path,
        "resulting_pages": len(page_actions),
        "file_size": os.path.getsize(output_path),
    }


def protect_pdf(
    file_path: str,
    output_path: str,
    user_password: str,
    owner_password: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Encrypts PDF with AES-256 standard encryption (R=6).
    """
    if not os.path.exists(file_path):
        raise FileNotFoundError(f"File not found: {file_path}")
    if not user_password:
        raise ValueError("User password must not be empty.")

    if not owner_password:
        owner_password = user_password

    os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)

    encryption = pikepdf.Encryption(
        user=user_password,
        owner=owner_password,
        R=6,  # AES-256
        aes=True,
    )

    with pikepdf.open(file_path) as pdf:
        pdf.save(output_path, encryption=encryption)

    return {
        "status": "success",
        "output_path": output_path,
        "encryption": "AES-256",
        "file_size": os.path.getsize(output_path),
    }


def unlock_pdf(
    file_path: str,
    output_path: str,
    password: str,
) -> Dict[str, Any]:
    """
    Removes password encryption and saves unencrypted PDF.
    """
    if not os.path.exists(file_path):
        raise FileNotFoundError(f"File not found: {file_path}")

    os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)

    with pikepdf.open(file_path, password=password) as pdf:
        pdf.save(output_path)

    return {
        "status": "success",
        "output_path": output_path,
        "is_encrypted": False,
        "file_size": os.path.getsize(output_path),
    }


def repair_pdf(file_path: str, output_path: str) -> Dict[str, Any]:
    """
    Recovers corrupted PDFs using QPDF cross-reference rebuild and stream normalization.
    """
    if not os.path.exists(file_path):
        raise FileNotFoundError(f"File not found: {file_path}")

    os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)

    # attempt_recovery=True enables QPDF linear scan and cross-reference table repair
    with pikepdf.open(file_path, attempt_recovery=True) as pdf:
        pdf.save(
            output_path,
            recompress_flate=True,
            compress_streams=True,
            object_stream_mode=pikepdf.ObjectStreamMode.generate,
        )

    return {
        "status": "success",
        "output_path": output_path,
        "file_size": os.path.getsize(output_path),
    }

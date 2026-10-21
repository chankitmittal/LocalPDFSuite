"""
PDF Signing Module (Visual & Cryptographic PAdES via pyHanko)
Provides:
- sign_pdf_visual: Overlay hand-drawn or image signatures at specified coordinates.
- sign_pdf_cryptographic: Full PAdES cryptographic signing with PKCS#12 (.pfx/.p12) certificates.
- generate_self_signed_cert: Helper to generate local test digital certificates for offline use.
"""

import datetime
import io
import os
from typing import Dict, Any, Optional
from reportlab.pdfgen import canvas
from pypdf import PdfReader, PdfWriter
from PIL import Image

# pyHanko imports
from pyhanko.pdf_utils.incremental_writer import IncrementalPdfFileWriter
from pyhanko.sign import fields, signers
from pyhanko.stamp import TextStampStyle
from pyhanko_certvalidator import ValidationContext
from cryptography import x509
from cryptography.x509.oid import NameOID
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa


def sign_pdf_visual(
    input_path: str,
    output_path: str,
    signature_image_path: str,
    page_number: int = 1,  # 1-based
    x: float = 100.0,
    y: float = 100.0,
    width: float = 150.0,
    height: float = 50.0,
) -> Dict[str, Any]:
    """
    Applies a visual signature image (e.g., hand-drawn canvas PNG or scan)
    onto a PDF page at (x, y) with specified width and height.
    Coordinates are in standard PDF 72 DPI points (bottom-left origin).
    """
    if not os.path.exists(input_path):
        raise FileNotFoundError(f"Input PDF not found: {input_path}")
    if not os.path.exists(signature_image_path):
        raise FileNotFoundError(f"Signature image not found: {signature_image_path}")

    os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)
    with open(input_path, "rb") as in_f:
        reader = PdfReader(in_f)
        writer = PdfWriter()
        total_pages = len(reader.pages)

        if not (1 <= page_number <= total_pages):
            raise ValueError(f"Page number {page_number} is out of bounds (1 to {total_pages})")

        target_page = reader.pages[page_number - 1]
        pw = float(target_page.mediabox.width)
        ph = float(target_page.mediabox.height)

        # Create overlay PDF with signature image
        stamp_buf = io.BytesIO()
        c = canvas.Canvas(stamp_buf, pagesize=(pw, ph))
        c.drawImage(
            signature_image_path,
            x=x,
            y=y,
            width=width,
            height=height,
            mask="auto",
            preserveAspectRatio=True,
        )
        c.showPage()
        c.save()
        stamp_buf.seek(0)

        stamp_reader = PdfReader(stamp_buf)
        target_page.merge_page(stamp_reader.pages[0])

        for idx, page in enumerate(reader.pages):
            writer.add_page(page)

        with open(output_path, "wb") as f_out:
            writer.write(f_out)

    return {
        "status": "success",
        "output_path": output_path,
        "page_signed": page_number,
        "file_size": os.path.getsize(output_path),
    }


def generate_self_signed_cert(
    output_pfx_path: str,
    passphrase: str,
    common_name: str = "LocalPDF Signer",
    organization: str = "LocalPDF Suite",
    days_valid: int = 365,
) -> Dict[str, Any]:
    """
    Generates a local PKCS#12 certificate (.pfx/.p12) for offline cryptographic signing.
    """
    os.makedirs(os.path.dirname(os.path.abspath(output_pfx_path)), exist_ok=True)

    # Generate RSA private key
    key = rsa.generate_private_key(
        public_exponent=65537,
        key_size=2048,
    )

    # Subject & Issuer
    subject = issuer = x509.Name([
        x509.NameAttribute(NameOID.COMMON_NAME, common_name),
        x509.NameAttribute(NameOID.ORGANIZATION_NAME, organization),
    ])

    cert = (
        x509.CertificateBuilder()
        .subject_name(subject)
        .issuer_name(issuer)
        .public_key(key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(datetime.datetime.now(datetime.timezone.utc))
        .not_valid_after(datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(days=days_valid))
        .add_extension(
            x509.KeyUsage(
                digital_signature=True,
                content_commitment=True,
                key_encipherment=False,
                data_encipherment=False,
                key_agreement=False,
                key_cert_sign=True,
                crl_sign=True,
                encipher_only=False,
                decipher_only=False,
            ),
            critical=True,
        )
        .sign(key, hashes.SHA256())
    )

    pfx_data = serialization.pkcs12.serialize_key_and_certificates(
        name=b"localpdf_signature",
        key=key,
        cert=cert,
        cas=None,
        encryption_algorithm=serialization.BestAvailableEncryption(passphrase.encode("utf-8")),
    )

    with open(output_pfx_path, "wb") as f_out:
        f_out.write(pfx_data)

    return {
        "status": "success",
        "output_path": output_pfx_path,
        "output_pfx_path": output_pfx_path,
        "common_name": common_name,
        "valid_days": days_valid,
        "file_size": os.path.getsize(output_pfx_path),
    }


def sign_pdf_cryptographic(
    input_path: str,
    output_path: str,
    pfx_path: str,
    passphrase: str,
    reason: str = "Digitally signed with LocalPDF",
    location: str = "Local Desktop",
    contact_info: Optional[str] = None,
    visible: bool = True,
    page_number: int = 1,
    box: Optional[tuple] = None,
) -> Dict[str, Any]:
    """
    Performs cryptographic PAdES digital signature using pyHanko and a PKCS#12 (.pfx/.p12) certificate.
    Supports both visible (on-page appearance box with signer identity and integrity verification)
    and invisible signatures.
    """
    if not os.path.exists(input_path):
        raise FileNotFoundError(f"Input PDF not found: {input_path}")
    if not os.path.exists(pfx_path):
        raise FileNotFoundError(f"Certificate file not found: {pfx_path}")

    os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)

    # Detect existing signature fields to prevent FieldAlreadyExistsError collisions
    sig_field_name = "Signature1"
    try:
        with open(input_path, "rb") as check_f:
            reader = PdfReader(check_f)
            existing_fields = set()
            root_fields = reader.get_fields()
            if root_fields:
                existing_fields = set(root_fields.keys())
            idx = 1
            while f"Signature{idx}" in existing_fields:
                idx += 1
            sig_field_name = f"Signature{idx}"
    except Exception:
        import uuid
        sig_field_name = f"Signature_{uuid.uuid4().hex[:6]}"

    signer = signers.SimpleSigner.load_pkcs12(
        pfx_file=pfx_path,
        passphrase=passphrase.encode("utf-8") if passphrase else None,
    )

    trust_roots = [signer.signing_cert]
    if signer.cert_registry:
        trust_roots.extend(signer.cert_registry)
    offline_vc = ValidationContext(trust_roots=trust_roots, allow_fetching=False)
    meta = signers.PdfSignatureMetadata(
        field_name=sig_field_name,
        reason=reason,
        location=location,
        contact_info=contact_info,
        validation_context=offline_vc,
    )

    new_field_spec = None
    stamp_style = None
    appearance_text_params = None

    if visible:
        # Default box if not provided: bottom-right corner (width 220, height 70)
        sig_box = box if box else (350, 50, 570, 120)
        on_page = max(0, page_number - 1)
        new_field_spec = fields.SigFieldSpec(
            sig_field_name=sig_field_name,
            on_page=on_page,
            box=sig_box,
        )
        stamp_style = TextStampStyle(
            stamp_text='[DIGITALLY SIGNED]\nSigner: %(signer)s\nDate: %(ts)s\nReason: %(reason)s\nLocation: %(location)s',
            border_width=1,
            border_color=(0.15, 0.4, 0.9),
        )
        appearance_text_params = {
            'reason': reason,
            'location': location,
        }

    pdf_signer = signers.PdfSigner(
        signature_meta=meta,
        signer=signer,
        new_field_spec=new_field_spec,
        stamp_style=stamp_style,
    )

    with open(input_path, "rb") as inf:
        w = IncrementalPdfFileWriter(inf)
        with open(output_path, "wb") as outf:
            if appearance_text_params:
                pdf_signer.sign_pdf(w, output=outf, appearance_text_params=appearance_text_params)
            else:
                pdf_signer.sign_pdf(w, output=outf)

    return {
        "status": "success",
        "output_path": output_path,
        "is_cryptographically_signed": True,
        "is_visible": visible,
        "reason": reason,
        "file_size": os.path.getsize(output_path),
    }

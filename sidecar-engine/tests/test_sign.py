import os
from PIL import Image
from core.pdf_sign import (
    sign_pdf_visual,
    sign_pdf_cryptographic,
    generate_self_signed_cert,
)


def test_visual_and_crypto_signing(sample_pdf, temp_dir):
    # 1. Create a dummy signature image
    sig_img_path = os.path.join(temp_dir, "signature.png")
    Image.new("RGBA", (200, 60), color=(0, 0, 150, 200)).save(sig_img_path)

    # 2. Test visual signing
    visual_signed_pdf = os.path.join(temp_dir, "visual_signed.pdf")
    res_vis = sign_pdf_visual(
        input_path=sample_pdf,
        output_path=visual_signed_pdf,
        signature_image_path=sig_img_path,
        page_number=1,
        x=150.0,
        y=150.0,
        width=120.0,
        height=40.0,
    )
    assert res_vis["status"] == "success"
    assert os.path.exists(visual_signed_pdf)

    # 3. Test self-signed certificate generation
    pfx_path = os.path.join(temp_dir, "test_signer.pfx")
    passphrase = "CertPassword123"
    res_cert = generate_self_signed_cert(
        output_pfx_path=pfx_path,
        passphrase=passphrase,
        common_name="Antigravity Test Signer",
    )
    assert res_cert["status"] == "success"
    assert os.path.exists(pfx_path)

    # 4. Test cryptographic signing with generated PKCS#12 cert
    crypto_signed_pdf = os.path.join(temp_dir, "crypto_signed.pdf")
    res_crypto = sign_pdf_cryptographic(
        input_path=visual_signed_pdf,
        output_path=crypto_signed_pdf,
        pfx_path=pfx_path,
        passphrase=passphrase,
        reason="Approved and Digitally Verified",
    )
    assert res_crypto["status"] == "success"
    assert res_crypto["is_cryptographically_signed"] is True
    assert os.path.exists(crypto_signed_pdf)

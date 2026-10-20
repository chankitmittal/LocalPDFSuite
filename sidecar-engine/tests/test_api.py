import os
import pytest
from fastapi.testclient import TestClient
from main import app


@pytest.fixture
def client():
    return TestClient(app)


def test_health_endpoint(client):
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert "Offline" in data["mode"]


def test_system_status_endpoint(client):
    response = client.get("/system/status")
    assert response.status_code == 200
    data = response.json()
    assert "libreoffice" in data
    assert "tesseract" in data


def test_licenses_endpoint(client):
    response = client.get("/api/licenses")
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    assert len(data) > 0


def test_api_merge_and_compress(client, sample_pdf, image_pdf, temp_dir):
    # Test merge via API
    merge_resp = client.post(
        "/api/structural/merge",
        json={"file_paths": [sample_pdf, sample_pdf], "output_filename": "api_merged.pdf"},
    )
    assert merge_resp.status_code == 200
    data = merge_resp.json()
    assert data["status"] == "success"
    assert data["total_pages"] == 6

    # Test compress via API
    comp_resp = client.post(
        "/api/compress",
        json={"file_path": image_pdf, "level": "medium", "output_filename": "api_comp.pdf"},
    )
    assert comp_resp.status_code == 200
    assert comp_resp.json()["status"] == "success"

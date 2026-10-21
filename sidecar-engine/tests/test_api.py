import os
import pytest
import httpx
from httpx import ASGITransport
from main import app


@pytest.fixture
def anyio_backend():
    return "asyncio"


@pytest.mark.anyio
async def test_health_endpoint():
    async with httpx.AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "ok"
        assert "Offline" in data["mode"]


@pytest.mark.anyio
async def test_system_status_endpoint():
    async with httpx.AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/system/status")
        assert response.status_code == 200
        data = response.json()
        assert "libreoffice" in data
        assert "tesseract" in data


@pytest.mark.anyio
async def test_licenses_endpoint():
    async with httpx.AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/api/licenses")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert len(data) > 0


@pytest.mark.anyio
async def test_api_merge_and_compress(sample_pdf, image_pdf, temp_dir):
    async with httpx.AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # Test merge via API
        merge_resp = await client.post(
            "/api/structural/merge",
            json={"file_paths": [sample_pdf, sample_pdf], "output_filename": "api_merged.pdf"},
        )
        assert merge_resp.status_code == 200
        data = merge_resp.json()
        assert data["status"] == "success"
        assert data["total_pages"] == 6

        # Test compress via API
        comp_resp = await client.post(
            "/api/compress",
            json={"file_path": image_pdf, "level": "medium", "output_filename": "api_comp.pdf"},
        )
        assert comp_resp.status_code == 200
        assert comp_resp.json()["status"] == "success"

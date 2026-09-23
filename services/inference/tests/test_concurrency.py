"""Real ASGI concurrency checks with model work stubbed, without Torch."""

import asyncio
import hashlib
import io
import os
import sys
import threading
from pathlib import Path
from unittest.mock import MagicMock

import httpx
import pytest
from PIL import Image

os.environ.setdefault("INFERENCE_API_KEY", "test-key")
os.environ.setdefault(
    "INFERENCE_MODEL_DOWNLOAD_ORIGINS",
    "https://example.com,https://fake-s3.example.com,https://x.com",
)
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import app as app_module


@pytest.mark.parametrize("endpoint", ["/models/inspect", "/predict"])
def test_health_responds_while_model_load_is_blocked(monkeypatch, tmp_path, endpoint):
    entered = threading.Event()
    release = threading.Event()
    model = MagicMock(task="detect", names={0: "plant"})
    model.predict.return_value = []
    model_bytes = b"test model"

    def download(url):
        path = tmp_path / "model.pt"
        path.write_bytes(model_bytes)
        return path

    def load(path):
        entered.set()
        if not release.wait(5):
            raise AssertionError("event loop could not release model loading")
        return model

    monkeypatch.setattr(app_module, "_download_to_temp", download)
    monkeypatch.setattr(app_module, "_load_yolo_from_path", load)
    app_module._model_cache.clear()
    image = io.BytesIO()
    Image.new("RGB", (2, 2)).save(image, format="PNG")

    async def run():
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app_module.app), base_url="http://test",
            headers={"X-Inference-Key": app_module._INFERENCE_API_KEY},
        ) as client:
            kwargs = {"data": {"model_url": "https://example.com/model.pt"}}
            if endpoint == "/predict":
                kwargs["data"]["model_checksum"] = hashlib.sha256(model_bytes).hexdigest()
                kwargs["files"] = {"file": ("image.png", image.getvalue(), "image/png")}
            task = asyncio.create_task(client.post(endpoint, **kwargs))
            try:
                assert await asyncio.to_thread(entered.wait, 2)
                health = await asyncio.wait_for(client.get("/health"), 1)
                assert health.status_code == 200
            finally:
                release.set()
            assert (await task).status_code == 200

    try:
        asyncio.run(run())
    finally:
        release.set()
        app_module._model_cache.clear()


def test_concurrent_predictions_share_one_model_load(monkeypatch, tmp_path):
    from concurrent.futures import ThreadPoolExecutor

    model = MagicMock(task="detect", names={0: "plant"})
    model.predict.return_value = []
    model_bytes = b"test model"
    checksum = hashlib.sha256(model_bytes).hexdigest()
    entered = threading.Event()
    release = threading.Event()

    def download(url):
        path = tmp_path / "model.pt"
        path.write_bytes(model_bytes)
        return path

    def load(path):
        entered.set()
        assert release.wait(5)
        return model

    loader = MagicMock(side_effect=load)
    monkeypatch.setattr(app_module, "_download_to_temp", download)
    monkeypatch.setattr(app_module, "_load_yolo_from_path", loader)
    app_module._model_cache.clear()
    image = io.BytesIO()
    Image.new("RGB", (2, 2)).save(image, format="PNG")
    try:
        with ThreadPoolExecutor(max_workers=2) as pool:
            first = pool.submit(app_module._predict_image, image.getvalue(), "https://example.com/model.pt", checksum)
            try:
                assert entered.wait(2)
                second = pool.submit(app_module._predict_image, image.getvalue(), "https://example.com/model.pt", checksum)
            finally:
                release.set()
            assert first.result()["width"] == second.result()["width"] == 2
        loader.assert_called_once()
        assert model.predict.call_count == 2
    finally:
        release.set()
        app_module._model_cache.clear()

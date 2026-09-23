"""
Tests for the AgroLens inference service.

All tests that would require a real Ultralytics YOLO model are monkeypatched
so that the test suite runs offline without torch / ultralytics installed.
"""

from __future__ import annotations

import io
import os
import socket
import sys
import urllib.request
from pathlib import Path
from unittest.mock import MagicMock

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from PIL import Image

# Ensure inference/ is on the path so that `import app` finds app.py.
_srcdir = Path(__file__).resolve().parent.parent
if str(_srcdir) not in sys.path:
    sys.path.insert(0, str(_srcdir))

# ---------------------------------------------------------------------------
# Import the app *after* we've set up any necessary mocks.
# app.py lazily imports ultralytics.YOLO inside functions, so the
# top-level import is safe even without ultralytics installed.
# ---------------------------------------------------------------------------
os.environ.setdefault("INFERENCE_API_KEY", "test-key")
os.environ.setdefault(
    "INFERENCE_MODEL_DOWNLOAD_ORIGINS",
    "https://example.com,https://fake-s3.example.com,https://x.com",
)
from app import _SafeRedirectHandler, _normalize_origin, _validate_detections  # noqa: E402
from app import HTTPException as AppHTTPException  # noqa: E402
from app import app  # noqa: E402

AUTH = {"X-Inference-Key": os.getenv("INFERENCE_API_KEY", "test-key")}
client = TestClient(app, headers=AUTH)


@pytest.fixture(autouse=True)
def mock_model_host_dns(monkeypatch):
    """Keep model endpoint validation offline while retaining its SSRF checks."""
    import app as app_module

    app_module._model_cache.clear()
    real_getaddrinfo = app_module.socket.getaddrinfo
    test_hosts = {"example.com", "fake-s3.example.com", "x.com"}

    def _getaddrinfo(host, *args, **kwargs):
        if host in test_hosts:
            return [(None, None, None, None, ("93.184.216.34", 443))]
        return real_getaddrinfo(host, *args, **kwargs)

    monkeypatch.setattr(app_module.socket, "getaddrinfo", _getaddrinfo)
    yield
    app_module._model_cache.clear()


def test_protected_endpoint_rejects_unauthorized():
    resp = client.post(
        "/models/inspect",
        data={"model_url": "https://example.com/model.pt"},
        headers={"X-Inference-Key": "invalid-test-key"},
    )
    assert resp.status_code == 401


def test_origin_normalization_host_and_default_ports():
    assert _normalize_origin("HTTP://Storage.Example") == "http://storage.example:80"
    assert _normalize_origin("https://Storage.Example") == "https://storage.example:443"
    assert _normalize_origin("https://Storage.Example:8443") == "https://storage.example:8443"


@pytest.mark.parametrize(
    "origin",
    [
        "ftp://storage.example",
        "https://storage.example/model",
        "https://storage.example?sig=secret",
        "https://storage.example#fragment",
        "https://user:password@storage.example",
        "https://storage.example:99999",
        "https://storage.example:bad",
        "",
    ],
)
def test_invalid_origin_entries_fail_parsing(origin):
    import app as app_module

    with pytest.raises(ValueError, match="Invalid inference model download origin"):
        app_module._normalize_origin(origin)


def test_missing_origin_config_fails_startup(monkeypatch):
    import app as app_module

    monkeypatch.delenv("INFERENCE_MODEL_DOWNLOAD_ORIGINS", raising=False)
    with pytest.raises(ValueError, match="must contain at least one origin"):
        app_module._load_model_download_origins()


def test_model_url_allows_configured_private_host(monkeypatch):
    import app as app_module

    monkeypatch.setattr(
        app_module.socket,
        "getaddrinfo",
        lambda *args, **kwargs: [(None, None, None, None, ("10.0.0.7", 3900))],
    )
    monkeypatch.setattr(app_module, "_INFERENCE_MODEL_DOWNLOAD_ORIGINS", frozenset({"http://garage:3900"}))
    app_module._validate_model_url("http://garage:3900/models/model.pt")


def test_model_url_rejects_unconfigured_public_and_private_origins(monkeypatch):
    import app as app_module

    monkeypatch.setattr(app_module, "_INFERENCE_MODEL_DOWNLOAD_ORIGINS", frozenset({"https://allowed.example:443"}))
    def fail_dns(*args, **kwargs):
        raise AssertionError("unconfigured origins must be rejected before DNS")
    monkeypatch.setattr(app_module.socket, "getaddrinfo", fail_dns)
    for url in (
        "https://other.example/model.pt",
        "http://10.0.0.7/model.pt",
        "https://allowed.example:8443/model.pt",
        "http://allowed.example/model.pt",
    ):
        with pytest.raises(HTTPException) as exc_info:
            app_module._validate_model_url(url)
        assert exc_info.value.status_code == 422


def test_model_url_rejects_unresolved_configured_host(monkeypatch):
    import app as app_module

    monkeypatch.setattr(app_module, "_INFERENCE_MODEL_DOWNLOAD_ORIGINS", frozenset({"https://unresolved.example:443"}))
    monkeypatch.setattr(app_module.socket, "getaddrinfo", lambda *args, **kwargs: (_ for _ in ()).throw(socket.gaierror("no")))
    with pytest.raises(HTTPException, match="cannot be resolved"):
        app_module._validate_model_url("https://unresolved.example/model.pt")


def test_model_url_rejects_private_destination():
    resp = client.post("/models/inspect", data={"model_url": "http://127.0.0.1/model.pt"}, headers=AUTH)
    assert resp.status_code == 422


def test_model_url_rejects_invalid_port():
    resp = client.post(
        "/models/inspect",
        data={"model_url": "https://example.com:99999/model.pt"},
        headers=AUTH,
    )
    assert resp.status_code == 422


def test_redirect_allows_same_origin_and_preserves_query(monkeypatch):
    import app as app_module

    monkeypatch.setattr(app_module.socket, "getaddrinfo", lambda *args, **kwargs: [(None, None, None, None, ("93.184.216.34", 443))])
    request = urllib.request.Request("https://example.com/model.pt?X-Amz-Signature=secret")
    redirected = _SafeRedirectHandler().redirect_request(
        request, None, 302, "Found", {}, "/other-model.pt?X-Amz-Signature=secret"
    )
    assert redirected.full_url == "https://example.com/other-model.pt?X-Amz-Signature=secret"


def test_redirect_rejects_cross_origin_without_forwarding_query():
    request = urllib.request.Request("https://example.com/model.pt?X-Amz-Signature=secret")
    with pytest.raises(HTTPException, match="Cross-origin"):
        _SafeRedirectHandler().redirect_request(
            request, None, 302, "Found", {}, "https://other.example/model.pt?X-Amz-Signature=secret"
        )


def test_redirect_rejects_private_destination():
    with pytest.raises(HTTPException) as exc_info:
        _SafeRedirectHandler().redirect_request(
            None,
            None,
            302,
            "Found",
            {},
            "http://127.0.0.1/model.pt",
        )
    assert exc_info.value.status_code == 422


def test_redirect_without_request_validates_and_returns_none(monkeypatch):
    import app as app_module

    monkeypatch.setattr(
        app_module.socket,
        "getaddrinfo",
        lambda *args, **kwargs: [(None, None, None, None, ("93.184.216.34", 443))],
    )
    assert _SafeRedirectHandler().redirect_request(
        None, None, 302, "Found", {}, "https://example.com/model.pt"
    ) is None


def test_download_rejects_oversized_content(monkeypatch):
    import app as app_module

    monkeypatch.setattr(
        app_module.socket,
        "getaddrinfo",
        lambda *args, **kwargs: [(None, None, None, None, ("93.184.216.34", 443))],
    )

    class Response:
        headers = {"Content-Length": str(app_module._MODEL_MAX_SIZE_BYTES + 1)}

        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc_value, traceback):
            return False

        def read(self, _size=-1):
            return b""

    monkeypatch.setattr(app_module, "_open_model_url", lambda url: Response())
    with pytest.raises(ValueError, match="size limit"):
        app_module._download_to_temp("https://example.com/model.pt")


def test_download_closes_mkstemp_descriptor(monkeypatch):
    import app as app_module
    import tempfile

    created = {}
    real_mkstemp = tempfile.mkstemp

    def _mkstemp(*args, **kwargs):
        fd, name = real_mkstemp(*args, **kwargs)
        created["fd"] = fd
        created["path"] = Path(name)
        return fd, name

    class Response:
        headers = {}

        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc_value, traceback):
            return False

        def read(self, _size=-1):
            if not hasattr(self, "_read_once"):
                self._read_once = True
                return b"model"
            return b""

    monkeypatch.setattr(app_module.tempfile, "mkstemp", _mkstemp)
    monkeypatch.setattr(app_module, "_open_model_url", lambda url: Response())

    tmp_path = app_module._download_to_temp("https://example.com/model.pt")
    try:
        with pytest.raises(OSError):
            os.fstat(created["fd"])
        assert tmp_path.read_bytes() == b"model"
    finally:
        tmp_path.unlink(missing_ok=True)


# ======================================================================
# health
# ======================================================================


def test_health():
    """GET /health returns 200 with {"status": "ok"}."""
    resp = client.get("/health")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}


# ======================================================================
# /predict – missing fields
# ======================================================================


def test_predict_rejects_missing_model_url():
    """POST /predict without model_url returns 422."""
    resp = client.post("/predict", files={"file": ("img.jpg", io.BytesIO(b"fake"), "image/jpeg")})
    assert resp.status_code == 422


def test_model_url_form_constraints_reject_empty_and_overlong_values():
    for path in ("/models/inspect", "/predict"):
        for model_url in ("", "x" * 2049):
            data = {"model_url": model_url, "model_checksum": "a" * 64}
            files = {"file": ("img.jpg", io.BytesIO(b"fake"), "image/jpeg")} if path == "/predict" else None
            assert client.post(path, data=data, files=files).status_code == 422


def test_predict_rejects_checksum_that_is_not_sha256_length():
    for checksum in ("", "a" * 63, "a" * 65):
        resp = client.post(
            "/predict",
            data={"model_url": "https://example.com/model.pt", "model_checksum": checksum},
            files={"file": ("img.jpg", io.BytesIO(b"fake"), "image/jpeg")},
        )
        assert resp.status_code == 422


def test_predict_rejects_missing_file():
    """POST /predict without file returns 422."""
    resp = client.post(
        "/predict",
        data={"model_url": "https://example.com/model.pt", "model_checksum": "a" * 64},
    )
    assert resp.status_code == 422


def test_predict_rejects_chunked_oversized_upload(monkeypatch):
    import app as app_module
    monkeypatch.setitem(app_module._model_cache, 'c' * 64, (MagicMock(), {}))
    payload = b'x' * (app_module._PREDICT_MAX_SIZE_BYTES + 1)
    resp = client.post('/predict', data={'model_url': 'https://example.com/m.pt', 'model_checksum': 'c' * 64}, files={'file': ('x.jpg', io.BytesIO(payload), 'image/jpeg')})
    assert resp.status_code == 413


def test_predict_preserves_deliberate_http_exception(monkeypatch):
    import app as app_module
    monkeypatch.setitem(app_module._model_cache, 'd' * 64, (MagicMock(), {}))
    monkeypatch.setattr(app_module.Image, 'open', lambda _: (_ for _ in ()).throw(HTTPException(status_code=413, detail='dimension limit')))
    resp = client.post('/predict', data={'model_url': 'https://example.com/m.pt', 'model_checksum': 'd' * 64}, files={'file': ('x.jpg', io.BytesIO(b'x'), 'image/jpeg')})
    assert resp.status_code == 413
    assert resp.json()['detail'] == 'dimension limit'


def test_predict_rejects_invalid_image(monkeypatch):
    """Corrupt image bytes are a non-retryable input error."""
    import app as app_module

    monkeypatch.setitem(app_module._model_cache, "c" * 64, (MagicMock(), {}))
    resp = client.post(
        "/predict",
        data={"model_url": "https://example.com/model.pt", "model_checksum": "c" * 64},
        files={"file": ("img.jpg", io.BytesIO(b"not an image"), "image/jpeg")},
    )

    assert resp.status_code == 422
    assert resp.json()["detail"] == "Invalid or unsupported image."


def _cached_predict_model(monkeypatch, checksum="a" * 64):
    import app as app_module
    model = MagicMock()
    model.names = {0: "weed"}
    model.predict.return_value = []
    monkeypatch.setitem(app_module._model_cache, checksum, (model, dict(model.names)))
    return model


def _predict_payload(checksum="a" * 64, data=b"image"):
    return {"model_url": "https://example.com/model.pt", "model_checksum": checksum}, {"file": ("image.jpg", io.BytesIO(data), "image/jpeg")}


def test_predict_rejects_max_dimension(monkeypatch):
    import app as app_module
    _cached_predict_model(monkeypatch)
    image = MagicMock(size=(app_module._IMAGE_MAX_DIMENSION + 1, 1))
    monkeypatch.setattr(app_module.Image, "open", lambda _: image)
    monkeypatch.setattr(app_module.ImageOps, "exif_transpose", lambda value: value)
    data, files = _predict_payload()
    resp = client.post("/predict", data=data, files=files)
    assert resp.status_code == 413
    assert resp.json()["detail"] == "Image dimensions exceed configured limit."


def test_predict_rejects_pixel_limit(monkeypatch):
    import app as app_module
    _cached_predict_model(monkeypatch)
    dimension = int(app_module._IMAGE_MAX_PIXELS**0.5) + 1
    image = MagicMock(size=(dimension, dimension))
    monkeypatch.setattr(app_module.Image, "open", lambda _: image)
    monkeypatch.setattr(app_module.ImageOps, "exif_transpose", lambda value: value)
    data, files = _predict_payload()
    resp = client.post("/predict", data=data, files=files)
    assert resp.status_code == 413
    assert resp.json()["detail"] == "Image pixel count exceeds configured limit."


def test_predict_maps_decompression_bomb_warning_to_422(monkeypatch):
    import app as app_module
    _cached_predict_model(monkeypatch)
    monkeypatch.setattr(app_module.Image, "open", lambda _: (_ for _ in ()).throw(Image.DecompressionBombWarning("bomb")))
    data, files = _predict_payload()
    resp = client.post("/predict", data=data, files=files)
    assert resp.status_code == 422
    assert resp.json()["detail"] == "Invalid or unsupported image."


def test_predict_maps_decompression_bomb_error_to_422(monkeypatch):
    import app as app_module
    _cached_predict_model(monkeypatch)
    monkeypatch.setattr(app_module.Image, "open", lambda _: (_ for _ in ()).throw(Image.DecompressionBombError("bomb")))
    data, files = _predict_payload()
    resp = client.post("/predict", data=data, files=files)
    assert resp.status_code == 422
    assert resp.json()["detail"] == "Invalid or unsupported image."


def test_predict_normal_image_reaches_mocked_predictor(monkeypatch):
    import app as app_module
    model = _cached_predict_model(monkeypatch, "b" * 64)
    image = MagicMock(size=(10, 10))
    monkeypatch.setattr(app_module.Image, "open", lambda _: image)
    monkeypatch.setattr(app_module.ImageOps, "exif_transpose", lambda value: value)
    data, files = _predict_payload("b" * 64, b"valid-image")
    resp = client.post("/predict", data=data, files=files)
    assert resp.status_code == 200
    assert model.predict.called


# ======================================================================
# /models/inspect – rejection paths
# ======================================================================


def test_inspect_rejects_missing_model_url():
    """POST /models/inspect without model_url returns 422."""
    resp = client.post("/models/inspect")
    assert resp.status_code == 422


def test_inspect_rejects_corrupt_model(monkeypatch):
    """POST /models/inspect with a corrupt model URL returns 422."""
    import tempfile

    def _fake_download(url):
        p = Path(tempfile.mkstemp(suffix=".pt")[1])
        p.write_bytes(b"garbage data not a real pt")
        return p

    monkeypatch.setattr("app._download_to_temp", _fake_download)

    resp = client.post(
        "/models/inspect",
        data={"model_url": "https://fake-s3.example.com/model.pt"},
    )
    assert resp.status_code == 422


def test_inspect_rejects_non_detection_model(monkeypatch):
    """POST /models/inspect with a non-detect model → 422."""
    fake_model = MagicMock()
    fake_model.task = "segment"
    fake_model.names = {}
    monkeypatch.setattr("app._load_yolo_from_path", lambda path: fake_model)

    import tempfile

    def _fake_download(url):
        p = Path(tempfile.mkstemp(suffix=".pt")[1])
        p.write_bytes(b"mock-bytes")
        return p

    monkeypatch.setattr("app._download_to_temp", _fake_download)

    resp = client.post(
        "/models/inspect",
        data={"model_url": "https://fake-s3.example.com/model.pt"},
    )
    assert resp.status_code == 422
    assert "segment" in resp.json()["detail"]


def test_inspect_with_mock(monkeypatch):
    """Full /models/inspect flow with a mocked YOLO model."""
    fake_model = MagicMock()
    fake_model.task = "detect"
    fake_model.names = {0: "weed", 1: "crop"}
    fake_model.predict.return_value = [MagicMock()]  # for warmup
    monkeypatch.setattr("app._load_yolo_from_path", lambda path: fake_model)

    import tempfile

    def _fake_download(url):
        p = Path(tempfile.mkstemp(suffix=".pt")[1])
        p.write_bytes(b"mock-model-bytes")
        return p

    monkeypatch.setattr("app._download_to_temp", _fake_download)

    resp = client.post(
        "/models/inspect",
        data={"model_url": "https://fake-s3.example.com/model.pt"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["task"] == "detect"
    assert body["sha256"]  # should be a hex string
    assert body["sizeBytes"] == len(b"mock-model-bytes")
    assert len(body["classes"]) == 2
    assert body["classes"][0] == {"id": 0, "name": "weed"}
    assert body["classes"][1] == {"id": 1, "name": "crop"}


# ======================================================================
# /predict  – happy path (mocked)
# ======================================================================


def test_predict_with_mock(monkeypatch):
    """Full /predict flow with a mocked YOLO model that returns fake detections."""
    # ------------------------------------------------------------------
    # Build a fake model & detection result
    # ------------------------------------------------------------------
    fake_box = MagicMock()
    _xywhn_inner = MagicMock()
    _xywhn_inner.tolist.return_value = [0.5, 0.5, 0.2, 0.3]
    fake_box.xywhn.__getitem__.return_value = _xywhn_inner
    fake_box.conf.item.return_value = 0.85
    fake_box.cls.item.return_value = 0  # classId 0 = "weed"

    fake_result = MagicMock()
    fake_result.boxes = [fake_box]

    fake_model = MagicMock()
    fake_model.names = {0: "weed", 1: "pest"}
    fake_model.task = "detect"
    fake_model.predict.return_value = [fake_result]

    # ------------------------------------------------------------------
    # Monkeypatch the YOLO loader and urllib download
    # ------------------------------------------------------------------
    def _fake_load(path: str):
        return fake_model

    monkeypatch.setattr("app._load_yolo_from_path", _fake_load)

    import tempfile as _tempfile

    def _fake_download(url: str) -> Path:
        """Return a dummy .pt file path – the model loader is mocked anyway."""
        p = Path(_tempfile.mkstemp(suffix=".pt")[1])
        p.write_bytes(b"mock")
        return p

    monkeypatch.setattr("app._download_to_temp", _fake_download)

    # ------------------------------------------------------------------
    # Run /predict
    # ------------------------------------------------------------------
    img_bytes = io.BytesIO()
    # Create a tiny valid JPEG (1×1 black pixel)
    from PIL import Image

    Image.new("RGB", (640, 480), color=(128, 0, 0)).save(img_bytes, format="JPEG")
    img_bytes.seek(0)

    resp = client.post(
        "/predict",
        data={
            "model_url": "https://fake-s3.example.com/model.pt?sig=xyz",
            "model_checksum": "ec864fe99b539704b8872ac591067ef22d836a8d942087f2dba274b301ebe6e5",
        },
        files={"file": ("field.jpg", img_bytes, "image/jpeg")},
    )
    assert resp.status_code == 200

    body = resp.json()
    assert "detections" in body
    assert body["width"] == 640
    assert body["height"] == 480
    assert isinstance(body["inferenceMs"], float)
    assert len(body["detections"]) == 1
    d = body["detections"][0]
    assert d["classId"] == 0
    assert d["className"] == "weed"
    assert d["confidence"] == 0.85
    assert d["xCenter"] == 0.5
    assert d["yCenter"] == 0.5
    assert d["width"] == 0.2
    assert d["height"] == 0.3


def test_predict_reuses_cached_model(monkeypatch):
    """Call /predict twice: second call should reuse the cached model."""
    fake_box = MagicMock()
    _xywhn_inner = MagicMock()
    _xywhn_inner.tolist.return_value = [0.1, 0.1, 0.1, 0.1]
    fake_box.xywhn.__getitem__.return_value = _xywhn_inner
    fake_box.conf.item.return_value = 0.9
    fake_box.cls.item.return_value = 1

    fake_result = MagicMock()
    fake_result.boxes = [fake_box]

    fake_model = MagicMock()
    fake_model.names = {1: "pest"}
    fake_model.task = "detect"
    fake_model.predict.return_value = [fake_result]

    call_count = 0

    def _fake_load(path: str):
        nonlocal call_count
        call_count += 1
        return fake_model

    monkeypatch.setattr("app._load_yolo_from_path", _fake_load)

    import tempfile as _tmpmod

    def _fake_download(url: str) -> Path:
        p = Path(_tmpmod.mkstemp(suffix=".pt")[1])
        p.write_bytes(b"mock")
        return p

    monkeypatch.setattr("app._download_to_temp", _fake_download)

    from PIL import Image

    img_bytes = io.BytesIO()
    Image.new("RGB", (10, 10)).save(img_bytes, format="JPEG")
    img_bytes.seek(0)

    # First call – loads model
    checksum = "ec864fe99b539704b8872ac591067ef22d836a8d942087f2dba274b301ebe6e5"
    r1 = client.post(
        "/predict",
        data={"model_url": "https://x.com/a.pt", "model_checksum": checksum},
        files={"file": ("a.jpg", img_bytes, "image/jpeg")},
    )
    assert r1.status_code == 200
    initial_calls = call_count

    # Second call with same checksum – should be cached
    img_bytes.seek(0)
    r2 = client.post(
        "/predict",
        data={"model_url": "https://x.com/a.pt", "model_checksum": checksum},
        files={"file": ("a.jpg", img_bytes, "image/jpeg")},
    )
    assert r2.status_code == 200
    assert call_count == initial_calls


def test_predict_normalizes_checksum_cache_key(monkeypatch):
    import app as app_module

    checksum = "abcdef0123456789" * 4
    model = MagicMock()
    model.predict.return_value = []
    monkeypatch.setitem(app_module._model_cache, checksum, (model, {}))

    from PIL import Image

    img_bytes = io.BytesIO()
    Image.new("RGB", (10, 10)).save(img_bytes, format="JPEG")

    resp = client.post(
        "/predict",
        data={"model_url": "https://x.com/a.pt", "model_checksum": checksum.upper()},
        files={"file": ("a.jpg", img_bytes, "image/jpeg")},
    )

    assert resp.status_code == 200
    model.predict.assert_called_once()


def test_predict_rejects_model_checksum_mismatch_before_loading_or_caching(monkeypatch):
    import tempfile as _tmpmod
    import app as app_module

    cached_model = MagicMock()
    checksum = "f" * 64
    monkeypatch.setitem(app_module._model_cache, checksum, (cached_model, {0: "old"}))
    original_cache = dict(app_module._model_cache)
    loaded_paths: list[str] = []
    created_path: Path | None = None

    def _fake_download(url: str) -> Path:
        nonlocal created_path
        created_path = Path(_tmpmod.mkstemp(suffix=".pt")[1])
        created_path.write_bytes(b"wrong-model-bytes")
        return created_path

    def _fake_load(path: str):
        loaded_paths.append(path)
        return MagicMock()

    monkeypatch.setattr("app._download_to_temp", _fake_download)
    monkeypatch.setattr("app._load_yolo_from_path", _fake_load)

    image = io.BytesIO()
    Image.new("RGB", (2, 2)).save(image, format="PNG")
    resp = client.post(
        "/predict",
        data={"model_url": "https://x.com/mismatch.pt", "model_checksum": "a" * 64},
        files={"file": ("img.png", image.getvalue(), "image/png")},
    )

    assert resp.status_code == 422
    assert "checksum" in resp.json()["detail"]
    assert loaded_paths == []
    assert app_module._model_cache == original_cache
    assert created_path is not None
    assert not created_path.exists()


def test_predict_evicts_old_model(monkeypatch):
    """Different checksum should evict old model and load the new one."""
    fake_box = MagicMock()
    _xywhn_inner = MagicMock()
    _xywhn_inner.tolist.return_value = [0.1, 0.2, 0.3, 0.4]
    fake_box.xywhn.__getitem__.return_value = _xywhn_inner
    fake_box.conf.item.return_value = 0.7
    fake_box.cls.item.return_value = 0

    fake_result = MagicMock()
    fake_result.boxes = [fake_box]

    fake_model = MagicMock()
    fake_model.names = {0: "weed"}
    fake_model.task = "detect"
    fake_model.predict.return_value = [fake_result]

    call_count = 0
    loaded_paths: list[str] = []

    def _fake_load(path: str):
        nonlocal call_count
        call_count += 1
        loaded_paths.append(path)
        return fake_model

    monkeypatch.setattr("app._load_yolo_from_path", _fake_load)

    import tempfile as _tmpmod

    def _fake_download(url: str) -> Path:
        p = Path(_tmpmod.mkstemp(suffix=".pt")[1])
        p.write_bytes(b"mock" if url.endswith("m1.pt") else b"mock-2")
        return p

    monkeypatch.setattr("app._download_to_temp", _fake_download)

    from PIL import Image

    img_bytes = io.BytesIO()
    Image.new("RGB", (10, 10)).save(img_bytes, format="JPEG")
    img_bytes.seek(0)

    r1 = client.post(
        "/predict",
        data={"model_url": "https://x.com/m1.pt", "model_checksum": "ec864fe99b539704b8872ac591067ef22d836a8d942087f2dba274b301ebe6e5"},
        files={"file": ("img.jpg", img_bytes, "image/jpeg")},
    )
    assert r1.status_code == 200

    img_bytes.seek(0)
    r2 = client.post(
        "/predict",
        data={"model_url": "https://x.com/m2.pt", "model_checksum": "7e3b3bf8e6e0fad2ebc774464e14418a1fc716aa72b49779d0e2788352c9c0d1"},
        files={"file": ("img.jpg", img_bytes, "image/jpeg")},
    )
    assert r2.status_code == 200
    assert call_count == 2


# ======================================================================
# _validate_detections unit tests
# ======================================================================


class TestValidateDetections:
    """Unit tests for _validate_detections – no model or network needed."""

    def test_passes_clean_detections(self):
        dets = [
            {"xCenter": 0.5, "yCenter": 0.5, "width": 0.2, "height": 0.3},
            {"xCenter": 0.1, "yCenter": 0.9, "width": 0.05, "height": 0.08},
        ]
        result = _validate_detections(dets)
        assert len(result) == 2
        assert result == dets  # no changes for in-range values

    def test_rejects_nan_values(self):
        import math

        dets = [
            {"xCenter": float("nan"), "yCenter": 0.5, "width": 0.2, "height": 0.3},
        ]
        assert len(_validate_detections(dets)) == 0

    def test_rejects_infinity(self):
        dets = [
            {"xCenter": float("inf"), "yCenter": 0.5, "width": 0.2, "height": 0.3},
            {"xCenter": 0.5, "yCenter": float("-inf"), "width": 0.2, "height": 0.3},
        ]
        assert len(_validate_detections(dets)) == 0

    def test_clips_out_of_range(self):
        dets = [
            {"xCenter": 1.5, "yCenter": -0.2, "width": 0.5, "height": 0.5},
        ]
        result = _validate_detections(dets)
        assert len(result) == 1
        assert result[0]["xCenter"] == 1.0
        assert result[0]["yCenter"] == 0.0

    def test_rejects_zero_width(self):
        dets = [
            {"xCenter": 0.5, "yCenter": 0.5, "width": 0.0, "height": 0.3},
        ]
        assert len(_validate_detections(dets)) == 0

    def test_rejects_zero_height(self):
        dets = [
            {"xCenter": 0.5, "yCenter": 0.5, "width": 0.2, "height": 0.0},
        ]
        assert len(_validate_detections(dets)) == 0

    def test_rejects_none_values(self):
        dets = [
            {"xCenter": None, "yCenter": 0.5, "width": 0.2, "height": 0.3},
        ]
        assert len(_validate_detections(dets)) == 0

    def test_clips_then_rejects_if_zero_after_clip(self):
        """If clipping produces zero width/height, the box is rejected."""
        dets = [
            {"xCenter": 0.5, "yCenter": 0.5, "width": -0.1, "height": 0.3},
        ]
        result = _validate_detections(dets)
        # width is clipped to 0.0 → rejected
        assert len(result) == 0

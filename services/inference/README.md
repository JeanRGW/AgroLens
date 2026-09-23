# AgroLens Inference Service

CPU-only FastAPI service for Ultralytics YOLO `.pt` detection models. Called by the NestJS worker only; never expose it publicly.

## Endpoints

| Method | Path              | Description                                          |
| ------ | ----------------- | ---------------------------------------------------- |
| `GET`  | `/health`         | `{"status":"ok"}`                                    |
| `POST` | `/models/inspect` | Validate a detection model from a signed S3 URL      |
| `POST` | `/predict`        | Run detection on an uploaded image + model reference |

`inspect` accepts multipart `model_url` (a signed S3 URL) and returns checksums, task, classes, and size; non-detection models are rejected (422). Model downloads are bounded by `INFERENCE_MODEL_MAX_SIZE_BYTES` (500 MiB by default). `predict` accepts multipart `file`, `model_url`, and `model_checksum`; images are bounded by `INFERENCE_PREDICT_MAX_SIZE_BYTES` (25 MiB by default). Both endpoints require `X-Inference-Key` matching `INFERENCE_API_KEY`.

## Model Cache

One model is cached in memory. A new `model_checksum` evicts the old model and downloads/loads the replacement.

Blocking download, hash, load, image decoding, and prediction work runs in background threads. Model loading/prediction is serialized with a lock so simultaneous cache misses do not duplicate model loads and mutable YOLO instances are not used concurrently. Health requests remain available while that work runs. Extra backend inference slots queue behind this lock rather than increasing CPU prediction parallelism.

## Download Origins

`INFERENCE_MODEL_DOWNLOAD_ORIGINS` is required: comma-separated exact HTTP(S) origins for worker-generated presigned model URLs. No paths, queries, fragments, or credentials. Redirects must stay on the same origin so signing queries never leak. Hostnames are case-normalized; omitted ports mean 80/443.

- Local Docker: `http://garage:3900` (or `http://localhost:3900` on host)
- Production: the `S3_ENDPOINT` origin, normally `http://garage:3900`

DNS resolves just before fetch; unconfigured origins are rejected before DNS or network access. Startup logs only the normalized origins, never URLs or signatures.

## CPU-Only Packaging

PyTorch comes from the CPU wheel index so the image avoids CUDA builds:

```bash
pip install --index-url https://download.pytorch.org/whl/cpu --extra-index-url https://pypi.org/simple torch==2.6.0 torchvision==0.21.0
pip install -r requirements.txt
```

Keep the release artifact lean and CPU-only (no `cu*`/`cuda` `.so` files).

## Local Development

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install --index-url https://download.pytorch.org/whl/cpu --extra-index-url https://pypi.org/simple torch==2.6.0 torchvision==0.21.0
pip install -r requirements.txt
INFERENCE_API_KEY=dev-only-inference-key-change-me INFERENCE_MODEL_DOWNLOAD_ORIGINS=http://localhost:3900 uvicorn app:app --host 127.0.0.1 --port 8000
```

Run the backend on the host too, with `INFERENCE_ENABLED=true`, `INFERENCE_SERVICE_URL=http://localhost:8000`, the same `INFERENCE_API_KEY`, and `S3_ENDPOINT=http://localhost:3900`. For an entirely containerized stack, use the [backend AI profile](../../apps/api/README.md#full-stack).

Interactive docs: `http://localhost:8000/docs`.

## Tests

```bash
pip install -r test-requirements.txt
pytest tests/
```

Tests mock the YOLO model; Ultralytics/PyTorch are not required. The real-model smoke tests stay skipped.

## Docker

```bash
docker build -t agrolens-inference .
docker run --read-only --tmpfs /tmp -p 127.0.0.1:8000:8000 \
  -e INFERENCE_API_KEY='replace-with-a-strong-key' \
  -e INFERENCE_MODEL_DOWNLOAD_ORIGINS='https://s3.agrolens.rgw.app' \
  agrolens-inference
```

## Security

- `.pt` files are pickle-based: accept models from trusted admins only.
- Single-worker, read-only root filesystem to limit exploit blast radius.

## Licensing

Ultralytics YOLO is AGPL-3.0. Personal project; reassess before commercial use.

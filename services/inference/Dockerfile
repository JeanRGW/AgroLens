# (linux/amd64) digest-pinned slim Python base for a reproducible image.
FROM python:3.11-slim@sha256:ff05d1a05204fb9f7444c435db8e8ec104e587a413280dc9ffc27a4797554182

# System dependencies for OpenCV / Pillow
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        libgl1 \
        libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install CPU-only PyTorch/Torchvision from the cpu index BEFORE the rest of
# the requirements so that ultralytics satisfies its torch dependency from
# these CPU wheels instead of pulling the CUDA build from the default index.
# This keeps the release image free of CUDA runtime libraries (~1 GB smaller).
RUN pip install --no-cache-dir \
        --index-url https://download.pytorch.org/whl/cpu \
        --extra-index-url https://pypi.org/simple \
        torch==2.6.0 \
        torchvision==0.21.0

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app.py .

# Run as non-root
RUN adduser --disabled-password --gecos "" appuser \
    && chown -R appuser:appuser /app
USER appuser

# The container requires a writable /tmp for temporary model files.
EXPOSE 8000

CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
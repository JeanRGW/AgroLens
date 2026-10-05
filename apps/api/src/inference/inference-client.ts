import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Detection } from '@agrolens/contracts';

/** Result of a prediction call — detections plus image metadata. */
export interface PredictResult {
  detections: Detection[];
  width: number;
  height: number;
  inferenceMs: number;
}

interface InspectModelResponse {
  sha256: string;
  task: string;
  classes: Array<{ id: number; name: string }>;
  sizeBytes: number;
}

export class InferenceHttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'InferenceHttpError';
  }
}

@Injectable()
export class InferenceClient {
  private readonly baseUrl: string;
  private readonly apiKey?: string;
  // Must exceed inference/app.py's 300-second model download socket timeout.
  private readonly requestTimeoutMs = 360_000;

  constructor(private readonly configService: ConfigService) {
    this.baseUrl = this.configService.get<string>('INFERENCE_SERVICE_URL', 'http://localhost:8000');
    this.apiKey = this.configService.get<string>('INFERENCE_API_KEY');
  }

  /**
   * Inspect a model at the given signed S3 URL.
   * Returns task type and class list (YOLO model metadata).
   */
  async inspectModel(signedUrl: string, signal?: AbortSignal): Promise<InspectModelResponse> {
    const formData = new FormData();
    formData.append('model_url', signedUrl);

    const response = await fetch(`${this.baseUrl}/models/inspect`, {
      method: 'POST',
      body: formData,
      ...(this.apiKey ? { headers: { 'X-Inference-Key': this.apiKey } } : {}),
      signal: AbortSignal.any([
        AbortSignal.timeout(this.requestTimeoutMs),
        ...(signal ? [signal] : []),
      ]),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new InferenceHttpError(
        response.status,
        `Inference service inspect failed (${response.status}): ${body}`,
      );
    }

    return response.json() as Promise<InspectModelResponse>;
  }

  /**
   * Run inference on an image buffer using a model at a signed S3 URL.
   *
   * @param imageBuffer - raw image bytes
   * @param modelUrl    - presigned GET URL for the model file in S3
   * @param modelChecksum - SHA-256 of the model (stable cache key; presigned URLs expire)
   * @returns normalized detection list
   */
  async predict(
    imageBuffer: Buffer,
    modelUrl: string,
    modelChecksum: string,
    signal?: AbortSignal,
  ): Promise<PredictResult> {
    const formData = new FormData();
    formData.append('file', new Blob([imageBuffer as BlobPart]), 'image.jpg');
    formData.append('model_url', modelUrl);
    formData.append('model_checksum', modelChecksum);

    const response = await fetch(`${this.baseUrl}/predict`, {
      method: 'POST',
      body: formData,
      ...(this.apiKey ? { headers: { 'X-Inference-Key': this.apiKey } } : {}),
      signal: AbortSignal.any([
        AbortSignal.timeout(this.requestTimeoutMs),
        ...(signal ? [signal] : []),
      ]),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new InferenceHttpError(
        response.status,
        `Inference service predict failed (${response.status}): ${body}`,
      );
    }

    return response.json() as Promise<PredictResult>;
  }
}

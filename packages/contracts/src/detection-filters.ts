import { z } from "zod";
import { detectionSchema, type Detection } from "./inference";
import { timestampDateSchema } from "./common";

export const reviewedDetectionSchema = detectionSchema
  .extend({
    confidence: z.number().min(0).max(1).nullable(),
  })
  .refine(
    (box) =>
      box.width > 0 &&
      box.height > 0 &&
      box.xCenter - box.width / 2 >= -0.000001 &&
      box.xCenter + box.width / 2 <= 1.000001 &&
      box.yCenter - box.height / 2 >= -0.000001 &&
      box.yCenter + box.height / 2 <= 1.000001,
    {
      message: "Boxes must have positive dimensions and stay inside the image",
    },
  );
export type ReviewedDetection = z.infer<typeof reviewedDetectionSchema>;

export const saveInferenceReviewSchema = z.object({
  expectedUpdatedAt: timestampDateSchema,
  detections: z.array(reviewedDetectionSchema).max(1000).nullable(),
});
export type SaveInferenceReviewDto = z.infer<typeof saveInferenceReviewSchema>;
export interface InferenceReviewResponse {
  reviewedDetections: ReviewedDetection[] | null;
  updatedAt: Date | string;
}

export interface DetectionFilterOptions {
  minConfidence: number;
  suppressOverlaps: boolean;
  iouThreshold: number;
}

export function intersectionOverUnion(
  a: ReviewedDetection,
  b: ReviewedDetection,
): number {
  const width = Math.max(
    0,
    Math.min(a.xCenter + a.width / 2, b.xCenter + b.width / 2) -
      Math.max(a.xCenter - a.width / 2, b.xCenter - b.width / 2),
  );
  const height = Math.max(
    0,
    Math.min(a.yCenter + a.height / 2, b.yCenter + b.height / 2) -
      Math.max(a.yCenter - a.height / 2, b.yCenter - b.height / 2),
  );
  const intersection = width * height;
  const union = a.width * a.height + b.width * b.height - intersection;
  return union > 0 ? intersection / union : 0;
}

/** Stable, class-aware greedy NMS. Input arrays and returned boxes are never mutated. */
export function filterDetections(
  detections: readonly Detection[],
  options: DetectionFilterOptions,
): Detection[] {
  const candidates = detections
    .map((box, index) => ({ box, index }))
    .filter(({ box }) => box.confidence >= options.minConfidence);
  if (!options.suppressOverlaps) return candidates.map(({ box }) => box);
  candidates.sort(
    (a, b) => b.box.confidence - a.box.confidence || a.index - b.index,
  );
  const kept: typeof candidates = [];
  for (const candidate of candidates) {
    if (
      !kept.some(
        ({ box }) =>
          box.classId === candidate.box.classId &&
          intersectionOverUnion(box, candidate.box) > options.iouThreshold,
      )
    )
      kept.push(candidate);
  }
  return kept.sort((a, b) => a.index - b.index).map(({ box }) => box);
}

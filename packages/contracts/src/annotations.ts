import { z } from "zod";

export const yoloLabelSchema = z.object({
  classId: z.number().int().min(0),
  className: z.string().min(1),
  xCenter: z.number().min(0).max(1),
  yCenter: z.number().min(0).max(1),
  width: z.number().min(0).max(1),
  height: z.number().min(0).max(1),
});

export type YoloLabel = z.infer<typeof yoloLabelSchema>;

/**
 * Upsert annotation payload.
 * Accepts flexible label data for YOLO, COCO, or custom annotation formats.
 */
export const upsertAnnotationSchema = z.object({
  imageWidth: z.number().int().positive(),
  imageHeight: z.number().int().positive(),
  classes: z.array(z.string()),
  labels: z.union([z.record(z.unknown()), z.array(z.unknown())]),
});

export type UpsertAnnotationDto = z.infer<typeof upsertAnnotationSchema>;

export const imageAnnotationSchema = z.object({
  id: z.string().uuid().optional(),
  uploadId: z.string().uuid(),
  imageIndex: z.number().int().min(0),
  imageWidth: z.number().int().positive(),
  imageHeight: z.number().int().positive(),
  classes: z.array(z.string()),
  labels: z.union([
    z.array(yoloLabelSchema),
    z.record(z.unknown()),
    z.array(z.unknown()),
  ]),
  updatedByUserId: z.string().uuid().optional(),
  updatedAt: z.union([z.string(), z.date()]).optional(),
});

export type ImageAnnotation = z.infer<typeof imageAnnotationSchema>;

export const saveAnnotationInputSchema = z.object({
  uploadId: z.string().uuid(),
  imageIndex: z.number().int().min(0),
  imageWidth: z.number().int().positive(),
  imageHeight: z.number().int().positive(),
  classes: z.array(z.string()),
  labels: z.array(yoloLabelSchema),
});

export type SaveAnnotationInput = z.infer<typeof saveAnnotationInputSchema>;

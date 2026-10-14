import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  filterDetections,
  reviewedDetectionSchema,
  saveInferenceReviewSchema,
} from "../dist/index.js";
const fixtures = JSON.parse(
  readFileSync(new URL("./fixtures/detection-filters.json", import.meta.url)),
);
for (const fixture of fixtures)
  test(fixture.name, () => {
    const boxes = fixture.boxes.map(
      ([classId, confidence, xCenter, yCenter, width, height]) =>
        Object.freeze({
          classId,
          className: String(classId),
          confidence,
          xCenter,
          yCenter,
          width,
          height,
        }),
    );
    const result = filterDetections(Object.freeze(boxes), {
      minConfidence: fixture.minimum,
      suppressOverlaps: fixture.enabled,
      iouThreshold: fixture.threshold,
    });
    assert.deepEqual(
      result.map((box) => boxes.indexOf(box)),
      fixture.kept,
    );
  });
test("review validation permits empty/restore snapshots and rejects invalid geometry", () => {
  const box = {
    classId: 0,
    className: "corn",
    confidence: null,
    xCenter: 0.5,
    yCenter: 0.5,
    width: 0.2,
    height: 0.2,
  };
  assert.ok(reviewedDetectionSchema.safeParse(box).success);
  for (const change of [
    { width: 0 },
    { xCenter: 0 },
    { height: Infinity },
    { confidence: 1.1 },
  ])
    assert.equal(
      reviewedDetectionSchema.safeParse({ ...box, ...change }).success,
      false,
    );
  for (const detections of [null, []])
    assert.ok(
      saveInferenceReviewSchema.safeParse({
        expectedUpdatedAt: "2026-10-13T00:00:00Z",
        detections,
      }).success,
    );
});

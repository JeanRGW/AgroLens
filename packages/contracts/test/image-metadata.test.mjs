import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeImageLocation, fileDescriptorSchema } from "../dist/index.js";
test("EXIF GPS respects hemispheres", () => {
  const result = normalizeImageLocation({
    gps: {
      GPSLatitude: [25, 24, 0],
      GPSLatitudeRef: "S",
      GPSLongitude: [51, 24, 0],
      GPSLongitudeRef: "W",
    },
  });
  assert.deepEqual(result.coordinates, {
    latitude: -25.4,
    longitude: -51.4,
    source: "exif",
  });
});
test("DJI pairs take precedence and disagreement is transient", () => {
  const result = normalizeImageLocation({
    gps: { latitude: 1, longitude: 2 },
    "drone-dji": { GpsLatitude: -25.4, GpsLongitude: -51.4, RtkFlag: 50 },
  });
  assert.equal(result.coordinates.source, "dji-xmp");
  assert.deepEqual(result.warnings, ["conflicting-gps"]);
  assert.equal(result.rtkFlag, undefined);
});
test("zero is valid and incomplete, invalid or mixed pairs are rejected", () => {
  assert.equal(
    normalizeImageLocation({
      "drone-dji": { GPSLatitude: 0, GPSLongtitude: 0 },
    }).coordinates.latitude,
    0,
  );
  for (const latitude of ["", Infinity, 91, "invalid"])
    assert.equal(
      normalizeImageLocation({
        "drone-dji": { GpsLatitude: latitude, GpsLongitude: 0 },
      }).coordinates,
      null,
    );
  assert.equal(
    normalizeImageLocation({
      gps: { GPSLatitude: [1, 0, 0] },
      "drone-dji": { GpsLongitude: 2 },
    }).coordinates,
    null,
  );
});
test("location choices reject legacy and inconsistent coordinate pairs", () => {
  const file = {
    imageId: "11111111-1111-4111-8111-111111111111",
    contentType: "image/jpeg",
    latitude: null,
    longitude: null,
  };
  assert.ok(
    fileDescriptorSchema.safeParse({ ...file, locationSource: "none" }).success,
  );
  assert.equal(
    fileDescriptorSchema.safeParse({ ...file, locationSource: "legacy" })
      .success,
    false,
  );
  assert.equal(
    fileDescriptorSchema.safeParse({ ...file, locationSource: "manual" })
      .success,
    false,
  );
});

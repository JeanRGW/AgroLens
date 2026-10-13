import { z } from "zod";

export const locationSourceSchema = z.enum([
  "file",
  "device",
  "manual",
  "none",
]);
export type LocationSource = z.infer<typeof locationSourceSchema>;
export interface ImageLocation {
  coordinates: {
    latitude: number;
    longitude: number;
    source: "exif" | "dji-xmp";
  } | null;
  warnings: Array<"invalid-gps" | "conflicting-gps" | "metadata-unreadable">;
}

export const IMAGE_METADATA_READ_OPTIONS = {
  xmp: true,
  mergeOutput: false,
  reviveValues: false,
  translateValues: false,
  ifd0: {
    pick: ["Model"],
  },
  exif: false,
  gps: {
    pick: [
      "GPSLatitude",
      "GPSLongitude",
      "GPSLatitudeRef",
      "GPSLongitudeRef",
      "GPSStatus",
    ],
  },
};

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

function number(value: unknown): number | null {
  if (typeof value !== "number" && typeof value !== "string") return null;
  if (typeof value === "string" && !value.trim()) return null;
  const result = Number(value);
  return Number.isFinite(result) ? result : null;
}

function coordinate(value: unknown, ref: unknown, max: number): number | null {
  if (
    ref !== undefined &&
    !(max === 90 ? ["N", "S"] : ["E", "W"]).includes(String(ref))
  )
    return null;
  let result = number(value);
  if (Array.isArray(value) && value.length === 3) {
    if (ref === undefined) return null;
    const parts = value.map(number);
    if (parts.some((part) => part === null)) return null;
    const [degrees, minutes, seconds] = parts as number[];
    if (
      degrees < 0 ||
      minutes < 0 ||
      minutes >= 60 ||
      seconds < 0 ||
      seconds >= 60
    )
      return null;
    result = degrees + minutes / 60 + seconds / 3600;
  }
  if (result === null) return null;
  if (ref === "S" || ref === "W") result = -Math.abs(result);
  if (ref === "N" || ref === "E") result = Math.abs(result);
  return Math.abs(result) <= max ? result : null;
}

/** Normalizes capture tags only; never imports serials, people or target coordinates. */
export function normalizeImageLocation(value: unknown): ImageLocation {
  const root = record(value);
  const gps = record(root.gps);
  const dji = record(root["drone-dji"]);
  const get = (data: Record<string, unknown>, ...keys: string[]): unknown => {
    for (const key of keys) if (data[key] !== undefined) return data[key];
    return undefined;
  };
  const lat = coordinate(
    get(gps, "GPSLatitude", "latitude") ?? root.GPSLatitude,
    gps.GPSLatitudeRef ?? root.GPSLatitudeRef,
    90,
  );
  const lon = coordinate(
    get(gps, "GPSLongitude", "longitude") ?? root.GPSLongitude,
    gps.GPSLongitudeRef ?? root.GPSLongitudeRef,
    180,
  );
  const djiLatValue = get(dji, "GpsLatitude", "GPSLatitude", "Latitude");
  const djiLonValue = get(
    dji,
    "GpsLongitude",
    "GPSLongitude",
    "GPSLongtitude",
    "Longitude",
  );
  const djiLat = coordinate(djiLatValue, undefined, 90);
  const djiLon = coordinate(djiLonValue, undefined, 180);
  const gpsUsable = (gps.GPSStatus ?? root.GPSStatus) !== "V";
  const djiUsable = !/^(invalid|none|error)$/i.test(
    String(dji.GpsStatus ?? ""),
  );
  const warnings: ImageLocation["warnings"] = [];
  if (
    (djiLatValue !== undefined || djiLonValue !== undefined) &&
    (!djiUsable || djiLat === null || djiLon === null)
  )
    warnings.push("invalid-gps");
  if (
    (gps.GPSLatitude !== undefined ||
      gps.GPSLongitude !== undefined ||
      root.GPSLatitude !== undefined ||
      root.GPSLongitude !== undefined) &&
    (!gpsUsable || lat === null || lon === null) &&
    !warnings.includes("invalid-gps")
  )
    warnings.push("invalid-gps");
  if (
    djiUsable &&
    gpsUsable &&
    djiLat !== null &&
    djiLon !== null &&
    lat !== null &&
    lon !== null &&
    (Math.abs(djiLat - lat) > 0.00001 || Math.abs(djiLon - lon) > 0.00001)
  )
    warnings.push("conflicting-gps");
  const coordinates =
    djiUsable && djiLat !== null && djiLon !== null
      ? { latitude: djiLat, longitude: djiLon, source: "dji-xmp" as const }
      : gpsUsable && lat !== null && lon !== null
        ? { latitude: lat, longitude: lon, source: "exif" as const }
        : null;
  return { coordinates, warnings };
}

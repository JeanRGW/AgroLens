# Photo location extraction

AgroLens imports ordinary JPEG, PNG and WebP photographs and reads capture GPS
from standard EXIF and DJI XMP. Valid complete DJI XMP pairs take precedence over
EXIF. Coordinates represent the camera/drone position, not the photographed
object, image footprint or laser target.

## Behavior

- Gallery imports never automatically use the importing device's GPS. Fresh
  camera captures can use device GPS as a fallback. Current GPS can also be
  explicitly applied to missing locations.
- Explicitly selected points (including GPS confirmed in the map) are stored as
  `manual` overrides and are not replaced by embedded GPS. There is no control
  to remove an image's location; missing GPS is a last-resort confirmation.
  Historical intentionally unset locations remain preserved. Delayed
  metadata results cannot overwrite these choices or attach to removed images.
- The browser/mobile reader gives immediate feedback; the backend independently
  reads the complete sealed original during finalization. Mobile reads a bounded
  512 KiB prefix locally, so server extraction can find tags missed locally.
- Only effective latitude, longitude and `location_source` are stored per image.
  Sources are `file`, `device`, `manual`, or `none`. RTK, altitude, timestamps and
  camera details remain inside the preserved original, not separate columns.
- Missing/damaged GPS does not reject an otherwise valid image. Warnings are
  transient upload feedback and sanitized backend diagnostics, not persisted.
- Originals remain byte-for-byte unchanged, including their embedded GPS, even
  when an application location override is selected.
- Preview JPEGs fit within 1200 × 1200 pixels, respecting orientation.

TIFF and DNG imports are rejected. Recognizable DJI radiometric R-JPEGs are
rejected using camera-model/APP4 identification; this is not universal thermal
detection. An ordinary JPEG export of a thermal image may be indistinguishable
from other JPEGs. No NDVI, thermal analysis, RAW conversion or surveying support
is provided. Scientific-image annotation/export compatibility is not included;
the application accepts ordinary-photo formats only. Existing stored files are
not deleted by these changes.

## Limits and deployment

Defaults: 100 files per upload and 100 MiB per original. JPEG imports allow up to
120 million pixels (`IMAGE_MAX_INPUT_PIXELS`); PNG/WebP are capped at the lower
of that setting and 40 million pixels, checked before preview decoding. Preview
decoding uses the same format-specific limit. Keep finalization concurrency at 1
for the shipped 1 GiB backend; higher concurrency needs a reviewed memory budget.
Inference retains separate 25 MiB / 40-million-pixel limits. Existing environment
and proxy overrides must be aligned. No ExifTool, Perl or LibRaw is required.

An immutable SHA-256 initialization-request fingerprint is stored on each new
upload. File-location input coordinates are normalized to null; extracted GPS
does not change retry identity. Files are ordered by ID for hashing and optional
size declarations remain checked separately. Historical requests without hashes
use existing descriptor checks; retries that cannot be reconciled safely require
a new client upload ID. An accepted historical retry adopts a fingerprint.

Migration `0002_photo_location_extraction.sql` classifies historical unknown
coordinates as `device` and missing coordinates as `none`. This is a convention,
not proof of historical provenance. The merged migration adds only location source
and the upload fingerprint; no intermediate metadata columns are created. Applied
baseline migrations remain unchanged. No live database is migrated by the
development changes; use the repository's migration/deployment workflow. Local
databases that applied earlier uncommitted variants need reconciliation before
running the merged migration; do not apply it blindly to those databases.

## Public sample checks

Downloaded originals remain outside the repository; consult source licenses:

- [Duncan Rawlinson's Mavic 4 Pro samples](https://duncan.co/dji-mavic-4-pro/):
  the 12288 × 8192 JPEG is Lightroom-exported, not untouched camera JPEG.
- [Zenodo Mavic 3M bands](https://zenodo.org/records/14604638): TIFFs are now
  negative acceptance tests (CC BY-NC 4.0).
- [DJI Thermal SDK samples](https://enterprise.dji.com/matrice-4-series/downloads):
  M4T R-JPEGs are negative acceptance tests. These samples have no GPS tags.

```sh
pnpm --filter @agrolens/api exec tsx scripts/verify-drone-samples.ts /tmp/opencode/agrolens-drone-samples/selected
# Require capture GPS when checking ordinary field photographs:
pnpm --filter @agrolens/api exec tsx scripts/verify-drone-samples.ts ~/dji --require-gps
```

Tests use synthetic images without network access. Public sample checking is
representative, not certification of every firmware or shooting mode.

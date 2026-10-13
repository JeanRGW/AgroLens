# Detection filters and reviews

Inference output is preserved. The viewer can reduce duplicates and save a
separate reviewed box list; it never rewrites the original model detections.

## Filtering

- Web and Flutter use the same class-aware, confidence-first greedy NMS behavior
  and shared test fixtures. Duplicate suppression is optional and initially off.
- Confidence starts at 25%; overlap IoU starts at 50%. Lower overlap thresholds
  remove more boxes. Different classes and low-IoU contained boxes remain.
- Overlay visibility does not alter counts or exports. Class checkboxes control
  the current image and export exclusions. Visited-image summaries include all
  classes after processing; list-page counts remain original model counts.
- The Python predictor still uses confidence 0.25, IoU 0.70 and `max_det=300`.
  Viewer filters cannot recover predictions already removed by that pipeline.

## Web editing

Choose **Editar resultado** to copy the processed result (all classes, including
hidden classes) into a draft. Automatic filters are frozen during editing.
Select boxes on the image or in the box list; delete, draw, move, resize with
corner handles, change classes, or adjust normalized coordinates with inputs.
Undo retains up to 50 changes. Cancel leaves the saved result untouched.

Added or modified boxes have null confidence and display **Manual**. Unchanged
boxes may retain their original confidence; the API verifies that such boxes
exactly match original model output and that classes match the model snapshot.
Boxes must have positive dimensions inside the image; reviews allow up to 1000
boxes, with a bounded 1 MiB request body on the review endpoint.

Saving requires job-owner/admin access and, for upload jobs, current upload
access. A transaction locks job then image, rejects expired/incomplete results
and stale `expectedUpdatedAt`, and advances the timestamp monotonically at
millisecond precision. Conflicts retain the client draft; cancel/reload to read
the other saved version. Saves/restores record an audit event.

`reviewed_detections = null` means no review; `[]` means a deliberately empty
review. **Ver original** is non-destructive. **Restaurar original** removes the
saved review after confirmation. Flutter displays saved reviews but editing is
available only on web in this version. Automatic filters do not run on reviews.

## Export and retention

Current-result exports include filtering/class exclusions or saved reviews.
Original exports include unchanged model output. All completed images are
fetched, not only visited images. JSON includes settings; CSV includes result
mode, confidence threshold, overlap threshold and excluded classes/IDs. Manual
confidence is null in JSON and blank in CSV. Hiding overlays does not filter data.

Reviews share the job's existing expiry and deletion lifecycle. They are not
permanent training annotations; export before expiry if needed.

Migration `apps/api/drizzle/0003_inference_review_snapshots.sql` adds one nullable
JSONB column to `inference_job_images`. No per-box tables, plugin registries,
saved filter presets or revision history are introduced.

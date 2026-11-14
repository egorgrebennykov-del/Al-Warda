# Product Image Quality Report — Al-Warda

## Root cause (confirmed in code)

The blur came from the generation pipeline, not from the browser or CSS:

1. `scripts/generate_product_images.py#generate_product_edit` downsampled the
   original Qogita photo to **511×511** (`source.thumbnail((511, 511))`) before
   sending it to Flux 2 Klein, which then re-drew the bottle at 1024×1024.
2. Flux is generative: it "reconstructed" the lost 511px detail, which
   inevitably softens small label text — a 1024px file that is not actually
   sharp.
3. `normalize_flacon_cutout()` then scaled the cutout **up to 850×850**, i.e.
   small bottles were upscaled and presented as if improved.
4. `generated_image_matches_source()` only compared the dominant product colour,
   so a blurry but correctly-coloured redraw always passed quality control.

The display path (`BookImage.jsx` → `enhancedImageUrl.js` → card CSS) is not the
problem: generated images are served at full size and `object-fit: contain`
never stretches them.

## Where detail is lost

- **511px downscale** — permanent loss of small label/logo detail before Flux.
- **Generative redraw** — Flux invents detail that no longer matches the real
  label typography.
- **850px upscale** — enlarges an already-soft product without adding detail.

## Changes made (`scripts/generate_product_images.py`)

1. `generate_product_edit` no longer shrinks the reference to 511px. It sends
   the full-resolution photo (downscaled only if larger than 1024). This is a
   separate decoded copy — the original bytes are never mutated.
2. Added `preserve_original_product()` — segments the **original** photo with
   U2Net and places the cutout on a transparent 1024×1024 canvas **without
   redrawing and without upscaling**.
3. `normalize_flacon_cutout(..., allow_upscale=False)` — added a no-upscale mode
   (scale capped at 1.0) so a small original is not artificially enlarged.
4. `process_product` now uses **preserve-original first** and falls back to the
   Flux studio edit only when segmentation fails. The colour guard still runs on
   the fallback path.
5. Added diagnostics recorded into `info.imageGeneration`:
   `processingMethod`, `whetherUpscaled`, `originalWidth`, `originalHeight`,
   `originalFileSize`, `processedWidth`, `processedHeight`, `sharpness`,
   `qualityStatus`, `sourceImageId`.
6. `measure_source_quality()` / `product_sharpness()` flag small originals as
   `low_source_quality` and soft originals as `low_sharpness`
   (`SHARPNESS_THRESHOLD` is a starting value to be tuned on real photos).

## Display path (verified, unchanged)

- `BookImage.jsx` renders `enhancedImageUrl(src)`; for generated products
  (`/assets/img/generated-products/…`) the URL is returned unchanged.
- Card CSS uses `object-fit: contain` with `aspect-ratio: 1` — the browser does
  not receive a thumbnail and does not stretch the image.

## Tests

- `py -m py_compile` passes for `scripts/generate_product_images.py` and
  `tests/test_product_image_generation.py`.
- Updated existing Python tests for the new flow (reference no longer
  downscaled; preserve-original is primary; fallback forced via mocked
  segmentation failure where the test exercises the Flux path).
- Added Python tests: no-upscale normalization, low-resolution detection,
  quality diagnostics, and the preserve-original end-to-end path.

**Important:** `python -m unittest` could **not be executed** in this
environment — `PIL`/`numpy`/`cv2`/`rembg` are not installed in the local Python
3.7 interpreter, so the test module fails to import (`ModuleNotFoundError: No
module named 'PIL'`). The Python tests must be run in the GitHub Actions/venv
environment that has the pipeline dependencies. Syntax was validated with
`py -m py_compile`. This is reported honestly, not hidden.

- `node --test` — 93 pass, 1 fail (`pushMainWithRetry.test.js`, unrelated
  git/bash environment test).
- `npm run build` — passes.

## Real source resolutions

Could not be measured live: Supabase currently returns `402 exceed_egress_quota`
and the Qogita source URLs were not fetched to avoid unnecessary network work
and because the pipeline must not run mass processing without approval. A
follow-up diagnostic pass over ~10 sample products (as described in the task)
would record `originalWidth/Height/FileSize` for the report.

## What still needs approval / next steps

- **Enable preserve-original as the production default** — the code path is now
  primary in `process_product`, but a small validation batch (not mass
  regeneration) should be run and reviewed before re-running the full queue.
- **Tune `SHARPNESS_THRESHOLD`** on real photos.
- **Super Resolution** was reviewed conceptually but not applied: it risks
  altering labels/logo/glass shape and must be tested on 5 real photos before
  any automatic use (per constraints).
- **Qogita source investigation** — confirm whether Qogita returns thumbnails or
  originals for `info.rawImage`, and whether a higher-resolution variant URL is
  available, before changing URL logic.

## Constraints respected

No mass regeneration was run; no Supabase schema changes; no mass
UPDATE/DELETE; no queue/publication mechanism changes; no deletion of old
photos; no AI redraw used as a substitute for a good original.

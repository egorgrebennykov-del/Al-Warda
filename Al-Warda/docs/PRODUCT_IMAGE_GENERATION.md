# Product Image Generation — Al-Warda Local AI System

The Al-Warda product photography pipeline converts original Qogita supplier packshots into studio-grade commercial product photographs with genuine transparent backgrounds at **$0.00 API cost**.

---

## 1. System Overview

- **Pipeline Type**: Local Computer Vision + Salient Object Segmentation + Photometric Enhancement.
- **Segmentation Model**: U2Net ONNX (Apache 2.0 Licence).
- **Inference Runtime**: Direct ONNX Runtime execution (`CPUExecutionProvider` / DirectML).
- **Core Principle**: **100% Product Preservation First**.
  - Original bottle silhouette, geometry, cap details, and glass reflections are retained.
  - Authentic labels, brand typography, and Arabic/English calligraphy are 100% preserved directly from original pixels.
  - Generative diffusion hallucination is prohibited in production.
- **Canvas Output**: Strictly $1024 \times 1024$ RGBA PNG with true alpha transparency.
- **Storage**: Committed directly into the repository at `public/assets/img/generated-products/` and deployed as static assets.
- **Target Catalog**: 2000+ perfume products.

---

## 2. Image Quality & Photometric Enhancements

The system applies non-generative studio enhancement to each extracted product:
1. **Dynamic Range & Auto-levels**: Percentile expansion (1st–99th percentile) restores deep shadows and sparkling highlights.
2. **LAB CLAHE**: Contrast-Limited Adaptive Histogram Equalization applied exclusively to the luminance ($L^*$) channel, enhancing glass reflections without distorting liquid color.
3. **Glass Clarity & Unsharp Masking**: High-frequency edge boosting sharpens bottle contours and fine label typography.
4. **Alpha Defringing**: Smooth anti-aliasing curve eliminates white halos and dark outlines around curved flacons.

---

## 3. Metadata Diagnostics in Database

Every generation writes comprehensive diagnostics into `stocks.info.imageGeneration`:
- `status`: `"publishing"` -> `"completed"`
- `aiModel`: `"u2net_onnx_local"`
- `apiCost`: `"$0.00"`
- `processingMethod`: `"local_studio_photometry"`
- `processingVersion`: `"2.0-local-photometry"`
- `transparencyStatus`: `"verified_transparent"`
- `width` / `height`: `1024` / `1024`
- `originalWidth` / `originalHeight` / `originalFileSize`: Original source image metrics
- `sharpness`: Laplacian variance of product silhouette
- `qualityStatus`: `"ok"`, `"low_source_quality"`, or `"low_sharpness"`
- `sourceImageId`: Short SHA-256 fingerprint of the supplier source URL

---

## 4. GitHub Actions Automation

- Workflow file: `.github/workflows/product-image-generation.yml`
- Runs scheduled checks or manual dispatches.
- Completely free of external Cloudflare AI quota limits or rotation secrets.
- Downloads and caches `u2net.onnx` (`SHA-256: 8d10d2f3bb75ae3b6d527c77944fc5e7dcd94b29809d47a739a7a728a912b491`).
- Commits generated 1024x1024 PNG files to `main` with automatic collision retries.

---

## 5. Privileged User Admin Panel

Accessible at `/privileged/product-image-queue`:
- **Local AI Dashboard**: Real-time monitoring of $0.00 API cost, local inference status, and throughput (~1.5s/image).
- **Side-by-Side Comparison Modal ("Сравнить с оригиналом")**: Inspect original Qogita packshots side-by-side with generated studio transparent PNGs against checkerboard or dark backdrops.
- **Batch Controls**: Start local generation batches (1 to 100,000) or gracefully stop global tasks.

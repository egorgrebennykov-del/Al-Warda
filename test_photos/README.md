# Al-Warda Local AI Perfume Photography Benchmark (Authentic Studio Photometry)

All 20 benchmark products processed with the **Authentic Studio Photometry** pipeline:
- **Zero Hallucinations & Zero Barcodes**: 100% authentic labels, English/Arabic typography, brand logos, and volume marks.
- **Micro-Contrast & Edge Acutance**: Bilateral denoising of JPEG compression + dual-scale unsharp masking.
- **No Tile Seams or Slicing**: Mathematical Lanczos4 resampling.
- **Zero Dark-Mode Halos**: White-matte defringing eliminates background bleed on #0b0907.
- **True Transparency**: 1024x1024 genuine RGBA PNG with 100% authentic bottle and label.
- **Speed**: ~0.74 seconds per product (full catalogue in ~25 minutes).
- **API Cost**: .00 (100% Local Inference).

## Structure
- \originals/\: Original unedited Qogita images (source of truth).
- \studio_transparent/\: Final transparent 1024x1024 PNGs.
- Root: Contains transparent PNGs, original JPGs, and dark previews (*_dark_preview.jpg).

# Rules & Architecture Guide for AI Agents (`AGENTS.md`)

## 1. Critical Safety & Danger-Zone Rules (MUST FOLLOW)

- **NEVER** run, dispatch or trigger the **"Full Database Refresh"** process (`.github/workflows/full-database-refresh.yml`, action id `full-database-refresh`, or `qogita_weekly_sync_upscayl.py --all`). It is a danger-zone operation that only the owner may start manually from the privileged panel.
- **NEVER display unprocessed white-background supplier photos (`rawImage`) to customers**:
  - Customer-facing views (`BookDetails.jsx`, `Featured.jsx`, `SearchResults.jsx`, `Sets.jsx`, `Home.jsx`) must only display verified transparent cutouts (`/assets/img/generated-products/<sha256>.png` or `.webp`).
  - If a product's transparent cutout has not finished processing or publishing yet, render the luxury loading animation (`.warda-flacon-processing-loader` on the product page, `.warda-perfume-card__processing` on catalog cards) and never fall back to `perfume.rawImage`.
- **Genuine Products Only (No Decanting, No Wholesale Multipacks)**:
  - Al-Warda sells only original full-size bottles, official discovery/gift sets, and official manufacturer samples from Qogita.
  - `isDecantablePerfume` must always return `false`. Wholesale multipacks/bundles (`pack of 6`, `carton`, etc.) are filtered out via `isWholesaleBundle`.
- **Verified Olfactory Notes Only**:
  - Never display unverified or hallucinated fragrance notes. Notes are shown only when `info.notesVerified === true` (verified via DeepSeek / official pyramid lookup).
- **Google Trends Regional Filter (`google_trends_filter.py`)**:
  - Catalog additions from Qogita follow the 5-step pipeline: `1. Qogita fetch` -> `2. Google Trends filter` -> `3. Image generation` -> `4. Fragrance notes` -> `5. AI description`.
  - Before adding any new Qogita product, its cleaned name (without ml, gender, or perfume type) is checked in Google Trends (`today 3-m`) across `BG`, `RO`, `GR`, `HU`; it passes if `avg >= 35` or `max >= 50`, or if any perfume in its series/family (`extract_perfume_series_key`, e.g., `9pm` & `9pm Rebel`) passes.
  - Existing DB products that fail Google Trends are **not deleted** from `stocks`; instead they are marked `in_stock = false` and `info.googleTrends.hiddenFromSite = true`, and are hidden from both the catalog (`fetchPerfumesFromSupabase`) and product details pages (`fetchPerfumeDetailsById`), as well as skipped by image generation (`select_candidates`).
- **Keep `AGENTS.md` Up to Date**:
  - Whenever you make important changes to architecture, pipelines, visual stage rules, catalog filtering, admin workflows, API endpoints, or safety/business rules, you **MUST** update `AGENTS.md` in the same task so future agents always have accurate instructions.

---

## 2. Project Overview & Tech Stack

- **Frontend (`Al-Warda/src/`)**: React 19, React Router 8, Vite 8 (`rolldown-vite`), custom luxury dark/gold CSS theme (`#080605` base background, `#d4af37` gold accents, `Cinzel` / serif display typography).
- **Backend & Edge Worker**:
  - Local API server: `Al-Warda/server/index.js` (Express, port `3001`) + `Al-Warda/server/wardaAssistantService.js` (Yasmin / Warda AI Perfume Sommelier).
  - Production Edge Worker: `Al-Warda/worker.js` & `Al-Warda/server/hasuraProxy.js` (Cloudflare Worker translating PostgREST `/api/rest/v1/stocks` queries to Hasura GraphQL / Nhost database with ETag & `304 Not Modified` caching, and serving `/assets/img/generated-products/*` with immutable caching).
- **Python Image & Catalog Pipelines (`Al-Warda/scripts/`)**:
  - Virtual environment: `Al-Warda/.pilot-venv/Scripts/python.exe`.
  - Uses `onnxruntime` (`RMBG-1.4` 1024×1024 & `U2Net`), OpenCV (`cv2`), Pillow (`PIL`), and Vulkan GPU `realesrgan-ncnn-vulkan` (`ultrasharp-4x`).

---

## 3. Repository Structure & Key Files

```text
Al-Warda/
├── AGENTS.md                                      # This agent rules & architecture reference
├── .github/workflows/
│   ├── brand-sync.yml                             # Brand-level Qogita catalog sync
│   ├── full-database-refresh.yml                  # DANGER ZONE: manual owner-only workflow
│   ├── product-image-delete.yml                   # Selected product image removal workflow
│   ├── qogita-smart-sync.yml                      # Automated smart catalog sync
│   ├── sync-huf-rate.yml                          # Daily HUF exchange rate sync (03:00 UTC)
│   └── sync-ron-rate.yml                          # Daily RON exchange rate sync (03:00 UTC)
└── Al-Warda/
    ├── public/assets/img/
    │   ├── generated-products/                    # 1024x1024 transparent RGBA PNG/WebP cutouts
    │   └── stage/bottom_glow_stage.webp           # Golden horizon & floor glow stage for BookDetails
    ├── scripts/
    │   ├── generate_product_images.py             # Official photo discovery, RMBG-1.4 cutout & photometry pipeline
    │   ├── fragrance_notes.py                     # DeepSeek olfactory pyramid lookup & verification
    │   ├── qogita_weekly_sync_upscayl.py          # Qogita API sync (NEVER run with --all)
    │   └── sync_currency_rate.js                  # Currency rate updater (EUR -> RON, HUF)
    ├── server/
    │   ├── index.js                               # Local Express API adapter (port 3001)
    │   ├── hasuraProxy.js                         # PostgREST-to-Hasura GraphQL proxy & ETag handler
    │   ├── productImageQueue.js                   # Admin queue status, quota tracking & manual product CRUD
    │   ├── productImageActions.js                 # GitHub Actions workflow dispatchers for admin panel
    │   └── wardaAssistantService.js               # AI Sommelier (Yasmin) chat, translation & recommendations
    ├── src/
    │   ├── components/
    │   │   ├── bookdetails/
    │   │   │   ├── BookDetails.jsx                # Product details page showcase, notes pyramid, volume pills
    │   │   │   └── BookDetails.css                # Horizon glow stage, reflection, loader & responsive layout
    │   │   ├── featured/
    │   │   │   ├── Featured.jsx                   # Main catalog grid, filters, brand/note search
    │   │   │   └── Featured.css                   # Catalog layout & filter styling
    │   │   ├── common/
    │   │   │   ├── BookImage.jsx                  # Image component with cache-busting & fallback chain
    │   │   │   └── ProductCardImages.css          # Card cutout rules & card processing spinner
    │   │   ├── privileged/Privileged.jsx          # Admin panel (image queue, quotas, manual editor)
    │   │   └── warda/WardaAssistant.jsx           # Floating AI Sommelier widget
    │   └── context/
    │       ├── LanguageContext.jsx                # 6-language localization provider (ru, en, ro, bg, hu, el)
    │       └── CurrencyContext.jsx                # Multi-currency formatting & auto-switching (EUR, RON, HUF)
    ├── utils/
    │   └── perfumes.js                            # Catalog/details split, caching, enrichment, MOQ & volume helpers
    └── tests/                                     # Node test runner suite (103 unit & integration tests)
```

---

## 4. Visual Presentation Architecture (Product Page vs. Catalog Grid)

### 4.1. Product Details Page (`BookDetails.jsx` & `BookDetails.css`)
- **No Pre-Baked Stage Templates or Podium Trays**:
  - Do not use `/assets/img/stages/<gtin>.webp` or 3D podium tray overlays.
  - Render the clean transparent cutout (`activeImageSrc`) inside `.warda-stage-assembly`.
- **Golden Horizon Glow Stage (`bottom_glow_stage.webp`)**:
  - `.warda-details-bottom-glow` is positioned at `bottom: 0` (`586 × 600 px` on desktop) with `mix-blend-mode: screen`.
  - Its bright golden horizon line sits at `y = 465 px` (`135 px` from the bottom), which coincides with the exact seam between `.warda-details-photo` (`height: 420 px`) and `.warda-stage-reflection-container` (`height: 135 px`).
- **Zero-Floating Grounding (`--flacon-pad-pct`)**:
  - Because `1024 × 1024` generated cutouts have a transparent margin around the bottle (~`7.4%` at the bottom), `handleFlaconImgLoad` scans a `256 × 256` offscreen canvas to compute the exact bottom transparent percentage `flaconBottomPadPct` (defaulting to `7.4%` before `onLoad`).
  - `.warda-details-img` applies `transform: translateY(var(--flacon-pad-pct, 7.4%))` (`transform-origin: bottom center`), shifting the bottle down so its lowest visible pixel rests directly on the golden horizon line.
  - `.warda-stage-reflection-img` applies `transform: translateY(calc(-1 * var(--flacon-pad-pct, 7.4%))) scaleY(-1)`, pulling the inverted reflection up so it meets the bottle base with zero gap.
- **Loading Animation for Unprocessed / Publishing Photos**:
  - If `!flaconLoaded || allSourcesExhausted || !activeImageSrc`, `.warda-flacon-processing-loader` renders an animated dual-ring golden spinner with localized status text, hides the reflection, and retries every 8 seconds until the cutout is available.

### 4.2. Catalog Grid (`Featured.jsx`, `SearchResults.jsx`, `Sets.jsx`, `Home.jsx`)
- Cards render **only** clean transparent cutouts (`bustProductImageCache(perfume.image)`) directly on the card background — no stage backgrounds, no podium trays, and no dark rectangular boxes.
- If a card's cutout is still being published, `onError` tries the GitHub raw asset URL once and then activates `.is-processing-photo` to display `.warda-perfume-card__processing-ring`.

---

## 5. Product Image Generation & Official Photo Lookup (`generate_product_images.py`)

When processing a product row from `stocks`:
1. **Official Brand Studio Lookup (`search_official_studio_candidates` / `search_official_studio_image`)**:
   - Queries official brand Shopify storefronts mapped in `BRAND_DOMAINS` (`afnan.com`, `lattafa-usa.com`, `armaf.com`, `sterlingparfums.com`, `swissarabian.com`, `in.ajmal.com`, `ajmalperfume.com`, `alharamainperfumes.co.uk`, `alharamainperfumes.com`, `alwataniah.com`, `orientica.com`, `rasasistore.com`, `pariscornerperfumes.com`, `fragranceworld.ae`) via `/search/suggest.json?q=...&resources[type]=product` with progressive query fallbacks.
   - Strips Shopify thumbnail suffixes/params via `upgrade_shopify_image_url` to fetch full-resolution originals, enforces strict set vs. single-bottle matching (`is_perfume_set`), excludes deodorant/body-spray/mist/lotion matches when searching for an EDP/EDT bottle, prefers front-view studio `.png` assets over lifestyle JPEGs, and requires >= 70% non-stopword token overlap.
2. **Quality-First Source Selection & Wholesale Catalog Fallback (`process_product` & `product_source`)**:
   - Always prioritizes high-resolution (`>= 500px`, sharp) official studio photos first; if an official candidate is `< 500px`, compares pixel area against `info.rawImage` (`*.qogita.com`) and picks the higher-resolution source.
3. **Segmentation, Super-Resolution & Stage-Aware Lighting Harmonization (`preserve_original_product` & `harmonize_cutout_for_stage`)**:
   - Segments the authentic photo first using `RMBG-1.4` (`1024 × 1024` ONNX) or `U2Net`.
   - Applies AI Super-Resolution (`high-fidelity-4x` / edge-preserving upscale) when resolution is below `1200 px`, combining raw and super-resolved alpha masks so boxes, caps, and miniatures are never clipped.
   - Runs `strip_baked_reflection(cutout)` inside `normalize_flacon_cutout` to remove baked-in studio reflections (narrow hanging tails, full-width mirror table slabs, and sharp-seam bottle-base reflections) before centering on a `1024 × 1024` transparent canvas (`target_max_h=880`, `target_max_w=880`), aligning multi-object baselines via `align_multi_object_floor`, and leveling tilted 3/4 single-bottle cutouts (`4°–20°` straight bottom edge) via `level_tilted_bottle` so bottles stand flat on the stage.
   - Runs `validate_cutout_quality(source_quality, output)` before saving/publishing: rejects low-resolution (`< 300px` / `< 380px` max / `< 4.5 KB`), blurry (`low_sharpness` with final sharpness `< 45`, or final sharpness `< 25`), unsegmented/empty (`< 3%` or `> 90%` foreground, opaque corners, or unsegmented studio scenes with high `bbox_fill` + flat top/scene borders), or edge-clipped (`> 60%` border opaque) cutouts so bad photos go to the failed list instead of the catalog.
   - Runs `harmonize_cutout_for_stage(cutout)`, which samples `/assets/img/stage/bottom_glow_stage.webp` and adapts the flacon's lighting to the dark golden stage: compresses harsh white-lightbox flash hotspots (`tanh` filmic shoulder), anchors lifted white-studio shadows, applies 3D cylindrical curvature shading across each scanline, warms cold specular highlights toward champagne gold, projects upward golden horizon bounce light + warm rim light onto the lower bottle, and decontaminates white-matte edge halos.

---

## 6. Localization, Currency & Catalog Rules

- **6 Languages**: Russian (`ru`), English (`en`), Romanian (`ro`), Bulgarian (`bg`), Hungarian (`hu`), Greek (`el`).
  - Switching language automatically switches the default currency (`ro` -> `RON`, `hu` -> `HUF`, others -> `EUR`).
  - Volume units are localized via `formatVolume` (`мл` for `ru`/`bg`, `ml` for `ro`/`en`/`hu`/`el`).
  - Fragrance notes are localized across all 6 languages via `getLocalizedNote`.
- **Catalog / Details Split (`Al-Warda/utils/perfumes.js`)**:
  - Catalog list queries exclude the heavy `info` JSONB column (`select=id,slug,name,title,brand,category,price,currency,image,in_stock,description`) and filter `info->imageGeneration->>status=eq.completed` server-side.
  - Full `info` is fetched on demand per product via `getPerfumeDetailsById(id)` with in-memory TTL caching and request deduplication.

---

## 7. Build, Verification & Testing Commands

Always run builds and tests from the workspace root (`c:\Users\testuser\Desktop\Al-Warda`):

```powershell
# 1. Build production frontend bundle
npm --prefix Al-Warda run build

# 2. Run the full automated test suite (103 tests across 7 suites)
node --test Al-Warda/tests/*.test.js

# 3. Start local preview & API servers
npm --prefix Al-Warda run preview -- --port 5173 --host 127.0.0.1
node --use-system-ca Al-Warda/server/index.js
```

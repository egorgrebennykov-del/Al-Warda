# Supabase Egress Optimization Report — Catalog / Details Split

## Goal
Reduce the **bytes** transferred from Supabase (egress), not just the number of
HTTP requests. The previous catalog query fetched the whole `info` JSONB for
every row. This change stops loading `info` for the catalog and loads it on
demand, per product.

## What changed

### 1. Catalog is now "light" — no more full `info`

File: `utils/perfumes.js`

Before:

```
select=id,name,brand,image,info
```

After:

```
select=id,slug,name,title,brand,category,price,currency,image,in_stock,description
```

The `info` JSONB (notes, descriptions, gender, longevity, sillage,
imageGeneration history, rawImage, minOrderQuantity, gtin, …) is **no longer
fetched** for the catalog.

The completed-image filter stays server-side via PostgREST:

```
info->imageGeneration->>status=eq.completed
```

so the client no longer needs `info` to decide whether a product is "photo
ready".

### 2. Light row mapping

New `mapStockRowLight(r)` builds the same perfume object shape but with:

- `image` / `fullCardImage` from the **top-level `image` column** (the image
  pipeline already writes the generated image there);
- `price`, `currency`, `category`, `description`, `in_stock` from top-level
  columns (these were previously read from `info` or — for price — never
  actually selected at all);
- `volume` still derived from the product name;
- a tiny `info` stub `{ imageGeneration: { status: "completed", imageUrl } }`
  so `hasCompletedGeneratedImage()` keeps working without the full JSONB;
- empty notes (`notesVerified: false`), default gender/longevity/sillage,
  `minOrderQuantity: 1`, `gtin: null` — these are filled in by the details
  fetch on the product page;
- marker `isLight: true`.

### 3. On-demand product details

New functions in `utils/perfumes.js`:

- `getPerfumeDetailsById(id)` — fetches `select=id,name,brand,image,info` for
  **one** product and maps it with the full logic (`mapStockRowRich`, the
  original rich mapping).
- `fetchPerfumeDetailsById(id)` — the raw single-row fetch.
- `invalidatePerfumeDetailsCache(id?)` — cache invalidation.

`BookDetails.jsx` now calls `getPerfumeById(targetId)` (light, cached catalog),
then, only when the object is `isLight`, calls `getPerfumeDetailsById(p.id)` to
load the full `info` for that single product.

### 4. Details cache

- Key: product id.
- TTL: `DETAILS_TTL_MS` = 15 minutes.
- In-flight dedup: concurrent calls for the same id share one Promise
  (`detailsInflight` Map).
- On success the rich object **replaces** the light entry in
  `memoryPerfumesCache`, so later `getCachedPerfumes()`/`getPerfumes()` reuse
  the full object without another request.
- On error nothing is cached, so a later call can retry.
- Cache is per-id; loading one product never clears the rest.

## Fields loaded in the catalog now

`id, slug, name, title, brand, category, price, currency, image, in_stock, description`

## When details are loaded

Only when the product page opens (or any future caller of
`getPerfumeDetailsById`). No mass per-product fetch happens for list/search
rendering.

## Which changes cut requests vs. bytes

- **Requests:** the catalog still uses the same paginated flow (1000 rows/page)
  and TTL, so request count is unchanged by this split; the details fetch adds
  **one** extra request only on the product page.
- **Bytes:** this is the real win — the per-row `info` JSONB (typically several
  KB with notes, descriptions, generation history, raw Qogita image URL) is no
  longer sent for ~5000 rows on every catalog load. Details are sent only for
  the one opened product.

## What was checked

- `npm run build` — passes.
- `node --check` on changed files — passes.
- `node --test` — 85 pass, 1 fail (`pushMainWithRetry.test.js`, a pre-existing
  git/bash environment failure unrelated to DB access).
- `tests/perfumeReadiness.test.js` was **updated** to the new contract: the
  client trusts the server-side completed-image filter and uses the top-level
  image column. It now verifies the catalog returns rows with the generated
  top-level image.

## Verified consumers

- Home / Featured / Sets / Search / SearchResults — use light fields only
  (name, brand, price, image, category, volume) and keep working.
- BookDetails — loads full details on demand; notes/description/longevity/
  sillage still shown.
- Cart / Checkout — use `id, name, price, image, url`, all present in light
  objects.
- Admin panel — unaffected; it reads `stocks` through the server
  (`fetchAllStocks`, which still selects `info` because the admin queues
  genuinely need it), not through the client catalog.

## Known limitations / remaining risks

1. **Search by notes** on the catalog page no longer matches, because notes live
   in `info` and are not part of the light catalog. Search by name, brand,
   category and description still works.
2. **Min-order filtering** (`applyMinOrderFilter`) treats every light product as
   `minOrderQuantity: 1`. With the default min-order settings
   (`minOrderFrom/minOrderTo = 0`) there is no filtering, so this has no visible
   effect today. If the admin enables min-order ranges, a top-level
   `minOrderQuantity` column or a details fetch would be required.
3. **GTIN / dropshipId** are `null` in the light catalog. Stock products do not
   use GTIN-based URLs (`getPerfumeUrl` is name+id based), so this is currently
   cosmetic; dropship products come from a separate endpoint and are unaffected.
4. Supabase currently returns **402 `exceed_egress_quota`**, so no live
   before/after byte measurements could be taken from the dashboard. The egress
   reduction here is architectural (dropping a large JSONB from the catalog
   payload), not a measured percentage.

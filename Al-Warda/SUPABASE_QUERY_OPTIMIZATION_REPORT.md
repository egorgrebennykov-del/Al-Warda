# Supabase Query Optimization Report — Al-Warda

## 0. Important context

During the audit, a direct probe against Supabase returned:

```
HTTP 402 {"message":"Service for this project is restricted due to the following
violations: exceed_egress_quota. The project owner must upgrade their plan or
remove spend caps to restore service."}
```

This means the project has already exceeded the free **egress** quota, so the
database is currently throttled. All measurements below are therefore
**client-side load estimates** (number of requests the frontend/Worker would
issue), not figures read from the Supabase dashboard. No claim of a precise
"percentage saved" is made.

---

## 1. Problems found (full audit)

### Storefront catalog — highest impact

- `utils/perfumes.js#fetchPerfumesFromSupabase` paginated `stocks` with
  `pageSize = 200`, causing ~25 round-trips for ~5000 rows.
- `Featured.jsx`, `Sets.jsx`, `BookDetails.jsx` each ran a **full catalog
  refetch (`refresh: true`) every 30 s** while their page was open.
- No TTL on the in-memory catalog cache: it lived forever until a full page
  reload, and nothing prevented a refetch from a hidden tab.
- `fetchMinOrderSettings()` was re-fetched whenever a caller passed
  `refresh: true` (the 30 s pollers), even though min-order settings change
  almost never.

### Admin panel

- `server/productImageQueueAdmin.js#fetchAllStocks` paginated with
  `pageSize = 500`.
- Every privileged API call ran a `user` table lookup
  (`requirePrivilegedUser`), with no caching.
- `Privileged.jsx` polled Git Action statuses every 2 s and the full inquiries
  list every 4 s, even when the relevant section was not open.
- After the tabs became keep-mounted, `ProductImageQueue` kept polling
  `status` + `runs` every 15–45 s even when the images sub-tab was inactive.

### Header / notifications

- `Header.jsx` polled unread counters every 15 s with `setInterval`.
- `utils/inquiries.js#fetchUserInquiry` used `select=*` for a query whose only
  consumer needs `notifications_user`.

### Announcements

- `utils/announcements.js` used `select=*` in both the active and admin fetches.

### Auth / profile

- `utils/auth.js#getProfile` had no cache and no in-flight dedup; several
  components (`Checkout`, `MessengerModal`, `Testimonial`, `Privileged`,
  `AuthContext`) each fetched the profile independently on mount.

### Cart

- `utils/cart.js#addToCart` performs `SELECT` (find existing) then
  `PATCH` (increment) or `POST` (insert). This cannot be made atomic without a
  schema change (see section 6).

---

## 2. Files changed

| File                                                     | Change                                                                                                                                                                                                                |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `utils/perfumes.js`                                      | `pageSize` 200→1000; added configurable `CATALOG_TTL_MS` (10 min); catalog refetch skips when `document.visibilityState === "hidden"`; `catalogCacheTime` set on success.                                             |
| `src/components/featured/Featured.jsx`                   | Removed 30 s `refresh: true` interval (initial load only).                                                                                                                                                            |
| `src/components/sets/Sets.jsx`                           | Removed 30 s `refresh: true` interval (initial load only).                                                                                                                                                            |
| `src/components/bookdetails/BookDetails.jsx`             | Removed 30 s `getPerfumeById(..., {refresh:true})` interval (initial load only).                                                                                                                                      |
| `server/productImageQueueAdmin.js`                       | `fetchAllStocks` `pageSize` 500→1000; added shared `allStocksCache` (20 s TTL) + `invalidateAllStocksCache()`; added `privilegedUserCache` (60 s TTL) in `requirePrivilegedUser` + `invalidatePrivilegedUserCache()`. |
| `server/descriptionQueue.js`                             | `invalidateDescriptionItemsCache()` now also clears `allStocksCache`.                                                                                                                                                 |
| `src/components/privileged/Privileged.jsx`               | Git status poll 2 s→5 s (only on the git section); inquiries poll 15 s while on the inquiries section, 60 s otherwise; `ProductImageQueue` now receives `active={subTab==="images"}`.                                 |
| `src/components/privileged/ProductImageQueue.jsx`        | Added `active` prop; polling effect early-returns when inactive.                                                                                                                                                      |
| `src/components/header/Header.jsx`                       | Removed `setInterval` polling; unread refresh now happens on mount, on the in-app `warda-inquiries-updated` event, and on `visibilitychange`/`focus`.                                                                 |
| `src/components/messenger/MessengerModal.jsx`            | Chat poll 3.5 s→5 s (kept: required for live replies).                                                                                                                                                                |
| `utils/inquiries.js`                                     | `fetchUserInquiry` `select=*` → `select=id,notifications_user`.                                                                                                                                                       |
| `utils/announcements.js`                                 | `select=*` → explicit column list in `fetchActiveAnnouncements` and `fetchAllAnnouncementsAdmin`.                                                                                                                     |
| `utils/auth.js`                                          | `getProfile` now cached 60 s + in-flight dedup (`invalidateProfileCache()`); `logout()` invalidates it.                                                                                                               |
| `tests/productImageQueueAdmin.test.js`                   | Clears `allStocksCache` + `privilegedUserCache` in `afterEach`.                                                                                                                                                       |
| `src/components/privileged/ProductManualConfigModal.jsx` | Restored a missing `const handleFetchNotes = async () => {` declaration (was breaking the build).                                                                                                                     |

---

## 3. Requests removed or merged

- Full-catalog refetch every 30 s on Featured / Sets / product page — **removed**
  (initial load only).
- Header unread polling every 15 s — **removed** (event + focus/visibility driven).
- ProductImageQueue polling while inactive — **removed** (gated on active tab).
- Profile fetch duplication across components — **merged** (60 s cache + shared
  in-flight promise).
- Announcements duplicate loads between `App.jsx` and `Home.jsx` — already
  deduplicated by the existing 2 min cache; SELECT narrowed.

---

## 4. Polling intervals changed

| Poll                            | Before         | After                              |
| ------------------------------- | -------------- | ---------------------------------- |
| Git Actions status (Privileged) | 2 s            | 5 s, only on git section           |
| Inquiries list (Privileged)     | 4 s            | 15 s on section / 60 s off-section |
| ProductImageQueue status+runs   | 15–45 s always | only while tab active              |
| Header unread                   | 15 s           | no timer (event/focus/visibility)  |
| Messenger chat                  | 3.5 s          | 5 s (kept for live chat)           |

---

## 5. TTLs introduced

| Cache                               | Scope                            | TTL                                      |
| ----------------------------------- | -------------------------------- | ---------------------------------------- |
| Catalog (`memoryPerfumesCache`)     | client, in-memory                | `CATALOG_TTL_MS` = 10 min (configurable) |
| Profile (`getProfile`)              | client, in-memory                | 60 s                                     |
| Full stocks scan (`allStocksCache`) | server/Worker                    | 20 s                                     |
| Privileged user check               | server/Worker                    | 60 s                                     |
| Min-order settings                  | client, in-memory                | 60 s (pre-existing)                      |
| Active announcements                | client, in-memory + localStorage | 2 min (pre-existing)                     |

All in-memory caches are invalidated on the relevant mutation path
(`invalidateAllStocksCache`, `invalidatePrivilegedUserCache`,
`invalidateDescriptionItemsCache`, `invalidateProfileCache`,
`invalidateAnnouncementsCache`). A failed request never overwrites an existing
working cache (the catalog and profile caches only write on success; on error
callers fall back to the previous cache value).

---

## 6. What was left unchanged and why

### Cart is still `SELECT` + `PATCH`/`POST`

`public.cart` has **no unique constraint** on `(user_id, link)` (verified in
`supabase_schema.sql`). PostgREST upsert (`Prefer: resolution=merge-duplicates`)
and atomic `quantity = quantity + N` both require an `ON CONFLICT` target, i.e.
a unique index. Adding one is a **schema change** that could fail on existing
duplicate rows and was explicitly excluded by the task constraints ("не менять
структуру таблицы без проверки"). The current two-step flow was left intact;
the SELECT is already minimal
(`id,quantity,link,title,price,image`). Recommendation for a future PR: add
`unique (user_id, link)` after deduplicating existing rows, then switch to a
single PostgREST upsert.

### `select=*` remaining

- `fetchAllInquiries` / `fetchInquiryById` / admin announcements need the full
  row (chat, interlocutors, localized content).
- The catalog SELECT (`id,name,brand,image,info`) was already column-specific;
  `info` is the large JSONB and is genuinely used by card rendering (notes,
  description, category, volume, min-order). Splitting "list fields" from
  "detail fields" was not done because many list components read `info`-derived
  values and removing them would risk breaking cards. Documented as future work.

### Messenger chat poll (5 s)

Kept on purpose: it is the mechanism that shows the admin's replies in the open
chat without a page reload. Replacing it with Realtime/WebSockets is a larger
architectural change and was out of scope.

### Qogita dropship catalog

`includeDropship` still defaults to `true` because search and catalog pages can
show dropship-only products. It is fetched once and cached in memory; subsequent
pages reuse the cache, so there is no repeated loading.

---

## 7. Test results

- `node --check` passes on all edited server/util files.
- `npm run build` (production) passes.
- `node --test` full suite: **85 pass, 1 fail**.
  - The single failure is `pushMainWithRetry.test.js` (a git/bash script test),
    which fails in this Windows environment for reasons unrelated to DB access.
  - `productImageQueueAdmin.test.js` + `productImageActions.test.js` pass
    (13/13) after adding cache invalidation to `afterEach`.

No automated measurements were recorded before the changes (the task reached me
after several optimization passes had already been applied in this session), so
a numeric "before" snapshot is not available. The client-side request model is
summarized in section 4.

---

## 8. Remaining risks / recommendations

1. **Egress is the binding constraint, not request count.** The biggest single
   win is reducing transferred bytes: the catalog currently sends the full
   `info` JSONB for every row. Moving rarely-used `info` fields (notes,
   descriptions, imageGeneration history) into a separate table or a separate
   per-product detail endpoint would cut egress far more than request-count
   tweaks.
2. **Cart upsert** — create `unique (user_id, link)` (after dedup) and use a
   single PostgREST upsert / RPC.
3. **Realtime** — for inquiries/chat, Supabase Realtime would eliminate the
   remaining polling, but requires the feature enabled and careful
   subscribe/unsubscribe handling.
4. **Catalog persistence** — a versioned sessionStorage/IndexedDB snapshot of
   card-only fields would avoid the full catalog fetch on every hard page
   reload, but must include a freshness check and was not implemented to avoid
   stale-data risk.

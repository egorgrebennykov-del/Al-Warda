-- verify_keys.sql — missing/duplicate keys and orphan references.
-- Run on the Nhost copy after restore. All queries must return zero rows.
-- Usage: psql "$NHOST_DB_URL" -f tools/verify_keys.sql

-- 1. Duplicate primary keys (should be none).
SELECT 'stocks.dup_id' AS check, id FROM public.stocks GROUP BY id HAVING count(*) > 1;
SELECT 'user.dup_id'   AS check, id FROM public."user" GROUP BY id HAVING count(*) > 1;

-- 2. Orphaned logical references (application-level FKs, no DB constraint).
SELECT 'cart.orphan_user' AS check, c.id
FROM public.cart c LEFT JOIN public."user" u ON c.user_id = u.id
WHERE c.user_id IS NOT NULL AND u.id IS NULL;

SELECT 'orders.orphan_user' AS check, o.id
FROM public.orders o LEFT JOIN public."user" u ON o.user_id = u.id
WHERE o.user_id IS NOT NULL AND u.id IS NULL;

SELECT 'orders_in_progress.orphan_user' AS check, p.id
FROM public.orders_in_progress p LEFT JOIN public."user" u ON p.user_id = u.id
WHERE p.user_id IS NOT NULL AND u.id IS NULL;

SELECT 'inquiries.orphan_user' AS check, i.id
FROM public.inquiries i LEFT JOIN public."user" u ON i.user_id = u.id
WHERE i.user_id IS NOT NULL AND u.id IS NULL;

SELECT 'feedbacks.orphan_user' AS check, f.id
FROM public.feedbacks f LEFT JOIN public."user" u ON f.user_id = u.id
WHERE f.user_id IS NOT NULL AND u.id IS NULL;

-- 3. Broken declared foreign key (perfumes.category -> categories.id).
SELECT 'perfumes.orphan_category' AS check, p.id
FROM public.perfumes p LEFT JOIN public.categories c ON p.category = c.id
WHERE c.id IS NULL;

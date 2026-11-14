-- verify_counts.sql — row counts per table.
-- Run on BOTH Supabase and Nhost and diff the output.
-- Usage: psql "$DB_URL" -f tools/verify_counts.sql

SELECT 'categories'            AS tbl, count(*) FROM public.categories
UNION ALL SELECT 'perfumes',   count(*) FROM public.perfumes
UNION ALL SELECT 'cart',       count(*) FROM public.cart
UNION ALL SELECT 'orders',     count(*) FROM public.orders
UNION ALL SELECT 'orders_in_progress', count(*) FROM public.orders_in_progress
UNION ALL SELECT 'reviews',    count(*) FROM public.reviews
UNION ALL SELECT 'inquiries',  count(*) FROM public.inquiries
UNION ALL SELECT 'feedbacks',  count(*) FROM public.feedbacks
UNION ALL SELECT 'coupons',    count(*) FROM public.coupons
UNION ALL SELECT 'announcements', count(*) FROM public.announcements
UNION ALL SELECT 'stocks',     count(*) FROM public.stocks
UNION ALL SELECT 'user',       count(*) FROM public."user"
ORDER BY tbl;

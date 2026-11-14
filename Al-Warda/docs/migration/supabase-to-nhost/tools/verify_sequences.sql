-- verify_sequences.sql — ensure every serial sequence is ahead of the max id.
-- Run on the Nhost copy after restore. No rows should be returned.
-- Usage: psql "$NHOST_DB_URL" -f tools/verify_sequences.sql

SELECT 'perfumes.seq_behind' AS check
WHERE (SELECT last_value FROM public.perfumes_id_seq) <
      (SELECT COALESCE(max(id),0) FROM public.perfumes)
UNION ALL
SELECT 'cart.seq_behind'
WHERE (SELECT last_value FROM public.cart_id_seq) <
      (SELECT COALESCE(max(id),0) FROM public.cart)
UNION ALL
SELECT 'orders.seq_behind'
WHERE (SELECT last_value FROM public.orders_id_seq) <
      (SELECT COALESCE(max(id),0) FROM public.orders)
UNION ALL
SELECT 'reviews.seq_behind'
WHERE (SELECT last_value FROM public.reviews_id_seq) <
      (SELECT COALESCE(max(id),0) FROM public.reviews)
UNION ALL
SELECT 'inquiries.seq_behind'
WHERE (SELECT last_value FROM public.inquiries_id_seq) <
      (SELECT COALESCE(max(id),0) FROM public.inquiries);
-- NOTE: sequence names above assume default naming; adjust to the live schema
-- dump (pg_get_serial_sequence is safer, see import_nhost.sh).

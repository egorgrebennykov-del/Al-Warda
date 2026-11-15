insert into storage.buckets (id, name, public)
values ('product-images', 'product-images', true)
on conflict (id) do update set public = excluded.public;

update public.stocks
set info = jsonb_set(
  coalesce(info, '{}'::jsonb),
  '{imageGeneration}',
  '{"status":"pending"}'::jsonb,
  true
)
where coalesce(jsonb_typeof(info), 'object') = 'object'
  and info ? 'rawImage'
  and coalesce(info -> 'imageGeneration' ->> 'status', '') not in ('completed', 'processing', 'failed');

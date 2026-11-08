create or replace function public.update_stock_image_if_unchanged(
  p_id text,
  p_expected_info jsonb,
  p_expected_image text,
  p_info jsonb,
  p_image text
) returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  updated_count integer;
begin
  update public.stocks
  set info = p_info::json, image = p_image
  where id::text = p_id
    and info::jsonb is not distinct from p_expected_info
    and image is not distinct from p_expected_image;
  get diagnostics updated_count = row_count;
  return updated_count = 1;
end;
$$;

revoke all on function public.update_stock_image_if_unchanged(text, jsonb, text, jsonb, text) from public, anon, authenticated;
grant execute on function public.update_stock_image_if_unchanged(text, jsonb, text, jsonb, text) to service_role;

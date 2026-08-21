-- Follow-up: community-created stores start as pending_review and must be
-- reportable immediately (the inline creation flow reports right after).
-- Moderation can still reject them later.

create or replace function public.submit_report(
  p_store_id     uuid,
  p_product_id   uuid,
  p_availability text,
  p_price_cup    integer default null,
  p_comment      text    default null,
  p_device_hash  text    default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_report_id uuid;
  v_daily     int;
  v_last_at   timestamptz;
begin
  if p_device_hash is null or char_length(btrim(p_device_hash)) = 0 then
    return jsonb_build_object('ok', false, 'error', 'invalid_device');
  end if;

  if p_availability not in ('available','out_of_stock') then
    return jsonb_build_object('ok', false, 'error', 'invalid_availability');
  end if;

  if not exists (
    select 1 from stores
    where id = p_store_id and status in ('active','pending_review')
  ) then
    return jsonb_build_object('ok', false, 'error', 'unknown_store');
  end if;

  if not exists (select 1 from products where id = p_product_id and active = true) then
    return jsonb_build_object('ok', false, 'error', 'unknown_product');
  end if;

  select count(*) into v_daily
  from reports
  where device_hash = p_device_hash
    and created_at > now() - interval '24 hours';
  if v_daily >= 10 then
    return jsonb_build_object('ok', false, 'error', 'rate_limit_daily');
  end if;

  select max(created_at) into v_last_at
  from reports where device_hash = p_device_hash;
  if v_last_at is not null and v_last_at > now() - interval '60 seconds' then
    return jsonb_build_object('ok', false, 'error', 'rate_limit_interval');
  end if;

  -- Exact duplicate guard: treat as success so the client outbox can flush.
  if exists (
    select 1 from reports
    where device_hash = p_device_hash
      and store_id  = p_store_id
      and product_id = p_product_id
      and created_at > now() - interval '30 minutes'
  ) then
    return jsonb_build_object('ok', true, 'duplicate', true);
  end if;

  insert into reports (store_id, product_id, device_hash, availability, price_cup, comment)
  values (p_store_id, p_product_id, p_device_hash, p_availability, p_price_cup, nullif(btrim(coalesce(p_comment,'')), ''))
  returning id into v_report_id;

  return jsonb_build_object('ok', true, 'report_id', v_report_id);
end;
$$;

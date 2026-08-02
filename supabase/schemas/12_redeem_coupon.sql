-- redeem_coupon: atomic, idempotent-per-user coupon redemption.
-- Lives in `public` (not `private`) because this project has no direct
-- Postgres connection for server code to call private-schema functions —
-- only the service-role PostgREST client is available, so this must be in
-- an API-exposed schema. EXECUTE is restricted to service_role below, so it
-- is only reachable through app/api/cupons/redeem (which authenticates the
-- caller and supplies p_user_id from the session, never from client input).
create or replace function public.redeem_coupon(p_code text, p_user_id uuid)
returns table (ok boolean, message text, credits integer)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_coupon public.credit_coupons%rowtype;
begin
  select * into v_coupon
  from public.credit_coupons
  where code = upper(trim(p_code))
  for update;

  if not found then
    return query select false, 'coupon_not_found', null::integer;
    return;
  end if;

  if not v_coupon.is_active then
    return query select false, 'coupon_inactive', null::integer;
    return;
  end if;

  if v_coupon.expires_at is not null and v_coupon.expires_at < now() then
    return query select false, 'coupon_expired', null::integer;
    return;
  end if;

  if v_coupon.max_redemptions is not null and v_coupon.redemptions_count >= v_coupon.max_redemptions then
    return query select false, 'coupon_exhausted', null::integer;
    return;
  end if;

  begin
    insert into public.coupon_redemptions (coupon_id, user_id, credits)
      values (v_coupon.id, p_user_id, v_coupon.credits);
  exception when unique_violation then
    return query select false, 'already_redeemed', null::integer;
    return;
  end;

  update public.credit_coupons
    set redemptions_count = redemptions_count + 1
    where id = v_coupon.id;

  return query select true, null::text, v_coupon.credits;
end;
$$;

revoke execute on function public.redeem_coupon(text, uuid) from public, anon, authenticated;
grant execute on function public.redeem_coupon(text, uuid) to service_role;

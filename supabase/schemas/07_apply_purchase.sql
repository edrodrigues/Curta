-- apply_purchase: atomic, idempotent credit RPC for InfinitePay webhook
-- Build guide §3.3 / §6
-- Invoked from the infinitepay-webhook Edge Function with the service-role client.
-- SECURITY INVOKER; lives in non-exposed schema `private`.

create or replace function private.apply_purchase(
  p_order_nsu text,
  p_paid_amount integer,
  p_invoice_slug text default null
)
returns table (ok boolean, message text)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
begin
  -- locate the order
  select * into v_order
  from public.orders
  where order_nsu = p_order_nsu
  for update;

  if not found then
    return query select false, 'order_not_found';
    return;
  end if;

  -- idempotency: reject re-processing a paid order
  if v_order.status = 'paid' then
    return query select true, 'already_paid';
    return;
  end if;

  -- validate the paid amount matches the order amount (build guide §13)
  if p_paid_amount is null or p_paid_amount <> v_order.amount_cents then
    update public.orders
      set status = 'failed', infinitepay_invoice_slug = coalesce(p_invoice_slug, infinitepay_invoice_slug)
      where id = v_order.id;
    return query select false, 'amount_mismatch';
    return;
  end if;

  -- mark order paid
  update public.orders
    set status = 'paid',
        paid_at = now(),
        infinitepay_invoice_slug = coalesce(p_invoice_slug, infinitepay_invoice_slug)
    where id = v_order.id;

  -- credit the wallet
  update public.credit_wallets
    set balance = balance + coalesce(
      (select credits from public.credit_packages where slug = v_order.package_slug),
      v_order.amount_cents / 2500  -- fallback: R$25 per credit if no matching package
    )
    where user_id = v_order.user_id;

  -- record the transaction
  insert into public.credit_transactions (user_id, delta, reason, related_order_nsu)
    values (v_order.user_id,
      coalesce(
        (select credits from public.credit_packages where slug = v_order.package_slug),
        v_order.amount_cents / 2500
      ),
      'purchase',
      v_order.order_nsu);

  return query select true, null::text;
end;
$$;
-- handle_new_user: atomic signup bonus of 2 credits
-- Build guide §3.2
-- SECURITY DEFINER; lives in non-exposed schema `private` so it isn't exposed via the Data API.
-- See the comment above the function for why SECURITY DEFINER is required here.

create schema if not exists private;

grant usage on schema private to postgres, anon, authenticated, service_role;
-- prevent anon/authenticated from executing private routines by default
revoke all on schema private from anon, authenticated;

-- SECURITY DEFINER + search_path='' is the canonical Supabase pattern for
-- on_auth_user_created: the Auth DB role that fires the trigger lacks
-- INSERT on the RLS-protected, postgres-owned application tables, and an
-- auth.uid()-gated INSERT policy cannot pass at signup (no session yet).
-- Running as the postgres owner (bypassrls) is the documented fix; the
-- function lives in the non-exposed `private` schema (USAGE revoked
-- below), so it is not reachable via the Data API. Table refs are
-- fully-qualified and search_path is empty to prevent hijacking.
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, name)
  values (new.id, coalesce(new.raw_user_meta_data->>'name', ''));

  insert into public.credit_wallets (user_id, balance)
  values (new.id, 2);

  insert into public.credit_transactions (user_id, delta, reason)
  values (new.id, 2, 'signup_bonus');

  return new;
end;
$$;

alter function private.handle_new_user() owner to postgres;

revoke all on function private.handle_new_user() from public, anon, authenticated;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();
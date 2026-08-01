-- handle_new_user: atomic signup bonus of 2 credits
-- Build guide §3.2
-- SECURITY INVOKER; lives in non-exposed schema `private` so it isn't exposed via the Data API.

create schema if not exists private;

grant usage on schema private to postgres, anon, authenticated, service_role;
-- prevent anon/authenticated from executing private routines by default
revoke all on schema private from anon, authenticated;

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security invoker
set search_path = public
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

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();
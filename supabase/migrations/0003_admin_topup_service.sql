-- =========================================================
-- Admin topup via service role
-- =========================================================
begin;

create or replace function public.admin_topup_credits(
  p_user_id uuid,
  p_amount int,
  p_meta jsonb default null
)
returns table (new_balance int)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_balance int;
  v_is_admin boolean;
begin
  if auth.role() = 'service_role' then
    v_is_admin := true;
  else
    select (p.role = 'admin') into v_is_admin
    from public.profiles p
    where p.user_id = auth.uid();
  end if;

  if coalesce(v_is_admin, false) = false then
    raise exception 'FORBIDDEN';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'AMOUNT_MUST_BE_POSITIVE';
  end if;

  select balance
  into v_balance
  from public.credit_wallets
  where user_id = p_user_id
  for update;

  if not found then
    raise exception 'WALLET_NOT_FOUND';
  end if;

  update public.credit_wallets
  set balance = balance + p_amount,
      updated_at = now()
  where user_id = p_user_id
  returning balance into v_balance;

  insert into public.credit_ledger (user_id, delta, reason, meta)
  values (p_user_id, p_amount, 'topup', p_meta);

  return query select v_balance;
end;
$$;

revoke all on function public.admin_topup_credits(uuid, int, jsonb) from public;
grant execute on function public.admin_topup_credits(uuid, int, jsonb) to service_role;

commit;

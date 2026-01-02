-- =========================================================
-- UP MIGRATION
-- =========================================================
begin;

-- 0) Extensions
create extension if not exists pgcrypto;

-- 1) Enums
do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public'
      and t.typname = 'user_role'
  ) then
    create type public.user_role as enum ('admin', 'user');
  end if;

  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public'
      and t.typname = 'ledger_reason'
  ) then
    create type public.ledger_reason as enum ('topup', 'usage', 'adjustment', 'refund');
  end if;

  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public'
      and t.typname = 'message_role'
  ) then
    create type public.message_role as enum ('user', 'assistant', 'system');
  end if;
end $$;

-- 2) Tables
create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role public.user_role not null default 'user',
  full_name text null,
  created_at timestamptz not null default now()
);

create table if not exists public.credit_wallets (
  user_id uuid primary key references auth.users(id) on delete cascade,
  balance integer not null default 0 check (balance >= 0),
  updated_at timestamptz not null default now()
);

create table if not exists public.credit_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  delta integer not null,
  reason public.ledger_reason not null,
  meta jsonb null,
  created_at timestamptz not null default now()
);

create index if not exists credit_ledger_user_id_created_at_idx
  on public.credit_ledger (user_id, created_at desc);

create table if not exists public.threads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists threads_user_id_updated_at_idx
  on public.threads (user_id, updated_at desc);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.threads(id) on delete cascade,
  role public.message_role not null,
  content text not null,
  credits_charged integer not null default 0 check (credits_charged >= 0),
  created_at timestamptz not null default now()
);

do $$
declare
  r record;
begin
  for r in
    select c.conname
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    join pg_attribute a on a.attrelid = t.oid and a.attnum = any (c.conkey)
    where n.nspname = 'public'
      and t.relname = 'messages'
      and a.attname = 'user_id'
  loop
    execute format('alter table public.messages drop constraint %I', r.conname);
  end loop;
end $$;

drop index if exists public.messages_user_id_created_at_idx;

alter table if exists public.messages drop column if exists user_id;

create index if not exists messages_thread_id_created_at_idx
  on public.messages (thread_id, created_at asc);

-- 3) Trigger on auth.users (optional but recommended)
-- Note: some environments restrict triggers on auth.users; ensure_user_bootstrap() is a safe fallback.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.profiles (user_id, role)
  values (new.id, 'user')
  on conflict (user_id) do nothing;

  insert into public.credit_wallets (user_id, balance)
  values (new.id, 0)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where t.tgname = 'on_auth_user_created'
      and n.nspname = 'auth'
      and c.relname = 'users'
  ) then
    create trigger on_auth_user_created
    after insert on auth.users
    for each row execute function public.handle_new_user();
  end if;
end $$;

-- 4) Atomic functions
create or replace function public.debit_credits(
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
begin
  if p_user_id is null or p_user_id <> auth.uid() then
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

  if v_balance < p_amount then
    raise exception 'INSUFFICIENT_CREDITS';
  end if;

  update public.credit_wallets
  set balance = balance - p_amount,
      updated_at = now()
  where user_id = p_user_id
  returning balance into v_balance;

  insert into public.credit_ledger (user_id, delta, reason, meta)
  values (p_user_id, -p_amount, 'usage', p_meta);

  return query select v_balance;
end;
$$;

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
  select (p.role = 'admin') into v_is_admin
  from public.profiles p
  where p.user_id = auth.uid();

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

create or replace function public.touch_thread_updated_at()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.threads
  set updated_at = now()
  where id = new.thread_id;
  return new;
end;
$$;

drop trigger if exists on_message_touch_thread on public.messages;
create trigger on_message_touch_thread
after insert on public.messages
for each row execute function public.touch_thread_updated_at();

create or replace function public.ensure_user_bootstrap()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  insert into public.profiles (user_id, role)
  values (auth.uid(), 'user')
  on conflict (user_id) do nothing;

  insert into public.credit_wallets (user_id, balance)
  values (auth.uid(), 0)
  on conflict (user_id) do nothing;
end;
$$;

revoke all on function public.debit_credits(uuid, int, jsonb) from public;
revoke all on function public.admin_topup_credits(uuid, int, jsonb) from public;
grant execute on function public.debit_credits(uuid, int, jsonb) to authenticated;
revoke all on function public.ensure_user_bootstrap() from public;
grant execute on function public.ensure_user_bootstrap() to authenticated;
revoke all on function public.touch_thread_updated_at() from public;
revoke all on function public.handle_new_user() from public;

-- 5) RLS + Policies (minimum safe)
alter table public.profiles enable row level security;
alter table public.credit_wallets enable row level security;
alter table public.credit_ledger enable row level security;
alter table public.threads enable row level security;
alter table public.messages enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'profiles'
      and policyname = 'profiles_select_own'
  ) then
    execute $p$
      create policy profiles_select_own
      on public.profiles
      for select
      using (user_id = auth.uid());
    $p$;
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'credit_wallets'
      and policyname = 'credit_wallets_select_own'
  ) then
    execute $p$
      create policy credit_wallets_select_own
      on public.credit_wallets
      for select
      using (user_id = auth.uid());
    $p$;
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'credit_ledger'
      and policyname = 'credit_ledger_select_own'
  ) then
    execute $p$
      create policy credit_ledger_select_own
      on public.credit_ledger
      for select
      using (user_id = auth.uid());
    $p$;
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'threads'
      and policyname = 'threads_select_own'
  ) then
    execute $p$
      create policy threads_select_own
      on public.threads
      for select
      using (user_id = auth.uid());
    $p$;
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'threads'
      and policyname = 'threads_insert_own'
  ) then
    execute $p$
      create policy threads_insert_own
      on public.threads
      for insert
      with check (user_id = auth.uid());
    $p$;
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'threads'
      and policyname = 'threads_update_own'
  ) then
    execute $p$
      create policy threads_update_own
      on public.threads
      for update
      using (user_id = auth.uid())
      with check (user_id = auth.uid());
    $p$;
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'threads'
      and policyname = 'threads_delete_own'
  ) then
    execute $p$
      create policy threads_delete_own
      on public.threads
      for delete
      using (user_id = auth.uid());
    $p$;
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'messages'
      and policyname = 'messages_select_own'
  ) then
    execute $p$
      create policy messages_select_own
      on public.messages
      for select
      using (
        exists (
          select 1 from public.threads t
          where t.id = messages.thread_id
            and t.user_id = auth.uid()
        )
      );
    $p$;
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'messages'
      and policyname = 'messages_insert_own'
  ) then
    execute $p$
      create policy messages_insert_own
      on public.messages
      for insert
      with check (
        exists (
          select 1 from public.threads t
          where t.id = messages.thread_id
            and t.user_id = auth.uid()
        )
      );
    $p$;
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'messages'
      and policyname = 'messages_update_own'
  ) then
    execute $p$
      create policy messages_update_own
      on public.messages
      for update
      using (
        exists (
          select 1 from public.threads t
          where t.id = messages.thread_id
            and t.user_id = auth.uid()
        )
      )
      with check (
        exists (
          select 1 from public.threads t
          where t.id = messages.thread_id
            and t.user_id = auth.uid()
        )
      );
    $p$;
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'messages'
      and policyname = 'messages_delete_own'
  ) then
    execute $p$
      create policy messages_delete_own
      on public.messages
      for delete
      using (
        exists (
          select 1 from public.threads t
          where t.id = messages.thread_id
            and t.user_id = auth.uid()
        )
      );
    $p$;
  end if;
end $$;

grant usage on schema public to authenticated;
revoke insert, update, delete on public.profiles from authenticated;
revoke insert, update, delete on public.credit_wallets from authenticated;
revoke insert, update, delete on public.credit_ledger from authenticated;
grant select on public.profiles, public.credit_wallets, public.credit_ledger to authenticated;
grant select, insert, update, delete on public.threads, public.messages to authenticated;

commit;

do $$
begin
  raise notice 'Migration complete: enums, tables, indexes, triggers, functions, and RLS policies created for Mentorix chat credits.';
end $$;

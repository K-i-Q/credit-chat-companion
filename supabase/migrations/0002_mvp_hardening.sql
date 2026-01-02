-- =========================================================
-- MVP HARDENING PATCH
-- - credit_ledger: delta must be non-zero
-- - messages: authenticated cannot UPDATE
-- - messages: authenticated can DELETE only if role='user'
-- =========================================================

-- =========================
-- UP
-- =========================
begin;

-- 1) credit_ledger delta must be non-zero
do $$
begin
  if not exists (
    select 1
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'credit_ledger'
      and c.conname = 'credit_ledger_delta_nonzero_chk'
  ) then
    execute 'alter table public.credit_ledger
             add constraint credit_ledger_delta_nonzero_chk check (delta <> 0)';
  end if;
end $$;

-- 2) Remove UPDATE permission on messages for authenticated
revoke update on public.messages from authenticated;

-- 3) Remove/replace messages update policy (if exists)
drop policy if exists messages_update_own on public.messages;

-- 4) Replace delete policy to allow deleting only user-authored messages
drop policy if exists messages_delete_own on public.messages;

create policy messages_delete_own
  on public.messages
  for delete
  using (
    role = 'user'
    and exists (
      select 1
      from public.threads t
      where t.id = messages.thread_id
        and t.user_id = auth.uid()
    )
  );

commit;

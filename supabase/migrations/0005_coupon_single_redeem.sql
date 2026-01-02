-- =========================================================
-- Each account can redeem only one coupon
-- =========================================================
begin;

do $$
begin
  if not exists (
    select 1
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'invite_redemptions'
      and c.conname = 'invite_redemptions_user_id_unique'
  ) then
    execute 'alter table public.invite_redemptions
             add constraint invite_redemptions_user_id_unique unique (user_id)';
  end if;
end $$;

commit;

-- V1 security advisor cleanup.
-- Applied to Supabase production on 2026-05-24.

create schema if not exists private;

create or replace function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.profiles
    where user_id = (select auth.uid())
      and role in ('admin', 'additional_admin')
  );
$$;

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.profiles (user_id, email, role)
  values (new.id, new.email, 'viewer')
  on conflict (user_id) do nothing;

  return new;
end;
$$;

grant usage on schema private to anon, authenticated;
grant execute on function private.is_admin() to anon, authenticated;
revoke execute on function private.handle_new_user() from public, anon, authenticated;

alter function public.set_updated_at() set search_path = public, pg_temp;
alter function public.enforce_max_100_tickers() set search_path = public, pg_temp;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function private.handle_new_user();

drop policy if exists profiles_select_own_or_admin on public.profiles;
create policy profiles_select_own_or_admin
on public.profiles for select
using (user_id = (select auth.uid()) or (select private.is_admin()));

drop policy if exists profiles_update_admin_only on public.profiles;
create policy profiles_update_admin_only
on public.profiles for update
using ((select private.is_admin()))
with check ((select private.is_admin()));

drop policy if exists ticker_lists_select_own_or_admin on public.ticker_lists;
create policy ticker_lists_select_own_or_admin
on public.ticker_lists for select
using (user_id = (select auth.uid()) or (select private.is_admin()));

drop policy if exists ticker_lists_insert_own_or_admin on public.ticker_lists;
create policy ticker_lists_insert_own_or_admin
on public.ticker_lists for insert
with check (user_id = (select auth.uid()) or (select private.is_admin()));

drop policy if exists ticker_lists_update_own_or_admin on public.ticker_lists;
create policy ticker_lists_update_own_or_admin
on public.ticker_lists for update
using (user_id = (select auth.uid()) or (select private.is_admin()))
with check (user_id = (select auth.uid()) or (select private.is_admin()));

drop policy if exists ticker_lists_delete_own_or_admin on public.ticker_lists;
create policy ticker_lists_delete_own_or_admin
on public.ticker_lists for delete
using (user_id = (select auth.uid()) or (select private.is_admin()));

drop policy if exists ticker_items_select_own_or_admin on public.ticker_list_items;
create policy ticker_items_select_own_or_admin
on public.ticker_list_items for select
using (
  exists (
    select 1
    from public.ticker_lists tl
    where tl.id = ticker_list_items.ticker_list_id
      and (tl.user_id = (select auth.uid()) or (select private.is_admin()))
  )
);

drop policy if exists ticker_items_insert_own_or_admin on public.ticker_list_items;
create policy ticker_items_insert_own_or_admin
on public.ticker_list_items for insert
with check (
  exists (
    select 1
    from public.ticker_lists tl
    where tl.id = ticker_list_items.ticker_list_id
      and (tl.user_id = (select auth.uid()) or (select private.is_admin()))
  )
);

drop policy if exists ticker_items_update_own_or_admin on public.ticker_list_items;
create policy ticker_items_update_own_or_admin
on public.ticker_list_items for update
using (
  exists (
    select 1
    from public.ticker_lists tl
    where tl.id = ticker_list_items.ticker_list_id
      and (tl.user_id = (select auth.uid()) or (select private.is_admin()))
  )
)
with check (
  exists (
    select 1
    from public.ticker_lists tl
    where tl.id = ticker_list_items.ticker_list_id
      and (tl.user_id = (select auth.uid()) or (select private.is_admin()))
  )
);

drop policy if exists ticker_items_delete_own_or_admin on public.ticker_list_items;
create policy ticker_items_delete_own_or_admin
on public.ticker_list_items for delete
using (
  exists (
    select 1
    from public.ticker_lists tl
    where tl.id = ticker_list_items.ticker_list_id
      and (tl.user_id = (select auth.uid()) or (select private.is_admin()))
  )
);

drop policy if exists valuation_results_select_own_or_admin on public.valuation_results;
create policy valuation_results_select_own_or_admin
on public.valuation_results for select
using (user_id = (select auth.uid()) or (select private.is_admin()));

drop policy if exists valuation_results_insert_own_or_admin on public.valuation_results;
create policy valuation_results_insert_own_or_admin
on public.valuation_results for insert
with check (user_id = (select auth.uid()) or (select private.is_admin()));

drop policy if exists valuation_results_update_own_or_admin on public.valuation_results;
create policy valuation_results_update_own_or_admin
on public.valuation_results for update
using (user_id = (select auth.uid()) or (select private.is_admin()))
with check (user_id = (select auth.uid()) or (select private.is_admin()));

drop policy if exists valuation_results_delete_own_or_admin on public.valuation_results;
create policy valuation_results_delete_own_or_admin
on public.valuation_results for delete
using (user_id = (select auth.uid()) or (select private.is_admin()));

drop policy if exists refresh_jobs_select_own_or_admin on public.refresh_jobs;
create policy refresh_jobs_select_own_or_admin
on public.refresh_jobs for select
using (user_id = (select auth.uid()) or (select private.is_admin()));

drop policy if exists refresh_jobs_insert_own_or_admin on public.refresh_jobs;
create policy refresh_jobs_insert_own_or_admin
on public.refresh_jobs for insert
with check (user_id = (select auth.uid()) or (select private.is_admin()));

drop policy if exists refresh_jobs_update_own_or_admin on public.refresh_jobs;
create policy refresh_jobs_update_own_or_admin
on public.refresh_jobs for update
using (user_id = (select auth.uid()) or (select private.is_admin()))
with check (user_id = (select auth.uid()) or (select private.is_admin()));

drop policy if exists refresh_jobs_delete_admin_only on public.refresh_jobs;
create policy refresh_jobs_delete_admin_only
on public.refresh_jobs for delete
using ((select private.is_admin()));

drop function if exists public.is_admin();
drop function if exists public.handle_new_user();

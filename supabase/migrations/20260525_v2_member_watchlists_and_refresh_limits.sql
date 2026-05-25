-- V2 foundation: member accounts, invite codes, per-user watchlists,
-- newsletter consent, and transparent beta refresh-rate tracking.

alter table public.profiles
  add column if not exists newsletter_opted_in boolean not null default true,
  add column if not exists newsletter_opted_in_at timestamptz,
  add column if not exists invite_code_id uuid,
  add column if not exists display_name text;

alter table public.profiles
  alter column role set default 'member'::public.user_role;

update public.profiles
set newsletter_opted_in_at = coalesce(newsletter_opted_in_at, created_at)
where newsletter_opted_in = true;

create table if not exists public.invite_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  label text,
  max_uses integer not null default 1 check (max_uses > 0),
  used_count integer not null default 0 check (used_count >= 0),
  is_active boolean not null default true,
  expires_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (used_count <= max_uses),
  check (length(trim(code)) >= 6)
);

alter table public.profiles
  drop constraint if exists profiles_invite_code_id_fkey;

alter table public.profiles
  add constraint profiles_invite_code_id_fkey
  foreign key (invite_code_id)
  references public.invite_codes(id)
  on delete set null;

create unique index if not exists ticker_lists_unique_name_per_user
  on public.ticker_lists (user_id, lower(trim(name)));

create table if not exists public.refresh_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  ticker_list_id uuid references public.ticker_lists(id) on delete cascade,
  ticker text,
  refresh_type text not null check (refresh_type in ('watchlist', 'single_ticker')),
  created_at timestamptz not null default now(),
  check (
    (refresh_type = 'watchlist' and ticker_list_id is not null and ticker is null)
    or
    (refresh_type = 'single_ticker' and ticker_list_id is null and ticker is not null)
  )
);

create index if not exists idx_refresh_events_watchlist_recent
  on public.refresh_events (user_id, ticker_list_id, created_at desc)
  where refresh_type = 'watchlist';

create index if not exists idx_refresh_events_single_ticker_recent
  on public.refresh_events (user_id, ticker, created_at desc)
  where refresh_type = 'single_ticker';

create or replace function public.enforce_max_2_watchlists()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  watchlist_count integer;
begin
  if tg_op = 'INSERT' then
    select count(*)
    into watchlist_count
    from public.ticker_lists
    where user_id = new.user_id;

    if watchlist_count >= 2 then
      raise exception 'Watchlist limit exceeded: Version 2 supports a maximum of 2 watchlists per user.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_max_2_watchlists_before_insert on public.ticker_lists;
create trigger enforce_max_2_watchlists_before_insert
before insert on public.ticker_lists
for each row execute function public.enforce_max_2_watchlists();

create or replace function public.prevent_last_default_watchlist_delete()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  other_watchlist_count integer;
begin
  if old.is_default then
    select count(*)
    into other_watchlist_count
    from public.ticker_lists
    where user_id = old.user_id
      and id <> old.id;

    if other_watchlist_count = 0 then
      raise exception 'Default watchlist cannot be deleted without another watchlist available.';
    end if;
  end if;

  return old;
end;
$$;

drop trigger if exists prevent_last_default_watchlist_delete_before_delete on public.ticker_lists;
create trigger prevent_last_default_watchlist_delete_before_delete
before delete on public.ticker_lists
for each row execute function public.prevent_last_default_watchlist_delete();

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.profiles (
    user_id,
    email,
    role,
    newsletter_opted_in,
    newsletter_opted_in_at
  )
  values (
    new.id,
    new.email,
    'member',
    true,
    now()
  )
  on conflict (user_id) do nothing;

  insert into public.ticker_lists (user_id, name, is_default)
  values (new.id, 'Default', true)
  on conflict do nothing;

  return new;
end;
$$;

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

alter table public.invite_codes enable row level security;
alter table public.refresh_events enable row level security;

drop policy if exists invite_codes_admin_select on public.invite_codes;
create policy invite_codes_admin_select
on public.invite_codes for select
using ((select private.is_admin()));

drop policy if exists refresh_events_select_own_or_admin on public.refresh_events;
create policy refresh_events_select_own_or_admin
on public.refresh_events for select
using (user_id = (select auth.uid()) or (select private.is_admin()));

drop policy if exists refresh_events_insert_own_or_admin on public.refresh_events;
create policy refresh_events_insert_own_or_admin
on public.refresh_events for insert
with check (user_id = (select auth.uid()) or (select private.is_admin()));

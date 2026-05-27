-- V2 advisor cleanup: add covering indexes for new foreign keys.

create index if not exists idx_invite_codes_created_by
  on public.invite_codes (created_by);

create index if not exists idx_profiles_invite_code_id
  on public.profiles (invite_code_id);

create index if not exists idx_refresh_events_ticker_list_id
  on public.refresh_events (ticker_list_id);

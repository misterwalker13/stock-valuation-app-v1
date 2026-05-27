-- V2 limit update: allow larger beta watchlists.

create or replace function public.enforce_max_100_tickers()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  ticker_count integer;
begin
  select count(*)
  into ticker_count
  from public.ticker_list_items
  where ticker_list_id = new.ticker_list_id;

  if tg_op = 'INSERT' and ticker_count >= 500 then
    raise exception 'Ticker limit exceeded: Version 2 supports a maximum of 500 tickers per list.';
  end if;

  return new;
end;
$$;

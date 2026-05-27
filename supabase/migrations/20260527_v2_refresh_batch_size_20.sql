-- V2 refresh jobs now support up to 20 tickers per batch.

alter table public.refresh_jobs
drop constraint if exists refresh_batch_size_valid;

alter table public.refresh_jobs
add constraint refresh_batch_size_valid
check (batch_size between 0 and 20);

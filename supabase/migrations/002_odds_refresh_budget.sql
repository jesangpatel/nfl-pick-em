create table if not exists public.odds_refresh_log (
  id uuid primary key default gen_random_uuid(),
  fetched_at timestamptz not null default now(),
  credits_used int not null default 1 check (credits_used > 0),
  source text not null default 'the-odds-api',
  requests_remaining text,
  requests_used text,
  status text not null default 'success',
  notes text
);

create index if not exists odds_refresh_log_fetched_idx on public.odds_refresh_log (fetched_at desc);

alter table public.odds_refresh_log enable row level security;

drop policy if exists "admins read odds refresh log" on public.odds_refresh_log;
create policy "admins read odds refresh log"
on public.odds_refresh_log
for select
to authenticated
using (public.is_admin());

drop policy if exists "admins manage odds refresh log" on public.odds_refresh_log;
create policy "admins manage odds refresh log"
on public.odds_refresh_log
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());


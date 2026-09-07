create extension if not exists pgcrypto;

create type public.profile_role as enum ('player', 'admin');
create type public.game_status as enum ('scheduled', 'in_progress', 'final', 'postponed', 'canceled');
create type public.pick_result as enum ('pending', 'win', 'loss', 'push', 'void');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  avatar_url text,
  role public.profile_role not null default 'player',
  created_at timestamptz not null default now()
);

create table public.seasons (
  id uuid primary key default gen_random_uuid(),
  year int not null unique,
  active boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.weeks (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons(id) on delete cascade,
  week_number int not null check (week_number between 1 and 22),
  status text not null default 'open' check (status in ('upcoming', 'open', 'locked', 'final')),
  unique (season_id, week_number)
);

create table public.teams (
  id uuid primary key default gen_random_uuid(),
  abbreviation text not null unique,
  city text not null,
  name text not null,
  logo_url text not null,
  primary_color text not null,
  secondary_color text not null,
  created_at timestamptz not null default now()
);

create table public.games (
  id uuid primary key default gen_random_uuid(),
  external_game_id text not null,
  season_id uuid not null references public.seasons(id) on delete cascade,
  week_number int not null check (week_number between 1 and 22),
  home_team_id uuid not null references public.teams(id),
  away_team_id uuid not null references public.teams(id),
  kickoff_at timestamptz not null,
  status public.game_status not null default 'scheduled',
  home_score int,
  away_score int,
  venue text,
  broadcast text,
  created_at timestamptz not null default now(),
  unique (season_id, external_game_id)
);

create table public.odds (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  sportsbook text not null check (sportsbook = 'draftkings'),
  home_spread numeric(5, 1) not null,
  away_spread numeric(5, 1) not null,
  fetched_at timestamptz not null default now(),
  source text not null default 'the-odds-api'
);

create table public.odds_refresh_log (
  id uuid primary key default gen_random_uuid(),
  fetched_at timestamptz not null default now(),
  credits_used int not null default 1 check (credits_used > 0),
  source text not null default 'the-odds-api',
  requests_remaining text,
  requests_used text,
  status text not null default 'success',
  notes text
);

create table public.picks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  season_id uuid not null references public.seasons(id) on delete cascade,
  week_number int not null check (week_number between 1 and 22),
  game_id uuid not null references public.games(id),
  selected_team_id uuid not null references public.teams(id),
  opponent_team_id uuid not null references public.teams(id),
  submitted_spread numeric(5, 1) not null check (submitted_spread > 0),
  submitted_at timestamptz not null default now(),
  result public.pick_result not null default 'pending',
  points_earned numeric(6, 1) not null default 0,
  locked boolean not null default false,
  unique (user_id, season_id, week_number)
);

create index odds_game_fetched_idx on public.odds (game_id, fetched_at desc);
create index odds_refresh_log_fetched_idx on public.odds_refresh_log (fetched_at desc);
create index games_week_idx on public.games (season_id, week_number, kickoff_at);
create index picks_week_idx on public.picks (season_id, week_number, user_id);

create or replace function public.is_admin(p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = p_user_id and role = 'admin'
  );
$$;

create or replace function public.has_submitted_week_pick(p_season_id uuid, p_week_number int)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.picks
    where user_id = auth.uid()
      and season_id = p_season_id
      and week_number = p_week_number
  );
$$;

create or replace function public.pick_points(p_spread numeric, p_won boolean)
returns numeric
language sql
immutable
as $$
  select case
    when not p_won then 0
    when p_spread >= 7 then p_spread + 5
    else p_spread + 3
  end;
$$;

create or replace function public.submit_weekly_pick(
  p_season int,
  p_week_number int,
  p_game_id uuid,
  p_selected_team_id uuid
)
returns public.picks
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_season_id uuid;
  v_game public.games;
  v_odds public.odds;
  v_spread numeric(5, 1);
  v_opponent uuid;
  v_pick public.picks;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  select id into v_season_id from public.seasons where year = p_season;
  if v_season_id is null then
    raise exception 'Unknown season %', p_season;
  end if;

  select * into v_game
  from public.games
  where id = p_game_id and season_id = v_season_id and week_number = p_week_number;

  if v_game.id is null then
    raise exception 'Game is not available for that week';
  end if;

  if v_game.kickoff_at <= now() then
    raise exception 'This game is locked';
  end if;

  select * into v_odds
  from public.odds
  where game_id = p_game_id and sportsbook = 'draftkings'
  order by fetched_at desc
  limit 1;

  if v_odds.id is null then
    raise exception 'DraftKings spread is unavailable';
  end if;

  if p_selected_team_id = v_game.home_team_id then
    v_spread := v_odds.home_spread;
    v_opponent := v_game.away_team_id;
  elsif p_selected_team_id = v_game.away_team_id then
    v_spread := v_odds.away_spread;
    v_opponent := v_game.home_team_id;
  else
    raise exception 'Selected team is not in this game';
  end if;

  if v_spread <= 0 then
    raise exception 'Only DraftKings underdogs can be selected';
  end if;

  insert into public.picks (
    user_id,
    season_id,
    week_number,
    game_id,
    selected_team_id,
    opponent_team_id,
    submitted_spread,
    submitted_at,
    locked
  )
  values (
    v_user_id,
    v_season_id,
    p_week_number,
    p_game_id,
    p_selected_team_id,
    v_opponent,
    v_spread,
    now(),
    false
  )
  on conflict (user_id, season_id, week_number)
  do update set
    game_id = excluded.game_id,
    selected_team_id = excluded.selected_team_id,
    opponent_team_id = excluded.opponent_team_id,
    submitted_spread = excluded.submitted_spread,
    submitted_at = now(),
    result = 'pending',
    points_earned = 0,
    locked = false
  where public.picks.locked = false
    and not exists (
      select 1
      from public.games existing_game
      where existing_game.id = public.picks.game_id
        and existing_game.kickoff_at <= now()
    )
  returning * into v_pick;

  if v_pick.id is null then
    raise exception 'Existing pick is locked because its game has started';
  end if;

  return v_pick;
end;
$$;

create or replace function public.recalculate_game_picks(p_game_id uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_game public.games;
  v_winner uuid;
  v_count int;
begin
  if not public.is_admin() then
    raise exception 'Admin access required';
  end if;

  select * into v_game from public.games where id = p_game_id;
  if v_game.status in ('canceled', 'postponed') then
    update public.picks set result = 'void', points_earned = 0, locked = true where game_id = p_game_id;
  elsif v_game.status = 'final' and v_game.home_score is not null and v_game.away_score is not null then
    if v_game.home_score = v_game.away_score then
      update public.picks set result = 'push', points_earned = 0, locked = true where game_id = p_game_id;
    else
      v_winner := case when v_game.home_score > v_game.away_score then v_game.home_team_id else v_game.away_team_id end;
      update public.picks
      set result = case when selected_team_id = v_winner then 'win' else 'loss' end,
          points_earned = public.pick_points(submitted_spread, selected_team_id = v_winner),
          locked = true
      where game_id = p_game_id;
    end if;
  end if;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

alter table public.profiles enable row level security;
alter table public.seasons enable row level security;
alter table public.weeks enable row level security;
alter table public.teams enable row level security;
alter table public.games enable row level security;
alter table public.odds enable row level security;
alter table public.odds_refresh_log enable row level security;
alter table public.picks enable row level security;

create policy "profiles are visible to signed-in users" on public.profiles for select to authenticated using (true);
create policy "users update own profile" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
create policy "admins manage profiles" on public.profiles for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "signed-in users read seasons" on public.seasons for select to authenticated using (true);
create policy "signed-in users read weeks" on public.weeks for select to authenticated using (true);
create policy "signed-in users read teams" on public.teams for select to authenticated using (true);
create policy "signed-in users read games" on public.games for select to authenticated using (true);
create policy "signed-in users read odds" on public.odds for select to authenticated using (true);
create policy "admins read odds refresh log" on public.odds_refresh_log for select to authenticated using (public.is_admin());

create policy "admins manage seasons" on public.seasons for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admins manage weeks" on public.weeks for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admins manage teams" on public.teams for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admins manage games" on public.games for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admins manage odds" on public.odds for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admins manage odds refresh log" on public.odds_refresh_log for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "users can see own or unlocked week picks"
on public.picks
for select
to authenticated
using (
  user_id = auth.uid()
  or public.is_admin()
  or public.has_submitted_week_pick(season_id, week_number)
);

create policy "users insert own picks" on public.picks for insert to authenticated with check (user_id = auth.uid());
create policy "users update own unlocked picks" on public.picks for update to authenticated using (user_id = auth.uid() and locked = false) with check (user_id = auth.uid());
create policy "admins manage picks" on public.picks for all to authenticated using (public.is_admin()) with check (public.is_admin());

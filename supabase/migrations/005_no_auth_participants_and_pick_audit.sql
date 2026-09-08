do $$
declare
  v_constraint_name text;
begin
  select constraint_name into v_constraint_name
  from information_schema.table_constraints
  where table_schema = 'public'
    and table_name = 'profiles'
    and constraint_type = 'FOREIGN KEY'
    and constraint_name = 'profiles_id_fkey';

  if v_constraint_name is not null then
    execute format('alter table public.profiles drop constraint %I', v_constraint_name);
  end if;
end $$;

alter table public.profiles
  add column if not exists active boolean not null default true,
  add column if not exists updated_at timestamptz not null default now();

alter table public.profiles
  alter column id set default gen_random_uuid();

alter table public.odds
  add column if not exists external_event_id text;

alter table public.picks
  add column if not exists odds_id uuid references public.odds(id);

create table if not exists public.pick_audit_events (
  id uuid primary key default gen_random_uuid(),
  pick_id uuid not null references public.picks(id) on delete restrict,
  participant_id uuid not null references public.profiles(id) on delete restrict,
  season_id uuid not null references public.seasons(id) on delete restrict,
  week_number int not null check (week_number between 1 and 22),
  action_type text not null check (action_type in ('created', 'changed', 'locked', 'admin-corrected')),
  previous_game_id uuid references public.games(id) on delete restrict,
  new_game_id uuid references public.games(id) on delete restrict,
  previous_selected_team_id uuid references public.teams(id) on delete restrict,
  new_selected_team_id uuid references public.teams(id) on delete restrict,
  previous_opponent_team_id uuid references public.teams(id) on delete restrict,
  new_opponent_team_id uuid references public.teams(id) on delete restrict,
  previous_spread numeric(5, 1),
  new_spread numeric(5, 1),
  previous_odds_id uuid references public.odds(id) on delete restrict,
  new_odds_id uuid references public.odds(id) on delete restrict,
  relevant_kickoff_at timestamptz,
  original_submitted_at timestamptz,
  changed_at timestamptz not null default now(),
  source text not null default 'server',
  notes text
);

create index if not exists pick_audit_participant_week_idx
on public.pick_audit_events (participant_id, season_id, week_number, changed_at);

create index if not exists pick_audit_pick_idx
on public.pick_audit_events (pick_id, changed_at);

create or replace function public.prevent_pick_audit_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'Pick audit events are append-only';
end;
$$;

drop trigger if exists pick_audit_events_append_only on public.pick_audit_events;
create trigger pick_audit_events_append_only
before update or delete on public.pick_audit_events
for each row execute function public.prevent_pick_audit_mutation();

create or replace function public.log_pick_audit_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_new_game public.games;
begin
  if tg_op = 'INSERT' then
    select * into v_new_game from public.games where id = new.game_id;
    insert into public.pick_audit_events (
      pick_id,
      participant_id,
      season_id,
      week_number,
      action_type,
      new_game_id,
      new_selected_team_id,
      new_opponent_team_id,
      new_spread,
      new_odds_id,
      relevant_kickoff_at,
      original_submitted_at,
      changed_at,
      source
    )
    values (
      new.id,
      new.user_id,
      new.season_id,
      new.week_number,
      'created',
      new.game_id,
      new.selected_team_id,
      new.opponent_team_id,
      new.submitted_spread,
      new.odds_id,
      v_new_game.kickoff_at,
      new.submitted_at,
      new.submitted_at,
      'server'
    );
    return new;
  end if;

  if tg_op = 'UPDATE'
    and (
      old.game_id is distinct from new.game_id
      or old.selected_team_id is distinct from new.selected_team_id
      or old.opponent_team_id is distinct from new.opponent_team_id
      or old.submitted_spread is distinct from new.submitted_spread
      or old.odds_id is distinct from new.odds_id
    )
  then
    select * into v_new_game from public.games where id = new.game_id;
    insert into public.pick_audit_events (
      pick_id,
      participant_id,
      season_id,
      week_number,
      action_type,
      previous_game_id,
      new_game_id,
      previous_selected_team_id,
      new_selected_team_id,
      previous_opponent_team_id,
      new_opponent_team_id,
      previous_spread,
      new_spread,
      previous_odds_id,
      new_odds_id,
      relevant_kickoff_at,
      original_submitted_at,
      changed_at,
      source
    )
    values (
      new.id,
      new.user_id,
      new.season_id,
      new.week_number,
      'changed',
      old.game_id,
      new.game_id,
      old.selected_team_id,
      new.selected_team_id,
      old.opponent_team_id,
      new.opponent_team_id,
      old.submitted_spread,
      new.submitted_spread,
      old.odds_id,
      new.odds_id,
      v_new_game.kickoff_at,
      old.submitted_at,
      new.submitted_at,
      'server'
    );
  end if;

  if tg_op = 'UPDATE' and old.locked = false and new.locked = true then
    select * into v_new_game from public.games where id = new.game_id;
    insert into public.pick_audit_events (
      pick_id,
      participant_id,
      season_id,
      week_number,
      action_type,
      new_game_id,
      new_selected_team_id,
      new_opponent_team_id,
      new_spread,
      new_odds_id,
      relevant_kickoff_at,
      original_submitted_at,
      changed_at,
      source
    )
    values (
      new.id,
      new.user_id,
      new.season_id,
      new.week_number,
      'locked',
      new.game_id,
      new.selected_team_id,
      new.opponent_team_id,
      new.submitted_spread,
      new.odds_id,
      v_new_game.kickoff_at,
      new.submitted_at,
      now(),
      'server'
    );
  end if;

  return new;
end;
$$;

drop trigger if exists picks_audit_log on public.picks;
create trigger picks_audit_log
after insert or update on public.picks
for each row execute function public.log_pick_audit_event();

create or replace function public.prevent_locked_pick_identity_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing_game public.games;
begin
  if (
    old.game_id is distinct from new.game_id
    or old.selected_team_id is distinct from new.selected_team_id
    or old.opponent_team_id is distinct from new.opponent_team_id
    or old.submitted_spread is distinct from new.submitted_spread
    or old.submitted_at is distinct from new.submitted_at
    or old.odds_id is distinct from new.odds_id
  ) then
    select * into v_existing_game from public.games where id = old.game_id;
    if old.locked = true or v_existing_game.kickoff_at <= now() then
      raise exception 'Existing pick is locked because its game has started';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists picks_prevent_locked_identity_changes on public.picks;
create trigger picks_prevent_locked_identity_changes
before update on public.picks
for each row execute function public.prevent_locked_pick_identity_changes();

alter table public.picks disable trigger picks_audit_log;

create or replace function public.submit_participant_weekly_pick(
  p_participant_id uuid,
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
  v_participant public.profiles;
  v_season_id uuid;
  v_game public.games;
  v_existing_pick public.picks;
  v_existing_game public.games;
  v_odds public.odds;
  v_spread numeric(5, 1);
  v_opponent uuid;
  v_pick public.picks;
begin
  select * into v_participant
  from public.profiles
  where id = p_participant_id;

  if v_participant.id is null then
    raise exception 'Participant was not found';
  end if;

  if v_participant.active = false then
    raise exception 'Participant is inactive';
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

  select * into v_existing_pick
  from public.picks
  where user_id = p_participant_id
    and season_id = v_season_id
    and week_number = p_week_number;

  if v_existing_pick.id is not null then
    select * into v_existing_game from public.games where id = v_existing_pick.game_id;
    if v_existing_pick.locked = true or v_existing_game.kickoff_at <= now() then
      raise exception 'Existing pick is locked because its game has started';
    end if;
  end if;

  select * into v_odds
  from public.odds
  where game_id = p_game_id
    and sportsbook = 'draftkings'
    and source = 'the-odds-api'
  order by fetched_at desc
  limit 1;

  if v_odds.id is null then
    raise exception 'DraftKings line currently unavailable';
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
    locked,
    odds_id
  )
  values (
    p_participant_id,
    v_season_id,
    p_week_number,
    p_game_id,
    p_selected_team_id,
    v_opponent,
    v_spread,
    now(),
    false,
    v_odds.id
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
    locked = false,
    odds_id = excluded.odds_id
  returning * into v_pick;

  return v_pick;
end;
$$;

with ranked_games as (
  select
    games.id,
    first_value(games.id) over (
      partition by games.season_id, games.week_number, games.home_team_id, games.away_team_id
      order by
        exists(select 1 from public.picks where picks.game_id = games.id) desc,
        exists(select 1 from public.odds where odds.game_id = games.id and odds.source = 'the-odds-api') desc,
        games.created_at asc,
        games.id asc
    ) as canonical_id,
    row_number() over (
      partition by games.season_id, games.week_number, games.home_team_id, games.away_team_id
      order by
        exists(select 1 from public.picks where picks.game_id = games.id) desc,
        exists(select 1 from public.odds where odds.game_id = games.id and odds.source = 'the-odds-api') desc,
        games.created_at asc,
        games.id asc
    ) as row_number
  from public.games
)
update public.odds
set game_id = ranked_games.canonical_id
from ranked_games
where public.odds.game_id = ranked_games.id
  and ranked_games.id <> ranked_games.canonical_id;

with ranked_games as (
  select
    games.id,
    first_value(games.id) over (
      partition by games.season_id, games.week_number, games.home_team_id, games.away_team_id
      order by
        exists(select 1 from public.picks where picks.game_id = games.id) desc,
        exists(select 1 from public.odds where odds.game_id = games.id and odds.source = 'the-odds-api') desc,
        games.created_at asc,
        games.id asc
    ) as canonical_id
  from public.games
)
update public.picks
set game_id = ranked_games.canonical_id
from ranked_games
where public.picks.game_id = ranked_games.id
  and ranked_games.id <> ranked_games.canonical_id;

with ranked_games as (
  select
    games.id,
    row_number() over (
      partition by games.season_id, games.week_number, games.home_team_id, games.away_team_id
      order by
        exists(select 1 from public.picks where picks.game_id = games.id) desc,
        exists(select 1 from public.odds where odds.game_id = games.id and odds.source = 'the-odds-api') desc,
        games.created_at asc,
        games.id asc
    ) as row_number
  from public.games
)
delete from public.games
using ranked_games
where public.games.id = ranked_games.id
  and ranked_games.row_number > 1;

alter table public.picks enable trigger picks_audit_log;

create unique index if not exists games_week_matchup_unique_idx
on public.games (season_id, week_number, home_team_id, away_team_id);

alter table public.pick_audit_events enable row level security;

drop policy if exists "admins read pick audit events" on public.pick_audit_events;
create policy "admins read pick audit events"
on public.pick_audit_events
for select
to authenticated
using (public.is_admin());

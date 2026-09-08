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
  where id = p_participant_id
    and active = true;

  if v_participant.id is null then
    raise exception 'Participant was not found or is inactive';
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
    and week_number = p_week_number
  for update;

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


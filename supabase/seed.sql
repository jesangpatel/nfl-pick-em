insert into public.seasons (id, year, active)
values ('00000000-0000-0000-0000-000000002026', 2026, true)
on conflict (year) do update set active = excluded.active;

insert into public.weeks (season_id, week_number, status)
select '00000000-0000-0000-0000-000000002026', week_number, case when week_number = 1 then 'open' else 'upcoming' end
from generate_series(1, 18) as week_number
on conflict (season_id, week_number) do update set status = excluded.status;

insert into public.teams (id, abbreviation, city, name, logo_url, primary_color, secondary_color) values
('00000000-0000-0000-0000-000000000001','ARI','Arizona','Cardinals','https://a.espncdn.com/i/teamlogos/nfl/500/ari.png','#97233f','#ffb612'),
('00000000-0000-0000-0000-000000000002','ATL','Atlanta','Falcons','https://a.espncdn.com/i/teamlogos/nfl/500/atl.png','#a71930','#000000'),
('00000000-0000-0000-0000-000000000003','BAL','Baltimore','Ravens','https://a.espncdn.com/i/teamlogos/nfl/500/bal.png','#241773','#9e7c0c'),
('00000000-0000-0000-0000-000000000004','BUF','Buffalo','Bills','https://a.espncdn.com/i/teamlogos/nfl/500/buf.png','#00338d','#c60c30'),
('00000000-0000-0000-0000-000000000005','CAR','Carolina','Panthers','https://a.espncdn.com/i/teamlogos/nfl/500/car.png','#0085ca','#101820'),
('00000000-0000-0000-0000-000000000006','CHI','Chicago','Bears','https://a.espncdn.com/i/teamlogos/nfl/500/chi.png','#0b162a','#c83803'),
('00000000-0000-0000-0000-000000000007','CIN','Cincinnati','Bengals','https://a.espncdn.com/i/teamlogos/nfl/500/cin.png','#fb4f14','#000000'),
('00000000-0000-0000-0000-000000000008','CLE','Cleveland','Browns','https://a.espncdn.com/i/teamlogos/nfl/500/cle.png','#311d00','#ff3c00'),
('00000000-0000-0000-0000-000000000009','DAL','Dallas','Cowboys','https://a.espncdn.com/i/teamlogos/nfl/500/dal.png','#003594','#869397'),
('00000000-0000-0000-0000-000000000010','DEN','Denver','Broncos','https://a.espncdn.com/i/teamlogos/nfl/500/den.png','#fb4f14','#002244'),
('00000000-0000-0000-0000-000000000011','DET','Detroit','Lions','https://a.espncdn.com/i/teamlogos/nfl/500/det.png','#0076b6','#b0b7bc'),
('00000000-0000-0000-0000-000000000012','GB','Green Bay','Packers','https://a.espncdn.com/i/teamlogos/nfl/500/gb.png','#203731','#ffb612'),
('00000000-0000-0000-0000-000000000013','HOU','Houston','Texans','https://a.espncdn.com/i/teamlogos/nfl/500/hou.png','#03202f','#a71930'),
('00000000-0000-0000-0000-000000000014','IND','Indianapolis','Colts','https://a.espncdn.com/i/teamlogos/nfl/500/ind.png','#002c5f','#a2aaad'),
('00000000-0000-0000-0000-000000000015','JAX','Jacksonville','Jaguars','https://a.espncdn.com/i/teamlogos/nfl/500/jax.png','#006778','#d7a22a'),
('00000000-0000-0000-0000-000000000016','KC','Kansas City','Chiefs','https://a.espncdn.com/i/teamlogos/nfl/500/kc.png','#e31837','#ffb81c'),
('00000000-0000-0000-0000-000000000017','LV','Las Vegas','Raiders','https://a.espncdn.com/i/teamlogos/nfl/500/lv.png','#000000','#a5acaf'),
('00000000-0000-0000-0000-000000000018','LAC','Los Angeles','Chargers','https://a.espncdn.com/i/teamlogos/nfl/500/lac.png','#0080c6','#ffc20e'),
('00000000-0000-0000-0000-000000000019','LAR','Los Angeles','Rams','https://a.espncdn.com/i/teamlogos/nfl/500/lar.png','#003594','#ffd100'),
('00000000-0000-0000-0000-000000000020','MIA','Miami','Dolphins','https://a.espncdn.com/i/teamlogos/nfl/500/mia.png','#008e97','#fc4c02'),
('00000000-0000-0000-0000-000000000021','MIN','Minnesota','Vikings','https://a.espncdn.com/i/teamlogos/nfl/500/min.png','#4f2683','#ffc62f'),
('00000000-0000-0000-0000-000000000022','NE','New England','Patriots','https://a.espncdn.com/i/teamlogos/nfl/500/ne.png','#002244','#c60c30'),
('00000000-0000-0000-0000-000000000023','NO','New Orleans','Saints','https://a.espncdn.com/i/teamlogos/nfl/500/no.png','#d3bc8d','#101820'),
('00000000-0000-0000-0000-000000000024','NYG','New York','Giants','https://a.espncdn.com/i/teamlogos/nfl/500/nyg.png','#0b2265','#a71930'),
('00000000-0000-0000-0000-000000000025','NYJ','New York','Jets','https://a.espncdn.com/i/teamlogos/nfl/500/nyj.png','#125740','#ffffff'),
('00000000-0000-0000-0000-000000000026','PHI','Philadelphia','Eagles','https://a.espncdn.com/i/teamlogos/nfl/500/phi.png','#004c54','#a5acaf'),
('00000000-0000-0000-0000-000000000027','PIT','Pittsburgh','Steelers','https://a.espncdn.com/i/teamlogos/nfl/500/pit.png','#ffb612','#101820'),
('00000000-0000-0000-0000-000000000028','SF','San Francisco','49ers','https://a.espncdn.com/i/teamlogos/nfl/500/sf.png','#aa0000','#b3995d'),
('00000000-0000-0000-0000-000000000029','SEA','Seattle','Seahawks','https://a.espncdn.com/i/teamlogos/nfl/500/sea.png','#002244','#69be28'),
('00000000-0000-0000-0000-000000000030','TB','Tampa Bay','Buccaneers','https://a.espncdn.com/i/teamlogos/nfl/500/tb.png','#d50a0a','#ff7900'),
('00000000-0000-0000-0000-000000000031','TEN','Tennessee','Titans','https://a.espncdn.com/i/teamlogos/nfl/500/ten.png','#0c2340','#4b92db'),
('00000000-0000-0000-0000-000000000032','WAS','Washington','Commanders','https://a.espncdn.com/i/teamlogos/nfl/500/wsh.png','#5a1414','#ffb612')
on conflict (abbreviation) do update set logo_url = excluded.logo_url;

insert into public.games (
  id, external_game_id, season_id, week_number, home_team_id, away_team_id,
  kickoff_at, status, home_score, away_score, venue, broadcast
) values
('10000000-0000-0000-0000-000000000001','nfl-2026-w1-ne-sea','00000000-0000-0000-0000-000000002026',1,'00000000-0000-0000-0000-000000000029','00000000-0000-0000-0000-000000000022','2026-09-10T00:20:00Z','scheduled',null,null,'Lumen Field','NBC'),
('10000000-0000-0000-0000-000000000002','nfl-2026-w1-sf-lar','00000000-0000-0000-0000-000000002026',1,'00000000-0000-0000-0000-000000000019','00000000-0000-0000-0000-000000000028','2026-09-11T00:35:00Z','scheduled',null,null,'Melbourne Cricket Ground','Netflix'),
('10000000-0000-0000-0000-000000000003','nfl-2026-w1-chi-car','00000000-0000-0000-0000-000000002026',1,'00000000-0000-0000-0000-000000000005','00000000-0000-0000-0000-000000000006','2026-09-13T17:00:00Z','scheduled',null,null,'Bank of America Stadium','FOX'),
('10000000-0000-0000-0000-000000000004','nfl-2026-w1-tb-cin','00000000-0000-0000-0000-000000002026',1,'00000000-0000-0000-0000-000000000007','00000000-0000-0000-0000-000000000030','2026-09-13T17:00:00Z','scheduled',null,null,'Paycor Stadium','FOX'),
('10000000-0000-0000-0000-000000000005','nfl-2026-w1-no-det','00000000-0000-0000-0000-000000002026',1,'00000000-0000-0000-0000-000000000011','00000000-0000-0000-0000-000000000023','2026-09-13T17:00:00Z','scheduled',null,null,'Ford Field','FOX'),
('10000000-0000-0000-0000-000000000006','nfl-2026-w1-buf-hou','00000000-0000-0000-0000-000000002026',1,'00000000-0000-0000-0000-000000000013','00000000-0000-0000-0000-000000000004','2026-09-13T17:00:00Z','scheduled',null,null,'NRG Stadium','CBS'),
('10000000-0000-0000-0000-000000000007','nfl-2026-w1-bal-ind','00000000-0000-0000-0000-000000002026',1,'00000000-0000-0000-0000-000000000014','00000000-0000-0000-0000-000000000003','2026-09-13T17:00:00Z','scheduled',null,null,'Lucas Oil Stadium','CBS'),
('10000000-0000-0000-0000-000000000008','nfl-2026-w1-cle-jax','00000000-0000-0000-0000-000000002026',1,'00000000-0000-0000-0000-000000000015','00000000-0000-0000-0000-000000000008','2026-09-13T17:00:00Z','scheduled',null,null,'EverBank Stadium','CBS'),
('10000000-0000-0000-0000-000000000009','nfl-2026-w1-atl-pit','00000000-0000-0000-0000-000000002026',1,'00000000-0000-0000-0000-000000000027','00000000-0000-0000-0000-000000000002','2026-09-13T17:00:00Z','scheduled',null,null,'Acrisure Stadium','FOX'),
('10000000-0000-0000-0000-000000000010','nfl-2026-w1-nyj-ten','00000000-0000-0000-0000-000000002026',1,'00000000-0000-0000-0000-000000000031','00000000-0000-0000-0000-000000000025','2026-09-13T17:00:00Z','scheduled',null,null,'Nissan Stadium','CBS'),
('10000000-0000-0000-0000-000000000011','nfl-2026-w1-ari-lac','00000000-0000-0000-0000-000000002026',1,'00000000-0000-0000-0000-000000000018','00000000-0000-0000-0000-000000000001','2026-09-13T20:25:00Z','scheduled',null,null,'SoFi Stadium','CBS'),
('10000000-0000-0000-0000-000000000012','nfl-2026-w1-mia-lv','00000000-0000-0000-0000-000000002026',1,'00000000-0000-0000-0000-000000000017','00000000-0000-0000-0000-000000000020','2026-09-13T20:25:00Z','scheduled',null,null,'Allegiant Stadium','FOX'),
('10000000-0000-0000-0000-000000000013','nfl-2026-w1-gb-min','00000000-0000-0000-0000-000000002026',1,'00000000-0000-0000-0000-000000000021','00000000-0000-0000-0000-000000000012','2026-09-13T20:25:00Z','scheduled',null,null,'U.S. Bank Stadium','CBS'),
('10000000-0000-0000-0000-000000000014','nfl-2026-w1-was-phi','00000000-0000-0000-0000-000000002026',1,'00000000-0000-0000-0000-000000000026','00000000-0000-0000-0000-000000000032','2026-09-13T20:25:00Z','scheduled',null,null,'Lincoln Financial Field','FOX'),
('10000000-0000-0000-0000-000000000015','nfl-2026-w1-dal-nyg','00000000-0000-0000-0000-000000002026',1,'00000000-0000-0000-0000-000000000024','00000000-0000-0000-0000-000000000009','2026-09-14T00:20:00Z','scheduled',null,null,'MetLife Stadium','NBC'),
('10000000-0000-0000-0000-000000000016','nfl-2026-w1-den-kc','00000000-0000-0000-0000-000000002026',1,'00000000-0000-0000-0000-000000000016','00000000-0000-0000-0000-000000000010','2026-09-15T00:15:00Z','scheduled',null,null,'GEHA Field at Arrowhead Stadium','ESPN')
on conflict (season_id, external_game_id) do update set status = excluded.status, home_score = excluded.home_score, away_score = excluded.away_score;

insert into public.odds (game_id, sportsbook, home_spread, away_spread, fetched_at, source) values
('10000000-0000-0000-0000-000000000001','draftkings',-4.5,4.5,'2026-09-06T20:00:00Z','demo'),
('10000000-0000-0000-0000-000000000002','draftkings',2.5,-2.5,'2026-09-06T20:00:00Z','demo'),
('10000000-0000-0000-0000-000000000003','draftkings',-3.5,3.5,'2026-09-06T20:00:00Z','demo'),
('10000000-0000-0000-0000-000000000004','draftkings',-2.5,2.5,'2026-09-06T20:00:00Z','demo'),
('10000000-0000-0000-0000-000000000005','draftkings',-6.5,6.5,'2026-09-06T20:00:00Z','demo'),
('10000000-0000-0000-0000-000000000006','draftkings',1.5,-1.5,'2026-09-06T20:00:00Z','demo'),
('10000000-0000-0000-0000-000000000007','draftkings',3,-3,'2026-09-06T20:00:00Z','demo'),
('10000000-0000-0000-0000-000000000008','draftkings',-4,4,'2026-09-06T20:00:00Z','demo'),
('10000000-0000-0000-0000-000000000009','draftkings',-5.5,5.5,'2026-09-06T20:00:00Z','demo'),
('10000000-0000-0000-0000-000000000010','draftkings',-1.5,1.5,'2026-09-06T20:00:00Z','demo'),
('10000000-0000-0000-0000-000000000011','draftkings',-7.5,7.5,'2026-09-06T20:00:00Z','demo'),
('10000000-0000-0000-0000-000000000012','draftkings',2,-2,'2026-09-06T20:00:00Z','demo'),
('10000000-0000-0000-0000-000000000013','draftkings',3.5,-3.5,'2026-09-06T20:00:00Z','demo'),
('10000000-0000-0000-0000-000000000014','draftkings',-6,6,'2026-09-06T20:00:00Z','demo'),
('10000000-0000-0000-0000-000000000015','draftkings',4.5,-4.5,'2026-09-06T20:00:00Z','demo'),
('10000000-0000-0000-0000-000000000016','draftkings',-8.5,8.5,'2026-09-06T20:00:00Z','demo');

-- Add real players from the app's Admin screen after running migration 005.
-- The rows in public.profiles are now manually managed pool participants,
-- not Supabase Auth users.
--
-- Demo picks are shown in the local frontend with non-authenticated fixture data.
-- Production picks should be created through public.submit_participant_weekly_pick so the
-- current DraftKings spread is snapshotted server-side.

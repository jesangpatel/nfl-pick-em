# NFL Underdog Pick'em

A private season-long NFL pick'em app where each player chooses one DraftKings underdog per week. The selected team must win outright. Points are based on the DraftKings spread snapshotted at submission time.

## What Is Included

- Next.js App Router, React, TypeScript strict mode, Tailwind CSS
- Mobile-first sportsbook-style pick board
- Real 2026 Week 1 NFL schedule loaded as the starter slate
- DraftKings-only spreads through The Odds API
- Supabase Auth-ready profile flow plus no-login local testing mode
- Supabase PostgreSQL schema with RLS policies
- Server-side pick submission RPC that validates underdogs and snapshots spreads
- Standings, season history table, cumulative chart, rules, and admin screen
- Manual admin fallback for spread entry when odds ingestion fails
- Demo data for Jesang, Varun, Ryan, and Nick

## Odds Data Decision

DraftKings does not provide a simple public official API for this private app use case. The app uses The Odds API as the legitimate provider because its NFL odds endpoint supports:

- sport key: `americanfootball_nfl`
- market: `spreads`
- bookmaker filter: `bookmakers=draftkings`
- request usage headers such as `x-requests-remaining` and `x-requests-used`

The live adapter is in `src/lib/odds/the-odds-api.ts` and calls:

```txt
https://api.the-odds-api.com/v4/sports/americanfootball_nfl/odds?regions=us&markets=spreads&bookmakers=draftkings&oddsFormat=american
```

The provider is modular through `OddsProvider`, so another licensed source can replace it later without rewriting the app. The admin screen keeps manual DraftKings spread entry as the fallback.

The app now labels odds as either Live DraftKings or Demo/manual odds. Do not send the league link until Admin Refresh succeeds with a real `ODDS_API_KEY`. If the provider lags DraftKings by a few seconds or minutes, the app can only be exact to the latest DraftKings line returned by The Odds API at refresh time.

Current pricing should be checked before launch. As of the research pass on September 6, 2026, The Odds API lists NFL as a paid/pro sport and its published pricing page lists a Professional tier at $29/month with 20,000 requests/month. A practical refresh cadence for this game is every 10-15 minutes on game day, hourly midweek, and on-demand from the admin screen.

Sources:

- https://www.nfl.com/schedules
- https://www.nfl.com/news/2026-nfl-schedule-release-complete-slate-of-week-1-games
- https://the-odds-api.com/liveapi/guides/v4/
- https://the-odds-api.com/sports/nfl-odds.html
- https://theoddsapi.com/pricing

## Scoring

If the selected underdog loses, the pick scores 0.

If the selected underdog wins outright:

- spread below +7: `spread + 3`
- spread +7 or greater: `spread + 5`

Canceled or postponed games are void by default. Ties are treated as pushes and score 0 unless the admin applies a manual correction.

## Environment

Copy `.env.example` to `.env.local`:

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
ODDS_API_KEY=
ADMIN_EMAILS=jesang@example.com
```

## Local Development

```bash
npm install
npm run dev
```

The app opens at `http://localhost:3000`.

## How You And Your Friends Use It

1. You deploy the app to Vercel and connect it to Supabase.
2. You add `ODDS_API_KEY` so the admin refresh pulls live DraftKings spreads from The Odds API.
3. Add your friends in Admin under Manual Players for quick setup and testing.
4. For the easiest real launch, invite each friend in Supabase Auth so each person can submit securely from their own phone.
5. During the week, each player opens Pick, taps one available underdog, and confirms.
6. The submitted DraftKings spread is snapshotted immediately. Later odds movement does not change that pick.
7. As each game kicks off, that game is shown as locked and can no longer be selected. The database RPC also blocks late submissions using server time.
8. After a player submits, they can open Week to see everyone else who has submitted. Before submitting, other users' picks stay hidden.
9. After games finish, the admin imports scores or enters finals, then recalculates scoring.

## No-Login Option

For testing, the app lets you manually add players in Admin and switch between them in Profile. This is intentionally frictionless.

For a real remote league, no-login self-submission needs secure personal pick links or short private player codes. Otherwise anyone with the link could submit as anyone else. The current Supabase schema is already set up for the safer login path; the next production improvement would be a `participants` table with one private invite token per player.

## Testing Before Sending To Friends

1. Open the local preview.
2. Go to Admin and confirm the odds badge says Live DraftKings after Refresh. If it says Demo/manual odds, do not use the lines as real.
3. Add all friends under Manual Players.
4. Go to Profile and switch to each friend.
5. Go to Pick, choose an underdog, and confirm.
6. Go to Week and confirm each row shows `TEAM +spread vs OPP`.
7. Change one spread in Admin and confirm an already submitted pick keeps its original snapshot.
8. Temporarily set a game's kickoff time in the seed or database to a past time and confirm the card says Locked.
9. Run the production checks:

```bash
npm run lint
npm run typecheck
npm run build
```

For Sunday, September 6, 2026, no Week 1 games have kicked off yet. The first listed game is Patriots at Seahawks on Wednesday, September 9, 2026 at 8:20 PM ET, so every Week 1 underdog is still selectable in the demo.

## Supabase Setup

1. Create a Supabase project.
2. Run `supabase/migrations/001_initial_schema.sql`.
3. Run `supabase/seed.sql` for seasons, teams, demo games, and demo odds.
4. Invite real players through Supabase Auth.
5. Insert matching rows in `profiles`, setting Jesang or other league managers to `role = 'admin'`.
6. From the app's Admin section, run Refresh to replace starter odds with current DraftKings odds from The Odds API.

Production picks should be submitted through `public.submit_weekly_pick`. That RPC:

- checks the user is authenticated
- checks the game belongs to the requested season/week
- checks kickoff has not passed using database server time
- reads the latest DraftKings odds row
- rejects favorites and pick'em lines
- stores the submitted spread snapshot
- updates the user's one allowed pick for the week only if it is unlocked

## API Routes

- `POST /api/odds` refreshes DraftKings spreads from The Odds API.
- `GET /api/scores` reads NFL scores from The Odds API for recently completed games.
- `POST /api/picks` calls the Supabase RPC for validated pick submission.

The Week 1 refresh window used by the app is September 9-16, 2026 UTC, which covers the full NFL Week 1 slate listed by NFL.com.

## Deployment

Deploy to Vercel:

1. Push this project to GitHub.
2. Import it in Vercel.
3. Add the environment variables above.
4. Set a scheduled job to call `/api/odds` during NFL weeks.
5. Set a scheduled job or admin workflow to call `/api/scores`, mark finals, and run `recalculate_game_picks`.

## Notes

The local UI ships with rich fixture data so the league feels complete immediately. Supabase production data is intentionally separate from that fixture data, which keeps the demo safe while preserving a clear path to launch.

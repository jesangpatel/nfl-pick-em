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
- Pick board, weekly picks, standings, season history table, cumulative chart, and admin screen
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

The app labels odds as either Live DraftKings or Demo/manual odds. Do not send the league link until Admin Refresh succeeds with a real `ODDS_API_KEY` and the live site reloads those lines from Supabase. If the provider lags DraftKings by a few seconds or minutes, the app can only be exact to the latest DraftKings line returned by The Odds API at refresh time.

Current pricing should be checked before launch. As of the research pass on September 6, 2026, The Odds API lists NFL as a paid/pro sport and its published pricing page lists a Professional tier at $29/month with 20,000 requests/month. This app is configured for the user's stricter 430-credit rolling 30-day budget so it can stay below a 500-credit monthly limit.

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
ODDS_MONTHLY_BUDGET=430
CRON_SECRET=
ADMIN_EMAILS=jesangpatel3@gmail.com
```

Use a long random value for `CRON_SECRET`, then configure Vercel Cron or any external scheduler to call `/api/cron/odds` with:

```txt
Authorization: Bearer YOUR_CRON_SECRET
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
3. Set Supabase Auth redirect URLs so magic links return to the app.
4. Send friends the Vercel link: `https://nfl-pick-em-pj4n-johipsczf-jesang-patel-s-projects.vercel.app/`
5. Each friend enters their email and display name on the site, taps the magic link in their email, and lands back in the app signed in.
6. During the week, each player opens Pick, taps one available underdog, and confirms.
7. The submitted DraftKings spread is snapshotted immediately. Later odds movement does not change that pick.
8. As each game kicks off, that game is shown as locked and can no longer be selected. The database RPC also blocks late submissions using server time.
9. After a player submits, they can open Week to see everyone else who has submitted. Before submitting, other users' picks stay hidden.
10. After games finish, the admin imports scores or enters finals, then recalculates scoring.

## Supabase Magic-Link Settings

In Supabase, go to Authentication, then URL Configuration.

Set Site URL to:

```txt
https://nfl-pick-em-pj4n-johipsczf-jesang-patel-s-projects.vercel.app
```

Add Redirect URLs:

```txt
https://nfl-pick-em-pj4n-johipsczf-jesang-patel-s-projects.vercel.app/auth/callback
http://localhost:3000/auth/callback
http://localhost:3001/auth/callback
http://localhost:3002/auth/callback
```

In Authentication, Providers, Email:

- Enable Email provider.
- Enable magic links/OTP.
- Allow new users to sign up.

After this, friends do not need an account created manually. They can open the site, type their email, and receive a login link.

## Vercel Login Prompt

If a friend sees an email or page saying there is no Vercel account for their email, that is Vercel Deployment Protection, not this app's Supabase magic-link login.

To let friends use the app without Vercel accounts, make the production deployment public:

1. Open the project in Vercel.
2. Go to Settings, then Deployment Protection.
3. Disable Vercel Authentication for the production deployment/domain, or use an unprotected production domain.
4. Re-test the public URL in a private/incognito browser before sending it to friends.

## No-Login Option

For testing, the app lets you manually add players in Admin and switch between them in Profile. This is intentionally frictionless.

For a real remote league, no-login self-submission needs secure personal pick links or short private player codes. Otherwise anyone with the link could submit as anyone else. The current Supabase schema is already set up for the safer login path; the next production improvement would be a `participants` table with one private invite token per player.

## Magic-Link Session Persistence

The browser Supabase client is configured with persistent sessions and token refresh. Friends should stay signed in on that device unless they log out, clear browser data, or you configure a shorter session lifetime in Supabase Auth settings.

In Supabase, leave session time-boxing disabled or set it very long if you want the "log in once" behavior.

## Odds Refresh Budget

The app includes a Vercel cron route at `/api/cron/odds`. Vercel can call it every 30 minutes, but the route only spends an Odds API credit when the cadence allows it.

Budget rules implemented:

- Maximum budget: 430 credits per rolling 30-day window.
- Tuesday and Wednesday: once every 4 hours during 8:00 AM-11:00 PM ET.
- Thursday and Friday: once every 2 hours during 8:00 AM-11:00 PM ET.
- Saturday and Sunday: once every 1 hour during 8:00 AM-11:00 PM ET.
- Any day: once every 30 minutes when a future game is within 2 hours of kickoff.
- Started games are ignored for urgency logic.
- If the 430-credit cap is reached, refreshes stop until the rolling window drops under budget.

The cron logs each successful API call in `odds_refresh_log`, including request usage headers returned by The Odds API.

Vercel Cron calls `/api/cron/odds` every 30 minutes after deployment. The endpoint checks the rules above before spending a credit. On Vercel Hobby, cron frequency may be limited to once per day; use Vercel Pro or an external scheduler if you need the every-30-minutes trigger.

## Admin Section

The Admin section is for league operations:

- refresh live DraftKings odds on demand
- see whether the app is using live or demo/manual odds
- manually override spreads if the odds provider is down
- add test players locally
- later: enter final scores and recalculate scoring

In production, regular players should not see Admin. The app hides Admin unless the signed-in user's profile role is `admin`, and the manual odds refresh API also checks for admin access. Set your admin by putting `jesangpatel3@gmail.com` in `ADMIN_EMAILS`; when you sign in, `/api/profile` creates your profile as admin.

## Testing Before Sending To Friends

1. Open the local preview.
2. Go to Admin and confirm the odds badge says Live DraftKings after Refresh. If it says Demo/manual odds, do not use the lines as real.
3. Add all friends under Manual Players.
4. Go to Profile and switch to each friend.
5. Go to Pick, choose an underdog, and confirm.
6. Go to Week and confirm each row shows `TEAM +spread vs OPP`.
7. Change one spread in Admin and confirm an already submitted pick keeps its original snapshot.
8. Temporarily set a game's kickoff time in the seed or database to a past time and confirm the card says Locked.
9. Submit one pick, set that selected game's kickoff to the past, and confirm the app/database will not let that user change picks.
10. Run the production checks:

```bash
npm run lint
npm run typecheck
npm run build
```

## What Codex Needs From You To Finish A Real Launch

Give Codex one of these two paths.

Path A, easiest and safest:

- Vercel URL: `https://nfl-pick-em-pj4n-johipsczf-jesang-patel-s-projects.vercel.app/`
- Admin email: `jesangpatel3@gmail.com`
- Confirmation that the Supabase env vars and `ODDS_API_KEY` are set in Vercel.
- Confirmation that you ran the migration and seed SQL.
- The admin email address that should control odds refreshes and scoring.
- The list of friend display names/emails to add as league users.

Path B, no-login friend experience:

- Confirm that you want private per-player pick links instead of magic-link login.
- The list of friend display names.
- Whether each private link should allow changing picks before kickoff.

Magic-link login is the recommended production path. Private pick links are easier for friends but need one more security layer so nobody can submit as someone else.

For Sunday, September 6, 2026, no Week 1 games have kicked off yet. The first listed game is Patriots at Seahawks on Wednesday, September 9, 2026 at 8:20 PM ET, so every Week 1 underdog is still selectable in the demo.

## Supabase Setup

1. Create a Supabase project.
2. Run `supabase/migrations/001_initial_schema.sql`.
3. Run `supabase/migrations/002_odds_refresh_budget.sql`, `003_lock_pick_changes_after_selected_game_starts.sql`, and `004_promote_jesang_admin.sql`.
4. Run `supabase/seed.sql` for seasons, teams, starter games, and local fallback odds.
5. Let real players join through the site's magic-link flow.
6. From the app's Admin section, run Refresh to replace starter odds with current DraftKings odds from The Odds API.

Production roster data comes only from `profiles`, which are created when real users sign in. The local demo names are used only when Supabase is not configured.

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
- `GET /api/cron/odds` refreshes odds only when the budget-aware cadence allows it.
- `GET /api/scores` reads NFL scores from The Odds API for recently completed games.
- `POST /api/picks` calls the Supabase RPC for validated pick submission.

The Week 1 refresh window used by the app is September 9-16, 2026 UTC, which covers the full NFL Week 1 slate listed by NFL.com.

## Deployment

Deploy to Vercel:

1. Push this project to GitHub.
2. Import it in Vercel.
3. Add the environment variables above.
4. Keep `vercel.json` in the repo so Vercel registers the `/api/cron/odds` scheduled job.
5. Set a scheduled job or admin workflow to call `/api/scores`, mark finals, and run `recalculate_game_picks`.

## Notes

The local UI ships with rich fixture data so the league feels complete immediately. Supabase production data is intentionally separate from that fixture data, which keeps the demo safe while preserving a clear path to launch.

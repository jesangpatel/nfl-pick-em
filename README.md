# NFL Underdog Pick'em

A private NFL underdog pool for friends. Regular players do not use email, magic links, or Supabase Auth. They choose their name once, the browser remembers it, and all pick rules are enforced by the server/database.

## Current Flow

1. New browser opens the site.
2. The app shows "Who Are You?"
3. The player chooses their name from the active participant roster.
4. The selected player ID is stored in `localStorage`.
5. Returning browsers open directly as that player.
6. Profile includes Switch Player.
7. Admin controls appear only after entering the admin key in Profile.

This is a trusted private pool. Someone could intentionally choose another name on their own device, but they cannot bypass kickoff locks or rewrite pick history through browser edits, localStorage changes, or computer-clock changes.

## Production Data Rules

- Supabase is the source of truth.
- Production roster rows live in `public.profiles`.
- Production does not auto-create fake users.
- If Supabase has zero active players, the app shows an empty state.
- Inactive players stay in the database so old picks and results remain historical, but production API responses hide them from player selection, weekly picks, standings, history, profile selection, and the Admin roster list.
- Local demo names are used only when Supabase environment variables are not configured.

## Odds Rules

The app uses The Odds API for DraftKings NFL spreads:

```txt
sport=americanfootball_nfl
bookmakers=draftkings
markets=spreads
regions=us
```

Production displays only odds rows saved with `source = 'the-odds-api'`. Seed/demo odds are not treated as live DraftKings lines. If DraftKings is unavailable, the app shows "DraftKings line currently unavailable" rather than inventing a number.

When a player submits or changes a pick, the database snapshots the current DraftKings spread into the pick row and audit event. Later odds refreshes update current game display, but they do not rewrite old pick snapshots.

## Pick Locking

A player can create or change their weekly pick only if:

- their existing selected game's kickoff is still in the future
- the new selected game's kickoff is still in the future
- the new team is the DraftKings underdog
- a real DraftKings spread from The Odds API exists for that game

Once the selected game starts, that weekly pick is locked. The database rejects later identity/spread changes even if someone sends a direct API request.

## Pick Audit Trail

Migration `005` creates `public.pick_audit_events`.

The audit table records append-only events for:

- `created`
- `changed`
- `locked`
- `admin-corrected` for a future explicit correction system

The current `picks` table remains the convenient current/final pick view. The audit table is the proof trail showing what happened and when.

## Environment Variables

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

ODDS_API_KEY=
ODDS_MONTHLY_BUDGET=430
CRON_SECRET=
ADMIN_SECRET=
```

Use a long random value for `ADMIN_SECRET`. Enter that value in Profile when you need Admin controls. `CRON_SECRET` protects the scheduled odds endpoint.

`ADMIN_EMAILS` is no longer needed for the regular app flow.

## Supabase Setup

Run migrations in order:

1. `supabase/migrations/001_initial_schema.sql`
2. `supabase/migrations/002_odds_refresh_budget.sql`
3. `supabase/migrations/003_lock_pick_changes_after_selected_game_starts.sql`
4. `supabase/migrations/004_promote_jesang_admin.sql`
5. `supabase/migrations/005_no_auth_participants_and_pick_audit.sql`
6. `supabase/migrations/006_harden_pick_submission_and_visibility.sql`

If `001` through `005` were already run, do not rerun them. Run only `006`.

Then run `supabase/seed.sql` only if your seasons, weeks, teams, and starter games are not already loaded. The seed includes local fallback odds marked as `source = 'demo'`; production ignores those for live DraftKings display.

## Adding Players

1. Open the live site.
2. Open Profile.
3. Enter `ADMIN_SECRET`.
4. Open Admin.
5. Add each friend's name.
6. Send friends the Vercel link.

Players do not need Supabase accounts. They select their name from the "Who Are You?" screen.

## Odds Refresh Budget

The app keeps the 430-credit rolling 30-day cap.

- Manual Admin Refresh counts against the same budget log as cron.
- Cron checks `/api/cron/odds`.
- The cron route uses the Supabase game schedule for urgency.
- Started games are ignored for urgency.
- Repeated refreshes cannot bypass the monthly cap.

cron-job.org should call the deployed Vercel URL:

```txt
URL: https://YOUR-VERCEL-DOMAIN.vercel.app/api/cron/odds
Method: GET
Authorization: Bearer YOUR_CRON_SECRET
```

In cron-job.org, add that as a custom request header named `Authorization` with the value `Bearer YOUR_CRON_SECRET`. Do not put the secret in the URL. The route also accepts `POST` and an `x-cron-secret` header for compatibility, but the recommended setup is `GET` plus the `Authorization` bearer header above.

Expected cron responses:

- `200` with `{"refreshed":true,...}` when an odds refresh runs.
- `200` with `{"refreshed":false,...}` when the cadence says it is not time yet.
- `401` when the header is missing or does not match `CRON_SECRET`.
- `503` when `CRON_SECRET` is not configured in Vercel.
- `500` for provider, Supabase, or persistence failures. These are written to `odds_refresh_log` with secrets redacted.

## API Routes

- `GET /api/league` returns active players, games, current DraftKings odds status, active-player picks, and audit summaries.
- `POST /api/picks` submits/changes a participant pick through `public.submit_participant_weekly_pick`.
- `GET /api/players` lists active participants.
- `POST /api/players` adds a participant; requires `x-admin-key`.
- `PATCH /api/players` activates/deactivates a participant; requires `x-admin-key`.
- `POST /api/odds` manually refreshes DraftKings odds; requires `x-admin-key`.
- `GET` or `POST /api/cron/odds` refreshes odds only when cadence and budget allow.
- `GET /api/scores` reads NFL scores from The Odds API.

## Deploy

From the project folder:

```bash
git status
git add .
git commit -m "Simplify pickem players and add pick audit trail"
git push
```

Then redeploy in Vercel, or let the connected GitHub deployment run automatically.

## Live Site Test Checklist

The full checklist also lives in `TESTING.md`.

1. Open the live site in an incognito/private browser.
2. Confirm there is no email field and no magic-link prompt.
3. Confirm "Who Are You?" appears.
4. If there are no players, enter the admin key in Profile, open Admin, and add players.
5. Select Jesang.
6. Reload the page and confirm Jesang is still selected.
7. Open Profile, click Switch Player, choose another name, and reload.
8. Open Admin with the admin key and click Refresh.
9. Confirm Admin shows updated DraftKings status, games updated, budget used, and any last error.
10. Reload the browser and confirm DraftKings lines persist.
11. Submit a pick before kickoff.
12. Change that pick before its original game starts.
13. Confirm History marks that pick as changed.
14. After kickoff, try changing the same pick and confirm the backend rejects it.
15. Refresh odds again and confirm the older pick's stored spread does not change.

## Validation

Run before deploying:

```bash
npm run lint
npm run typecheck
npm run build
```

## Limitations

- Player identity is intentionally trust-based. A friend can choose another friend's name, but cannot bypass server/database lock rules.
- Emergency admin corrections should be built as a separate audited correction flow before use.
- Vercel Hobby cron frequency may be limited; use Vercel Pro or an external scheduler if you need the full cadence.

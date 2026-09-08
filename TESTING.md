# Live Test Checklist

Run these after deploying the latest code and applying migration `006`.

## Test A - New Player / Browser

1. Open the live site in an incognito/private browser.
2. Confirm "Who Are You?" appears.
3. Choose Jesang.
4. Reload.
5. Confirm Jesang remains selected.

## Test B - Switch Player

1. Open Profile.
2. Click Switch Player.
3. Choose another participant.
4. Reload.
5. Confirm the browser now uses that participant.

## Test C - Initial Pick

1. Refresh DraftKings odds from Admin.
2. Pick an eligible underdog before kickoff.
3. Confirm the pick saves.
4. In Supabase, confirm one row exists in `picks` and one `created` row exists in `pick_audit_events`.

## Test D - Legal Pick Change

1. Before the original picked game's kickoff, choose another not-yet-started underdog.
2. Confirm the current `picks` row changes.
3. In Supabase, confirm the original `created` audit row remains and a new `changed` row exists.

## Test E - Illegal Late Change

1. After the selected game's kickoff, attempt to change the pick.
2. Confirm the app shows the backend error.
3. Confirm the `picks` row did not change.

## Test F - Past History Integrity

1. After a week is completed and scored, reload the browser or use another device.
2. Open History.
3. Confirm the old pick, result, points, and submitted time match the stored data.

## Test G - Changing Odds

1. Submit a pick.
2. Refresh DraftKings odds later.
3. Confirm the live Pick page can update.
4. Confirm the existing pick's stored `submitted_spread` and audit `new_spread` do not change.

## Test H - Odds Persistence

1. Admin Refresh Odds.
2. Note one DraftKings line.
3. Reload the site.
4. Confirm the same persisted line is still shown until the next successful refresh.

## Test I - Duplicate Games

1. Run Admin Refresh multiple times.
2. In Supabase, confirm each Week 1 matchup appears once by `(season_id, week_number, home_team_id, away_team_id)`.

## Test J - API Failure

1. Temporarily use a bad Odds API key in a non-production test deployment.
2. Refresh odds.
3. Confirm no fake odds appear.
4. Confirm Admin shows the provider error and `odds_refresh_log.status = 'error'`.

## Test K - Production Has No Demo Players

1. Open production with Supabase configured.
2. Confirm only rows from `public.profiles` appear.
3. Confirm Jesang, Varun, Ryan, or Nick do not appear unless you manually added them.

## Test L - Inactive Players Stay Hidden

1. Open Admin with the admin key.
2. Deactivate a participant.
3. Confirm the participant disappears from player selection, weekly picks, standings, history, profile selection, and the Admin roster list.
4. In Supabase, confirm the profile row and any old picks still exist.

## Test M - cron-job.org

1. Set the cron-job.org URL to `https://YOUR-VERCEL-DOMAIN.vercel.app/api/cron/odds`.
2. Set method to `GET`.
3. Add custom header `Authorization` with value `Bearer YOUR_CRON_SECRET`.
4. Run the job manually.
5. Confirm cron-job.org sees HTTP `200`.
6. If the response has `"refreshed": true`, check Admin and `odds_refresh_log` for a success row.
7. If the response has `"refreshed": false`, the cron call worked but cadence or budget correctly skipped the provider request.

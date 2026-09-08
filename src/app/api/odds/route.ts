import { NextResponse } from "next/server";
import { currentWeek, season } from "@/lib/demo-data";
import { budgetWindowStart, ODDS_MONTHLY_BUDGET } from "@/lib/odds/cadence";
import { persistDraftKingsOdds } from "@/lib/odds/persist";
import { TheOddsApiDraftKingsProvider } from "@/lib/odds/the-odds-api";
import { createServiceClient, requestHasAdminAccess } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const service = process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY ? createServiceClient() : null;

  try {
    if (process.env.NEXT_PUBLIC_SUPABASE_URL && !service) {
      throw new Error("Supabase service credentials are not configured.");
    }

    if (service && !requestHasAdminAccess(request)) {
      return NextResponse.json({ error: "Admin access required." }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    if (service) {
      const { data: refreshes, error } = await service
        .from("odds_refresh_log")
        .select("credits_used")
        .gte("fetched_at", budgetWindowStart());
      if (error) throw error;

      const creditsUsedThisWindow = (refreshes ?? []).reduce((sum, item) => sum + Number(item.credits_used ?? 1), 0);
      const monthlyBudget = Number(process.env.ODDS_MONTHLY_BUDGET ?? ODDS_MONTHLY_BUDGET);
      if (creditsUsedThisWindow >= monthlyBudget) {
        return NextResponse.json(
          { error: "Monthly odds refresh budget has been reached.", creditsUsedThisWindow, monthlyBudget },
          { status: 429 },
        );
      }
    }

    const provider = new TheOddsApiDraftKingsProvider();
    const result = await provider.refreshOdds({
      commenceTimeFrom: body.commenceTimeFrom,
      commenceTimeTo: body.commenceTimeTo,
    });

    if (result.games.length === 0) {
      throw new Error("No DraftKings NFL spread events were returned by The Odds API for this window.");
    }

    let persisted = null;
    if (service) {
      persisted = await persistDraftKingsOdds({
        supabase: service,
        games: result.games,
        seasonYear: Number(body.season ?? season),
        weekNumber: Number(body.week ?? currentWeek),
      });
      const { error: logError } = await service.from("odds_refresh_log").insert({
        fetched_at: result.fetchedAt,
        credits_used: 1,
        source: result.source,
        requests_remaining: result.requestsRemaining,
        requests_used: result.requestsUsed,
        status: "success",
        notes: `Manual admin refresh. Persisted ${persisted.oddsInserted} odds rows across ${persisted.gamesUpserted} games.`,
      });
      if (logError) throw logError;
    }

    return NextResponse.json({ ...result, persisted });
  } catch (error) {
    const message = sanitizeError(error);
    if (service) {
      await service.from("odds_refresh_log").insert({
        credits_used: 1,
        source: "the-odds-api",
        status: "error",
        notes: `Manual admin refresh failed: ${message}`,
      });
    }

    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function sanitizeError(error: unknown) {
  const raw = error instanceof Error ? error.message : "Unable to refresh DraftKings odds.";
  return [process.env.ODDS_API_KEY, process.env.SUPABASE_SERVICE_ROLE_KEY, process.env.CRON_SECRET, process.env.ADMIN_SECRET]
    .filter((secret): secret is string => Boolean(secret))
    .reduce((message, secret) => message.replaceAll(String(secret), "[redacted]"), raw);
}

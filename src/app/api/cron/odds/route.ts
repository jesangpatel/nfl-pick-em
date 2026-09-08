import { NextResponse } from "next/server";
import { currentWeek, season } from "@/lib/demo-data";
import { budgetWindowStart, decideOddsRefresh, ODDS_MONTHLY_BUDGET } from "@/lib/odds/cadence";
import { persistDraftKingsOdds } from "@/lib/odds/persist";
import { TheOddsApiDraftKingsProvider } from "@/lib/odds/the-odds-api";
import { createServiceClient } from "@/lib/supabase/server";

const weekOneWindow = {
  commenceTimeFrom: "2026-09-09T00:00:00Z",
  commenceTimeTo: "2026-09-16T04:00:00Z",
};

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const expected = process.env.CRON_SECRET;
  if (expected && authHeader !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  let supabase: ReturnType<typeof createServiceClient> | null = null;

  try {
    supabase = createServiceClient();
    const { data: activeSeason, error: seasonError } = await supabase
      .from("seasons")
      .select("id, year")
      .eq("active", true)
      .single();
    if (seasonError) throw seasonError;

    const { data: openWeek } = await supabase
      .from("weeks")
      .select("week_number")
      .eq("season_id", activeSeason.id)
      .eq("status", "open")
      .order("week_number", { ascending: true })
      .limit(1)
      .maybeSingle();
    const weekNumber = openWeek?.week_number ?? currentWeek;

    const { data: dbGames, error: gamesError } = await supabase
      .from("games")
      .select("id, external_game_id, kickoff_at, status, home_team_id, away_team_id")
      .eq("season_id", activeSeason.id)
      .eq("week_number", weekNumber)
      .order("kickoff_at");
    if (gamesError) throw gamesError;

    const windowStart = budgetWindowStart(now);
    const { data: refreshes, error } = await supabase
      .from("odds_refresh_log")
      .select("fetched_at, credits_used")
      .gte("fetched_at", windowStart)
      .order("fetched_at", { ascending: false });

    if (error) throw error;

    const creditsUsedThisWindow = (refreshes ?? []).reduce((sum, item) => sum + Number(item.credits_used ?? 1), 0);
    const lastRefreshAt = refreshes?.[0]?.fetched_at ?? null;
    const decision = decideOddsRefresh({
      now,
      games: (dbGames ?? []).map((game) => ({
        id: game.id,
        externalGameId: game.external_game_id,
        season: activeSeason.year ?? season,
        week: weekNumber,
        homeTeamId: game.home_team_id,
        awayTeamId: game.away_team_id,
        kickoffAt: game.kickoff_at,
        status: game.status,
        sportsbook: "draftkings" as const,
      })),
      lastRefreshAt,
      creditsUsedThisWindow,
      monthlyBudget: Number(process.env.ODDS_MONTHLY_BUDGET ?? ODDS_MONTHLY_BUDGET),
    });

    if (!decision.shouldRefresh) {
      return NextResponse.json({ refreshed: false, decision });
    }

    const provider = new TheOddsApiDraftKingsProvider();
    const result = await provider.refreshOdds(weekOneWindow);
    const persisted = await persistDraftKingsOdds({
      supabase,
      games: result.games,
      seasonYear: activeSeason.year ?? season,
      weekNumber,
    });

    const { error: logError } = await supabase.from("odds_refresh_log").insert({
      fetched_at: result.fetchedAt,
      credits_used: 1,
      source: result.source,
      requests_remaining: result.requestsRemaining,
      requests_used: result.requestsUsed,
      status: "success",
      notes: decision.reason,
    });
    if (logError) throw logError;

    return NextResponse.json({
      refreshed: true,
      decision,
      games: result.games.length,
      persisted,
      requestsRemaining: result.requestsRemaining,
      requestsUsed: result.requestsUsed,
    });
  } catch (error) {
    const message = sanitizeError(error);
    if (supabase) {
      await supabase.from("odds_refresh_log").insert({
        credits_used: 1,
        source: "the-odds-api",
        status: "error",
        notes: `Cron odds refresh failed: ${message}`,
      });
    }
    return NextResponse.json(
      { error: message },
      { status: 500 },
    );
  }
}

function sanitizeError(error: unknown) {
  const raw = error instanceof Error ? error.message : "Cron odds refresh failed.";
  return [process.env.ODDS_API_KEY, process.env.SUPABASE_SERVICE_ROLE_KEY, process.env.CRON_SECRET, process.env.ADMIN_SECRET]
    .filter((secret): secret is string => Boolean(secret))
    .reduce((message, secret) => message.replaceAll(String(secret), "[redacted]"), raw);
}

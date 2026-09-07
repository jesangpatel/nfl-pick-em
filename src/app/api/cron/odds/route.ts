import { NextResponse } from "next/server";
import { games } from "@/lib/demo-data";
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

  try {
    const supabase = createServiceClient();
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
      games,
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
      seasonYear: 2026,
      weekNumber: 1,
    });

    await supabase.from("odds_refresh_log").insert({
      fetched_at: result.fetchedAt,
      credits_used: 1,
      source: result.source,
      requests_remaining: result.requestsRemaining,
      requests_used: result.requestsUsed,
      status: "success",
      notes: decision.reason,
    });

    return NextResponse.json({
      refreshed: true,
      decision,
      games: result.games.length,
      persisted,
      requestsRemaining: result.requestsRemaining,
      requestsUsed: result.requestsUsed,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Cron odds refresh failed." },
      { status: 500 },
    );
  }
}

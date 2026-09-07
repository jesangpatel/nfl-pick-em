import { NextResponse } from "next/server";
import { currentWeek, season } from "@/lib/demo-data";
import { budgetWindowStart, ODDS_MONTHLY_BUDGET } from "@/lib/odds/cadence";
import { persistDraftKingsOdds } from "@/lib/odds/persist";
import { TheOddsApiDraftKingsProvider } from "@/lib/odds/the-odds-api";
import { createClient, createServiceClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  try {
    if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
      const isAdmin = await currentUserIsAdmin();
      if (!isAdmin) {
        return NextResponse.json({ error: "Admin access required." }, { status: 403 });
      }
    }

    const body = await request.json().catch(() => ({}));
    const service = process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY ? createServiceClient() : null;
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
    let persisted = null;
    if (service) {
      persisted = await persistDraftKingsOdds({
        supabase: service,
        games: result.games,
        seasonYear: Number(body.season ?? season),
        weekNumber: Number(body.week ?? currentWeek),
      });
      await service.from("odds_refresh_log").insert({
        fetched_at: result.fetchedAt,
        credits_used: 1,
        source: result.source,
        requests_remaining: result.requestsRemaining,
        requests_used: result.requestsUsed,
        status: "success",
        notes: "Manual admin refresh.",
      });
    }

    return NextResponse.json({ ...result, persisted });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to refresh DraftKings odds." },
      { status: 500 },
    );
  }
}

export async function GET() {
  return POST(new Request("http://localhost/api/odds", { method: "POST" }));
}

async function currentUserIsAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;

  const service = createServiceClient();
  const { data } = await service.from("profiles").select("role").eq("id", user.id).single();
  return data?.role === "admin";
}

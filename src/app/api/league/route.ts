import { NextResponse } from "next/server";
import { currentWeek, season } from "@/lib/demo-data";
import { budgetWindowStart } from "@/lib/odds/cadence";
import { createServiceClient } from "@/lib/supabase/server";

type HydratedGame = {
  id: string;
  externalGameId: string;
  season: number;
  week: number;
  homeTeamId: string;
  awayTeamId: string;
  kickoffAt: string;
  status: string;
  homeScore?: number;
  awayScore?: number;
  homeSpread?: number;
  awaySpread?: number;
  sportsbook: "draftkings";
  lastOddsUpdate?: string;
  venue?: string;
  broadcast?: string;
};

export async function GET() {
  try {
    const service = createServiceClient();
    const { data: activeSeason, error: seasonError } = await service
      .from("seasons")
      .select("id, year")
      .eq("active", true)
      .single();
    if (seasonError) throw seasonError;

    const { data: openWeek } = await service
      .from("weeks")
      .select("week_number")
      .eq("season_id", activeSeason.id)
      .eq("status", "open")
      .order("week_number", { ascending: true })
      .limit(1)
      .maybeSingle();

    const weekNumber = openWeek?.week_number ?? currentWeek;
    const windowStart = budgetWindowStart();

    const [
      { data: profiles, error: profilesError },
      { data: teams, error: teamsError },
      { data: games, error: gamesError },
      { data: odds, error: oddsError },
      { data: picks, error: picksError },
      { data: auditEvents, error: auditError },
      { data: refreshes, error: refreshError },
    ] = await Promise.all([
      service.from("profiles").select("id, display_name, avatar_url, role, active, created_at").order("display_name"),
      service.from("teams").select("id, abbreviation"),
      service
        .from("games")
        .select("id, external_game_id, kickoff_at, status, home_team_id, away_team_id, home_score, away_score, venue, broadcast")
        .eq("season_id", activeSeason.id)
        .eq("week_number", weekNumber)
        .order("kickoff_at"),
      service
        .from("odds")
        .select("id, game_id, home_spread, away_spread, fetched_at, source, external_event_id")
        .eq("source", "the-odds-api")
        .order("fetched_at", { ascending: false }),
      service
        .from("picks")
        .select("id, user_id, week_number, game_id, selected_team_id, opponent_team_id, submitted_spread, submitted_at, result, points_earned, locked")
        .eq("season_id", activeSeason.id),
      service
        .from("pick_audit_events")
        .select("pick_id, participant_id, week_number, action_type, changed_at")
        .eq("season_id", activeSeason.id)
        .order("changed_at", { ascending: true }),
      service
        .from("odds_refresh_log")
        .select("fetched_at, credits_used, status, notes, requests_remaining, requests_used")
        .gte("fetched_at", windowStart)
        .order("fetched_at", { ascending: false }),
    ]);

    if (profilesError) throw profilesError;
    if (teamsError) throw teamsError;
    if (gamesError) throw gamesError;
    if (oddsError) throw oddsError;
    if (picksError) throw picksError;
    if (auditError) throw auditError;
    if (refreshError) throw refreshError;

    const activeProfiles = (profiles ?? []).filter((profile) => profile.active ?? true);
    const activeProfileIds = new Set(activeProfiles.map((profile) => profile.id));
    const visiblePicks = (picks ?? []).filter((pick) => activeProfileIds.has(pick.user_id));
    const visibleAuditEvents = (auditEvents ?? []).filter((event) => activeProfileIds.has(event.participant_id));
    const teamAbbrById = new Map((teams ?? []).map((team) => [team.id, team.abbreviation]));
    const latestOddsByGame = new Map<string, { home_spread: number; away_spread: number; fetched_at: string }>();
    for (const oddsRow of odds ?? []) {
      if (!latestOddsByGame.has(oddsRow.game_id)) latestOddsByGame.set(oddsRow.game_id, oddsRow);
    }

    const hydratedGames = (games ?? []).map((game) => {
      const latestOdds = latestOddsByGame.get(game.id);
      return {
        id: game.id,
        externalGameId: game.external_game_id,
        season: activeSeason.year,
        week: weekNumber,
        homeTeamId: teamAbbrById.get(game.home_team_id) ?? game.home_team_id,
        awayTeamId: teamAbbrById.get(game.away_team_id) ?? game.away_team_id,
        kickoffAt: game.kickoff_at,
        status: game.status,
        homeScore: game.home_score ?? undefined,
        awayScore: game.away_score ?? undefined,
        homeSpread: latestOdds?.home_spread,
        awaySpread: latestOdds?.away_spread,
        sportsbook: "draftkings" as const,
        lastOddsUpdate: latestOdds?.fetched_at,
        venue: game.venue ?? undefined,
        broadcast: game.broadcast ?? undefined,
      };
    });
    const visibleGames = dedupeMatchups(hydratedGames);
    const latestRefresh = refreshes?.[0] ?? null;

    return NextResponse.json({
      season: activeSeason.year ?? season,
      currentWeek: weekNumber,
      oddsSummary: {
        liveOddsGames: visibleGames.filter((game) => typeof game.homeSpread === "number" && typeof game.awaySpread === "number").length,
        totalGames: visibleGames.length,
        latestFetchedAt: visibleGames
          .map((game) => game.lastOddsUpdate)
          .filter(Boolean)
          .sort()
          .at(-1) ?? null,
        creditsUsedThisWindow: (refreshes ?? []).reduce((sum, row) => sum + Number(row.credits_used ?? 1), 0),
        lastRefreshStatus: latestRefresh?.status ?? null,
        lastRefreshAt: latestRefresh?.fetched_at ?? null,
        lastRefreshNotes: latestRefresh?.notes ?? null,
        requestsRemaining: latestRefresh?.requests_remaining ?? null,
        requestsUsed: latestRefresh?.requests_used ?? null,
      },
      players: activeProfiles.map((profile) => ({
        id: profile.id,
        displayName: profile.display_name,
        avatarUrl: profile.avatar_url ?? undefined,
        role: profile.role,
        active: true,
      })),
      activePlayers: activeProfiles.map((profile) => ({
        id: profile.id,
        displayName: profile.display_name,
        avatarUrl: profile.avatar_url ?? undefined,
        role: profile.role,
        active: true,
      })),
      games: visibleGames,
      picks: visiblePicks.map((pick) => ({
        id: pick.id,
        userId: pick.user_id,
        season: activeSeason.year,
        week: pick.week_number,
        gameId: pick.game_id,
        selectedTeamId: teamAbbrById.get(pick.selected_team_id) ?? pick.selected_team_id,
        opponentTeamId: teamAbbrById.get(pick.opponent_team_id) ?? pick.opponent_team_id,
        submittedSpread: Number(pick.submitted_spread),
        submittedAt: pick.submitted_at,
        result: pick.result,
        pointsEarned: Number(pick.points_earned),
        locked: pick.locked,
        changed: visibleAuditEvents.some(
          (event) => event.pick_id === pick.id && event.action_type === "changed",
        ),
      })),
      auditEvents: visibleAuditEvents,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to load league data." },
      { status: 500 },
    );
  }
}

function dedupeMatchups(games: HydratedGame[]) {
  const byMatchup = new Map<string, HydratedGame>();
  for (const game of games) {
    const key = `${game.awayTeamId}-${game.homeTeamId}`;
    const existing = byMatchup.get(key);
    if (!existing || shouldPreferGame(game, existing)) {
      byMatchup.set(key, game);
    }
  }

  return [...byMatchup.values()].sort((a, b) => new Date(a.kickoffAt).getTime() - new Date(b.kickoffAt).getTime());
}

function shouldPreferGame(candidate: HydratedGame, existing: HydratedGame) {
  const candidateHasOdds = typeof candidate.homeSpread === "number" && typeof candidate.awaySpread === "number";
  const existingHasOdds = typeof existing.homeSpread === "number" && typeof existing.awaySpread === "number";
  if (candidateHasOdds !== existingHasOdds) return candidateHasOdds;
  return new Date(candidate.lastOddsUpdate ?? 0).getTime() > new Date(existing.lastOddsUpdate ?? 0).getTime();
}

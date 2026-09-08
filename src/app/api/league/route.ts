import { NextResponse } from "next/server";
import { currentWeek, season } from "@/lib/demo-data";
import { createClient, createServiceClient, ensureUserProfile } from "@/lib/supabase/server";

export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
    }

    const service = createServiceClient();
    await ensureUserProfile({ service, user });
    const { data: activeSeason, error: seasonError } = await service
      .from("seasons")
      .select("id, year")
      .eq("active", true)
      .single();
    if (seasonError) return NextResponse.json({ error: seasonError.message }, { status: 500 });

    const { data: openWeek } = await service
      .from("weeks")
      .select("week_number")
      .eq("season_id", activeSeason.id)
      .eq("status", "open")
      .order("week_number", { ascending: true })
      .limit(1)
      .maybeSingle();

    const weekNumber = openWeek?.week_number ?? currentWeek;

    const [{ data: profiles }, { data: teams }, { data: games }, { data: odds }, { data: userPick }] = await Promise.all([
      service.from("profiles").select("id, display_name, avatar_url, role").order("display_name"),
      service.from("teams").select("id, abbreviation"),
      service
        .from("games")
        .select("id, external_game_id, kickoff_at, status, home_team_id, away_team_id, home_score, away_score, venue, broadcast")
        .eq("season_id", activeSeason.id)
        .eq("week_number", weekNumber)
        .order("kickoff_at"),
      service
        .from("odds")
        .select("game_id, home_spread, away_spread, fetched_at, source")
        .eq("source", "the-odds-api")
        .order("fetched_at", { ascending: false }),
      service
        .from("picks")
        .select("id")
        .eq("season_id", activeSeason.id)
        .eq("week_number", weekNumber)
        .eq("user_id", user.id)
        .maybeSingle(),
    ]);

    const teamAbbrById = new Map((teams ?? []).map((team) => [team.id, team.abbreviation]));
    const latestOddsByGame = new Map<string, { home_spread: number; away_spread: number; fetched_at: string; source: string }>();
    for (const oddsRow of odds ?? []) {
      if (!latestOddsByGame.has(oddsRow.game_id)) latestOddsByGame.set(oddsRow.game_id, oddsRow);
    }

    const shouldRevealCurrentWeek = Boolean(userPick);
    const picksQuery = service
      .from("picks")
      .select("id, user_id, week_number, game_id, selected_team_id, opponent_team_id, submitted_spread, submitted_at, result, points_earned, locked")
      .eq("season_id", activeSeason.id);

    const { data: picks } = shouldRevealCurrentWeek
      ? await picksQuery
      : await picksQuery.or(`week_number.neq.${weekNumber},user_id.eq.${user.id}`);

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
        sportsbook: "draftkings",
        lastOddsUpdate: latestOdds?.fetched_at,
        venue: game.venue ?? undefined,
        broadcast: game.broadcast ?? undefined,
      };
    });
    const visibleGames = dedupeMatchups(hydratedGames);

    return NextResponse.json({
      currentUserId: user.id,
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
      },
      players: (profiles ?? []).map((profile) => ({
        id: profile.id,
        displayName: profile.display_name,
        avatarUrl: profile.avatar_url ?? undefined,
        role: profile.role,
      })),
      games: visibleGames,
      picks: (picks ?? []).map((pick) => ({
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
      })),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to load league data." },
      { status: 500 },
    );
  }
}

function dedupeMatchups<T extends { homeTeamId: string; awayTeamId: string; kickoffAt: string; lastOddsUpdate?: string }>(games: T[]) {
  const byMatchup = new Map<string, T>();
  for (const game of games) {
    const key = `${game.awayTeamId}-${game.homeTeamId}`;
    const existing = byMatchup.get(key);
    if (!existing || shouldPreferGame(game, existing)) {
      byMatchup.set(key, game);
    }
  }

  return [...byMatchup.values()].sort((a, b) => new Date(a.kickoffAt).getTime() - new Date(b.kickoffAt).getTime());
}

function shouldPreferGame<T extends { homeSpread?: number; awaySpread?: number; lastOddsUpdate?: string }>(candidate: T, existing: T) {
  const candidateHasOdds = typeof candidate.homeSpread === "number" && typeof candidate.awaySpread === "number";
  const existingHasOdds = typeof existing.homeSpread === "number" && typeof existing.awaySpread === "number";
  if (candidateHasOdds !== existingHasOdds) return candidateHasOdds;
  return new Date(candidate.lastOddsUpdate ?? 0).getTime() > new Date(existing.lastOddsUpdate ?? 0).getTime();
}

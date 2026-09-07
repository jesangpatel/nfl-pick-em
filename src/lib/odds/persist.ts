import type { SupabaseClient } from "@supabase/supabase-js";
import type { Game } from "@/lib/types";

export async function persistDraftKingsOdds({
  supabase,
  games,
  seasonYear,
  weekNumber,
}: {
  supabase: SupabaseClient;
  games: Game[];
  seasonYear: number;
  weekNumber: number;
}) {
  if (games.length === 0) return { gamesUpserted: 0, oddsInserted: 0 };

  const { data: season, error: seasonError } = await supabase
    .from("seasons")
    .select("id")
    .eq("year", seasonYear)
    .single();
  if (seasonError) throw seasonError;

  const { data: teams, error: teamsError } = await supabase
    .from("teams")
    .select("id, abbreviation");
  if (teamsError) throw teamsError;

  const teamIds = new Map((teams ?? []).map((team) => [team.abbreviation, team.id]));
  const gameRows = games.flatMap((game) => {
    const homeTeamId = teamIds.get(game.homeTeamId);
    const awayTeamId = teamIds.get(game.awayTeamId);
    if (!homeTeamId || !awayTeamId) return [];
    return [
      {
        external_game_id: game.externalGameId,
        season_id: season.id,
        week_number: weekNumber,
        home_team_id: homeTeamId,
        away_team_id: awayTeamId,
        kickoff_at: game.kickoffAt,
        status: game.status,
        venue: game.venue ?? null,
        broadcast: game.broadcast ?? null,
      },
    ];
  });

  const { data: upsertedGames, error: gamesError } = await supabase
    .from("games")
    .upsert(gameRows, { onConflict: "season_id,external_game_id" })
    .select("id, external_game_id");
  if (gamesError) throw gamesError;

  const dbGameIds = new Map((upsertedGames ?? []).map((game) => [game.external_game_id, game.id]));
  const oddsRows = games.flatMap((game) => {
    const gameId = dbGameIds.get(game.externalGameId);
    if (!gameId || typeof game.homeSpread !== "number" || typeof game.awaySpread !== "number") return [];
    return [
      {
        game_id: gameId,
        sportsbook: "draftkings",
        home_spread: game.homeSpread,
        away_spread: game.awaySpread,
        fetched_at: game.lastOddsUpdate ?? new Date().toISOString(),
        source: "the-odds-api",
      },
    ];
  });

  const { error: oddsError } = await supabase.from("odds").insert(oddsRows);
  if (oddsError) throw oddsError;

  return { gamesUpserted: gameRows.length, oddsInserted: oddsRows.length };
}


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
  let gamesUpserted = 0;
  let oddsInserted = 0;

  for (const game of games) {
    const homeTeamId = teamIds.get(game.homeTeamId);
    const awayTeamId = teamIds.get(game.awayTeamId);
    if (!homeTeamId || !awayTeamId) continue;

    const row = {
      external_game_id: game.externalGameId,
      season_id: season.id,
      week_number: weekNumber,
      home_team_id: homeTeamId,
      away_team_id: awayTeamId,
      kickoff_at: game.kickoffAt,
      status: game.status,
      venue: game.venue ?? null,
      broadcast: game.broadcast ?? null,
    };

    const { data: existingExternalGame, error: externalLookupError } = await supabase
      .from("games")
      .select("id, external_game_id")
      .eq("season_id", season.id)
      .eq("external_game_id", game.externalGameId)
      .maybeSingle();
    if (externalLookupError) throw externalLookupError;

    const { data: existingMatchupGame, error: matchupLookupError } = await supabase
      .from("games")
      .select("id, external_game_id")
      .eq("season_id", season.id)
      .eq("week_number", weekNumber)
      .eq("home_team_id", homeTeamId)
      .eq("away_team_id", awayTeamId)
      .maybeSingle();
    if (matchupLookupError) throw matchupLookupError;

    const existingGame = existingMatchupGame ?? existingExternalGame;
    const updateRow =
      existingMatchupGame && existingExternalGame && existingMatchupGame.id !== existingExternalGame.id
        ? { ...row, external_game_id: existingMatchupGame.external_game_id }
        : row;
    const { data: savedGame, error: gamesError } = existingGame
      ? await supabase.from("games").update(updateRow).eq("id", existingGame.id).select("id").single()
      : await supabase.from("games").upsert(row, { onConflict: "season_id,external_game_id" }).select("id").single();
    if (gamesError) throw gamesError;

    gamesUpserted += 1;

    if (typeof game.homeSpread !== "number" || typeof game.awaySpread !== "number") continue;

    const { error: oddsError } = await supabase.from("odds").insert({
      game_id: savedGame.id,
      sportsbook: "draftkings",
      home_spread: game.homeSpread,
      away_spread: game.awaySpread,
      fetched_at: game.lastOddsUpdate ?? new Date().toISOString(),
      source: "the-odds-api",
    });
    if (oddsError) throw oddsError;

    oddsInserted += 1;
  }

  return { gamesUpserted, oddsInserted };
}

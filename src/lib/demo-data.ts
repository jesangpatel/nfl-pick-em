import type { Game, Pick, Player } from "@/lib/types";
import { getOpponent } from "@/lib/scoring";

export const season = 2026;
export const currentWeek = 1;

export const players: Player[] = [
  { id: "u-jesang", displayName: "Jesang", avatarUrl: "JP", role: "admin" },
  { id: "u-varun", displayName: "Varun", avatarUrl: "V", role: "player" },
  { id: "u-ryan", displayName: "Ryan", avatarUrl: "R", role: "player" },
  { id: "u-nick", displayName: "Nick", avatarUrl: "N", role: "player" },
];

export const games: Game[] = [
  ["ne-sea", "SEA", "NE", "2026-09-10T00:20:00Z", -4.5, 4.5, "Lumen Field", "NBC"],
  ["sf-lar", "LAR", "SF", "2026-09-11T00:35:00Z", 2.5, -2.5, "Melbourne Cricket Ground", "Netflix"],
  ["chi-car", "CAR", "CHI", "2026-09-13T17:00:00Z", -3.5, 3.5, "Bank of America Stadium", "FOX"],
  ["tb-cin", "CIN", "TB", "2026-09-13T17:00:00Z", -2.5, 2.5, "Paycor Stadium", "FOX"],
  ["no-det", "DET", "NO", "2026-09-13T17:00:00Z", -6.5, 6.5, "Ford Field", "FOX"],
  ["buf-hou", "HOU", "BUF", "2026-09-13T17:00:00Z", 1.5, -1.5, "NRG Stadium", "CBS"],
  ["bal-ind", "IND", "BAL", "2026-09-13T17:00:00Z", 3, -3, "Lucas Oil Stadium", "CBS"],
  ["cle-jax", "JAX", "CLE", "2026-09-13T17:00:00Z", -4, 4, "EverBank Stadium", "CBS"],
  ["atl-pit", "PIT", "ATL", "2026-09-13T17:00:00Z", -5.5, 5.5, "Acrisure Stadium", "FOX"],
  ["nyj-ten", "TEN", "NYJ", "2026-09-13T17:00:00Z", -1.5, 1.5, "Nissan Stadium", "CBS"],
  ["ari-lac", "LAC", "ARI", "2026-09-13T20:25:00Z", -7.5, 7.5, "SoFi Stadium", "CBS"],
  ["mia-lv", "LV", "MIA", "2026-09-13T20:25:00Z", 2, -2, "Allegiant Stadium", "FOX"],
  ["gb-min", "MIN", "GB", "2026-09-13T20:25:00Z", 3.5, -3.5, "U.S. Bank Stadium", "CBS"],
  ["was-phi", "PHI", "WAS", "2026-09-13T20:25:00Z", -6, 6, "Lincoln Financial Field", "FOX"],
  ["dal-nyg", "NYG", "DAL", "2026-09-14T00:20:00Z", 4.5, -4.5, "MetLife Stadium", "NBC"],
  ["den-kc", "KC", "DEN", "2026-09-15T00:15:00Z", -8.5, 8.5, "GEHA Field at Arrowhead Stadium", "ESPN"],
].map(([slug, homeTeamId, awayTeamId, kickoffAt, homeSpread, awaySpread, venue, broadcast]) => ({
  id: `g-w1-${slug}`,
  externalGameId: `nfl-2026-w1-${slug}`,
  season,
  week: currentWeek,
  homeTeamId: String(homeTeamId),
  awayTeamId: String(awayTeamId),
  kickoffAt: String(kickoffAt),
  status: "scheduled",
  homeSpread: Number(homeSpread),
  awaySpread: Number(awaySpread),
  sportsbook: "draftkings",
  lastOddsUpdate: "2026-09-06T20:00:00Z",
  venue: String(venue),
  broadcast: String(broadcast),
})) as Game[];

export const allGames = [...games];

export const picks: Pick[] = [
  makePick("u-jesang", "g-w1-ne-sea", "NE", 4.5, "2026-09-06T20:12:00Z"),
  makePick("u-varun", "g-w1-ari-lac", "ARI", 7.5, "2026-09-06T20:18:00Z"),
  makePick("u-ryan", "g-w1-den-kc", "DEN", 8.5, "2026-09-06T20:21:00Z"),
];

export const seededCurrentPick = picks[0];

function makePick(userId: string, gameId: string, selectedTeamId: string, spread: number, submittedAt: string): Pick {
  const game = allGames.find((item) => item.id === gameId);
  if (!game) throw new Error(`Missing game ${gameId}`);
  return {
    id: `p-${userId}-${gameId}`,
    userId,
    season,
    week: currentWeek,
    gameId,
    selectedTeamId,
    opponentTeamId: getOpponent(game, selectedTeamId),
    submittedSpread: spread,
    submittedAt,
    result: "pending",
    pointsEarned: 0,
    locked: false,
  };
}

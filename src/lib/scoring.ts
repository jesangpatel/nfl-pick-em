import type { Game, Pick, PickResult } from "@/lib/types";

export function potentialPoints(spread: number) {
  return Number((spread + (spread >= 7 ? 5 : 3)).toFixed(1));
}

export function getUnderdog(game: Game) {
  if (typeof game.homeSpread !== "number" || typeof game.awaySpread !== "number") return null;
  if (game.homeSpread > game.awaySpread) return { teamId: game.homeTeamId, spread: game.homeSpread };
  if (game.awaySpread > game.homeSpread) return { teamId: game.awayTeamId, spread: game.awaySpread };
  return null;
}

export function getOpponent(game: Game, teamId: string) {
  return game.homeTeamId === teamId ? game.awayTeamId : game.homeTeamId;
}

export function hasGameStarted(game: Game, now = new Date()) {
  return new Date(game.kickoffAt).getTime() <= now.getTime();
}

export function scorePick(pick: Pick, game: Game): { result: PickResult; pointsEarned: number } {
  if (game.status === "canceled" || game.status === "postponed") return { result: "void", pointsEarned: 0 };
  if (game.status !== "final" || game.homeScore == null || game.awayScore == null) {
    return { result: "pending", pointsEarned: 0 };
  }
  if (game.homeScore === game.awayScore) return { result: "push", pointsEarned: 0 };

  const winnerId = game.homeScore > game.awayScore ? game.homeTeamId : game.awayTeamId;
  if (winnerId !== pick.selectedTeamId) return { result: "loss", pointsEarned: 0 };

  return { result: "win", pointsEarned: potentialPoints(pick.submittedSpread) };
}


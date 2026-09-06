import type { ChartPoint, Pick, Player, Standing } from "@/lib/types";

export function buildStandings(players: Player[], picks: Pick[]): Standing[] {
  const standings = players.map((player) => {
    const playerPicks = picks.filter((pick) => pick.userId === player.id && pick.result !== "void");
    const wins = playerPicks.filter((pick) => pick.result === "win").length;
    const losses = playerPicks.filter((pick) => pick.result === "loss").length;
    const totalPoints = playerPicks.reduce((sum, pick) => sum + pick.pointsEarned, 0);
    const weeksPlayed = playerPicks.filter((pick) => pick.result !== "pending").length;
    return {
      player,
      totalPoints,
      wins,
      losses,
      winPercentage: wins + losses === 0 ? 0 : wins / (wins + losses),
      averagePoints: weeksPlayed === 0 ? 0 : totalPoints / weeksPlayed,
      biggestWin: Math.max(0, ...playerPicks.map((pick) => pick.pointsEarned)),
      weeksPlayed,
    };
  });

  return standings.sort((a, b) => {
    if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints;
    if (b.wins !== a.wins) return b.wins - a.wins;
    return b.biggestWin - a.biggestWin;
  });
}

export function buildChart(players: Player[], picks: Pick[], throughWeek: number): ChartPoint[] {
  return Array.from({ length: throughWeek }, (_, weekIndex) => {
    const week = weekIndex + 1;
    const point: ChartPoint = { week };
    for (const player of players) {
      point[player.displayName] = picks
        .filter((pick) => pick.userId === player.id && pick.week <= week)
        .reduce((sum, pick) => sum + pick.pointsEarned, 0);
    }
    return point;
  });
}


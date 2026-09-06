export type GameStatus = "scheduled" | "in_progress" | "final" | "postponed" | "canceled";

export type PickResult = "pending" | "win" | "loss" | "push" | "void";

export type ProfileRole = "player" | "admin";

export type Team = {
  id: string;
  abbreviation: string;
  city: string;
  name: string;
  fullName: string;
  logoUrl: string;
  primaryColor: string;
  secondaryColor: string;
};

export type Player = {
  id: string;
  displayName: string;
  avatarUrl?: string;
  role: ProfileRole;
};

export type Game = {
  id: string;
  externalGameId: string;
  season: number;
  week: number;
  homeTeamId: string;
  awayTeamId: string;
  kickoffAt: string;
  status: GameStatus;
  homeScore?: number;
  awayScore?: number;
  homeSpread?: number;
  awaySpread?: number;
  sportsbook: "draftkings";
  lastOddsUpdate?: string;
  venue?: string;
  broadcast?: string;
};

export type Pick = {
  id: string;
  userId: string;
  season: number;
  week: number;
  gameId: string;
  selectedTeamId: string;
  opponentTeamId: string;
  submittedSpread: number;
  submittedAt: string;
  result: PickResult;
  pointsEarned: number;
  locked: boolean;
};

export type Standing = {
  player: Player;
  totalPoints: number;
  wins: number;
  losses: number;
  winPercentage: number;
  averagePoints: number;
  biggestWin: number;
  weeksPlayed: number;
  previousRank?: number;
};

export type ChartPoint = {
  week: number;
  [playerName: string]: number;
};


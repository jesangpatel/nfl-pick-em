import type { Game } from "@/lib/types";

export type OddsRefreshResult = {
  games: Game[];
  fetchedAt: string;
  source: "the-odds-api";
  requestsRemaining?: string | null;
  requestsUsed?: string | null;
};

export interface OddsProvider {
  getCurrentWeekOdds(params?: { commenceTimeFrom?: string; commenceTimeTo?: string }): Promise<OddsRefreshResult>;
  getGameOdds(eventId: string): Promise<OddsRefreshResult>;
  refreshOdds(params?: { commenceTimeFrom?: string; commenceTimeTo?: string }): Promise<OddsRefreshResult>;
}


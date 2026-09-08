import { findTeamByApiName } from "@/lib/teams";
import type { Game } from "@/lib/types";
import type { OddsProvider, OddsRefreshResult } from "./provider";

type OddsApiOutcome = { name: string; point?: number; price?: number };
type OddsApiMarket = { key: string; last_update: string; outcomes: OddsApiOutcome[] };
type OddsApiBookmaker = { key: string; title: string; last_update: string; markets: OddsApiMarket[] };
type OddsApiEvent = {
  id: string;
  commence_time: string;
  home_team: string;
  away_team: string;
  bookmakers: OddsApiBookmaker[];
};

const SPORT = "americanfootball_nfl";
const HOST = "https://api.the-odds-api.com/v4";

export class TheOddsApiDraftKingsProvider implements OddsProvider {
  constructor(private readonly apiKey = process.env.ODDS_API_KEY) {}

  async getCurrentWeekOdds(params?: { commenceTimeFrom?: string; commenceTimeTo?: string }) {
    return this.fetchOdds(`${HOST}/sports/${SPORT}/odds`, params);
  }

  async getGameOdds(eventId: string) {
    return this.fetchOdds(`${HOST}/sports/${SPORT}/events/${eventId}/odds`);
  }

  async refreshOdds(params?: { commenceTimeFrom?: string; commenceTimeTo?: string }) {
    return this.getCurrentWeekOdds(params);
  }

  private async fetchOdds(
    endpoint: string,
    params: { commenceTimeFrom?: string; commenceTimeTo?: string } = {},
  ): Promise<OddsRefreshResult> {
    if (!this.apiKey) {
      throw new Error("ODDS_API_KEY is not configured.");
    }

    const url = new URL(endpoint);
    url.searchParams.set("apiKey", this.apiKey);
    url.searchParams.set("regions", "us");
    url.searchParams.set("markets", "spreads");
    url.searchParams.set("oddsFormat", "american");
    url.searchParams.set("dateFormat", "iso");
    url.searchParams.set("bookmakers", "draftkings");
    if (params.commenceTimeFrom) url.searchParams.set("commenceTimeFrom", params.commenceTimeFrom);
    if (params.commenceTimeTo) url.searchParams.set("commenceTimeTo", params.commenceTimeTo);

    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`The Odds API request failed (${response.status}): ${detail}`);
    }

    const payload = (await response.json()) as OddsApiEvent | OddsApiEvent[];
    const events = Array.isArray(payload) ? payload : [payload];
    return {
      games: events.map(toGame).filter(Boolean) as Game[],
      fetchedAt: new Date().toISOString(),
      source: "the-odds-api",
      requestsRemaining: response.headers.get("x-requests-remaining"),
      requestsUsed: response.headers.get("x-requests-used"),
    };
  }
}

function toGame(event: OddsApiEvent): Game | null {
  const home = findTeamByApiName(event.home_team);
  const away = findTeamByApiName(event.away_team);
  const draftKings = event.bookmakers.find((bookmaker) => bookmaker.key === "draftkings");
  const spreadMarket = draftKings?.markets.find((market) => market.key === "spreads");
  if (!home || !away || !draftKings || !spreadMarket) return null;

  const homeSpread = spreadMarket.outcomes.find((outcome) => outcome.name === event.home_team)?.point;
  const awaySpread = spreadMarket.outcomes.find((outcome) => outcome.name === event.away_team)?.point;
  if (typeof homeSpread !== "number" || typeof awaySpread !== "number") return null;

  return {
    id: event.id,
    externalGameId: event.id,
    season: new Date(event.commence_time).getUTCFullYear(),
    week: 0,
    homeTeamId: home.id,
    awayTeamId: away.id,
    kickoffAt: event.commence_time,
    status: "scheduled",
    homeSpread,
    awaySpread,
    sportsbook: "draftkings",
    lastOddsUpdate: spreadMarket.last_update ?? draftKings.last_update,
  };
}

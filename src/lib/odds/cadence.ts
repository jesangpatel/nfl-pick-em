import type { Game } from "@/lib/types";

export type OddsRefreshDecision = {
  shouldRefresh: boolean;
  reason: string;
  minimumMinutesBetweenRefreshes: number | null;
  creditsUsedThisWindow: number;
  monthlyBudget: number;
  nextEligibleAt?: string;
};

export const ODDS_MONTHLY_BUDGET = 430;
export const ODDS_BUDGET_WINDOW_DAYS = 30;

const ACTIVE_START_HOUR = 8;
const ACTIVE_END_HOUR = 23;

export function decideOddsRefresh({
  now = new Date(),
  games,
  lastRefreshAt,
  creditsUsedThisWindow,
  monthlyBudget = ODDS_MONTHLY_BUDGET,
}: {
  now?: Date;
  games: Game[];
  lastRefreshAt?: string | null;
  creditsUsedThisWindow: number;
  monthlyBudget?: number;
}): OddsRefreshDecision {
  if (creditsUsedThisWindow >= monthlyBudget) {
    return {
      shouldRefresh: false,
      reason: "Monthly odds refresh budget has been reached.",
      minimumMinutesBetweenRefreshes: null,
      creditsUsedThisWindow,
      monthlyBudget,
    };
  }

  const cadence = getCurrentCadenceMinutes(now, games);
  if (cadence == null) {
    return {
      shouldRefresh: false,
      reason: "Outside active refresh window and no game is within two hours of kickoff.",
      minimumMinutesBetweenRefreshes: null,
      creditsUsedThisWindow,
      monthlyBudget,
    };
  }

  if (!lastRefreshAt) {
    return {
      shouldRefresh: true,
      reason: "No prior refresh has been recorded for this budget window.",
      minimumMinutesBetweenRefreshes: cadence,
      creditsUsedThisWindow,
      monthlyBudget,
    };
  }

  const nextEligible = new Date(new Date(lastRefreshAt).getTime() + cadence * 60_000);
  const shouldRefresh = now >= nextEligible;
  return {
    shouldRefresh,
    reason: shouldRefresh
      ? `Cadence allows a refresh every ${cadence} minutes right now.`
      : `Next refresh is not due yet under the ${cadence}-minute cadence.`,
    minimumMinutesBetweenRefreshes: cadence,
    creditsUsedThisWindow,
    monthlyBudget,
    nextEligibleAt: nextEligible.toISOString(),
  };
}

export function getCurrentCadenceMinutes(now: Date, games: Game[]) {
  const futureGames = games
    .map((game) => ({ ...game, kickoff: new Date(game.kickoffAt) }))
    .filter((game) => game.kickoff.getTime() > now.getTime());

  const withinTwoHours = futureGames.some((game) => {
    const minutesUntilKickoff = (game.kickoff.getTime() - now.getTime()) / 60_000;
    return minutesUntilKickoff >= 0 && minutesUntilKickoff <= 120;
  });

  if (withinTwoHours) return 30;

  const easternParts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    hour: "numeric",
    hour12: false,
  }).formatToParts(now);

  const weekday = easternParts.find((part) => part.type === "weekday")?.value;
  const hour = Number(easternParts.find((part) => part.type === "hour")?.value);
  const activeHours = hour >= ACTIVE_START_HOUR && hour < ACTIVE_END_HOUR;

  if ((weekday === "Tue" || weekday === "Wed") && activeHours) return 240;
  if ((weekday === "Thu" || weekday === "Fri") && activeHours) return 120;
  if ((weekday === "Sat" || weekday === "Sun") && activeHours) return 60;
  if (weekday === "Mon" && activeHours && futureGames.some((game) => isSameEasternDay(now, game.kickoff))) return 60;

  return null;
}

export function budgetWindowStart(now = new Date()) {
  return new Date(now.getTime() - ODDS_BUDGET_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();
}

function isSameEasternDay(a: Date, b: Date) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(a) === formatter.format(b);
}


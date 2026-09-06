export const nf = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1, minimumFractionDigits: 0 });

export function formatSpread(spread: number) {
  return `${spread > 0 ? "+" : ""}${nf.format(spread)}`;
}

export function formatPoints(points: number) {
  return `${nf.format(points)} pts`;
}

export function formatKickoff(iso: string) {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(new Date(iso));
}


import { NextResponse } from "next/server";

const SPORT = "americanfootball_nfl";

export async function GET() {
  const apiKey = process.env.ODDS_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "ODDS_API_KEY is not configured." }, { status: 500 });
  }

  const url = new URL(`https://api.the-odds-api.com/v4/sports/${SPORT}/scores`);
  url.searchParams.set("apiKey", apiKey);
  url.searchParams.set("daysFrom", "3");
  url.searchParams.set("dateFormat", "iso");

  const response = await fetch(url, { next: { revalidate: 120 } });
  if (!response.ok) {
    return NextResponse.json({ error: await response.text() }, { status: response.status });
  }

  return NextResponse.json(await response.json(), {
    headers: {
      "x-requests-remaining": response.headers.get("x-requests-remaining") ?? "",
      "x-requests-used": response.headers.get("x-requests-used") ?? "",
    },
  });
}


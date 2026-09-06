import { NextResponse } from "next/server";
import { TheOddsApiDraftKingsProvider } from "@/lib/odds/the-odds-api";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const provider = new TheOddsApiDraftKingsProvider();
    const result = await provider.refreshOdds({
      commenceTimeFrom: body.commenceTimeFrom,
      commenceTimeTo: body.commenceTimeTo,
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to refresh DraftKings odds." },
      { status: 500 },
    );
  }
}

export async function GET() {
  return POST(new Request("http://localhost/api/odds", { method: "POST" }));
}


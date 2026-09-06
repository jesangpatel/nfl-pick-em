import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const submitPickSchema = z.object({
  season: z.number().int(),
  week: z.number().int().min(1).max(22),
  gameId: z.string().uuid(),
  selectedTeamId: z.string().uuid(),
});

export async function POST(request: Request) {
  const parsed = submitPickSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid pick payload." }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Please log in before submitting a pick." }, { status: 401 });
  }

  const { data, error } = await supabase.rpc("submit_weekly_pick", {
    p_season: parsed.data.season,
    p_week_number: parsed.data.week,
    p_game_id: parsed.data.gameId,
    p_selected_team_id: parsed.data.selectedTeamId,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ pick: data });
}


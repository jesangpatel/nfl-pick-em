import { NextResponse } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/server";

const submitPickSchema = z.object({
  participantId: z.string().uuid(),
  season: z.number().int(),
  week: z.number().int().min(1).max(22),
  gameId: z.string().uuid(),
  selectedTeamId: z.string(),
});

export async function POST(request: Request) {
  try {
    const parsed = submitPickSchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid pick payload." }, { status: 400 });
    }

    const service = createServiceClient();
    const selectedTeamId = await resolveSelectedTeamId(service, parsed.data.selectedTeamId);
    const { data, error } = await service.rpc("submit_participant_weekly_pick", {
      p_participant_id: parsed.data.participantId,
      p_season: parsed.data.season,
      p_week_number: parsed.data.week,
      p_game_id: parsed.data.gameId,
      p_selected_team_id: selectedTeamId,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ pick: data });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to submit pick." },
      { status: 500 },
    );
  }
}

async function resolveSelectedTeamId(service: ReturnType<typeof createServiceClient>, selectedTeamId: string) {
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(selectedTeamId)) {
    return selectedTeamId;
  }

  const { data, error } = await service
    .from("teams")
    .select("id")
    .eq("abbreviation", selectedTeamId.toUpperCase())
    .single();

  if (error || !data) {
    throw new Error("Selected team was not found.");
  }

  return data.id;
}

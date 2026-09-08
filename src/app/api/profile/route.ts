import { NextResponse } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/server";
import { postgresUuidSchema } from "@/lib/validation";

const profileSchema = z.object({
  participantId: postgresUuidSchema,
});

export async function POST(request: Request) {
  try {
    const parsed = profileSchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: "Choose a valid player." }, { status: 400 });
    }

    const service = createServiceClient();
    const { data, error } = await service
      .from("profiles")
      .select("id, display_name, avatar_url, role, active")
      .eq("id", parsed.data.participantId)
      .eq("active", true)
      .maybeSingle();
    if (error) throw error;
    if (!data) {
      return NextResponse.json({ error: "Choose an active player." }, { status: 404 });
    }

    return NextResponse.json({
      profile: {
        id: data.id,
        displayName: data.display_name,
        avatarUrl: data.avatar_url ?? undefined,
        role: data.role,
        active: data.active,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to load profile." },
      { status: 500 },
    );
  }
}

import { NextResponse } from "next/server";
import { z } from "zod";
import { createServiceClient, requestHasAdminAccess } from "@/lib/supabase/server";

const createPlayerSchema = z.object({
  displayName: z.string().trim().min(1).max(40),
});

const updatePlayerSchema = z.object({
  id: z.string().uuid(),
  displayName: z.string().trim().min(1).max(40).optional(),
  active: z.boolean().optional(),
});

export async function GET() {
  try {
    const service = createServiceClient();
    const { data, error } = await service
      .from("profiles")
      .select("id, display_name, avatar_url, role, active, created_at")
      .order("display_name");
    if (error) throw error;

    return NextResponse.json({
      players: (data ?? []).map((player) => ({
        id: player.id,
        displayName: player.display_name,
        avatarUrl: player.avatar_url ?? undefined,
        role: player.role,
        active: player.active ?? true,
        createdAt: player.created_at,
      })),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to load players." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    if (!requestHasAdminAccess(request)) {
      return NextResponse.json({ error: "Admin access required." }, { status: 403 });
    }

    const parsed = createPlayerSchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: "Enter a valid player name." }, { status: 400 });
    }

    const displayName = parsed.data.displayName;
    const service = createServiceClient();
    const { data, error } = await service
      .from("profiles")
      .insert({
        display_name: displayName,
        avatar_url: initials(displayName),
        role: "player",
        active: true,
      })
      .select("id, display_name, avatar_url, role, active, created_at")
      .single();
    if (error) throw error;

    return NextResponse.json({ player: data });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to add player." },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request) {
  try {
    if (!requestHasAdminAccess(request)) {
      return NextResponse.json({ error: "Admin access required." }, { status: 403 });
    }

    const parsed = updatePlayerSchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid player update." }, { status: 400 });
    }

    const updates: { display_name?: string; avatar_url?: string; active?: boolean; updated_at: string } = {
      updated_at: new Date().toISOString(),
    };
    if (parsed.data.displayName) {
      updates.display_name = parsed.data.displayName;
      updates.avatar_url = initials(parsed.data.displayName);
    }
    if (typeof parsed.data.active === "boolean") updates.active = parsed.data.active;

    const service = createServiceClient();
    const { data, error } = await service
      .from("profiles")
      .update(updates)
      .eq("id", parsed.data.id)
      .select("id, display_name, avatar_url, role, active, created_at")
      .single();
    if (error) throw error;

    return NextResponse.json({ player: data });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to update player." },
      { status: 500 },
    );
  }
}

function initials(displayName: string) {
  return displayName
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

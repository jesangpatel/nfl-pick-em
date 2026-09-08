import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient, ensureUserProfile } from "@/lib/supabase/server";

const profileSchema = z.object({
  displayName: z.string().trim().min(1).max(40).optional(),
});

export async function POST(request: Request) {
  try {
    const parsed = profileSchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid profile." }, { status: 400 });
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user?.email) {
      return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
    }

    const profile = await ensureUserProfile({
      user,
      displayName: parsed.data.displayName,
    });

    return NextResponse.json({ profile });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to update profile." },
      { status: 500 },
    );
  }
}

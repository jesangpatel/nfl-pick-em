import { createServerClient } from "@supabase/ssr";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { cookies } from "next/headers";

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch {
            // Server components cannot always set cookies; route handlers can.
          }
        },
      },
    },
  );
}

export function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase service credentials are not configured.");
  return createSupabaseClient(url, key, { auth: { persistSession: false } });
}

export function isAdminEmail(email?: string | null) {
  if (!email) return false;
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean)
    .includes(email.trim().toLowerCase());
}

export async function ensureUserProfile({
  service = createServiceClient(),
  user,
  displayName,
}: {
  service?: SupabaseClient;
  user: User;
  displayName?: string;
}) {
  if (!user.email) throw new Error("Authenticated user is missing an email address.");

  const { data: existing, error: existingError } = await service
    .from("profiles")
    .select("display_name, avatar_url, role")
    .eq("id", user.id)
    .maybeSingle();
  if (existingError) throw existingError;

  const resolvedDisplayName = String(
    displayName?.trim() ||
    existing?.display_name ||
    user.user_metadata.display_name ||
    user.email.split("@")[0] ||
    "Player",
  ).slice(0, 40);
  const resolvedAvatar =
    existing?.avatar_url ||
    resolvedDisplayName
      .split(/\s+/)
      .map((part) => part[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();
  const resolvedRole = isAdminEmail(user.email) ? "admin" : existing?.role ?? "player";

  const { data, error } = await service
    .from("profiles")
    .upsert(
      {
        id: user.id,
        display_name: resolvedDisplayName,
        avatar_url: resolvedAvatar,
        role: resolvedRole,
      },
      { onConflict: "id" },
    )
    .select("id, display_name, avatar_url, role")
    .single();
  if (error) throw error;

  return data;
}

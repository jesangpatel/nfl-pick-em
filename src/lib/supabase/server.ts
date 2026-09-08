import { createClient as createSupabaseClient } from "@supabase/supabase-js";

export function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase service credentials are not configured.");
  return createSupabaseClient(url, key, { auth: { persistSession: false } });
}

export function requestHasAdminAccess(request: Request) {
  const expected = process.env.ADMIN_SECRET || process.env.CRON_SECRET;
  if (!expected) return false;
  const submitted = request.headers.get("x-admin-key") || request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  return submitted === expected;
}

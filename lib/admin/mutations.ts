import "server-only";
import { createClient } from "@supabase/supabase-js";
import { isAdmin } from "./auth";
import { parseStatusAction, type StatusAction } from "./transitions";
export async function applyStatusAction(action: StatusAction) {
  if (!(await isAdmin()) || !parseStatusAction(action)) return false;
  try {
    const url = process.env.SUPABASE_URL,
      key = process.env.SUPABASE_SECRET_KEY;
    if (!url || !key) return false;
    const client = createClient(url, key, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });
    const { data, error } = await client.rpc("admin_transition_waitlist", {
      p_action: action,
    });
    return !error && typeof data?.changed === "number";
  } catch {
    return false;
  }
}

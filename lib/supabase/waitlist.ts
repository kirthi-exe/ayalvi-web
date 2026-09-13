import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Entry } from "../validation/waitlist";
export async function insertEntry(entry: Entry) {
  const url = process.env.SUPABASE_URL,
    key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error("Waitlist configuration unavailable");
  const db = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await db.from("waitlist_entries").insert(entry);
  return { code: error?.code };
}

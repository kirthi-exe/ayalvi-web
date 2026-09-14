import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Entry } from "../validation/waitlist";
import { normalizeReferralCode } from "../referrals/code";
export async function insertEntry(entry: Entry) {
  const url = process.env.SUPABASE_URL,
    key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error("Waitlist configuration unavailable");
  const db = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await db.rpc("join_waitlist", { p_entry: entry });
  if (error) return { code: "unavailable" };
  if (data === null) return { code: undefined };
  const referralCode = normalizeReferralCode(data);
  if (!referralCode) return { code: "unavailable" };
  return { code: undefined, referralCode };
}

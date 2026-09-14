import "server-only";
import { createClient } from "@supabase/supabase-js";
import { requireAdmin } from "./auth";
import { parseFilters, type SearchParams } from "./filters";
export type Breakdown = { label: string; count: number };
export type RecentEntry = {
  entry_key: string;
  invited_at: string | null;
  beta_at: string | null;
  masked_email: string;
  created_at: string;
  city_region: string;
  gender: string;
  interested_in: string;
  status: string;
  referral_count: number;
  referred: boolean;
  heard_from: string | null;
};
export type Referrer = {
  masked_email: string;
  city_region: string;
  referral_count: number;
  referral_code: string;
  created_at: string;
};
export type DashboardData = {
  overview: {
    total: number;
    today: number;
    last7: number;
    last30: number;
    total_referrals: number;
    referred_signups: number;
    referrers: number;
    highest_referrals: number;
    average_referrals: number;
    top_referral_code: string | null;
  };
  pagination: { page: number; page_size: number; total: number; pages: number };
  recent: RecentEntry[];
  top_referrers: Referrer[];
  breakdowns: Record<
    "city" | "gender" | "interest" | "status" | "trend" | "referrals",
    Breakdown[]
  >;
};
export async function loadDashboard(query: SearchParams) {
  await requireAdmin();
  const filters = parseFilters(query);
  if (!filters) return { kind: "invalid" as const };
  try {
    const url = process.env.SUPABASE_URL,
      key = process.env.SUPABASE_SECRET_KEY;
    if (!url || !key) throw new Error("Unavailable");
    const client = createClient(url, key, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
      global: {
        fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }),
      },
    });
    const { data, error } = await client.rpc("admin_waitlist_dashboard", {
      p_filters: filters,
    });
    if (
      error ||
      !data?.overview ||
      !data?.pagination ||
      !data?.breakdowns ||
      !Array.isArray(data?.recent) ||
      !Array.isArray(data?.top_referrers)
    )
      throw new Error("Unavailable");
    return { kind: "ready" as const, filters, data: data as DashboardData };
  } catch {
    return { kind: "unavailable" as const };
  }
}

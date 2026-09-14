import type { DashboardData } from "../../lib/admin/data.ts";
export const adminTestPassword =
  "E2E-only-admin-password-not-a-real-secret-012345";
export const adminFixture: DashboardData = {
  overview: {
    total: 1,
    today: 1,
    last7: 1,
    last30: 1,
    total_referrals: 2,
    referred_signups: 0,
    referrers: 1,
    highest_referrals: 2,
    average_referrals: 2,
    top_referral_code: "ABCDEF1234",
  },
  pagination: { page: 1, page_size: 25, total: 1, pages: 1 },
  recent: [
    {
      masked_email: "te***@example.test",
      created_at: "2026-09-14T09:00:00Z",
      city_region: "Zürich",
      gender: "Woman",
      interested_in: "Men",
      status: "waiting",
      referral_count: 2,
      referred: false,
      heard_from: "Friend",
    },
  ],
  top_referrers: [
    {
      masked_email: "te***@example.test",
      created_at: "2026-09-14T09:00:00Z",
      city_region: "Zürich",
      referral_count: 2,
      referral_code: "ABCDEF1234",
    },
  ],
  breakdowns: {
    city: [{ label: "Zürich", count: 1 }],
    gender: [{ label: "Woman", count: 1 }],
    interest: [{ label: "Men", count: 1 }],
    status: [{ label: "waiting", count: 1 }],
    trend: [{ label: "2026-09-14", count: 1 }],
    referrals: [{ label: "2–4", count: 1 }],
  },
};

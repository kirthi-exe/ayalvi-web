vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
import { render, screen, within } from "@testing-library/react";
import { it, expect, vi } from "vitest";
import { Dashboard } from "@/components/admin/dashboard";
import { adminFixture } from "./support/admin-fixture";
it("renders masked tables, referral stats and accessible filters", () => {
  render(<Dashboard data={adminFixture} filters={{ page: 1 }} />);
  expect(screen.getByRole("heading", { name: "Top referrers" })).toBeVisible();
  expect(screen.getAllByText("te***@example.test")).toHaveLength(2);
  for (const label of [
    "Status",
    "Gender",
    "Interested in",
    "Referred",
    "City / region",
    "From (UTC)",
    "Through (UTC)",
  ])
    expect(screen.getByLabelText(label, { exact: true })).toBeVisible();
  expect(screen.getByText("Average per referring entry")).toBeVisible();
  expect(screen.getByText("Top referral code")).toBeVisible();
  expect(screen.queryByText("test@example.test")).not.toBeInTheDocument();
});
it("renders empty dashboard without invalid numbers or empty tables", () => {
  const data = structuredClone(adminFixture);
  data.recent = [];
  data.top_referrers = [];
  data.pagination = { page: 1, page_size: 25, pages: 1, total: 0 };
  data.overview = {
    total: 0,
    today: 0,
    last7: 0,
    last30: 0,
    total_referrals: 0,
    referred_signups: 0,
    referrers: 0,
    highest_referrals: 0,
    average_referrals: 0,
    top_referral_code: null,
  };
  for (const key of Object.keys(
    data.breakdowns,
  ) as (keyof typeof data.breakdowns)[])
    data.breakdowns[key] = [];
  render(<Dashboard data={data} filters={{ page: 1 }} />);
  expect(
    screen.getByText("No referring entries match these filters."),
  ).toBeVisible();
  expect(
    screen.getAllByText("No signups match these filters.").length,
  ).toBeGreaterThan(0);
  expect(screen.queryByRole("table")).not.toBeInTheDocument();
  expect(screen.getByText(/Page 1 of 1/)).toBeVisible();
});
it("pagination preserves filters and hides unavailable directions", () => {
  render(
    <Dashboard
      data={{
        ...adminFixture,
        pagination: { page: 2, page_size: 25, total: 60, pages: 3 },
      }}
      filters={{ page: 2, status: "waiting" }}
    />,
  );
  const nav = screen.getByRole("navigation", { name: "Signup pages" });
  expect(within(nav).getByRole("link", { name: "Previous" })).toHaveAttribute(
    "href",
    "/admin/waitlist?page=1&status=waiting",
  );
  expect(within(nav).getByRole("link", { name: "Next" })).toHaveAttribute(
    "href",
    "/admin/waitlist?page=3&status=waiting",
  );
});

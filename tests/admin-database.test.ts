// @vitest-environment node
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { beforeAll, afterAll, it, expect } from "vitest";
import type { DashboardData } from "@/lib/admin/data";
let db: PGlite;
async function dashboard(filters: Record<string, unknown> = {}) {
  return (
    await db.query<{ data: DashboardData }>(
      "select public.admin_waitlist_dashboard($1::jsonb) as data",
      [JSON.stringify(filters)],
    )
  ).rows[0].data;
}
beforeAll(async () => {
  db = new PGlite();
  await db.exec(
    "create role anon; create role authenticated; create role service_role bypassrls;",
  );
  for (const file of [
    "202609130001_waitlist.sql",
    "202609140001_waitlist_referrals.sql",
    "202609140002_waitlist_admin.sql",
    "202609140003_waitlist_invites.sql",
  ])
    await db.exec(readFileSync(`supabase/migrations/${file}`, "utf8"));
  await db.exec(`insert into public.waitlist_entries(email,city_region,gender,interested_in,is_18_plus,referral_code,referral_count,status,created_at)
 select 'person'||n||'@example.test',case when n<=20 then 'Zürich' else 'Basel' end,'Woman','Men',true,upper(lpad(to_hex(n),10,'0')),case when n=1 then 3 when n=2 then 1 else 0 end,case when n<=20 then 'waiting' else 'priority' end,(current_timestamp at time zone 'UTC')::date::timestamp at time zone 'UTC' - (case when n<=10 then 0 when n<=20 then 5 else 29 end)*interval '1 day' from generate_series(1,30) n;
 update public.waitlist_entries set referred_by=(select id from public.waitlist_entries where email='person1@example.test') where email in ('person3@example.test','person4@example.test','person5@example.test');
 update public.waitlist_entries set referred_by=(select id from public.waitlist_entries where email='person2@example.test') where email='person6@example.test';`);
}, 120000);
afterAll(async () => {
  await db?.close();
});
it("computes UTC totals, referrals, charts and ranked masked referrers", async () => {
  const d = await dashboard();
  expect(d.overview).toEqual({
    total: 30,
    today: 10,
    last7: 20,
    last30: 30,
    total_referrals: 4,
    referred_signups: 4,
    referrers: 2,
    highest_referrals: 3,
    average_referrals: 2,
    top_referral_code: "0000000001",
  });
  expect(d.breakdowns.city).toEqual([
    { label: "Zürich", count: 20 },
    { label: "Basel", count: 10 },
  ]);
  expect(d.breakdowns.trend).toHaveLength(30);
  expect(d.breakdowns.trend.reduce((n, x) => n + x.count, 0)).toBe(30);
  expect(d.breakdowns.referrals.map((x) => x.count)).toEqual([28, 1, 1, 0, 0]);
  expect(d.top_referrers.map((x) => x.referral_count)).toEqual([3, 1]);
  expect(JSON.stringify(d)).not.toMatch(
    /person\d+@|"id"|"email"|"referred_by"|utm_|is_18_plus/,
  );
  expect(d.recent.every((x) => x.masked_email === "pe***@example.test")).toBe(
    true,
  );
});
it("paginates 25 rows deterministically and clamps out-of-range pages", async () => {
  const first = await dashboard(),
    second = await dashboard({ page: 2 }),
    last = await dashboard({ page: 9999 });
  expect(first.recent).toHaveLength(25);
  expect(second.recent).toHaveLength(5);
  expect(second.pagination).toEqual({
    page: 2,
    page_size: 25,
    total: 30,
    pages: 2,
  });
  expect(last).toEqual(second);
});
it("applies all filters to summaries and tables", async () => {
  expect(
    (
      await dashboard({
        city_region: "zÜRICH",
        status: "waiting",
        gender: "Woman",
        interested_in: "Men",
        referred: "yes",
      })
    ).overview.total,
  ).toBe(4);
  expect((await dashboard({ referred: "no" })).overview.total).toBe(26);
  const today = new Date().toISOString().slice(0, 10);
  expect(
    (await dashboard({ date_from: today, date_to: today })).overview.total,
  ).toBe(10);
  expect((await dashboard({ gender: "Man" })).recent).toEqual([]);
  expect(
    (await dashboard({ city_region: "' OR true --" })).overview.total,
  ).toBe(0);
});
it("returns safe empty metrics and one empty page", async () => {
  const d = await dashboard({ status: "blocked" });
  expect(d.overview.total).toBe(0);
  expect(d.overview.average_referrals).toBe(0);
  expect(d.overview.top_referral_code).toBeNull();
  expect(d.recent).toEqual([]);
  expect(d.pagination.pages).toBe(1);
});
it("rejects malformed RPC filters independently of the website", async () => {
  for (const filters of [
    { unknown: "x" },
    { page: 0 },
    { page: 10001 },
    { page: "1" },
    { status: "bad" },
    { gender: "bad" },
    { interested_in: "bad" },
    { referred: "maybe" },
    { city_region: "" },
    { date_from: "2026-02-30" },
    { date_from: "2026-10-01", date_to: "2026-01-01" },
  ])
    await expect(dashboard(filters)).rejects.toThrow();
});
it("denies browser roles RPC and every table operation; grants server only RPC", async () => {
  for (const role of ["anon", "authenticated", "service_role"]) {
    const grants = (
      await db.query<{ allowed: boolean }>(
        `select has_table_privilege($1,'public.waitlist_entries','SELECT,INSERT,UPDATE,DELETE') as allowed`,
        [role],
      )
    ).rows[0];
    expect(grants.allowed).toBe(false);
  }
  for (const role of ["anon", "authenticated"]) {
    await db.exec(`set role ${role}`);
    await expect(dashboard()).rejects.toThrow(/permission denied/);
    await expect(
      db.query("select email from public.waitlist_entries"),
    ).rejects.toThrow(/permission denied/);
    await db.exec("reset role");
  }
  await db.exec("set role service_role");
  expect((await dashboard()).overview.total).toBe(30);
  await db.exec("reset role");
  const r = await db.query<{ relrowsecurity: boolean }>(
    "select relrowsecurity from pg_class where oid='public.waitlist_entries'::regclass",
  );
  expect(r.rows[0].relrowsecurity).toBe(true);
});
it("dashboard reads cannot mutate referral counts or waitlist data", async () => {
  const before = (
    await db.query("select * from public.waitlist_entries order by id")
  ).rows;
  await dashboard();
  await dashboard({ referred: "yes" });
  expect(
    (await db.query("select * from public.waitlist_entries order by id")).rows,
  ).toEqual(before);
});

it("handles an actually empty table and entries with no referrals", async () => {
  await db.exec("begin");
  try {
    await db.exec("delete from public.waitlist_entries");
    const empty = await dashboard();
    expect(empty.overview.total).toBe(0);
    expect(empty.recent).toEqual([]);
    expect(empty.top_referrers).toEqual([]);
    expect(empty.breakdowns.trend.every((x) => x.count === 0)).toBe(true);
    expect(empty.breakdowns.status.every((x) => x.count === 0)).toBe(true);
    await db.exec(
      'select public.join_waitlist(\'{"email":"single@example.test","city_region":"Basel","gender":"Man","interested_in":"Women","is_18_plus":true}\'::jsonb)',
    );
    const single = await dashboard();
    expect(single.overview.total).toBe(1);
    expect(single.overview.referrers).toBe(0);
    expect(single.overview.total_referrals).toBe(0);
    expect(single.top_referrers).toEqual([]);
    expect(single.recent[0].heard_from).toBeNull();
    expect(single.recent[0].masked_email).toBe("si***@example.test");
  } finally {
    await db.exec("rollback");
  }
});
it("returns complete status, gender, and interest breakdowns", async () => {
  const d = await dashboard();
  expect(d.breakdowns.gender).toEqual([{ label: "Woman", count: 30 }]);
  expect(d.breakdowns.interest).toEqual([{ label: "Men", count: 30 }]);
  expect(
    Object.fromEntries(d.breakdowns.status.map((x) => [x.label, x.count])),
  ).toEqual({ waiting: 20, priority: 10, invited: 0, beta: 0, blocked: 0 });
});
it("keeps UTC metrics correct when the database session uses another timezone", async () => {
  const expected = await dashboard();
  await db.exec("set timezone='Pacific/Honolulu'");
  try {
    const actual = await dashboard();
    for (const data of [expected, actual]) {
      for (const row of [...data.recent, ...data.top_referrers])
        row.created_at = new Date(row.created_at).toISOString();
    }
    expect(actual).toEqual(expected);
  } finally {
    await db.exec("set timezone='UTC'");
  }
});
it("declares a stable definer with empty search path and no public function privilege", async () => {
  const r = await db.query<{
    prosecdef: boolean;
    provolatile: string;
    proconfig: string[];
    public_execute: boolean;
  }>(
    `select prosecdef,provolatile,proconfig,exists(select 1 from aclexplode(proacl) where grantee=0 and privilege_type='EXECUTE') as public_execute from pg_proc where oid='public.admin_waitlist_dashboard(jsonb)'::regprocedure`,
  );
  expect(r.rows[0]).toEqual({
    prosecdef: true,
    provolatile: "s",
    proconfig: ['search_path=""'],
    public_execute: false,
  });
});

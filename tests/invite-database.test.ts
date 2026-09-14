// @vitest-environment node
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { beforeAll, beforeEach, afterEach, afterAll, it, expect } from "vitest";
let db: PGlite;
const one = "00000000-0000-4000-8000-000000000001",
  two = "00000000-0000-4000-8000-000000000002";
const statuses = ["waiting", "priority", "invited", "beta", "blocked"];
const allowed: Record<string, string[]> = {
  waiting: ["priority", "invited", "blocked"],
  priority: ["invited", "blocked"],
  invited: ["beta", "blocked"],
  beta: ["blocked"],
  blocked: ["waiting"],
};
async function action(
  entries: unknown[],
  target: string,
  confirmed_block = true,
) {
  return (
    await db.query<{ data: { changed: number } }>(
      "select public.admin_transition_waitlist($1::jsonb) data",
      [JSON.stringify({ entries, target, confirmed_block })],
    )
  ).rows[0].data;
}
async function row(id = one) {
  return (
    await db.query<{
      status: string;
      invited_at: Date | null;
      beta_at: Date | null;
      updated_at: Date;
    }>(
      "select status,invited_at,beta_at,updated_at from public.waitlist_entries where id=$1",
      [id],
    )
  ).rows[0];
}
beforeAll(async () => {
  db = new PGlite();
  await db.exec(
    "create role anon;create role authenticated;create role service_role bypassrls;",
  );
  for (const name of [
    "202609130001_waitlist",
    "202609140001_waitlist_referrals",
    "202609140002_waitlist_admin",
  ])
    await db.exec(readFileSync(`supabase/migrations/${name}.sql`, "utf8"));
  await db.exec(
    `insert into public.waitlist_entries(id,email,city_region,gender,interested_in,is_18_plus,referral_code,status,created_at,updated_at) values ('${one}','one@example.test','Zürich','Woman','Men',true,'ABCDEF0001','waiting','2026-01-01T00:00:00Z','2026-01-01T00:00:00Z'),('${two}','two@example.test','Basel','Man','Women',true,'ABCDEF0002','waiting','2026-02-01T00:00:00Z','2026-02-01T00:00:00Z');`,
  );
  await db.exec(
    readFileSync(
      "supabase/migrations/202609140003_waitlist_invites.sql",
      "utf8",
    ),
  );
}, 120000);
beforeEach(async () => {
  await db.exec("begin");
});
afterEach(async () => {
  await db.exec("rollback");
});
afterAll(async () => {
  await db.close();
});
it("migration leaves historical entries and timestamps untouched", async () => {
  const r = await row();
  expect(r.invited_at).toBeNull();
  expect(r.beta_at).toBeNull();
  expect(new Date(r.updated_at).toISOString()).toBe("2026-01-01T00:00:00.000Z");
});
for (const from of statuses)
  for (const to of statuses) {
    it(`${from} to ${to} follows the explicit allowlist`, async () => {
      await db.query(
        "update public.waitlist_entries set status=$1 where id=$2",
        [from, one],
      );
      const operation = () => action([{ id: one, expected_status: from }], to);
      if (allowed[from].includes(to)) {
        expect(await operation()).toEqual({ changed: 1 });
        expect((await row()).status).toBe(to);
      } else await expect(operation()).rejects.toThrow();
    });
  }
it("retries are no-ops and preserve first invitation/beta timestamps", async () => {
  const entries = [{ id: one, expected_status: "waiting" }];
  await action(entries, "invited");
  const first = await row();
  expect(first.invited_at).not.toBeNull();
  expect(await action(entries, "invited")).toEqual({ changed: 0 });
  expect(await row()).toEqual(first);
  await action([{ id: one, expected_status: "invited" }], "beta");
  expect((await row()).beta_at).not.toBeNull();
  await action([{ id: one, expected_status: "beta" }], "blocked");
  await action([{ id: one, expected_status: "blocked" }], "waiting");
  await action(entries, "invited");
  expect((await row()).invited_at).toEqual(first.invited_at);
});
it("blocks stale invitations and rolls back the entire mixed-invalid batch", async () => {
  await db.query(
    "update public.waitlist_entries set status='blocked' where id=$1",
    [two],
  );
  await expect(
    action(
      [
        { id: one, expected_status: "waiting" },
        { id: two, expected_status: "waiting" },
      ],
      "invited",
    ),
  ).rejects.toThrow();
  await db.exec("rollback;begin");
  expect((await row()).status).toBe("waiting");
});
it("bulk priority and invitations succeed atomically for eligible rows", async () => {
  expect(
    await action(
      [one, two].map((id) => ({ id, expected_status: "waiting" })),
      "priority",
    ),
  ).toEqual({ changed: 2 });
  expect(
    await action(
      [one, two].map((id) => ({ id, expected_status: "priority" })),
      "invited",
    ),
  ).toEqual({ changed: 2 });
  expect((await row(two)).status).toBe("invited");
});
for (const [label, entries, target, confirmed] of [
  [
    "oversized",
    Array.from({ length: 26 }, () => ({ id: one, expected_status: "waiting" })),
    "priority",
    true,
  ],
  [
    "malformed ID",
    [{ id: "bad", expected_status: "waiting" }],
    "priority",
    true,
  ],
  [
    "duplicate ID",
    [
      { id: one, expected_status: "waiting" },
      { id: one, expected_status: "waiting" },
    ],
    "priority",
    true,
  ],
  [
    "unconfirmed block",
    [{ id: one, expected_status: "waiting" }],
    "blocked",
    false,
  ],
  [
    "bulk block",
    [one, two].map((id) => ({ id, expected_status: "waiting" })),
    "blocked",
    true,
  ],
  [
    "missing row",
    [
      {
        id: "00000000-0000-4000-8000-000000000099",
        expected_status: "waiting",
      },
    ],
    "priority",
    true,
  ],
] as const)
  it(`rejects ${label}`, async () => {
    await expect(action([...entries], target, confirmed)).rejects.toThrow();
  });
it("RPC execution is server-only and no direct table UPDATE or RLS change is introduced", async () => {
  for (const role of ["anon", "authenticated", "service_role"]) {
    const r = await db.query<{ allowed: boolean }>(
      "select has_table_privilege($1,'public.waitlist_entries','UPDATE') allowed",
      [role],
    );
    expect(r.rows[0].allowed).toBe(false);
    const execute = await db.query<{ allowed: boolean }>(
      "select has_function_privilege($1,'public.admin_transition_waitlist(jsonb)','EXECUTE') allowed",
      [role],
    );
    expect(execute.rows[0].allowed).toBe(role === "service_role");
  }
  const r = await db.query<{ prosecdef: boolean; proconfig: string[] }>(
    "select prosecdef,proconfig from pg_proc where oid='public.admin_transition_waitlist(jsonb)'::regprocedure",
  );
  expect(r.rows[0]).toEqual({ prosecdef: true, proconfig: ['search_path=""'] });
  await db.exec("set local role service_role");
  expect(
    await action([{ id: one, expected_status: "waiting" }], "priority"),
  ).toEqual({ changed: 1 });
});
it("dashboard sorting and masked mutation identifiers stay behind the restricted read RPC", async () => {
  const read = async (sort: string) =>
    (
      await db.query<{
        data: { recent: { entry_key: string; masked_email: string }[] };
      }>("select public.admin_waitlist_dashboard($1::jsonb) data", [
        JSON.stringify({ sort }),
      ])
    ).rows[0].data.recent;
  expect((await read("newest"))[0].entry_key).toBe(two);
  expect((await read("oldest"))[0].entry_key).toBe(one);
  expect((await read("city"))[0].entry_key).toBe(two);
  await db.query(
    "update public.waitlist_entries set referral_count=4,status='priority' where id=$1",
    [one],
  );
  expect((await read("referrals"))[0].entry_key).toBe(one);
  expect((await read("status"))[0].entry_key).toBe(two);
  expect((await read("newest"))[0].masked_email).toBe("tw***@example.test");
  await expect(read("arbitrary")).rejects.toThrow();
});

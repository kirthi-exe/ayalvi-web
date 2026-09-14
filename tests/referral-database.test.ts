// @vitest-environment node
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
let db: PGlite;
const migration = readFileSync(
  "supabase/migrations/202609140001_waitlist_referrals.sql",
  "utf8",
);
const payload = (email: string, referral_code?: string) => ({
  email,
  city_region: "Zürich",
  gender: "Woman",
  interested_in: "Men",
  is_18_plus: true,
  ...(referral_code ? { referral_code } : {}),
});
async function join(email: string, referral_code?: string) {
  const r = await db.query<{ code: string | null }>(
    "select public.join_waitlist($1::jsonb) as code",
    [JSON.stringify(payload(email, referral_code))],
  );
  return r.rows[0].code;
}
async function row(email: string) {
  return (
    await db.query<{
      id: string;
      email: string;
      referral_code: string;
      referral_count: number;
      referred_by: string | null;
      status: string;
    }>(
      `select id,email,referral_code,referral_count,referred_by,status from public.waitlist_entries where email=$1`,
      [email],
    )
  ).rows[0];
}
beforeAll(async () => {
  db = new PGlite();
  await db.exec(
    "create role anon; create role authenticated; create role service_role bypassrls;",
  );
  await db.exec(
    readFileSync("supabase/migrations/202609130001_waitlist.sql", "utf8"),
  );
  await db.exec(
    `insert into public.waitlist_entries(email,city_region,gender,interested_in,is_18_plus,status,created_at,updated_at) values ('old@example.com','Basel','Man','Women',true,'priority','2026-01-01T00:00:00Z','2026-01-02T00:00:00Z');`,
  );
  await db.exec(
    `insert into public.waitlist_entries(email,city_region,gender,interested_in,is_18_plus,referral_code) values ('coded@example.com','Basel','Man','Women',true,'ABCDEF0001');`,
  );
  await db.exec(migration);
}, 120000);
afterAll(async () => {
  await db?.close();
});
describe("actual referral migration and RPC", () => {
  it("backfills only codes and preserves existing data, status and timestamps", async () => {
    const r = await db.query<{
      referral_code: string;
      status: string;
      updated_at: Date;
      created_at: Date;
      referred_by: null;
      referral_count: number;
    }>("select * from public.waitlist_entries where email=$1", [
      "old@example.com",
    ]);
    const old = r.rows[0];
    expect(old.referral_code).toMatch(/^[A-F0-9]{10}$/);
    expect(old.status).toBe("priority");
    expect(new Date(old.updated_at).toISOString()).toBe(
      "2026-01-02T00:00:00.000Z",
    );
    expect(new Date(old.created_at).toISOString()).toBe(
      "2026-01-01T00:00:00.000Z",
    );
    expect(old.referred_by).toBeNull();
    expect(old.referral_count).toBe(0);
    expect((await row("coded@example.com")).referral_code).toBe("ABCDEF0001");
  });
  it("generates unique valid codes for new signups without referrals", async () => {
    const codes = [];
    for (let i = 0; i < 20; i++) {
      const code = await join(`unique${i}@example.com`);
      codes.push(code);
      expect((await row(`unique${i}@example.com`)).referral_code).toBe(code);
    }
    expect(new Set(codes).size).toBe(20);
    for (const code of codes) expect(code).toMatch(/^[A-F0-9]{10}$/);
    expect((await row("unique0@example.com")).referred_by).toBeNull();
  });
  it("attributes and increments exactly once for normalized referral code", async () => {
    const parent = await row("unique0@example.com");
    await join(
      "referred@example.com",
      ` ${parent.referral_code.toLowerCase()} `,
    );
    expect((await row("referred@example.com")).referred_by).toBe(parent.id);
    expect((await row(parent.email)).referral_count).toBe(1);
  });
  it("ignores unknown code without exposing identity", async () => {
    const code = await join("unknown@example.com", "0000000000");
    expect(typeof code).toBe("string");
    expect(code).toMatch(/^[A-F0-9]{10}$/);
    expect((await row("unknown@example.com")).referred_by).toBeNull();
  });
  it("duplicates and uppercase/whitespace variants cannot increment or change referrer", async () => {
    const original = await row("referred@example.com");
    const other = await row("unique1@example.com");
    const codes = [
      await join("referred@example.com", other.referral_code),
      await join(" REFERRED@EXAMPLE.COM ", other.referral_code),
    ];
    expect((await row(original.email)).referred_by).toBe(original.referred_by);
    expect((await row(other.email)).referral_count).toBe(0);
    expect((await row("unique0@example.com")).referral_count).toBe(1);
    for (const code of codes) {
      expect(code).toBeNull();
      expect(code).not.toBe(original.referral_code);
      expect(
        (
          await db.query(
            "select id from public.waitlist_entries where referral_code=$1",
            [code],
          )
        ).rows,
      ).toHaveLength(0);
    }
  });
  it("self-referrals succeed without count or attribution changes", async () => {
    const parent = await row("unique2@example.com");
    expect(
      await join(` ${parent.email.toUpperCase()} `, parent.referral_code),
    ).toBeNull();
    expect((await row(parent.email)).referral_count).toBe(0);
    expect((await row(parent.email)).referred_by).toBeNull();
  });
  it("rejects malformed codes and protected RPC fields", async () => {
    for (const patch of [
      { referral_code: "bad!" },
      { referred_by: "00000000-0000-0000-0000-000000000000" },
      { referral_count: 9 },
      { status: "priority" },
    ])
      await expect(
        db.query("select public.join_waitlist($1::jsonb)", [
          JSON.stringify({ ...payload("forbidden@example.com"), ...patch }),
        ]),
      ).rejects.toThrow();
    expect(await row("forbidden@example.com")).toBeUndefined();
  });
  it("rolls back the insert when increment fails", async () => {
    const parent = await row("unique3@example.com");
    await db.exec(
      `create function public.test_fail_count() returns trigger language plpgsql as $$ begin if new.referral_count > old.referral_count then raise exception 'test increment failure'; end if; return new; end $$; create trigger test_fail_count before update on public.waitlist_entries for each row execute function public.test_fail_count();`,
    );
    try {
      await expect(
        join("rollback@example.com", parent.referral_code),
      ).rejects.toThrow("test increment failure");
      expect(await row("rollback@example.com")).toBeUndefined();
      expect((await row(parent.email)).referral_count).toBe(0);
    } finally {
      await db.exec(
        "drop trigger test_fail_count on public.waitlist_entries; drop function public.test_fail_count();",
      );
    }
  });
  it("repeated overlapping requests count a unique email only once (single-session Postgres)", async () => {
    const parent = await row("unique4@example.com");
    const responses = await Promise.all(
      Array.from({ length: 12 }, () =>
        join("overlapping@example.com", parent.referral_code),
      ),
    );
    expect(responses.filter((code) => code !== null)).toHaveLength(1);
    expect(responses.filter((code) => code === null)).toHaveLength(11);
    expect((await row(parent.email)).referral_count).toBe(1);
    expect(
      (
        await db.query(
          "select id from public.waitlist_entries where email=$1",
          ["overlapping@example.com"],
        )
      ).rows,
    ).toHaveLength(1);
  });
  it("retries a forced code collision and never changes existing codes", async () => {
    const parent = await row("unique5@example.com");
    await db.exec(
      `create sequence public.test_code_attempt; create or replace function public.waitlist_random_referral_code() returns text language sql volatile set search_path='' as $$ select case when pg_catalog.nextval('public.test_code_attempt')=1 then '${parent.referral_code}' else 'ABCDEF1234' end $$;`,
    );
    try {
      expect(await join("collision@example.com")).toBe("ABCDEF1234");
      expect((await row(parent.email)).referral_code).toBe(
        parent.referral_code,
      );
    } finally {
      const original = migration.match(
        /CREATE FUNCTION public\.waitlist_random_referral_code\(\)[\s\S]*?\$\$;/,
      )![0];
      await db.exec(
        original.replace("CREATE FUNCTION", "CREATE OR REPLACE FUNCTION"),
      );
      await db.exec("drop sequence public.test_code_attempt");
    }
  });
  it("uses SECURITY DEFINER, empty search_path and exact RPC-only grants", async () => {
    const f = await db.query<{ prosecdef: boolean; proconfig: string[] }>(
      "select prosecdef,proconfig from pg_proc where oid=$1::regprocedure",
      ["public.join_waitlist(jsonb)"],
    );
    expect(f.rows[0].prosecdef).toBe(true);
    expect(f.rows[0].proconfig.join("")).toContain("search_path=");
    for (const role of ["anon", "authenticated", "service_role"]) {
      for (const operation of ["SELECT", "INSERT", "UPDATE", "DELETE"])
        expect(
          (
            await db.query<{ allowed: boolean }>(
              "select has_table_privilege($1,$2,$3) as allowed",
              [role, "public.waitlist_entries", operation],
            )
          ).rows[0].allowed,
        ).toBe(false);
      expect(
        (
          await db.query<{ allowed: boolean }>(
            "select has_function_privilege($1,$2,$3) as allowed",
            [role, "public.join_waitlist(jsonb)", "EXECUTE"],
          )
        ).rows[0].allowed,
      ).toBe(role === "service_role");
    }
    expect(
      (
        await db.query<{ rls: boolean }>(
          `select relrowsecurity as rls from pg_class where oid='public.waitlist_entries'::regclass`,
        )
      ).rows[0].rls,
    ).toBe(true);
  });
  it("server role can invoke RPC but browser roles cannot", async () => {
    await db.exec("set role service_role");
    try {
      expect(await join("rpc-role@example.com")).toMatch(/^[A-F0-9]{10}$/);
      await expect(
        db.query("select email from public.waitlist_entries"),
      ).rejects.toThrow();
    } finally {
      await db.exec("reset role");
    }
    for (const role of ["anon", "authenticated"]) {
      await db.exec(`set role ${role}`);
      try {
        await expect(join("browser@example.com")).rejects.toThrow();
      } finally {
        await db.exec("reset role");
      }
    }
  });
});

it("does not call the generator for duplicate or normalized duplicate submissions", async () => {
  const existing = await row("unique0@example.com");
  await db.exec(
    `create or replace function public.waitlist_random_referral_code() returns text language plpgsql volatile set search_path='' as $$ begin raise exception 'generator must not be called for duplicates'; end $$;`,
  );
  try {
    expect(await join(existing.email)).toBeNull();
    expect(
      await join(` ${existing.email.toUpperCase()} `, existing.referral_code),
    ).toBeNull();
    expect((await row(existing.email)).referral_code).toBe(
      existing.referral_code,
    );
    expect((await row(existing.email)).referral_count).toBe(
      existing.referral_count,
    );
  } finally {
    const original = migration.match(
      /CREATE FUNCTION public\.waitlist_random_referral_code\(\)[\s\S]*?\$\$;/,
    )![0];
    await db.exec(
      original.replace("CREATE FUNCTION", "CREATE OR REPLACE FUNCTION"),
    );
  }
});

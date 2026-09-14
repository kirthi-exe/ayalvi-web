// @vitest-environment node
import { it, expect } from "vitest";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? files(join(dir, e.name)) : [join(dir, e.name)],
  );
}
it("guards database code with server-only and no public secret variable", () => {
  expect(readFileSync("lib/supabase/waitlist.ts", "utf8")).toMatch(
    /import ["']server-only["']/,
  );
  for (const path of [...files("components"), ...files("lib/analytics")])
    expect(readFileSync(path, "utf8")).not.toMatch(
      /SUPABASE_SECRET_KEY|ADMIN_DASHBOARD_PASSWORD|service_role/,
    );
});
it("contains no server secret in production client assets when built", () => {
  if (!existsSync(".next/static")) return;
  for (const path of files(".next/static").filter((p) => p.endsWith(".js")))
    expect(readFileSync(path, "utf8")).not.toMatch(
      /SUPABASE_SECRET_KEY|ADMIN_DASHBOARD_PASSWORD|AYALVI_BUILD_SECRET_CANARY|ayalvi-e2e-server-only-canary|E2E-only-admin-password/,
    );
});

it("keeps admin credentials and data access server-only with no logging", () => {
  for (const file of [
    "lib/admin/session.ts",
    "lib/admin/data.ts",
    "lib/admin/auth.ts",
  ]) {
    const source = readFileSync(file, "utf8");
    expect(source).toMatch(/import ["']server-only["']/);
    expect(source).not.toMatch(/console\./);
  }
  for (const file of files("app/admin"))
    expect(readFileSync(file, "utf8")).not.toMatch(/console\.|NEXT_PUBLIC_/);
  expect(readFileSync("app/sitemap.ts", "utf8")).not.toContain("/admin");
  expect(readFileSync("components/layout/site.tsx", "utf8")).not.toContain(
    "/admin",
  );
});

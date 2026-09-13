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
      /SUPABASE_SECRET_KEY|service_role/,
    );
});
it("contains no server secret in production client assets when built", () => {
  if (!existsSync(".next/static")) return;
  for (const path of files(".next/static").filter((p) => p.endsWith(".js")))
    expect(readFileSync(path, "utf8")).not.toMatch(
      /SUPABASE_SECRET_KEY|AYALVI_BUILD_SECRET_CANARY/,
    );
});

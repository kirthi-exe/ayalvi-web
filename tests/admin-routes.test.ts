// @vitest-environment node
import { beforeEach, afterEach, it, expect, vi } from "vitest";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({
  cookies: vi.fn(),
  rpc: vi.fn(),
  createClient: vi.fn(),
  allow: vi.fn(() => true),
}));
vi.mock("next/headers", () => ({ cookies: mocks.cookies }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));
vi.mock("@supabase/supabase-js", () => ({ createClient: mocks.createClient }));
vi.mock("@/lib/admin/rate-limit", () => ({ allowLoginAttempt: mocks.allow }));
import { loadDashboard } from "@/lib/admin/data";
import { createSession, validSession, cookieName } from "@/lib/admin/session";
import { POST as login } from "@/app/admin/session/route";
import { POST as logout } from "@/app/admin/logout/route";
const password = "route-test-only-password-0123456789";
beforeEach(() => {
  vi.stubEnv("ADMIN_DASHBOARD_PASSWORD", password);
  vi.stubEnv("SUPABASE_URL", "https://example.test");
  vi.stubEnv("SUPABASE_SECRET_KEY", "test-only");
  mocks.cookies.mockResolvedValue({ get: () => undefined });
  mocks.createClient.mockReturnValue({ rpc: mocks.rpc });
  mocks.allow.mockReturnValue(true);
});
afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});
const request = (value: string, origin = "https://ayalvi.test") =>
  new Request("https://ayalvi.test/admin/session", {
    method: "POST",
    headers: { origin, "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ password: value }),
  });
it("authenticates before parsing filters or accessing Supabase", async () => {
  await expect(loadDashboard({})).rejects.toThrow("REDIRECT:/admin/login");
  await expect(loadDashboard({ bad: "x" })).rejects.toThrow(
    "REDIRECT:/admin/login",
  );
  expect(mocks.createClient).not.toHaveBeenCalled();
});
it("rejects expired or forged session before reading any data", async () => {
  for (const token of ["forged", createSession(Date.now() - 9 * 3600000)]) {
    mocks.cookies.mockResolvedValue({ get: () => ({ value: token }) });
    await expect(loadDashboard({})).rejects.toThrow("REDIRECT:/admin/login");
  }
  expect(mocks.rpc).not.toHaveBeenCalled();
});
it("loads only the restricted RPC after authentication and validates filters", async () => {
  mocks.cookies.mockResolvedValue({ get: () => ({ value: createSession() }) });
  mocks.rpc.mockResolvedValue({
    data: {
      overview: {},
      pagination: {},
      breakdowns: {},
      recent: [],
      top_referrers: [],
    },
    error: null,
  });
  expect((await loadDashboard({ status: "waiting" })).kind).toBe("ready");
  expect(mocks.rpc).toHaveBeenCalledWith("admin_waitlist_dashboard", {
    p_filters: { page: 1, status: "waiting" },
  });
  expect((await loadDashboard({ status: "bad" })).kind).toBe("invalid");
  expect(mocks.rpc).toHaveBeenCalledTimes(1);
});
it("never returns database errors or stack traces", async () => {
  mocks.cookies.mockResolvedValue({ get: () => ({ value: createSession() }) });
  mocks.rpc.mockRejectedValue(new Error("secret database detail"));
  expect(await loadDashboard({})).toEqual({ kind: "unavailable" });
});
it("sets a valid session only for correct password and same origin", async () => {
  const response = await login(request(password));
  expect(response.status).toBe(303);
  expect(response.headers.get("location")).toBe(
    "https://ayalvi.test/admin/waitlist",
  );
  expect(validSession(response.cookies.get(cookieName())?.value)).toBe(true);
  expect(response.headers.get("set-cookie")).toMatch(/HttpOnly/);
  expect(response.headers.get("cache-control")).toContain("no-store");
  for (const req of [
    request("wrong"),
    request(password, "https://evil.test"),
  ]) {
    const r = await login(req);
    expect(r.headers.get("location")).toBe(
      "https://ayalvi.test/admin/login?error=1",
    );
    expect(r.headers.get("set-cookie")).toBeNull();
    expect(await r.text()).not.toContain(password);
  }
  mocks.allow.mockReturnValue(false);
  expect((await login(request(password))).headers.get("set-cookie")).toBeNull();
});
it("logout clears the same cookie and rejects cross-origin requests", async () => {
  const r = await logout(request(""));
  expect(r.status).toBe(303);
  expect(r.headers.get("set-cookie")?.startsWith(`${cookieName()}=;`)).toBe(
    true,
  );
  expect(r.headers.get("set-cookie")).toContain("Max-Age=0");
  expect(r.headers.get("set-cookie")).toContain("Path=/admin");
  expect((await logout(request("", "https://evil.test"))).status).toBe(403);
});

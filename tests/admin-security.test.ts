// @vitest-environment node
import { beforeEach, afterEach, it, expect, vi } from "vitest";
vi.mock("server-only", () => ({}));
import {
  createSession,
  validSession,
  matchesPassword,
  cookieOptions,
  cookieName,
  SESSION_SECONDS,
} from "@/lib/admin/session";
import { createLoginLimiter } from "@/lib/admin/rate-limit";
import { readPassword, sameOrigin } from "@/lib/admin/http";
import { parseFilters, pageLink } from "@/lib/admin/filters";
const password = "unit-test-only-password-0123456789";
beforeEach(() => {
  vi.stubEnv("ADMIN_DASHBOARD_PASSWORD", password);
});
afterEach(() => {
  vi.unstubAllEnvs();
});
it("requires configured strong password and compares exact input", () => {
  expect(matchesPassword(password)).toBe(true);
  expect(matchesPassword(" " + password)).toBe(false);
  expect(matchesPassword("wrong")).toBe(false);
  vi.stubEnv("ADMIN_DASHBOARD_PASSWORD", "short");
  expect(matchesPassword("short")).toBe(false);
  expect(() => createSession()).toThrow("Admin access unavailable");
});
it("accepts signed sessions, rejects expiry, tampering, future sessions and rotation", () => {
  const now = Date.now(),
    token = createSession(now);
  expect(validSession(token, now)).toBe(true);
  expect(validSession(token, now + SESSION_SECONDS * 1000)).toBe(false);
  expect(validSession(token, now - 1000)).toBe(false);
  expect(validSession(token.slice(0, -1) + "x", now)).toBe(false);
  expect(validSession(undefined)).toBe(false);
  expect(validSession("x".repeat(300))).toBe(false);
  vi.stubEnv("ADMIN_DASHBOARD_PASSWORD", "different-unit-test-password-012345");
  expect(validSession(token, now)).toBe(false);
});
it("uses production secure HttpOnly same-site cookies with bounded lifetime", () => {
  vi.stubEnv("NODE_ENV", "production");
  expect(cookieName()).toBe("__Secure-ayalvi-admin");
  expect(cookieOptions()).toEqual({
    secure: true,
    httpOnly: true,
    sameSite: "strict",
    path: "/admin",
    maxAge: 28800,
  });
});
it("limits password attempts and ignores spoofed IP headers off Vercel", () => {
  vi.stubEnv("VERCEL", "");
  let now = 1000;
  const allow = createLoginLimiter(() => now);
  for (let n = 0; n < 5; n++)
    expect(allow(new Headers({ "x-forwarded-for": String(n) }))).toBe(true);
  expect(allow(new Headers({ "x-forwarded-for": "new" }))).toBe(false);
  now += 900001;
  expect(allow(new Headers())).toBe(true);
});
it("enforces a global ceiling even across platform IPs", () => {
  vi.stubEnv("VERCEL", "1");
  const allow = createLoginLimiter();
  for (let n = 0; n < 30; n++)
    expect(allow(new Headers({ "x-forwarded-for": String(n) }))).toBe(true);
  expect(allow(new Headers({ "x-forwarded-for": "31" }))).toBe(false);
});
const request = (body: string, origin = "https://ayalvi.test") =>
  new Request("https://ayalvi.test/admin/session", {
    method: "POST",
    headers: { origin, "content-type": "application/x-www-form-urlencoded" },
    body,
  });
it("bounds login bodies, accepts one password and rejects unexpected fields", async () => {
  expect(await readPassword(request("password=test"))).toBe("test");
  for (const body of [
    "password=x&extra=x",
    "password=x&password=y",
    "password=",
    "x=1",
    "password=" + "x".repeat(1025),
  ])
    expect(await readPassword(request(body))).toBeNull();
  expect(sameOrigin(request("password=x", "https://evil.test"))).toBe(false);
  expect(sameOrigin(request("password=x"))).toBe(true);
});
it("validates query filters and safely encodes pagination links", () => {
  expect(
    parseFilters({ city_region: " Zürich ", page: "2", referred: "yes" }),
  ).toEqual({ city_region: "Zürich", page: 2, referred: "yes" });
  for (const q of [
    { x: "a" },
    { page: "0" },
    { page: ["1", "2"] },
    { date_from: "2026-02-30" },
    { date_from: "2026-09-02", date_to: "2026-01-01" },
    { gender: "bad" },
    { city_region: "x".repeat(101) },
  ])
    expect(parseFilters(q)).toBeNull();
  expect(pageLink({ page: 1, city_region: "A&B" }, 2)).toBe(
    "/admin/waitlist?page=2&city_region=A%26B",
  );
});

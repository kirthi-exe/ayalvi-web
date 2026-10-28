// @vitest-environment node
import { beforeEach, afterEach, it, expect, vi } from "vitest";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({
  allowed: vi.fn(),
  signin: vi.fn(),
  user: vi.fn(),
  options: vi.fn(),
}));
vi.mock("@/lib/admin/rate-limit", () => ({
  createLoginLimiter: () => mocks.allowed,
}));
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    auth: { signInWithPassword: mocks.signin, getUser: mocks.user },
  }),
}));
vi.mock("@/lib/reviewer/auth", () => ({
  reviewerCookie: () => "reviewer-test",
  reviewerCookieOptions: mocks.options,
}));
import { POST } from "@/app/admin/verifications/session/route";
const session = () => ({
  access_token: "private-access-token",
  refresh_token: "private-refresh-token",
  expires_at: Math.floor(Date.now() / 1000) + 3600,
});
const request = (
  origin = "https://web.test",
  body = "email=private%40example.test&password=private-password",
  contentType = "application/x-www-form-urlencoded",
) =>
  new Request("https://web.test/admin/verifications/session", {
    method: "POST",
    headers: { origin, "content-type": contentType },
    body,
  });
beforeEach(() => {
  vi.stubEnv("REVIEW_SUPABASE_URL", "https://review.example");
  vi.stubEnv(
    "REVIEW_SUPABASE_PUBLISHABLE_KEY",
    "sb_publishable_private_fixture",
  );
  mocks.allowed.mockReturnValue(true);
  mocks.signin.mockResolvedValue({ data: { session: session() }, error: null });
  mocks.user.mockResolvedValue({
    data: {
      user: { id: "private-user-id", app_metadata: { ayalvi_reviewer: true } },
    },
    error: null,
  });
  mocks.options.mockReturnValue({
    httpOnly: true,
    secure: true,
    sameSite: "strict",
  });
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "info").mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.resetAllMocks();
  vi.unstubAllEnvs();
});
it.each([
  "origin_rejected",
  "rate_limited",
  "invalid_request",
  "missing_config",
  "invalid_config",
  "invalid_credentials",
  "sign_in_failed",
  "session_missing",
  "user_fetch_failed",
  "reviewer_role_missing",
  "session_token_too_large",
  "session_expired",
  "session_cookie_failed",
])(
  "logs only the category for %s and preserves the generic redirect",
  async (reason) => {
    let req = request();
    if (reason === "origin_rejected") req = request("https://other.test");
    if (reason === "rate_limited") mocks.allowed.mockReturnValue(false);
    if (reason === "invalid_request")
      req = request("https://web.test", "unexpected=private");
    if (reason === "missing_config") vi.stubEnv("REVIEW_SUPABASE_URL", "");
    if (reason === "invalid_config")
      vi.stubEnv("REVIEW_SUPABASE_URL", "not-a-url");
    if (reason === "invalid_credentials" || reason === "sign_in_failed")
      mocks.signin.mockResolvedValue({
        data: { session: null },
        error: {
          code:
            reason === "invalid_credentials" ? reason : "private-error-code",
          message: "private-error-detail",
        },
      });
    if (reason === "session_missing")
      mocks.signin.mockResolvedValue({ data: { session: null }, error: null });
    if (reason === "user_fetch_failed")
      mocks.user.mockResolvedValue({
        data: { user: null },
        error: { message: "private-error-detail" },
      });
    if (reason === "reviewer_role_missing")
      mocks.user.mockResolvedValue({
        data: {
          user: { app_metadata: {}, user_metadata: { ayalvi_reviewer: true } },
        },
        error: null,
      });
    if (reason === "session_token_too_large")
      mocks.signin.mockResolvedValue({
        data: { session: { ...session(), access_token: "x".repeat(3801) } },
        error: null,
      });
    if (reason === "session_expired")
      mocks.signin.mockResolvedValue({
        data: { session: { ...session(), expires_at: 1 } },
        error: null,
      });
    if (reason === "session_cookie_failed")
      mocks.options.mockImplementation(() => {
        throw new Error("private-cookie-detail");
      });
    const response = await POST(req);
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "https://web.test/admin/verifications/login?error=1",
    );
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(console.warn).toHaveBeenCalledExactlyOnceWith(
      `REVIEW_LOGIN_FAIL reason=${reason}`,
    );
    expect(console.info).not.toHaveBeenCalled();
    expect(await response.text()).not.toContain("private");
  },
);
it.each(["signin", "user"] as const)(
  "classifies thrown %s errors without logging their details",
  async (step) => {
    mocks[step].mockRejectedValue(new Error("private-token-in-error"));
    await POST(request());
    expect(console.warn).toHaveBeenCalledExactlyOnceWith(
      `REVIEW_LOGIN_FAIL reason=${step === "signin" ? "sign_in_failed" : "user_fetch_failed"}`,
    );
  },
);
it("logs only success after creating the authorized cookie", async () => {
  const response = await POST(request());
  expect(response.headers.get("location")).toBe(
    "https://web.test/admin/verifications",
  );
  expect(response.cookies.get("reviewer-test")?.value).toBe(
    "private-access-token",
  );
  expect(console.info).toHaveBeenCalledExactlyOnceWith("REVIEW_LOGIN_OK");
  expect(console.warn).not.toHaveBeenCalled();
});

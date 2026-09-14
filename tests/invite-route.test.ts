// @vitest-environment node
import { beforeEach, afterEach, it, expect, vi } from "vitest";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({
  cookies: vi.fn(),
  rpc: vi.fn(),
  client: vi.fn(),
}));
vi.mock("next/headers", () => ({ cookies: mocks.cookies }));
vi.mock("@supabase/supabase-js", () => ({ createClient: mocks.client }));
import { POST } from "@/app/admin/waitlist/status/route";
import { createSession } from "@/lib/admin/session";
import { parseStatusAction } from "@/lib/admin/transitions";
import { earlyAccessInviteTemplate } from "@/lib/email/invite";
import { parseFilters, pageLink } from "@/lib/admin/filters";
const payload = {
  entries: [
    { id: "00000000-0000-4000-8000-000000000001", expected_status: "waiting" },
  ],
  target: "invited",
};
const req = (body: unknown = payload, origin = "https://ayalvi.test") =>
  new Request("https://ayalvi.test/admin/waitlist/status", {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
beforeEach(() => {
  vi.stubEnv(
    "ADMIN_DASHBOARD_PASSWORD",
    "test-invite-only-password-0123456789",
  );
  vi.stubEnv("SUPABASE_URL", "https://example.test");
  vi.stubEnv("SUPABASE_SECRET_KEY", "test-only");
  mocks.cookies.mockResolvedValue({ get: () => ({ value: createSession() }) });
  mocks.client.mockReturnValue({ rpc: mocks.rpc });
  mocks.rpc.mockResolvedValue({ data: { changed: 1 }, error: null });
});
afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});
it("requires valid session for mutations including expired/tampered cookies", async () => {
  for (const value of [
    undefined,
    "tampered",
    createSession(Date.now() - 9 * 3600000),
  ]) {
    mocks.cookies.mockResolvedValue({
      get: () => (value ? { value } : undefined),
    });
    expect((await POST(req())).status).toBe(401);
  }
  expect(mocks.client).not.toHaveBeenCalled();
});
it("rejects cross-origin and missing Origin before database access", async () => {
  expect((await POST(req(payload, "https://evil.test"))).status).toBe(403);
  expect((await POST(req(payload, ""))).status).toBe(403);
  expect(mocks.client).not.toHaveBeenCalled();
});
it("updates through only the restricted RPC without email configuration", async () => {
  vi.stubEnv("RESEND_API_KEY", "");
  expect(await (await POST(req())).json()).toEqual({ success: true });
  expect(mocks.rpc).toHaveBeenCalledWith("admin_transition_waitlist", {
    p_action: payload,
  });
});
it("hides returned and thrown DB errors", async () => {
  for (const error of [false, true]) {
    if (error) mocks.rpc.mockRejectedValue(new Error("private SQL secret"));
    else
      mocks.rpc.mockResolvedValue({
        error: { message: "private SQL secret" },
        data: null,
      });
    const response = await POST(req());
    expect(response.status).toBe(409);
    expect(await response.text()).not.toContain("private SQL");
  }
});
it("rejects malformed bodies, IDs, transitions, fields and oversized requests", async () => {
  for (const value of [
    { ...payload, extra: true },
    { ...payload, entries: [{ id: "bad", expected_status: "waiting" }] },
    { ...payload, target: "arbitrary" },
    {
      ...payload,
      entries: [{ ...payload.entries[0], expected_status: "blocked" }],
    },
  ])
    expect((await POST(req(value))).status).toBe(400);
  for (const [body, status] of [
    ["{", 400],
    ["x".repeat(8193), 413],
  ] as const)
    expect(
      (
        await POST(
          new Request("https://ayalvi.test/admin/waitlist/status", {
            method: "POST",
            headers: {
              origin: "https://ayalvi.test",
              "content-type": "application/json",
            },
            body,
          }),
        )
      ).status,
    ).toBe(status);
  expect(mocks.client).not.toHaveBeenCalled();
});
it("enforces batch and confirmation contracts in the server validator", () => {
  expect(
    parseStatusAction({
      ...payload,
      entries: Array(26).fill(payload.entries[0]),
    }),
  ).toBeNull();
  expect(parseStatusAction({ ...payload, target: "blocked" })).toBeNull();
  expect(
    parseStatusAction({ ...payload, target: "blocked", confirmed_block: true }),
  ).not.toBeNull();
});
it("invite template contains HTML/text but no links, IDs, provider or secrets", () => {
  const template = earlyAccessInviteTemplate();
  expect(template.subject).toBe("Your Ayalvi Early Access invite");
  expect(template.html).toContain("<!doctype html>");
  expect(template.text).toContain(
    "We'll send you everything you need to get started.",
  );
  expect(JSON.stringify(template)).not.toMatch(
    /https?:|href|founder|uuid|RESEND|SUPABASE/,
  );
});
it("allows only supported sorting and preserves it across pages", () => {
  for (const sort of ["newest", "oldest", "referrals", "status", "city"])
    expect(parseFilters({ sort })?.sort).toBe(sort);
  expect(parseFilters({ sort: "sql" })).toBeNull();
  expect(pageLink({ page: 1, sort: "referrals" }, 2)).toContain(
    "sort=referrals",
  );
});

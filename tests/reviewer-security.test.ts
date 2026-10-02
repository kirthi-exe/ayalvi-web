// @vitest-environment node
import { beforeEach, afterEach, it, expect, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`REDIRECT:${path}`);
  },
}));
import Verifications from "@/app/admin/verifications/page";
const mocks = vi.hoisted(() => ({
  cookies: vi.fn(),
  user: vi.fn(),
  signin: vi.fn(),
  client: vi.fn(),
  fetch: vi.fn(),
}));
vi.mock("next/headers", () => ({ cookies: mocks.cookies }));
vi.mock("@supabase/supabase-js", () => ({ createClient: mocks.client }));
import { POST } from "@/app/admin/verifications/review/route";
import { POST as login } from "@/app/admin/verifications/session/route";
import { POST as logout } from "@/app/admin/verifications/logout/route";
import { reviewerAccess, reviewerCookie } from "@/lib/reviewer/auth";
import { reviewerConfig } from "@/lib/reviewer/client";
const id = "00000000-0000-4000-8000-000000000001";
const summary = {
  submission_id: id,
  user_id: "hidden-user-id",
  first_name: "Anu",
  age: 28,
  city: "Zürich",
  submitted_at: "2026-10-01T10:00:00Z",
  email: "hidden@example.test",
  date_of_birth: "1998-01-01",
  video_path: "private-path",
};
const req = (body: unknown, origin = "https://web.test") =>
  new Request("https://web.test/admin/verifications/review", {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
beforeEach(() => {
  vi.stubEnv("REVIEW_SUPABASE_URL", "https://review.example");
  vi.stubEnv("REVIEW_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test_only");
  mocks.cookies.mockResolvedValue({ get: () => ({ value: "reviewer-token" }) });
  mocks.user.mockResolvedValue({
    data: { user: { app_metadata: { ayalvi_reviewer: true } } },
    error: null,
  });
  mocks.client.mockReturnValue({
    auth: { getUser: mocks.user, signInWithPassword: mocks.signin },
  });
  mocks.fetch.mockResolvedValue(Response.json({ reviews: [summary] }));
  vi.stubGlobal("fetch", mocks.fetch);
});
afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
it("signed-out requests are denied before reaching auth or Edge Function", async () => {
  mocks.cookies.mockResolvedValue({ get: () => undefined });
  expect((await POST(req({ action: "list" }))).status).toBe(401);
  expect(mocks.client).not.toHaveBeenCalled();
  expect(mocks.fetch).not.toHaveBeenCalled();
});
it("normal users and editable user_metadata cannot grant reviewer access", async () => {
  for (const app_metadata of [
    {},
    { ayalvi_reviewer: false },
    { ayalvi_reviewer: "true" },
  ]) {
    mocks.user.mockResolvedValue({
      data: {
        user: { app_metadata, user_metadata: { ayalvi_reviewer: true } },
      },
      error: null,
    });
    expect((await POST(req({ action: "list" }))).status).toBe(403);
  }
  expect(mocks.fetch).not.toHaveBeenCalled();
});
it("expired sessions and role revocation are checked through getUser on every call", async () => {
  await reviewerAccess();
  mocks.user.mockResolvedValue({
    data: { user: null },
    error: { message: "expired" },
  });
  expect((await POST(req({ action: "list" }))).status).toBe(401);
  expect(mocks.user).toHaveBeenCalledTimes(2);
  expect(mocks.user).toHaveBeenCalledWith("reviewer-token");
});
it("list uses only the reviewer Edge Function with user token and removes private fields", async () => {
  const response = await POST(req({ action: "list" }));
  expect(response.status).toBe(200);
  const output = await response.json();
  expect(output.reviews[0]).toEqual({
    submission_id: id,
    first_name: "Anu",
    age: 28,
    city: "Zürich",
    submitted_at: summary.submitted_at,
  });
  expect(response.headers.get("cache-control")).toContain("no-store");
  const [url, init] = mocks.fetch.mock.calls[0];
  expect(url).toBe(
    "https://review.example/functions/v1/review-profile-verification",
  );
  expect(init.headers.Authorization).toBe("Bearer reviewer-token");
  expect(JSON.parse(init.body)).toEqual({
    action: "list",
    limit: 100,
    offset: 0,
  });
  expect(init.cache).toBe("no-store");
});
it("get returns only controlled media fields and bounds the URL lifetime", async () => {
  mocks.fetch.mockResolvedValue(
    Response.json({
      ...summary,
      video_signed_url:
        "https://review.example/storage/v1/object/sign/profile-verification-videos/v.mp4?token=test",
      profile_photo_signed_urls: [
        "https://review.example/storage/v1/object/sign/profile-photos/p.jpg?token=test",
      ],
      expires_in_seconds: 999,
    }),
  );
  const data = await (
    await POST(req({ action: "get", submission_id: id }))
  ).json();
  expect(data.expires_in_seconds).toBe(300);
  expect(data.email).toBeUndefined();
  expect(data.user_id).toBeUndefined();
  expect(data.date_of_birth).toBeUndefined();
  expect(data.video_path).toBeUndefined();
});
it("approve and controlled rejection use only Edge Function actions", async () => {
  mocks.fetch.mockImplementation(async () =>
    Response.json({ finalized: true, private: "discard" }),
  );
  for (const action of [
    { action: "approve", submission_id: id },
    { action: "reject", submission_id: id, reason_code: "video_unclear" },
    { action: "reject", submission_id: id, reason_code: "appearance_mismatch" },
    { action: "reject", submission_id: id, reason_code: "technical_issue" },
  ]) {
    expect(await (await POST(req(action))).json()).toEqual({ finalized: true });
    expect(JSON.parse(mocks.fetch.mock.calls.at(-1)![1].body)).toEqual(action);
  }
});
it("rejects missing/unknown reasons, malformed IDs, extra notes and cross-origin calls", async () => {
  for (const action of [
    { action: "reject", submission_id: id },
    { action: "reject", submission_id: id, reason_code: "other" },
    { action: "approve", submission_id: "bad" },
    {
      action: "reject",
      submission_id: id,
      reason_code: "video_unclear",
      notes: "not allowed",
    },
    { action: "sql" },
  ])
    expect((await POST(req(action))).status).toBe(400);
  expect(
    (await POST(req({ action: "list" }, "https://evil.test"))).status,
  ).toBe(403);
  expect(mocks.fetch).not.toHaveBeenCalled();
});
it("maps stale and backend failures safely without exposing response bodies", async () => {
  for (const status of [401, 403, 404, 409, 500]) {
    mocks.fetch.mockResolvedValue(
      new Response("private-url-token-detail", { status }),
    );
    const response = await POST(req({ action: "approve", submission_id: id }));
    expect(response.status).toBe(status === 500 ? 503 : status);
    expect(await response.text()).not.toContain("private-url");
  }
});
it("rejects unexpected signed-media origins", async () => {
  mocks.fetch.mockResolvedValue(
    Response.json({
      ...summary,
      video_signed_url: "https://evil.test/file?token=private",
      profile_photo_signed_urls: [],
    }),
  );
  expect((await POST(req({ action: "get", submission_id: id }))).status).toBe(
    503,
  );
});
it("fails closed when configured with a secret instead of a publishable key", () => {
  vi.stubEnv("REVIEW_SUPABASE_PUBLISHABLE_KEY", "sb_secret_invalid_test_only");
  expect(() => reviewerConfig()).toThrow("Reviewer unavailable");
});
it("reviewer password login uses Auth and stores only a secure HttpOnly access session", async () => {
  vi.stubEnv("NODE_ENV", "production");
  mocks.signin.mockResolvedValue({
    data: {
      session: {
        access_token: "test-access",
        expires_at: Math.floor(Date.now() / 1000) + 3600,
      },
    },
    error: null,
  });
  const response = await login(
    new Request("https://web.test/admin/verifications/session", {
      method: "POST",
      headers: {
        origin: "https://web.test",
        "content-type": "application/x-www-form-urlencoded",
      },
      body: "email=reviewer%40example.test&password=test-only",
    }),
  );
  expect(response.headers.get("location")).toBe(
    "https://web.test/admin/verifications",
  );
  expect(response.headers.get("set-cookie")).toMatch(/HttpOnly/);
  expect(response.headers.get("set-cookie")).toMatch(/Secure/);
  expect(response.headers.get("set-cookie")).toMatch(/SameSite=strict/i);
  expect(response.cookies.get(reviewerCookie())?.value).toBe("test-access");
  expect(await response.text()).not.toContain("test-access");
});
it("reviewer logout clears its cookie without exposing tokens", async () => {
  const response = await logout(req({}));
  expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
  expect(response.headers.get("location")).toContain(
    "/admin/verifications/login",
  );
});

it("server page redirects signed-out users and blocks non-reviewers without media", async () => {
  mocks.cookies.mockResolvedValue({ get: () => undefined });
  await expect(Verifications()).rejects.toThrow(
    "REDIRECT:/admin/verifications/login",
  );
  mocks.cookies.mockResolvedValue({ get: () => ({ value: "normal-user" }) });
  mocks.user.mockResolvedValue({
    data: { user: { app_metadata: {} } },
    error: null,
  });
  const page = await Verifications();
  expect(JSON.stringify(page)).toContain("Reviewer access required.");
  expect(JSON.stringify(page)).not.toContain("signed_url");
  expect(mocks.fetch).not.toHaveBeenCalled();
});
it("authorized server page renders a console shell without signed URLs or access token", async () => {
  const page = await Verifications();
  expect(page.props.className).toBe("wrap reviewer-wrap");
  expect(JSON.stringify(page)).not.toMatch(
    /reviewer-token|signed_url|hidden@example/,
  );
  expect(mocks.fetch).not.toHaveBeenCalled();
});

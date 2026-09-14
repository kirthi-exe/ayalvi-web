// @vitest-environment node
import { beforeEach, afterEach, it, expect, vi } from "vitest";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({
  send: vi.fn(),
  insert: vi.fn(),
  tasks: [] as (() => Promise<void>)[],
}));
vi.mock("resend", () => ({
  Resend: class {
    emails = { send: mocks.send };
  },
}));
vi.mock("@/lib/supabase/waitlist", () => ({ insertEntry: mocks.insert }));
vi.mock("next/server", () => ({
  after: (task: () => Promise<void>) => {
    mocks.tasks.push(task);
  },
}));
import { POST } from "@/app/api/waitlist/route";
import { sendWaitlistConfirmation } from "@/lib/email/confirmation";
import {
  confirmationTemplate,
  referralUrl,
  confirmationSubject,
} from "@/lib/email/template";
const code = "ABCDEF0123";
const valid = {
  email: " Test@Example.test ",
  city_region: "Zürich",
  gender: "Woman",
  interested_in: "Men",
  is_18_plus: true,
};
const request = (payload: unknown) =>
  new Request("https://untrusted-host.test/api/waitlist", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
async function flush() {
  for (const task of mocks.tasks.splice(0)) await task();
}
beforeEach(() => {
  vi.stubEnv("RESEND_API_KEY", "test-only-resend-key");
  vi.stubEnv("WAITLIST_FROM_EMAIL", "Ayalvi <sender@example.test>");
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://ayalvi.example");
  mocks.send
    .mockReset()
    .mockResolvedValue({ data: { id: "private-provider-id" }, error: null });
  mocks.insert.mockReset().mockResolvedValue({ referralCode: code });
  mocks.tasks.length = 0;
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "info").mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});
it("sends once after a committed new signup with normalized recipient and owned link", async () => {
  const response = await POST(request(valid));
  expect(mocks.send).not.toHaveBeenCalled();
  expect(mocks.tasks).toHaveLength(1);
  await flush();
  expect(mocks.send).toHaveBeenCalledTimes(1);
  const [payload, options] = mocks.send.mock.calls[0];
  expect(payload.to).toEqual(["test@example.test"]);
  expect(payload.subject).toBe(confirmationSubject);
  expect(payload.html).toContain("https://ayalvi.example/ref/ABCDEF0123");
  expect(payload.text).toContain("https://ayalvi.example/ref/ABCDEF0123");
  expect(payload.html).not.toContain("untrusted-host");
  expect(options.idempotencyKey).toMatch(
    /^waitlist-confirmation-v1\/[a-f0-9]{64}$/,
  );
  expect(await response.json()).toEqual({ success: true, referralCode: code });
});
it("does not resend on duplicates, normalized retries or self-referral duplicates", async () => {
  await POST(request(valid));
  await flush();
  mocks.insert.mockResolvedValue({});
  for (const payload of [
    valid,
    { ...valid, email: "test@example.test" },
    { ...valid, email: " TEST@EXAMPLE.TEST ", referral_code: code },
  ]) {
    expect(await (await POST(request(payload))).json()).toEqual({
      success: true,
    });
    await flush();
  }
  expect(mocks.send).toHaveBeenCalledTimes(1);
});
it("never sends before database success or for failed writes", async () => {
  mocks.insert.mockRejectedValue(new Error("private DB details"));
  expect((await POST(request(valid))).status).toBe(503);
  expect(mocks.tasks).toHaveLength(0);
  mocks.insert.mockResolvedValue({ code: "unavailable" });
  expect((await POST(request(valid))).status).toBe(503);
  expect(mocks.send).not.toHaveBeenCalled();
});
it("never sends for invalid, malformed or oversized requests", async () => {
  for (const payload of [
    { ...valid, email: "bad" },
    { ...valid, is_18_plus: false },
    { ...valid, website: "bot" },
    { ...valid, extra: "bad" },
  ])
    expect((await POST(request(payload))).status).toBe(400);
  for (const body of ["{", "x".repeat(4097)])
    expect(
      (
        await POST(
          new Request("https://example.test/api/waitlist", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body,
          }),
        )
      ).status,
    ).toBeGreaterThanOrEqual(400);
  await flush();
  expect(mocks.insert).not.toHaveBeenCalled();
  expect(mocks.send).not.toHaveBeenCalled();
});
it("provider rejection or exceptions never change signup success or leak details", async () => {
  for (const throwing of [false, true]) {
    if (throwing)
      mocks.send.mockRejectedValue(
        new Error("private provider secret recipient body"),
      );
    else
      mocks.send.mockResolvedValue({
        data: null,
        error: { message: "private provider secret recipient body" },
      });
    const response = await POST(request(valid));
    await flush();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      success: true,
      referralCode: code,
    });
  }
  expect(console.error).toHaveBeenCalledWith("waitlist_confirmation: failed");
  expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toMatch(
    /private|recipient|body/,
  );
});
it("missing configuration skips sending while signup succeeds, with production error logging", async () => {
  vi.stubEnv("NODE_ENV", "production");
  for (const key of ["RESEND_API_KEY", "WAITLIST_FROM_EMAIL"]) {
    const previous = process.env[key]!;
    vi.stubEnv(key, "");
    expect((await POST(request(valid))).status).toBe(200);
    await flush();
    vi.stubEnv(key, previous);
  }
  expect(mocks.send).not.toHaveBeenCalled();
  expect(console.error).toHaveBeenCalledWith(
    "waitlist_confirmation: skipped_missing_configuration",
  );
});
it("validates canonical HTTPS origin and fails closed without host fallback", async () => {
  for (const value of [
    "",
    "http://localhost:3000",
    "javascript:alert(1)",
    "https://user:pass@example.test",
    "https://example.test/path",
    "https://example.test?x=1",
    "https://example.test#x",
    "https://127.0.0.1",
  ]) {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", value);
    expect(() => referralUrl(code)).toThrow();
    await sendWaitlistConfirmation("test@example.test", code);
  }
  expect(mocks.send).not.toHaveBeenCalled();
});
it("renders HTML/text without a referral section when absent and escapes markup", () => {
  const content = confirmationTemplate();
  expect(content.html).toContain("<!doctype html>");
  expect(content.text).toContain("You're on the list.");
  expect(content.text).not.toContain("Invite");
  expect(content.html).not.toContain("<a ");
  expect(content.text).toContain("DACH");
  expect(content.html).not.toMatch(/founder|SUPABASE|RESEND_API_KEY|uuid/i);
  expect(confirmationTemplate('https://example.test/"<bad>').html).toContain(
    "&quot;&lt;bad&gt;",
  );
});
it("uses a stable provider idempotency key for the same owned code", async () => {
  await sendWaitlistConfirmation("test@example.test", code);
  await sendWaitlistConfirmation("test@example.test", code);
  expect(mocks.send.mock.calls[0][1]).toEqual(mocks.send.mock.calls[1][1]);
});

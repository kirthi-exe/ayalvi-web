// @vitest-environment node
import { it, expect, vi, afterEach } from "vitest";
vi.mock("server-only", () => ({}));
import { createEmailClient } from "@/lib/email/client";
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
it("real SDK never logs raw provider failures in development", async () => {
  vi.stubEnv("NODE_ENV", "development");
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  const fetchMock = vi.fn().mockResolvedValue(
    new Response(
      JSON.stringify({
        message: "private recipient or provider error",
        name: "validation_error",
      }),
      { status: 422 },
    ),
  );
  vi.stubGlobal("fetch", fetchMock);
  const result = await createEmailClient("dummy-sdk-test-key").emails.send(
    {
      from: "sender@example.test",
      to: "recipient@example.test",
      subject: "Test",
      text: "Test",
    },
    { idempotencyKey: "test-only" },
  );
  expect(result.error).toBeTruthy();
  expect(error).not.toHaveBeenCalled();
  expect(fetchMock.mock.calls[0][0]).toBe("https://api.resend.com/emails");
});

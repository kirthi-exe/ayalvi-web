// @vitest-environment node
import { it, expect, vi, beforeEach } from "vitest";
vi.mock("server-only", () => ({}));
const { rpc, createClient } = vi.hoisted(() => ({
  rpc: vi.fn(),
  createClient: vi.fn(),
}));
vi.mock("@supabase/supabase-js", () => ({ createClient }));
import { insertEntry } from "@/lib/supabase/waitlist";
const entry = {
  email: "test@example.com",
  city_region: "Zürich",
  gender: "Woman",
  interested_in: "Men",
  is_18_plus: true as const,
};
beforeEach(() => {
  rpc.mockReset();
  createClient.mockReturnValue({ rpc });
  vi.stubEnv("SUPABASE_URL", "https://example.invalid");
  vi.stubEnv("SUPABASE_SECRET_KEY", "test-server-key");
  return () => vi.unstubAllEnvs();
});
it("uses only the restricted RPC and returns a code without private data", async () => {
  rpc.mockResolvedValue({ data: "ABCDEF1234", error: null });
  expect(await insertEntry(entry)).toEqual({
    code: undefined,
    referralCode: "ABCDEF1234",
  });
  expect(rpc).toHaveBeenCalledWith("join_waitlist", { p_entry: entry });
});
it("does not pass raw database errors or unexpected RPC results onward", async () => {
  rpc
    .mockResolvedValueOnce({
      data: null,
      error: { message: "private details", code: "23505" },
    })
    .mockResolvedValueOnce({
      data: { email: "private@example.com" },
      error: null,
    });
  expect(await insertEntry(entry)).toEqual({ code: "unavailable" });
  expect(await insertEntry(entry)).toEqual({ code: "unavailable" });
});

it("treats a null RPC code as neutral success without inventing a code", async () => {
  rpc.mockResolvedValue({ data: null, error: null });
  expect(await insertEntry(entry)).toEqual({ code: undefined });
});

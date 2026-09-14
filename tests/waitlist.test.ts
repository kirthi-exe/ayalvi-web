// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { validate } from "@/lib/validation/waitlist";
vi.mock("@/lib/supabase/waitlist", () => ({ insertEntry: vi.fn() }));
import { insertEntry } from "@/lib/supabase/waitlist";
import { POST } from "@/app/api/waitlist/route";
const valid = {
  email: " Test@Example.com ",
  city_region: " Zürich ",
  gender: "Woman",
  interested_in: "Men",
  is_18_plus: true,
  website: "",
};
const request = (payload: unknown) =>
  new Request("https://ayalvi.example/api/waitlist", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "https://ayalvi.example",
    },
    body: JSON.stringify(payload),
  });
beforeEach(() => {
  vi.mocked(insertEntry).mockReset();
});
describe("validation", () => {
  it("accepts and normalizes a valid payload", () => {
    const result = validate(valid);
    expect(result.data?.email).toBe("test@example.com");
    expect(result.data?.city_region).toBe("Zürich");
  });
  for (const [field, value] of [
    ["email", "wrong"],
    ["is_18_plus", false],
    ["gender", "arbitrary"],
    ["interested_in", "arbitrary"],
    ["website", "bot"],
    ["city_region", "x"],
    ["heard_from", "x".repeat(121)],
    ["utm_source", "<script>"],
  ])
    it(`rejects invalid ${field}`, () =>
      expect(
        validate({ ...valid, [field as string]: value }).errors,
      ).toBeDefined());
  it("rejects extra fields and non-string fields", () => {
    expect(validate({ ...valid, status: "priority" }).errors).toBeDefined();
    expect(validate({ ...valid, heard_from: 123 }).errors).toBeDefined();
  });
});
describe("server submission", () => {
  it("accepts a valid entry", async () => {
    vi.mocked(insertEntry).mockResolvedValue({
      code: undefined,
      referralCode: "ABCDEF0123",
    });
    expect((await POST(request(valid))).status).toBe(200);
    expect(insertEntry).toHaveBeenCalledWith(
      expect.objectContaining({ email: "test@example.com" }),
    );
  });
  it("returns neutral success without a referral code or duplicate flag for duplicates", async () => {
    vi.mocked(insertEntry)
      .mockResolvedValueOnce({ code: undefined, referralCode: "ABCDEF0123" })
      .mockResolvedValueOnce({ code: undefined });
    const created = await POST(request(valid));
    const repeated = await POST(request(valid));
    expect(created.status).toBe(200);
    expect(repeated.status).toBe(200);
    expect(await created.json()).toEqual({
      success: true,
      referralCode: "ABCDEF0123",
    });
    expect(await repeated.json()).toEqual({ success: true });
  });
  it("never exposes raw database errors", async () => {
    vi.mocked(insertEntry).mockRejectedValue(
      new Error("secret internal table password"),
    );
    const response = await POST(request(valid));
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("secret");
  });
  it("hides returned database failure details", async () => {
    vi.mocked(insertEntry).mockResolvedValue({ code: "INTERNAL_DB_ERROR" });
    expect(await (await POST(request(valid))).text()).not.toContain(
      "INTERNAL_DB_ERROR",
    );
  });
  it("rejects honeypot before storage", async () => {
    expect((await POST(request({ ...valid, website: "bot" }))).status).toBe(
      400,
    );
    expect(insertEntry).not.toHaveBeenCalled();
  });
  it("limits actual payload bytes", async () =>
    expect((await POST(request({ email: "x".repeat(5000) }))).status).toBe(
      413,
    ));
  it("rejects cross-origin submissions", async () => {
    const r = request(valid);
    r.headers.set("origin", "https://other.example");
    expect((await POST(r)).status).toBe(403);
  });
  it("rejects malformed JSON", async () =>
    expect(
      (
        await POST(
          new Request("https://ayalvi.example/api/waitlist", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: "{",
          }),
        )
      ).status,
    ).toBe(400));
});

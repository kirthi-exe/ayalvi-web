import { beforeEach, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { normalizeReferralCode } from "@/lib/referrals/code";
import {
  rememberReferral,
  incomingReferral,
  completeReferral,
  referralReceipt,
} from "@/lib/referrals/storage";
import { validate } from "@/lib/validation/waitlist";
import { ReferralLink } from "@/components/referrals/link";
beforeEach(() => {
  sessionStorage.clear();
});
it("normalizes valid codes and rejects malformed/oversized/non-string input", () => {
  expect(normalizeReferralCode(" abcdef0123 ")).toBe("ABCDEF0123");
  for (const value of [
    "../../bad",
    "g".repeat(10),
    "A".repeat(11),
    null,
    123,
    " ".repeat(40) + "ABCDEF0123",
  ])
    expect(normalizeReferralCode(value)).toBeNull();
});
it("accepts optional referral code, rejects malformed code and protected fields", () => {
  const p = {
    email: "test@example.com",
    city_region: "Wien",
    gender: "Woman",
    interested_in: "Men",
    is_18_plus: true,
  };
  expect(validate(p).data).toBeDefined();
  expect(
    validate({ ...p, referral_code: " abcdef0123 " }).data?.referral_code,
  ).toBe("ABCDEF0123");
  expect(
    validate({ ...p, referral_code: "bad!" }).errors?.referral_code,
  ).toBeDefined();
  for (const field of ["referred_by", "referral_count", "status"])
    expect(validate({ ...p, [field]: "anything" }).errors).toBeDefined();
});
it("preserves referral for signup then clears it and retains only a short-lived receipt", () => {
  rememberReferral("ABCDEF0123");
  expect(incomingReferral()).toBe("ABCDEF0123");
  completeReferral("123456ABCD");
  expect(incomingReferral()).toBeNull();
  expect(referralReceipt()).toBe("123456ABCD");
  const now = Date.now();
  const spy = vi.spyOn(Date, "now").mockReturnValue(now + 31 * 60 * 1000);
  expect(referralReceipt()).toBeNull();
  spy.mockRestore();
});
it("expires incoming referral and tolerates unavailable storage", () => {
  rememberReferral("ABCDEF0123");
  const now = Date.now();
  const time = vi.spyOn(Date, "now").mockReturnValue(now + 31 * 60 * 1000);
  expect(incomingReferral()).toBeNull();
  time.mockRestore();
  const spy = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
    throw new Error("blocked");
  });
  expect(incomingReferral()).toBeNull();
  spy.mockRestore();
});
it("shows an accessible link and copies it with status feedback", async () => {
  completeReferral("ABCDEF0123");
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText },
  });
  render(<ReferralLink />);
  const input = await screen.findByLabelText("Your invitation link");
  expect(input).toHaveValue(`${window.location.origin}/ref/ABCDEF0123`);
  fireEvent.click(screen.getByRole("button", { name: "Copy link" }));
  await waitFor(() =>
    expect(screen.getByRole("status")).toHaveTextContent("Link copied."),
  );
  expect(writeText).toHaveBeenCalledWith(
    `${window.location.origin}/ref/ABCDEF0123`,
  );
});
it("offers manual copying when clipboard access fails", async () => {
  completeReferral("ABCDEF0123");
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: vi.fn().mockRejectedValue(new Error("blocked")) },
  });
  render(<ReferralLink />);
  fireEvent.click(await screen.findByRole("button", { name: "Copy link" }));
  await waitFor(() =>
    expect(screen.getByRole("status")).toHaveTextContent("Select and copy"),
  );
});
it("direct success visits expose no referral link without a receipt", () => {
  render(<ReferralLink />);
  expect(
    screen.queryByLabelText("Your invitation link"),
  ).not.toBeInTheDocument();
});

it("clears any prior receipt on success without a genuine new code", () => {
  completeReferral("ABCDEF0123");
  rememberReferral("123456ABCD");
  completeReferral(undefined);
  expect(referralReceipt()).toBeNull();
  expect(incomingReferral()).toBeNull();
  render(<ReferralLink />);
  expect(
    screen.queryByRole("region", { name: "Your referral link" }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Copy link" }),
  ).not.toBeInTheDocument();
});

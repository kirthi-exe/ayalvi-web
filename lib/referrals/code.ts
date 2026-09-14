export const REFERRAL_PATTERN = /^[A-F0-9]{10}$/;
export function normalizeReferralCode(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 32) return null;
  const code = value.trim().toUpperCase();
  return REFERRAL_PATTERN.test(code) ? code : null;
}

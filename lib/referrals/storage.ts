"use client";
import { normalizeReferralCode } from "./code";
const incomingKey = "ayalvi:incoming-referral";
const receiptKey = "ayalvi:referral-receipt";
const lifetime = 30 * 60 * 1000;
function read(key: string): string | null {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const value = JSON.parse(raw);
    if (typeof value.expires !== "number" || value.expires <= Date.now()) {
      sessionStorage.removeItem(key);
      return null;
    }
    return normalizeReferralCode(value.code);
  } catch {
    return null;
  }
}
export function rememberReferral(code: string) {
  try {
    sessionStorage.setItem(
      incomingKey,
      JSON.stringify({ code, expires: Date.now() + lifetime }),
    );
  } catch {
    /* Storage can be disabled; the signup remains available. */
  }
}
export function incomingReferral() {
  return read(incomingKey);
}
export function completeReferral(code: unknown) {
  try {
    sessionStorage.removeItem(incomingKey);
    const normalized = normalizeReferralCode(code);
    if (normalized)
      sessionStorage.setItem(
        receiptKey,
        JSON.stringify({ code: normalized, expires: Date.now() + lifetime }),
      );
    else sessionStorage.removeItem(receiptKey);
  } catch {
    /* The signup itself has already succeeded. */
  }
}
export function referralReceipt() {
  return read(receiptKey);
}

export function forgetReferral() {
  try {
    sessionStorage.removeItem(incomingKey);
  } catch {}
}

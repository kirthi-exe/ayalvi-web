import "server-only";
import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
export const SESSION_SECONDS = 8 * 60 * 60;
export const cookieName = () =>
  process.env.NODE_ENV === "production"
    ? "__Secure-ayalvi-admin"
    : "ayalvi-admin";
export const cookieOptions = () => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "strict" as const,
  path: "/admin",
  maxAge: SESSION_SECONDS,
});
function password() {
  const value = process.env.ADMIN_DASHBOARD_PASSWORD;
  return value && value.length >= 24 && value.length <= 256 ? value : null;
}
function digest(value: string) {
  return createHash("sha256").update(value).digest();
}
export function matchesPassword(input: string) {
  const expected = password();
  const match = timingSafeEqual(
    digest(input),
    digest(expected || "admin-login-disabled"),
  );
  return Boolean(expected) && match;
}
function signature(payload: string, secret: string) {
  return createHmac("sha256", secret)
    .update("ayalvi-admin-session-v1\0" + payload)
    .digest();
}
export function createSession(now = Date.now()) {
  const secret = password();
  if (!secret) throw new Error("Admin access unavailable");
  const issued = Math.floor(now / 1000);
  const payload = `v1.${issued}.${issued + SESSION_SECONDS}.${randomBytes(24).toString("hex")}`;
  return `${payload}.${signature(payload, secret).toString("hex")}`;
}
export function validSession(token: string | undefined, now = Date.now()) {
  const secret = password();
  if (!secret || !token || token.length > 256) return false;
  const match = /^(v1\.(\d{10})\.(\d{10})\.[a-f0-9]{48})\.([a-f0-9]{64})$/.exec(
    token,
  );
  if (!match) return false;
  const issued = Number(match[2]),
    expires = Number(match[3]),
    seconds = Math.floor(now / 1000);
  return (
    issued <= seconds &&
    expires > seconds &&
    expires - issued === SESSION_SECONDS &&
    timingSafeEqual(signature(match[1], secret), Buffer.from(match[4], "hex"))
  );
}

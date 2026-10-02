import "server-only";
import { cookies } from "next/headers";
import { reviewerClient } from "./client";
export const reviewerCookie = () =>
  process.env.NODE_ENV === "production"
    ? "__Secure-ayalvi-reviewer"
    : "ayalvi-reviewer";
export const reviewerCookieOptions = () => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "strict" as const,
  path: "/admin/verifications",
});
export async function reviewerAccess() {
  const token = (await cookies()).get(reviewerCookie())?.value;
  if (!token || token.length > 3800) return { kind: "unauthorized" as const };
  try {
    const { data, error } = await reviewerClient().auth.getUser(token);
    if (error || !data.user) return { kind: "unauthorized" as const };
    if (data.user.app_metadata?.ayalvi_reviewer !== true)
      return { kind: "forbidden" as const };
    return { kind: "authorized" as const, token };
  } catch {
    return { kind: "unavailable" as const };
  }
}

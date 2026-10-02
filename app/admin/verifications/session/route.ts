import { NextResponse } from "next/server";
import { sameOrigin } from "@/lib/admin/http";
import { createLoginLimiter } from "@/lib/admin/rate-limit";
import { reviewerClient } from "@/lib/reviewer/client";
import { reviewerCookie, reviewerCookieOptions } from "@/lib/reviewer/auth";
import { readSmallBody } from "@/lib/reviewer/http";
const allowed = createLoginLimiter();
export const runtime = "nodejs";
export async function POST(request: Request) {
  const response = (path: string) => {
    const r = NextResponse.redirect(new URL(path, request.url), 303);
    r.headers.set("Cache-Control", "private, no-store");
    return r;
  };
  const failure = () => response("/admin/verifications/login?error=1");
  if (
    !sameOrigin(request) ||
    !allowed(request.headers) ||
    request.headers.get("content-type")?.split(";")[0] !==
      "application/x-www-form-urlencoded"
  )
    return failure();
  try {
    const body = await readSmallBody(request);
    if (body === null) return failure();
    const form = new URLSearchParams(body);
    if (
      [...form.keys()].some((k) => !["email", "password"].includes(k)) ||
      form.getAll("email").length !== 1 ||
      form.getAll("password").length !== 1
    )
      return failure();
    const email = form.get("email")?.trim(),
      password = form.get("password");
    if (!email || email.length > 254 || !password || password.length > 512)
      return failure();
    const client = reviewerClient();
    const { data, error } = await client.auth.signInWithPassword({
      email,
      password,
    });
    if (error || !data.session) return failure();
    const { data: identity, error: identityError } = await client.auth.getUser(
      data.session.access_token,
    );
    if (
      identityError ||
      identity.user?.app_metadata?.ayalvi_reviewer !== true ||
      data.session.access_token.length > 3800
    )
      return failure();
    const remaining = Math.min(
      3600,
      (data.session.expires_at || 0) - Math.floor(Date.now() / 1000),
    );
    if (remaining <= 0) return failure();
    const result = response("/admin/verifications");
    result.cookies.set(reviewerCookie(), data.session.access_token, {
      ...reviewerCookieOptions(),
      maxAge: remaining,
    });
    return result;
  } catch {
    return failure();
  }
}

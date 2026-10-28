import { NextResponse } from "next/server";
import { sameOrigin } from "@/lib/admin/http";
import { createLoginLimiter } from "@/lib/admin/rate-limit";
import { reviewerClient } from "@/lib/reviewer/client";
import { reviewerCookie, reviewerCookieOptions } from "@/lib/reviewer/auth";
import { readSmallBody } from "@/lib/reviewer/http";
const allowed = createLoginLimiter();
export const runtime = "nodejs";
type FailureReason =
  | "origin_rejected"
  | "rate_limited"
  | "invalid_request"
  | "missing_config"
  | "invalid_config"
  | "invalid_credentials"
  | "sign_in_failed"
  | "session_missing"
  | "user_fetch_failed"
  | "reviewer_role_missing"
  | "session_token_too_large"
  | "session_expired"
  | "session_cookie_failed";
export async function POST(request: Request) {
  const response = (path: string) => {
    const r = NextResponse.redirect(new URL(path, request.url), 303);
    r.headers.set("Cache-Control", "private, no-store");
    return r;
  };
  // Only this closed category set may reach logs; never pass request/auth data.
  const failure = (reason: FailureReason) => {
    console.warn(`REVIEW_LOGIN_FAIL reason=${reason}`);
    return response("/admin/verifications/login?error=1");
  };
  if (!sameOrigin(request)) return failure("origin_rejected");
  if (!allowed(request.headers)) return failure("rate_limited");
  if (
    request.headers.get("content-type")?.split(";")[0] !==
    "application/x-www-form-urlencoded"
  )
    return failure("invalid_request");
  let stage: FailureReason = "invalid_request";
  try {
    const body = await readSmallBody(request);
    if (body === null) return failure("invalid_request");
    const form = new URLSearchParams(body);
    if (
      [...form.keys()].some((k) => !["email", "password"].includes(k)) ||
      form.getAll("email").length !== 1 ||
      form.getAll("password").length !== 1
    )
      return failure("invalid_request");
    const email = form.get("email")?.trim(),
      password = form.get("password");
    if (!email || email.length > 254 || !password || password.length > 512)
      return failure("invalid_request");
    if (
      !process.env.REVIEW_SUPABASE_URL ||
      !process.env.REVIEW_SUPABASE_PUBLISHABLE_KEY
    )
      return failure("missing_config");
    stage = "invalid_config";
    const client = reviewerClient();
    stage = "sign_in_failed";
    const { data, error } = await client.auth.signInWithPassword({
      email,
      password,
    });
    if (error)
      return failure(
        error.code === "invalid_credentials"
          ? "invalid_credentials"
          : "sign_in_failed",
      );
    if (!data.session) return failure("session_missing");
    stage = "user_fetch_failed";
    const { data: identity, error: identityError } = await client.auth.getUser(
      data.session.access_token,
    );
    if (identityError || !identity.user) return failure("user_fetch_failed");
    if (identity.user.app_metadata?.ayalvi_reviewer !== true)
      return failure("reviewer_role_missing");
    if (data.session.access_token.length > 3800)
      return failure("session_token_too_large");
    const remaining = Math.min(
      3600,
      (data.session.expires_at || 0) - Math.floor(Date.now() / 1000),
    );
    if (remaining <= 0) return failure("session_expired");
    stage = "session_cookie_failed";
    const result = response("/admin/verifications");
    result.cookies.set(reviewerCookie(), data.session.access_token, {
      ...reviewerCookieOptions(),
      maxAge: remaining,
    });
    console.info("REVIEW_LOGIN_OK");
    return result;
  } catch {
    return failure(stage);
  }
}

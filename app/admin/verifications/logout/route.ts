import { NextResponse } from "next/server";
import { sameOrigin } from "@/lib/admin/http";
import { reviewerCookie, reviewerCookieOptions } from "@/lib/reviewer/auth";
import { privateReply } from "@/lib/reviewer/http";
export async function POST(request: Request) {
  if (!sameOrigin(request))
    return privateReply({ message: "Request not permitted." }, 403);
  const response = NextResponse.redirect(
    new URL("/admin/verifications/login", request.url),
    303,
  );
  response.headers.set("Cache-Control", "private, no-store");
  response.cookies.set(reviewerCookie(), "", {
    ...reviewerCookieOptions(),
    maxAge: 0,
    expires: new Date(0),
  });
  return response;
}

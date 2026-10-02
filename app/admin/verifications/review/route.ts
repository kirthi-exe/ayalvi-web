import { reviewerAccess } from "@/lib/reviewer/auth";
import { sameOrigin } from "@/lib/admin/http";
import { readSmallBody, privateReply } from "@/lib/reviewer/http";
import { parseReviewAction } from "@/lib/reviewer/contract";
import { callReviewer, ReviewFailure } from "@/lib/reviewer/edge";
export const runtime = "nodejs";
export async function POST(request: Request) {
  const access = await reviewerAccess();
  if (access.kind !== "authorized")
    return privateReply(
      {
        message:
          access.kind === "forbidden"
            ? "Reviewer access required."
            : access.kind === "unauthorized"
              ? "Please sign in again."
              : "Review is unavailable.",
      },
      access.kind === "forbidden"
        ? 403
        : access.kind === "unauthorized"
          ? 401
          : 503,
    );
  if (!sameOrigin(request))
    return privateReply({ message: "Request not permitted." }, 403);
  if (request.headers.get("content-type")?.split(";")[0] !== "application/json")
    return privateReply({ message: "Invalid request." }, 400);
  try {
    const raw = await readSmallBody(request);
    if (raw === null) return privateReply({ message: "Invalid request." }, 400);
    let data: unknown;
    try {
      data = JSON.parse(raw);
    } catch {
      return privateReply({ message: "Invalid request." }, 400);
    }
    const action = parseReviewAction(data);
    if (!action) return privateReply({ message: "Invalid request." }, 400);
    return privateReply(await callReviewer(access.token, action));
  } catch (error) {
    const status = error instanceof ReviewFailure ? error.status : 503;
    return privateReply(
      {
        message:
          status === 401
            ? "Please sign in again."
            : status === 403
              ? "Reviewer access required."
              : status === 404 || status === 409
                ? "This review is no longer pending."
                : "Review is unavailable. Try again.",
      },
      status,
    );
  }
}

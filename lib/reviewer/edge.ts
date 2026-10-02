import "server-only";
import { reviewerConfig } from "./client";
import type { ReviewAction, ReviewSummary } from "./contract";
export class ReviewFailure extends Error {
  constructor(public status: number) {
    super("Review unavailable");
  }
}
function summary(value: unknown): ReviewSummary {
  if (!value || typeof value !== "object") throw new ReviewFailure(503);
  const row = value as Record<string, unknown>;
  if (
    typeof row.submission_id !== "string" ||
    !/^[0-9a-f-]{36}$/i.test(row.submission_id) ||
    typeof row.first_name !== "string" ||
    typeof row.city !== "string" ||
    typeof row.submitted_at !== "string" ||
    !Number.isFinite(Date.parse(row.submitted_at)) ||
    (row.age !== null &&
      (!Number.isInteger(row.age) ||
        Number(row.age) < 0 ||
        Number(row.age) > 130))
  )
    throw new ReviewFailure(503);
  return {
    submission_id: row.submission_id,
    first_name: row.first_name.slice(0, 100),
    age: row.age as number | null,
    city: row.city.slice(0, 100),
    submitted_at: row.submitted_at,
  };
}
function mediaUrl(value: unknown, origin: string, bucket: string) {
  if (typeof value !== "string") throw new ReviewFailure(503);
  const url = new URL(value);
  if (
    url.origin !== origin ||
    url.username ||
    url.password ||
    !url.pathname.startsWith(`/storage/v1/object/sign/${bucket}/`) ||
    !url.searchParams.get("token")
  )
    throw new ReviewFailure(503);
  return url.href;
}
export async function callReviewer(token: string, action: ReviewAction) {
  const { url, key } = reviewerConfig();
  const response = await fetch(
    `${url}/functions/v1/review-profile-verification`,
    {
      method: "POST",
      headers: {
        apikey: key,
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(
        action.action === "list"
          ? { action: "list", limit: 100, offset: 0 }
          : action,
      ),
      cache: "no-store",
      signal: AbortSignal.timeout(20000),
    },
  );
  if (!response.ok)
    throw new ReviewFailure(
      [401, 403, 404, 409].includes(response.status) ? response.status : 503,
    );
  const data = await response.json();
  if (action.action === "list") {
    if (!Array.isArray(data.reviews) || data.reviews.length > 100)
      throw new ReviewFailure(503);
    return {
      reviews: data.reviews.map(summary),
      more_possible: data.reviews.length === 100,
    };
  }
  if (action.action === "get") {
    const clean = summary(data);
    if (
      clean.submission_id !== action.submission_id ||
      !Array.isArray(data.profile_photo_signed_urls) ||
      data.profile_photo_signed_urls.length > 12
    )
      throw new ReviewFailure(503);
    return {
      ...clean,
      video_signed_url: mediaUrl(
        data.video_signed_url,
        url,
        "profile-verification-videos",
      ),
      profile_photo_signed_urls: data.profile_photo_signed_urls.map(
        (value: unknown) => mediaUrl(value, url, "profile-photos"),
      ),
      expires_in_seconds: Math.min(
        300,
        typeof data.expires_in_seconds === "number"
          ? Math.max(1, data.expires_in_seconds)
          : 300,
      ),
    };
  }
  if (data.finalized !== true) throw new ReviewFailure(409);
  return { finalized: true };
}

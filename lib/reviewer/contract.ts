export const reasons = {
  video_unclear: "Video unclear",
  appearance_mismatch: "Person does not match profile photos",
  technical_issue: "Technical issue",
} as const;
export type Reason = keyof typeof reasons;
export type ReviewAction =
  | { action: "list" }
  | { action: "get" | "approve"; submission_id: string }
  | { action: "reject"; submission_id: string; reason_code: Reason };
export type ReviewSummary = {
  submission_id: string;
  first_name: string;
  age: number | null;
  city: string;
  submitted_at: string;
};
export type Review = ReviewSummary & {
  video_signed_url: string;
  profile_photo_signed_urls: string[];
  expires_in_seconds: number;
};
export function parseReviewAction(value: unknown): ReviewAction | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  if (!["list", "get", "approve", "reject"].includes(input.action as string))
    return null;
  const keys =
    input.action === "list"
      ? ["action"]
      : input.action === "reject"
        ? ["action", "submission_id", "reason_code"]
        : ["action", "submission_id"];
  if (Object.keys(input).some((k) => !keys.includes(k))) return null;
  if (
    input.action !== "list" &&
    (typeof input.submission_id !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        input.submission_id,
      ))
  )
    return null;
  if (
    input.action === "reject" &&
    (typeof input.reason_code !== "string" ||
      !Object.hasOwn(reasons, input.reason_code))
  )
    return null;
  return input as ReviewAction;
}

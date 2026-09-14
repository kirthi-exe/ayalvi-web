import "server-only";
import { createHash } from "node:crypto";
import { createEmailClient } from "./client";
import { confirmationTemplate, referralUrl } from "./template";
// Never log provider exceptions, addresses, codes, contents or response IDs.
export function reportEmailFailure() {
  console.error("waitlist_confirmation: failed");
}
export async function sendWaitlistConfirmation(
  email: string,
  referralCode: string,
) {
  try {
    const key = process.env.RESEND_API_KEY;
    const from = process.env.WAITLIST_FROM_EMAIL?.trim();
    if (!key || !from) {
      if (process.env.NODE_ENV === "production")
        console.error("waitlist_confirmation: skipped_missing_configuration");
      else console.warn("waitlist_confirmation: skipped_missing_configuration");
      return;
    }
    if (/[\r\n]/.test(from)) throw new Error("Invalid sender");
    const content = confirmationTemplate(referralUrl(referralCode));
    const resend = createEmailClient(key);
    const { data, error } = await resend.emails.send(
      { from, to: [email], ...content },
      {
        idempotencyKey: `waitlist-confirmation-v1/${createHash("sha256").update(referralCode).digest("hex")}`,
      },
    );
    if (error || !data?.id) {
      reportEmailFailure();
      return;
    }
    console.info("waitlist_confirmation: accepted");
  } catch {
    reportEmailFailure();
  }
}

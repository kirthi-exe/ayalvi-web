# Waitlist confirmation email

A genuinely new `join_waitlist` result includes its owned referral code. Only that result schedules a confirmation through Next.js `after()`; duplicates, self-referral duplicates, invalid requests and failed database writes never schedule email. The database remains authoritative. No migration, grant, RPC or mobile-table changes are needed.

`lib/email/client.ts` constructs the official Resend SDK server-side. `confirmation.ts` sends only destination, sender, subject, HTML/text and the referral URL. `template.ts` contains the separate branded template and canonical-link validation. No contacts, audiences, tracking pixels, analytics tags or provider response IDs are added to the signup response.

## Configuration

- `RESEND_API_KEY`: server-only Resend sending key; restrict it to the sending domain where supported.
- `WAITLIST_FROM_EMAIL`: verified sender, optionally `Ayalvi <your-verified-address>`. No production sender is hardcoded.
- `NEXT_PUBLIC_SITE_URL`: explicit canonical HTTPS origin, with no credentials, path, query, fragment or custom port. Localhost/IP URLs are rejected for email links. It is public by design; never use request Host headers.

Missing key/sender skips sending and preserves signup success. Development logs a fixed warning; production logs a fixed error rather than pretending delivery succeeded. Invalid link/sender configuration and provider errors also preserve signup success and log only `waitlist_confirmation: failed`. `accepted` means Resend accepted the request, not that it reached an inbox. No address, referral code, body, provider ID, exception or credential is logged by application code. The pinned SDK's development raw-error logging hook is disabled per client instance and covered by a real-SDK test with mocked HTTP; recheck on SDK upgrades.

The subject is “You're on the Ayalvi Early Access list”. HTML and plain text explain the DACH early-access purpose, include the genuine referral URL and use no founder identity. The reusable template omits invitations when no link is supplied; duplicates never invoke it.

## Reliability and privacy limits

A stable SHA-256 digest of the genuine referral code forms the provider idempotency key. Database uniqueness is the primary protection against resend on HTTP retries; Resend's additional idempotency window is 24 hours ([provider documentation](https://resend.com/docs/dashboard/emails/idempotency-keys)). No email-to-code lookup or duplicate flag is introduced. Existing observable referral-code presence remains unchanged; email scheduling happens after the response.

`after()` is managed by Next/Vercel but is not a durable queue and remains bounded by the hosting function duration ([Next.js documentation](https://nextjs.org/docs/app/api-reference/functions/after)). A crash after commit, missing configuration or provider failure can leave a signup without confirmation. Duplicate submission deliberately does not retry delivery. V1 has no automatic retries, historical backfill, per-entry delivery status, bounce webhooks or admin resend feature. Use restricted provider logs for delivery investigation; do not promise guaranteed delivery. Email ownership is not verified, so this confirmation is not proof of ownership.

## Tests and safe validation

Unit tests mock the SDK and database; the SDK regression test mocks fetch. Existing browser signup tests intercept the API, and the isolated browser server explicitly clears email key/sender values even if real local values exist. Automated validation sends no real email. Do not enable production credentials in automated tests.

Run `npm test`, lint, typecheck, build, format:check, test:e2e, source/client secret scan and `git diff --check`. Manually verify actual sender/domain/provider configuration only after it exists. Optional integration testing can use Resend's documented test recipients in an isolated environment ([test email documentation](https://resend.com/docs/dashboard/emails/send-test-emails)); no real-send integration test is part of this change.

## Deployment order — not performed

1. In Resend, verify an owned sending domain and required DNS records; choose the sender. Review domain settings and disable open/click tracking for this minimal flow. Do not assume verification exists ([domain documentation](https://resend.com/docs/dashboard/domains/introduction)).
2. Create a suitable sending API key. Set `RESEND_API_KEY`, `WAITLIST_FROM_EMAIL` and the canonical `NEXT_PUBLIC_SITE_URL` in the intended Vercel environment. Keep previews without email credentials unless intentionally isolated.
3. Deploy the reviewed application. No Supabase push or Edge Function deployment is required.
4. With explicit authorization, use a controlled new signup to verify provider acceptance, inbox rendering and the referral link. Check provider delivery/bounce status. Duplicate behavior and failure isolation are already automated; real mailbox rendering/provider setup remain manual.

This task does not deploy, commit, apply migrations, send test emails, or change existing local secrets.

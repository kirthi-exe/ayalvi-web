# Ayalvi website

Internal referrals are now implemented; see [REFERRALS.md](REFERRALS.md) for the new migration, privacy tradeoff, test coverage and deployment order. Do not apply the migration or deploy until separately authorized.

Standalone pre-launch website for Tamil singles in Switzerland, Germany and Austria. No mobile repository or private dating data dependencies. This referral change has not been deployed or committed.

## Local setup

Use Node.js 24 LTS, then `npm ci`, copy `.env.example` to `.env.local`, and run `npm run dev`. Fonts are bundled locally. No Google font requests occur at runtime or build time.

## Structure and pages

- `app/`: App Router pages, metadata, sitemap, robots, favicon and server API.
- `/`: responsive landing page with all eight requested sections.
- `/waitlist/success`: confirmation, noindex, and a session-scoped referral link/copy panel.
- `/ref/[code]`: identity-free invitation arrival and redirect.
- `/privacy`, `/terms`: explicitly marked legal drafts, noindex.
- `/community-guidelines`, `/contact`: community standards and configurable contact.
- `components/layout/`: Header, Footer, replaceable Wordmark.
- `components/landing/`: decorative Kolam linework and labeled PhonePreview.
- `components/waitlist/`: accessible client form; the rest of the content uses server components.
- `lib/constants/`, `lib/validation/`, `lib/supabase/`, `lib/analytics/`: isolated shared options, validation, server persistence and optional event bridge.
- `supabase/migrations/`: schema and access-control migration.
- `tests/`: validation, server route, UI and bundle boundary tests.

## Database and submission

The initial `supabase/migrations/202609130001_waitlist.sql` migration is already deployed to the linked project. The new `202609140001_waitlist_referrals.sql` migration is unapplied; follow REFERRALS.md for the coordinated migration and redeploy order.

`waitlist_entries` contains UUID id, normalized unique email, city_region, gender, interested_in, is_18_plus, optional heard_from, unique non-null referral_code after the referral migration, nullable self-referencing referred_by, nonnegative referral_count, status, optional UTM fields, created_at and trigger-maintained updated_at. Status supports waiting, priority, invited, beta and blocked. Referral codes and atomic attribution are implemented by the new referral migration. Rewards are not active. New-signup confirmation emails are available when Resend is configured; see EMAIL.md.

Browser → same-origin JSON POST `/api/waitlist` → streaming 4 KiB body limit → strict server validation and honeypot → abuse-verification extension point → server-only Supabase RPC. Requests accept only an optional referring `referral_code`; they never accept status, `referred_by`, `referral_count` or arbitrary extra fields. All strings are trimmed; email is lowercased and length limited to 254, city is 2–100 characters, optional text is limited to 120, enumerations are allowlisted and age confirmation must be literal true. Gender and interest include “Prefer not to say”; these website enums can be reviewed against the product vocabulary without coupling tables.

New and duplicate submissions both return neutral success. Only new unique entries receive their genuine referral code; duplicates receive no code and show no referral panel. See REFERRALS.md for the observable code-presence privacy limitation. Existing rows are never updated by a repeated signup. Database failures return a generic 503 with no raw errors or submitted data. The restricted RPC handles internal reads and writes atomically. RLS is enabled with no anon/authenticated policies; all table privileges are revoked from public, anon and authenticated. After the referral migration, the service role has RPC EXECUTE only and no direct table grants; the key must stay server-only. A dedicated Supabase project limits its scope. Never use a NEXT_PUBLIC variable for a secret.

The honeypot and origin check are basic abuse controls, not comprehensive bot protection. `lib/validation/abuse.ts` is the explicit future Turnstile verification point. Configure shared rate limiting at the hosting edge before a high-volume campaign; the public signup route has no process-memory rate limit. Admin login has a documented best-effort per-instance limit; see ADMIN.md.

## Environment

- `SUPABASE_URL`: dedicated Supabase project URL, server only.
- `SUPABASE_SECRET_KEY`: Supabase secret key (or legacy service-role key), server only.
- `NEXT_PUBLIC_SITE_URL`: canonical HTTPS origin for production metadata and sitemap; localhost for development.
- `NEXT_PUBLIC_CONTACT_EMAIL`: verified team address. Required before public launch; no invented address or founder identity.
- `NEXT_PUBLIC_INSTAGRAM_URL`, `NEXT_PUBLIC_TIKTOK_URL`: optional verified HTTPS profiles. Unconfigured links are hidden.
- `NEXT_PUBLIC_ANALYTICS_ENABLED`: false by default. True enables the local event bridge only; it does not install an analytics provider.

## Analytics, SEO and accessibility

The event bridge dispatches `ayalvi:analytics` CustomEvents for page_view, waitlist_cta_clicked, waitlist_started, waitlist_completed and social_link_clicked. Events contain no form values or email. Supply a reviewed provider adapter if needed. UTM source, medium and campaign are read from the current URL on signup, trimmed, sanitized and capped at 120 characters. No cross-session storage, cookies or fingerprinting. UTM attribution is not retained after navigating away from the landing URL.

SEO includes default title and description, Open Graph PNG generated by Next.js, Twitter card metadata, sitemap and robots. Configure the real domain before deployment. Legal drafts and confirmation are noindex. Replace the initial favicon and wordmark with approved assets later.

Semantic sections, a skip link, visible focus styles, labels, native required validation, field-associated server errors, focus on the first invalid field, live status feedback, keyboard controls and reduced-motion support are included. Mobile stacks the hero and keeps its CTA before the phone preview; feature cards, steps and form stack at narrow widths. No heavy animation or UI framework. The phone is explicitly a brand preview, not a production screenshot.

## Validation

Run `npm run lint`, `npm test`, `npm run typecheck`, and `npm run build`. (`npm lint` is not an npm script invocation; use `npm run lint`.) Run tests again after building to scan generated client assets. The bundle test verifies no secret identifier or build canary appears in browser JS. Server tests mock persistence; a staging database integration test is still required after applying the migration. Prettier is configured: run `npm run format:check` (or `npm run format` to apply formatting). Run `npm run test:e2e` for desktop/mobile browser smoke tests; the default configuration uses an installed Chrome browser. Browser signup tests mock persistence and do not create real entries. They start an isolated production server on port 3100.

## Vercel setup — later, not deployed

Import this directory as a Next.js project, select Node.js 24, configure environment variables for the correct environments, apply the database migration, and use the standard `npm run build`. No architecture change is needed. Keep staging and production credentials separate. Verify a new signup, duplicate signup and denied direct anon/authenticated operations in staging before opening registration.

## Launch prerequisites and limitations

Complete professional legal review, operator disclosures, a real contact address, retention/deletion process and any required consent wording before public launch. Gender and dating interests can be sensitive information; review necessity and the appropriate legal basis. There is no email ownership verification, unsubscribe automation, referral rewards or mobile integration. Final logo, real screenshots, optional social links and analytics provider remain configurable. App functionality described here is pre-launch product copy.

Recommended next step: configure a dedicated staging Supabase project, apply the migration, verify access controls and end-to-end submissions, then finalize legal/contact content before public launch.

## Internal waitlist dashboard

See [ADMIN.md](ADMIN.md) for the new read-only dashboard, password/session setup, restricted RPC migration, tests and exact deployment order. The admin migration has not been applied; no deployment was performed.

## Waitlist confirmation email

See [EMAIL.md](EMAIL.md) for the server-only Resend integration, required sender/key configuration, safe failure behavior, testing and deployment order. Confirmation sending is limited to genuinely new signups; no database migration is needed.

## Internal invite preparation

See [INVITES.md](INVITES.md) for admin status transitions, page-limited bulk actions, sorting, the new restricted migration and deployment order. Invitation status changes do not send email and do not depend on Resend configuration.

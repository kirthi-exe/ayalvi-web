# Internal waitlist referrals

This feature is for internal testing. No public sharing campaign or social integrations are included. The linked database has not been changed.

## Architecture and deployment order

Apply `supabase/migrations/202609140001_waitlist_referrals.sql` later, then redeploy the website. Do not deploy this website change before that migration: signup now calls `public.join_waitlist(jsonb)` instead of directly inserting. Do not run old and new application versions concurrently against the new permissions. The initial waitlist migration and all existing migration history remain intact; no migration repair is needed. No Edge Function is involved.

The PostgreSQL function has SECURITY DEFINER, an empty search_path and qualified application objects. Browser roles have no table or RPC permissions. The service role has EXECUTE on this RPC, no direct table operations and no code-generator permission. The database owner retains normal administrative access. Existing RLS remains enabled with no browser policies. `supabase/verify-access.sql` includes post-migration grant checks. The function accepts only waitlist fields and the optional referring code, never a client-supplied UUID, status or count.

## Codes and atomic signup

Codes are ten uppercase hexadecimal characters (40 random bits) derived from PostgreSQL's random UUID generator. No sequential identifiers or signup counts are exposed. The unique index and bounded collision retries protect assignments. The migration locks the waitlist while backfilling missing codes, preserving status, relationships and timestamps. Existing non-null codes are preserved; incompatible legacy formats stop the migration for review rather than silently changing exported links.

The server normalizes email and the optional incoming code. The RPC independently normalizes and validates its input, takes a transaction-scoped advisory lock for the normalized email, and returns NULL for an existing entry before calling the code generator. A new signup resolves the referrer, inserts with `ON CONFLICT (email) DO NOTHING`, and increments only after a newly inserted row was returned. All steps run in one transaction. A failed count update rolls back the signup. Row locking protects referrer existence; increments use `referral_count + 1`, and the email unique constraint arbitrates duplicate submissions. A normalized self-referral is ignored. Duplicate submissions cannot alter the original referrer or increment anyone's count.

Malformed incoming codes are rejected with a safe validation response. Well-formed but unknown codes are treated as ordinary signups. There is no code-lookup endpoint and no returned identity, UUID, status, attribution flag or count. Raw database errors never leave the server route. The existing honeypot, request byte limit, UTM validation and abuse-check extension point remain in place.

## Duplicate contract and privacy limits

A new unique signup receives its genuinely owned code: `{ success: true, referralCode: <owned code> }`. A duplicate receives only `{ success: true }`; the RPC returns NULL, does not invoke the code generator for duplicate RPC submissions, and never returns the existing entry's code. The normalized-email advisory lock serializes competing RPC submissions before generation. Defensive conflict handling also suppresses any code if a privileged insert outside the RPC wins the email constraint race.

Both cases return HTTP 200 with the same success headline/body, no duplicate flag and no duplicate-specific message. A success without a code clears any previous browser receipt and shows no referral panel or link. No placeholder, unassigned or fake link is issued. This does not add an email-to-existing-code lookup, but the presence or absence of a newly issued code is observable and can imply whether an entry was created. Therefore this requested conditional delivery contract cannot provide indistinguishable email-enumeration responses. Email ownership verification or deferring code delivery would be needed for that stronger guarantee; neither is implemented here.

This is not email verification. Someone with access to a valid referral link can use it as intended, and unverified unique email submissions can still inflate counts. Counts are internal signals only, not automatic priority/status changes or rewards. Consider verified ownership, Turnstile, shared rate limits and suspicious-referral review before broader use; none are built here.

## Referral route and storage

`/ref/[code]` never queries Supabase. It normalizes a code, saves it in sessionStorage, and redirects to the ordinary landing form. Unknown and malformed codes produce the same page and destination; malformed codes clear earlier pending attribution. A fixed relative redirect avoids open redirects. Sanitized UTM source/medium/campaign survive the redirect. No identity is included in the URL.

Incoming attribution expires after 30 minutes and is removed after successful submission. The browser sends only `referral_code`, never a referring UUID. Only a newly created entry's genuine returned code is kept as a separate 30-minute, tab-scoped receipt so refresh/back navigation can show the copy-link panel. No email or UUID is stored. Direct visits to the success page without a receipt show no link. Storage-disabled browsers still support signup, but cannot retain referrals; JavaScript is required for referral persistence, with a normal landing link available as fallback. A user-entered/tampered receipt affects only that browser's displayed link, not server ownership or table access.

The copy button uses the clipboard API with selectable text and accessible status feedback as fallback. There are no social-share integrations. Referral pages are noindex and excluded from robots/sitemap. The form and success copy remain pre-launch/internal.

## Analytics

The existing opt-in event bridge emits `referral_link_opened`, `referral_signup_completed` and `referral_link_copied` without code, email, UUID or count. Page-view paths for referral routes are redacted to `/ref/[code]`. `referral_signup_completed` means an accepted form carried an incoming code; it deliberately does not claim successful credit, since reporting that distinction would leak validity or duplicate state. No new provider, cookies or fingerprinting are added.

## Tests

`npm test` executes the actual original waitlist migration and referral migration in a development-only PGlite PostgreSQL instance. These tests never load application credentials or contact Supabase. They cover backfill, format/uniqueness, attribution, unknown codes, self-referrals, normalized duplicates, immutable attribution, no generator calls for duplicates, genuine-code ownership, forced collision retries, exact privileges and rollback when a count trigger fails. Overlapping JavaScript requests are tested, but PGlite serializes them on one database session; this is not a real multi-connection concurrency test. A staging multi-connection check remains advisable after migration application.

Component and browser tests cover normalization, storage expiry, incoming-code removal, redirects, preserved UTMs, payload shape, success links, clipboard success/failure and accessible feedback. Browser tests mock submission responses and must not submit test data to the live project. Before release run lint, unit/database/UI tests, typecheck, build, format check, browser tests, secret scan and `git diff --check`.

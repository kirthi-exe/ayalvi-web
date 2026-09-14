# Current status workflow

The dashboard now includes restricted status management and invite preparation. See [INVITES.md](INVITES.md) for the current mutation contract, opaque row identifiers, timestamps and deployment order. The read-only architecture below describes the original dashboard baseline.

# Internal waitlist dashboard

`/admin/login` → `/admin/waitlist`. These routes are unlinked from public navigation and the sitemap, noindex, and dynamically rendered with private/no-store responses. Login and logout use POST `/admin/session` and `/admin/logout`. There is no public admin data API or server action.

## Configuration and authentication

Set **ADMIN_DASHBOARD_PASSWORD** in the server environment to a unique randomly generated password of 24–256 characters (32 or more recommended). The empty `.env.example` value disables login. Existing server-only `SUPABASE_URL` and `SUPABASE_SECRET_KEY` are also required. No `NEXT_PUBLIC_` admin variable is used; the actual `.env` is untouched.

The server compares SHA-256 digests in constant time and issues a domain-separated HMAC-signed session with a random nonce and an eight-hour expiry. The password signs sessions and is never in the cookie or HTML. Cookies are HttpOnly, SameSite=Strict, scoped to `/admin`, and Secure with a `__Secure-` name in production. Use HTTPS outside localhost. Password rotation invalidates all sessions. Logout expires the current browser cookie; it cannot revoke a copied stateless token before expiry. There are no user records, email lookups, password recovery, or founder identifiers.

Every dashboard read checks the session before creating the Supabase client. Invalid/expired cookies redirect to login. The same-origin referrer policy preserves Origin for internal form POSTs and suppresses referrers to external sites. Login/logout require same-origin POSTs; login accepts one password field in a maximum 1 KiB form body. Errors do not include credentials, submitted values, database details, or stack traces. The app analytics bridge ignores admin routes.

Login throttling allows five attempts per 15 minutes per client and 30 total per process. Off Vercel all attempts share one client bucket; on Vercel only its overwritten `x-forwarded-for` header is used, hashed in memory. Successful attempts also count. **This is best-effort per-instance throttling:** serverless cold starts and multiple instances do not share limits, and a global limit can temporarily deny legitimate login. Use Vercel Firewall rate limits or Deployment Protection for stronger perimeter control. No distributed limiter, MFA, session revocation store, or audit log was added.

## Restricted database access

The new, unapplied migration `supabase/migrations/202609140002_waitlist_admin.sql` defines only `public.admin_waitlist_dashboard(jsonb)`, a STABLE SECURITY DEFINER function with an empty search path. EXECUTE is revoked from PUBLIC, anon and authenticated and granted only to service_role. It queries only `public.waitlist_entries`; it adds no tables, direct table grants, RLS policies, mobile dependencies or write operations. Existing referral and signup functions are unchanged.

The RPC validates allowlisted filters independently of the application and returns a fixed projection. Emails are masked **in SQL** as the first two local-part characters plus `***@domain`. Full emails, UUIDs, `referred_by` identifiers, age flags and UTM fields never leave the database through this function. Recent entries return only the requested fields; top referrers additionally return their referral code. Free-text city/heard-from values remain visible to the authorized admin and may contain information supplied by a signup. There is no full-email mode, export, editing or deletion.

## Metrics and filtering

All metrics and charts reflect current filters: status, exact case-insensitive city/region, gender, interested-in, referred yes/no, inclusive UTC date range. Date input must be valid and ordered. Today is UTC; 7/30-day windows include today. Referral totals/counts are lifetime values for matching entries, not referrals newly earned during the date window. A filtered referral sum and referred-signup count can differ because they measure different cohorts.

Overview: total, today, 7/30 days, referral sum, referred signups, entries with referrals, highest count, average among positive-count entries and top code. Charts: ten largest cities plus other cities, gender, interest, status, 30-day signup trend and referral buckets 0/1/2–4/5–9/10+. Tables: top ten positive referrers and 25 recent entries per page, with stable ordering and out-of-range pages clamped. Filters use URL parameters; there is no email search or generic SQL interface. Dates displayed in tables use UTC. Empty results show zero metrics and explanatory text.

CSS charts have text counts; tables scroll within their containers on mobile, with visible keyboard focus and labeled controls. Aggregations scan matching rows in PostgreSQL, not browser memory. This is suitable for the initial waitlist; large datasets may eventually need query profiling/index tuning. No real dashboard data was queried during implementation.

## Validation

`npm test`, `npm run lint`, `npm run typecheck`, `npm run build`, `npm run format:check`, `npm run test:e2e`, client/source secret scan and `git diff --check`.

Database tests execute all three waitlist migrations against local PGlite PostgreSQL, exercising metrics, filters, pagination, email masking, role permissions and read-only behavior. Auth tests cover session tampering/expiry/rotation, cookies, same-origin boundaries, body limits, throttling, neutral errors and authorization before reads. Browser tests use a loopback-only synthetic RPC on port 3101 and an isolated production Next server on 3100 with dummy credentials overriding real environment values. They never contact the linked Supabase project or create live entries.

## Deployment steps — not performed

1. Review the new admin migration. Confirm the CLI is linked to the intended project and migration history matches; inspect `supabase db push --dry-run` to ensure only the intended pending migration will run.
2. Apply the reviewed admin migration with `supabase db push`. Existing live referrals must already be migrated. No Edge Function deployment is needed.
3. Set `ADMIN_DASHBOARD_PASSWORD` as a server-only Vercel environment variable in the intended environment. Verify its existing server-only Supabase URL/key point to the same project. Use a different password for any preview environment that has admin access.
4. Redeploy the reviewed app through the normal Vercel workflow to load the environment variable and routes.
5. In that authenticated environment, sign in and verify the real project's aggregate counts; sign out and confirm access redirects. Local tests already cover UI, grants, session/security behavior and regression paths; they do not verify the remote migration or provider configuration.

Do not publicly launch based solely on this internal dashboard change; existing legal/contact launch prerequisites still apply.

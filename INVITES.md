# Internal Early Access invite preparation

The admin dashboard now supports explicit status transitions. No invitation email is sent, even if Resend is later configured. Status management does not import the email provider. `lib/email/invite.ts` is a reusable server-only HTML/text draft without a recipient, send function, download link, secret or internal identifier. An `invited` status means internally prepared, not email delivered or app access provisioned.

## Boundaries and state transitions

Authenticated same-origin JSON POST `/admin/waitlist/status` accepts only `{entries:[{id,expected_status}],target,confirmed_block?}`. It validates an 8 KiB streaming body limit, UUIDs, enums, duplicate IDs and the explicit transition matrix before calling the server-only mutation module. That module rechecks the admin session and action. No generic table update/search API is added. Error responses are fixed messages without database details.

Allowed transitions:

- waiting → priority, invited, blocked
- priority → invited, blocked
- invited → beta, blocked
- beta → blocked
- blocked → waiting

The database independently enforces the same contract. A maximum of 25 distinct rows is allowed. Batches of more than one row allow only priority or invited. Blocking requires explicit confirmation and is single-row only. Invalid, missing, blocked/ineligible or stale rows reject the entire batch. There is no implicit all-database selection.

The UI shows permitted row actions, status badges, loading and safe success/error feedback. Blocking prompts for confirmation. Selection applies only to the current visible page, clears after success, and resets when filters/page change. Bulk buttons are disabled when any selected row is ineligible. Successful mutations refresh the current server-rendered dashboard, including all filtered status counts. All five statuses have count cards. Sort options are newest, oldest, most referrals, workflow status order and case-insensitive city/region; stable timestamp/ID tie-breakers prevent ambiguous ordering.

## Migration and authorization

New unapplied migration: `supabase/migrations/202609140003_waitlist_invites.sql`.

- Adds nullable `invited_at` and `beta_at` to `public.waitlist_entries`, with no defaults or backfill. Existing values/statuses/updated timestamps are untouched by migration.
- Adds `public.admin_transition_waitlist(jsonb)`, SECURITY DEFINER, empty search_path, fully qualified table references.
- Replaces the existing masked dashboard RPC to support allowlisted sorting and return `entry_key`, `invited_at`, `beta_at` on the current page only. `entry_key` is an opaque UUID carried in authenticated component data and mutation payloads, never displayed as visible text. Full emails remain masked in SQL.
- Revokes ALL function privileges from PUBLIC, anon, authenticated and service_role, then grants EXECUTE only to service_role for both `admin_transition_waitlist(jsonb)` and `admin_waitlist_dashboard(jsonb)`. There are no direct SELECT/INSERT/UPDATE/DELETE table grants, new RLS policies, mobile-table changes, new audit tables or public lookups. Database owners retain their normal administrative privileges.

The mutation RPC locks target rows in UUID order, validates all current states before writing and executes one atomic transaction. Requests carry the status seen by the admin to reject stale actions. Replaying an already successful transition is a no-op when the row remains at its requested target; it does not fire an update or alter timestamps. A row that has since changed to an unrelated state is rejected. Explicit same-status actions are not selectable or accepted as new transitions.

`invited_at` and `beta_at` record the **first** successful transition to each status. Repeated actions, blocking/restoration and later invitations preserve these historical milestones. Existing previously invited/beta rows retain null dates; no dates are fabricated. `updated_at` continues to use the existing trigger only on an actual status change. Referral codes, relationships and counts are untouched.

## Validation and limitations

Local PGlite tests apply the actual migration and exercise every allowed/disallowed transition, atomic batches, stale requests, retry timestamps, grants, sorting and masking. Route tests use real session validation with mocked database transport. UI/browser tests cover row controls, selection, blocking confirmation, feedback, refresh and mobile overflow. Browser mutations target only a loopback synthetic RPC; email credentials remain explicitly disabled. No real database or email mutation is performed during validation.

No audit log, delivery tracking, retry queue, automatic ranking or invitation algorithm was added. First-event timestamps are not a full status history. Existing admin password/session and per-instance login-throttling limitations still apply. Stale actions require an explicit refresh and retry; they are not silently applied to changed rows.

## Deployment order — not performed

1. Review the new migration and confirm the intended Supabase project and synchronized existing history. Inspect `supabase db push --dry-run` to confirm only the intended migration is pending.
2. Apply the reviewed migration with `supabase db push` before deploying the new dashboard, which expects the new projection and RPC.
3. Deploy the reviewed application to the intended Vercel environment. Existing admin/Supabase environment variables suffice; no new environment variable or Edge Function is needed. Leave Resend intentionally unconfigured.
4. In the target environment, verify an authorized controlled status transition and refresh of real counts. Do not use unrelated real entries for testing. No invitation email should be sent.

Do not run migration repair. This implementation does not deploy, commit, apply migrations or send email.

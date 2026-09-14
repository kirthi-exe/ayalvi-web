-- Run against a disposable/staging database after the migration.
-- Each anonymous/authenticated operation should fail with permission denied.
-- Execute each transaction separately in the SQL editor, then ROLLBACK.
begin;
set local role anon;
select * from public.waitlist_entries;
rollback;

begin;
set local role authenticated;
select * from public.waitlist_entries;
rollback;

-- Verify metadata as database owner: RLS true, no public policies.
select relrowsecurity from pg_class where oid = 'public.waitlist_entries'::regclass;
select * from pg_policies where schemaname = 'public' and tablename = 'waitlist_entries';
select role_name, privilege,
 has_table_privilege(role_name, 'public.waitlist_entries', privilege) as allowed
from unnest(array['anon','authenticated']) role_name
cross join unnest(array['SELECT','INSERT','UPDATE','DELETE']) privilege;
-- Expected: all eight privilege rows are false.

-- After the referral migration, the server uses RPC only.
select privilege,
 has_table_privilege('service_role', 'public.waitlist_entries', privilege) as allowed
from unnest(array['SELECT','INSERT','UPDATE','DELETE']) privilege;
-- Expected: all four false.
select role_name,
 has_function_privilege(role_name, 'public.waitlist_touch_updated_at()', 'EXECUTE') as allowed
from unnest(array['anon','authenticated']) role_name;
-- Expected: both false. The function is for the update trigger, not a public RPC.

select role_name, has_function_privilege(role_name, 'public.join_waitlist(jsonb)', 'EXECUTE') as allowed
from unnest(array['anon','authenticated','service_role']) role_name;
-- Expected: only service_role true.

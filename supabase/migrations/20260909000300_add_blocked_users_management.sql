create or replace function public.get_blocked_users(
  requested_limit integer default 50,
  requested_offset integer default 0
)
returns table (
  blocked_user_id uuid,
  first_name text,
  age integer,
  city text,
  blocked_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  requesting_user_id uuid := (select auth.uid());
  effective_limit integer := least(
    greatest(coalesce(requested_limit, 50), 1),
    100
  );
  effective_offset integer := greatest(coalesce(requested_offset, 0), 0);
begin
  if requesting_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  return query
  select
    outgoing_block.blocked_user_id,
    blocked_profile.first_name,
    extract(
      year from age(current_date, blocked_private.date_of_birth)
    )::integer as age,
    blocked_profile.city,
    outgoing_block.created_at as blocked_at
  from public.blocks as outgoing_block
  join public.profiles as blocked_profile
    on blocked_profile.user_id = outgoing_block.blocked_user_id
  join public.account_private as blocked_private
    on blocked_private.user_id = outgoing_block.blocked_user_id
  where outgoing_block.blocker_user_id = requesting_user_id
  order by
    outgoing_block.created_at desc,
    outgoing_block.blocked_user_id
  limit effective_limit
  offset effective_offset;
end;
$$;

-- The underlying blocks table remains unavailable to normal clients. This RPC
-- reveals only blocks created by the authenticated caller and accepts no user
-- identity argument, so incoming blocks cannot be inspected.
revoke all on function public.get_blocked_users(integer, integer)
from public, anon;
grant execute on function public.get_blocked_users(integer, integer)
to authenticated;

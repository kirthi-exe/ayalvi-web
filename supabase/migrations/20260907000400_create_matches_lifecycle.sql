alter table public.matches
add column status text not null default 'active'
  check (status in ('active', 'unmatched')),
add column unmatched_at timestamptz,
add column unmatched_by uuid references auth.users (id);

alter table public.matches
add constraint matches_unmatch_state_is_consistent check (
  (
    status = 'active'
    and unmatched_at is null
    and unmatched_by is null
  )
  or (
    status = 'unmatched'
    and unmatched_at is not null
    and unmatched_by in (user_a_id, user_b_id)
  )
);

drop policy "Users can view their own matches" on public.matches;

create policy "Participants can view active matches"
on public.matches for select to authenticated
using (
  status = 'active'
  and (
    (select auth.uid()) = user_a_id
    or (select auth.uid()) = user_b_id
  )
);

create or replace function public.get_active_matches()
returns table (
  match_id uuid,
  other_user_id uuid,
  first_name text,
  age integer,
  city text,
  matched_at timestamptz
)
language sql
security definer
stable
set search_path = ''
as $$
  select
    active_match.id as match_id,
    other_profile.user_id as other_user_id,
    other_profile.first_name,
    extract(year from age(current_date, other_private.date_of_birth))::integer as age,
    other_profile.city,
    active_match.created_at as matched_at
  from public.matches as active_match
  join public.profiles as other_profile
    on other_profile.user_id = case
      when active_match.user_a_id = (select auth.uid())
        then active_match.user_b_id
      else active_match.user_a_id
    end
  join public.account_private as other_private
    on other_private.user_id = other_profile.user_id
  where (select auth.uid()) is not null
    and active_match.status = 'active'
    and (
      active_match.user_a_id = (select auth.uid())
      or active_match.user_b_id = (select auth.uid())
    )
    and other_private.onboarding_completed_at is not null
    and other_private.date_of_birth <= (current_date - interval '18 years')::date
  order by active_match.created_at desc, active_match.id;
$$;

revoke all on function public.get_active_matches() from public, anon;
grant execute on function public.get_active_matches() to authenticated;

create or replace function public.unmatch(requested_match_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  requesting_user_id uuid := (select auth.uid());
  updated_match_id uuid;
begin
  if requesting_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  update public.matches as active_match
  set
    status = 'unmatched',
    unmatched_at = now(),
    unmatched_by = requesting_user_id
  where active_match.id = requested_match_id
    and active_match.status = 'active'
    and requesting_user_id in (
      active_match.user_a_id,
      active_match.user_b_id
    )
  returning active_match.id into updated_match_id;

  if updated_match_id is null then
    raise exception 'Active match not found' using errcode = '42501';
  end if;

  return true;
end;
$$;

revoke all on function public.unmatch(uuid) from public, anon;
grant execute on function public.unmatch(uuid) to authenticated;

-- Keep immutable swipe retries from reporting an unmatched historical row as
-- an active match. The rest of the transactional swipe behavior is unchanged.
create or replace function public.record_swipe(
  target_profile_id uuid,
  new_decision text
)
returns table (
  swipe_id uuid,
  recorded_decision text,
  matched boolean,
  match_id uuid
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  requesting_user_id uuid := (select auth.uid());
  canonical_user_a uuid;
  canonical_user_b uuid;
  existing_swipe_id uuid;
  existing_decision text;
  resulting_swipe_id uuid;
  resulting_match_id uuid;
begin
  if requesting_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if target_profile_id is null or target_profile_id = requesting_user_id then
    raise exception 'A user cannot swipe on themselves' using errcode = '23514';
  end if;

  if new_decision is null or new_decision not in ('like', 'pass') then
    raise exception 'Invalid swipe decision' using errcode = '23514';
  end if;

  canonical_user_a := least(requesting_user_id, target_profile_id);
  canonical_user_b := greatest(requesting_user_id, target_profile_id);

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      canonical_user_a::text || ':' || canonical_user_b::text,
      0
    )
  );

  select swipe.id, swipe.decision
  into existing_swipe_id, existing_decision
  from public.swipes as swipe
  where swipe.swiper_user_id = requesting_user_id
    and swipe.target_user_id = target_profile_id;

  if found then
    if existing_decision <> new_decision then
      raise exception 'Swipe decisions are immutable' using errcode = '23514';
    end if;

    select existing_match.id
    into resulting_match_id
    from public.matches as existing_match
    where existing_match.user_a_id = canonical_user_a
      and existing_match.user_b_id = canonical_user_b
      and existing_match.status = 'active';

    return query
    select
      existing_swipe_id,
      existing_decision,
      resulting_match_id is not null,
      resulting_match_id;
    return;
  end if;

  if not private.discovery_pair_is_unblocked(
    requesting_user_id,
    target_profile_id
  ) then
    raise exception 'This profile is unavailable' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.profiles as viewer_profile
    join public.account_private as viewer_private
      on viewer_private.user_id = viewer_profile.user_id
    join public.profiles as target_profile
      on target_profile.user_id = target_profile_id
    join public.account_private as target_private
      on target_private.user_id = target_profile.user_id
    where viewer_profile.user_id = requesting_user_id
      and viewer_private.onboarding_completed_at is not null
      and viewer_private.date_of_birth <= (current_date - interval '18 years')::date
      and target_private.onboarding_completed_at is not null
      and target_private.date_of_birth <= (current_date - interval '18 years')::date
      and private.discovery_interest_key(target_profile.gender)
        = any(viewer_profile.interested_in)
      and private.discovery_interest_key(viewer_profile.gender)
        = any(target_profile.interested_in)
      and (
        select count(*)
        from public.profile_photos as eligible_photo
        where eligible_photo.user_id = target_profile.user_id
      ) >= 3
  ) then
    raise exception 'This profile is not eligible for discovery' using errcode = '42501';
  end if;

  insert into public.swipes (swiper_user_id, target_user_id, decision)
  values (requesting_user_id, target_profile_id, new_decision)
  returning id into resulting_swipe_id;

  if new_decision = 'like' and exists (
    select 1
    from public.swipes as reciprocal_swipe
    where reciprocal_swipe.swiper_user_id = target_profile_id
      and reciprocal_swipe.target_user_id = requesting_user_id
      and reciprocal_swipe.decision = 'like'
  ) then
    insert into public.matches (user_a_id, user_b_id)
    values (canonical_user_a, canonical_user_b)
    on conflict (user_a_id, user_b_id) do nothing;

    select created_match.id
    into resulting_match_id
    from public.matches as created_match
    where created_match.user_a_id = canonical_user_a
      and created_match.user_b_id = canonical_user_b
      and created_match.status = 'active';
  end if;

  return query
  select
    resulting_swipe_id,
    new_decision,
    resulting_match_id is not null,
    resulting_match_id;
end;
$$;

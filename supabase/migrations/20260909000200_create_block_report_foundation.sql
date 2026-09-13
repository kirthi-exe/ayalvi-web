create table public.blocks (
  id uuid primary key default gen_random_uuid(),
  blocker_user_id uuid not null references auth.users (id) on delete cascade,
  blocked_user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint blocks_cannot_target_self check (
    blocker_user_id <> blocked_user_id
  ),
  constraint blocks_one_directed_pair unique (
    blocker_user_id,
    blocked_user_id
  )
);

create index blocks_blocked_user_lookup_idx
on public.blocks (blocked_user_id, blocker_user_id);

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_user_id uuid not null references auth.users (id) on delete cascade,
  reported_user_id uuid not null references auth.users (id) on delete cascade,
  match_id uuid references public.matches (id) on delete set null,
  reason text not null check (
    reason in (
      'harassment',
      'hate_or_abuse',
      'sexual_content',
      'spam_or_scam',
      'impersonation',
      'underage_concern',
      'offline_safety',
      'other'
    )
  ),
  details text check (
    details is null
    or char_length(details) between 1 and 1000
  ),
  status text not null default 'pending' check (
    status in ('pending', 'reviewed', 'actioned', 'dismissed')
  ),
  created_at timestamptz not null default now(),
  constraint reports_cannot_target_self check (
    reporter_user_id <> reported_user_id
  )
);

create index reports_moderation_queue_idx
on public.reports (status, created_at);

create index reports_recent_duplicate_lookup_idx
on public.reports (
  reporter_user_id,
  reported_user_id,
  created_at desc
);

alter table public.blocks enable row level security;
alter table public.reports enable row level security;

-- Both tables are RPC-only for normal clients. In particular, reports are not
-- selectable by their reporter, so moderation state and internal IDs stay out
-- of the app and no user can infer somebody else's safety actions.
revoke all on table public.blocks from public, anon, authenticated;
revoke all on table public.reports from public, anon, authenticated;

create or replace function private.discovery_pair_is_unblocked(
  viewer_id uuid,
  candidate_id uuid
)
returns boolean
language sql
stable
set search_path = ''
as $$
  select viewer_id is not null
    and candidate_id is not null
    and not exists (
      select 1
      from public.blocks as pair_block
      where (
        pair_block.blocker_user_id = viewer_id
        and pair_block.blocked_user_id = candidate_id
      ) or (
        pair_block.blocker_user_id = candidate_id
        and pair_block.blocked_user_id = viewer_id
      )
    );
$$;

create or replace function public.block_user(target_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  requesting_user_id uuid := (select auth.uid());
  canonical_user_a uuid;
  canonical_user_b uuid;
begin
  if requesting_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if target_user_id is null or target_user_id = requesting_user_id then
    raise exception 'A user cannot block themselves' using errcode = '23514';
  end if;

  if not exists (
    select 1 from auth.users as target where target.id = target_user_id
  ) then
    raise exception 'User is unavailable' using errcode = '22023';
  end if;

  canonical_user_a := least(requesting_user_id, target_user_id);
  canonical_user_b := greatest(requesting_user_id, target_user_id);

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      canonical_user_a::text || ':' || canonical_user_b::text,
      0
    )
  );

  insert into public.blocks (blocker_user_id, blocked_user_id)
  values (requesting_user_id, target_user_id)
  on conflict (blocker_user_id, blocked_user_id) do nothing;

  -- Blocking permanently closes an active match. Unblocking never restores it.
  update public.matches as active_match
  set
    status = 'unmatched',
    unmatched_at = now(),
    unmatched_by = requesting_user_id
  where active_match.user_a_id = canonical_user_a
    and active_match.user_b_id = canonical_user_b
    and active_match.status = 'active';

  return true;
end;
$$;

create or replace function public.unblock_user(target_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  requesting_user_id uuid := (select auth.uid());
begin
  if requesting_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if target_user_id is null or target_user_id = requesting_user_id then
    raise exception 'A user cannot unblock themselves' using errcode = '23514';
  end if;

  delete from public.blocks as owned_block
  where owned_block.blocker_user_id = requesting_user_id
    and owned_block.blocked_user_id = target_user_id;

  return true;
end;
$$;

create or replace function public.report_user(
  target_user_id uuid,
  report_reason text,
  report_details text default null,
  related_match_id uuid default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  requesting_user_id uuid := (select auth.uid());
  normalized_details text := nullif(
    pg_catalog.regexp_replace(
      report_details,
      '^[[:space:]]+|[[:space:]]+$',
      '',
      'g'
    ),
    ''
  );
begin
  if requesting_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if target_user_id is null or target_user_id = requesting_user_id then
    raise exception 'A user cannot report themselves' using errcode = '23514';
  end if;

  if not exists (
    select 1 from auth.users as target where target.id = target_user_id
  ) then
    raise exception 'User is unavailable' using errcode = '22023';
  end if;

  if report_reason is null or report_reason not in (
    'harassment',
    'hate_or_abuse',
    'sexual_content',
    'spam_or_scam',
    'impersonation',
    'underage_concern',
    'offline_safety',
    'other'
  ) then
    raise exception 'Invalid report reason' using errcode = '22023';
  end if;

  if normalized_details is not null
    and char_length(normalized_details) > 1000
  then
    raise exception 'Report details are too long' using errcode = '22001';
  end if;

  if related_match_id is not null and not exists (
    select 1
    from public.matches as related_match
    where related_match.id = related_match_id
      and (
        (
          related_match.user_a_id = requesting_user_id
          and related_match.user_b_id = target_user_id
        ) or (
          related_match.user_a_id = target_user_id
          and related_match.user_b_id = requesting_user_id
        )
      )
  ) then
    raise exception 'Match is unavailable' using errcode = '42501';
  end if;

  -- Collapse identical rapid retries without preventing a later genuine report.
  if exists (
    select 1
    from public.reports as recent_report
    where recent_report.reporter_user_id = requesting_user_id
      and recent_report.reported_user_id = target_user_id
      and recent_report.reason = report_reason
      and recent_report.details is not distinct from normalized_details
      and recent_report.match_id is not distinct from related_match_id
      and recent_report.created_at >= now() - interval '30 seconds'
  ) then
    return true;
  end if;

  insert into public.reports (
    reporter_user_id,
    reported_user_id,
    match_id,
    reason,
    details
  ) values (
    requesting_user_id,
    target_user_id,
    related_match_id,
    report_reason,
    normalized_details
  );

  return true;
end;
$$;

-- Move the bidirectional block check ahead of immutable swipe replay. This
-- guarantees every swipe attempt is rejected while either direction is blocked.
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

  if not private.discovery_pair_is_unblocked(
    requesting_user_id,
    target_profile_id
  ) then
    raise exception 'This profile is unavailable' using errcode = '42501';
  end if;

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

revoke all on function public.block_user(uuid) from public, anon;
revoke all on function public.unblock_user(uuid) from public, anon;
revoke all on function public.report_user(uuid, text, text, uuid) from public, anon;
revoke all on function public.record_swipe(uuid, text) from public, anon;

grant execute on function public.block_user(uuid) to authenticated;
grant execute on function public.unblock_user(uuid) to authenticated;
grant execute on function public.report_user(uuid, text, text, uuid) to authenticated;
grant execute on function public.record_swipe(uuid, text) to authenticated;

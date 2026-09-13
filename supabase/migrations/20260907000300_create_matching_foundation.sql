create table public.swipes (
  id uuid primary key default gen_random_uuid(),
  swiper_user_id uuid not null references auth.users (id) on delete cascade,
  target_user_id uuid not null references auth.users (id) on delete cascade,
  decision text not null check (decision in ('like', 'pass')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint swipes_cannot_target_self check (swiper_user_id <> target_user_id),
  constraint swipes_one_decision_per_pair unique (swiper_user_id, target_user_id)
);

create index swipes_mutual_like_lookup_idx
on public.swipes (target_user_id, swiper_user_id)
where decision = 'like';

create table public.matches (
  id uuid primary key default gen_random_uuid(),
  user_a_id uuid not null references auth.users (id) on delete cascade,
  user_b_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint matches_canonical_user_order check (user_a_id < user_b_id),
  constraint matches_one_per_pair unique (user_a_id, user_b_id)
);

create index matches_user_b_lookup_idx on public.matches (user_b_id);

alter table public.swipes enable row level security;
alter table public.matches enable row level security;

revoke all on table public.swipes from anon, authenticated;
revoke all on table public.matches from anon, authenticated;

-- Swipe writes are intentionally RPC-only. Decisions are immutable for the MVP.
grant select on table public.swipes to authenticated;
grant select on table public.matches to authenticated;

create policy "Users can view their own swipes"
on public.swipes for select to authenticated
using ((select auth.uid()) = swiper_user_id);

create policy "Users can view their own matches"
on public.matches for select to authenticated
using (
  (select auth.uid()) = user_a_id
  or (select auth.uid()) = user_b_id
);

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

  -- Serialize both directions of the same pair so simultaneous likes cannot miss
  -- each other or create duplicate matches.
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
      and existing_match.user_b_id = canonical_user_b;

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
      and created_match.user_b_id = canonical_user_b;
  end if;

  return query
  select
    resulting_swipe_id,
    new_decision,
    resulting_match_id is not null,
    resulting_match_id;
end;
$$;

revoke all on function public.record_swipe(uuid, text) from public, anon;
grant execute on function public.record_swipe(uuid, text) to authenticated;

-- Replace the discovery RPC in a new migration so already-swiped profiles are
-- excluded without changing the existing eligibility or ranking rules.
create or replace function public.get_discovery_feed(result_limit integer default 20)
returns table (
  user_id uuid,
  first_name text,
  age integer,
  city text,
  languages text[],
  dating_intention text,
  bio text,
  religion text,
  drinking text,
  smoking text,
  exercise text,
  interests jsonb,
  prompts jsonb
)
language sql
security definer
volatile
set search_path = ''
as $$
  with viewer as (
    select
      viewer_profile.user_id,
      viewer_profile.gender,
      viewer_profile.interested_in,
      viewer_profile.city,
      viewer_profile.languages,
      viewer_profile.dating_intention
    from public.profiles as viewer_profile
    join public.account_private as viewer_private
      on viewer_private.user_id = viewer_profile.user_id
    where viewer_profile.user_id = (select auth.uid())
      and viewer_private.onboarding_completed_at is not null
      and viewer_private.date_of_birth <= (current_date - interval '18 years')::date
  ),
  ranked_candidates as (
    select
      candidate.user_id,
      candidate.first_name,
      extract(year from age(current_date, candidate_private.date_of_birth))::integer as age,
      candidate.city,
      candidate.languages,
      candidate.dating_intention,
      candidate.bio,
      candidate.religion,
      candidate.drinking,
      candidate.smoking,
      candidate.exercise,
      (
        case
          when lower(trim(candidate.city)) = lower(trim(viewer.city)) then 3.0
          else 0.0
        end
        + case
            when candidate.dating_intention = viewer.dating_intention then 2.0
            else 0.0
          end
        + least(
            2.0,
            (
              select count(*)::numeric * 0.5
              from unnest(candidate.languages) as candidate_language
              join unnest(viewer.languages) as viewer_language
                on lower(candidate_language) = lower(viewer_language)
            )
          )
        + least(
            3.0,
            (
              select count(*)::numeric
              from public.profile_interests as candidate_interest
              join public.profile_interests as viewer_interest
                on viewer_interest.interest_id = candidate_interest.interest_id
              where candidate_interest.user_id = candidate.user_id
                and viewer_interest.user_id = viewer.user_id
            )
          )
        + case
            when candidate.updated_at >= now() - interval '30 days' then 1.0
            when candidate.updated_at >= now() - interval '90 days' then 0.5
            else 0.0
          end
        + random() * 0.25
      ) as discovery_score
    from public.profiles as candidate
    join public.account_private as candidate_private
      on candidate_private.user_id = candidate.user_id
    cross join viewer
    where candidate.user_id <> viewer.user_id
      and candidate_private.onboarding_completed_at is not null
      and candidate_private.date_of_birth <= (current_date - interval '18 years')::date
      and private.discovery_interest_key(candidate.gender) = any(viewer.interested_in)
      and private.discovery_interest_key(viewer.gender) = any(candidate.interested_in)
      and private.discovery_pair_is_unblocked(viewer.user_id, candidate.user_id)
      and not exists (
        select 1
        from public.swipes as existing_swipe
        where existing_swipe.swiper_user_id = viewer.user_id
          and existing_swipe.target_user_id = candidate.user_id
      )
      and (
        select count(*)
        from public.profile_photos as eligible_photo
        where eligible_photo.user_id = candidate.user_id
      ) >= 3
  )
  select
    candidate.user_id,
    candidate.first_name,
    candidate.age,
    candidate.city,
    candidate.languages,
    candidate.dating_intention,
    candidate.bio,
    candidate.religion,
    candidate.drinking,
    candidate.smoking,
    candidate.exercise,
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', definition.id,
            'label', definition.label
          )
          order by definition.sort_order, definition.label
        )
        from public.profile_interests as profile_interest
        join public.interest_definitions as definition
          on definition.id = profile_interest.interest_id
        where profile_interest.user_id = candidate.user_id
          and definition.is_active
      ),
      '[]'::jsonb
    ) as interests,
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'prompt', definition.prompt,
            'answer', prompt_answer.answer,
            'position', prompt_answer.position
          )
          order by prompt_answer.position
        )
        from public.profile_prompt_answers as prompt_answer
        join public.prompt_definitions as definition
          on definition.id = prompt_answer.prompt_id
        where prompt_answer.user_id = candidate.user_id
          and definition.is_active
      ),
      '[]'::jsonb
    ) as prompts
  from ranked_candidates as candidate
  order by candidate.discovery_score desc, candidate.user_id
  limit least(greatest(coalesce(result_limit, 20), 1), 50);
$$;

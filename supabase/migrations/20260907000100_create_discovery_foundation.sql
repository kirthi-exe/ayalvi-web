create schema if not exists private;

revoke all on schema private from public, anon, authenticated;

create or replace function private.discovery_interest_key(profile_gender text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case profile_gender
    when 'woman' then 'women'
    when 'man' then 'men'
    when 'non_binary' then 'non_binary'
    else null
  end;
$$;

-- This is the single extension point for a future user_blocks table. Keeping the
-- check server-side means adding blocks will not require a Flutter API change.
create or replace function private.discovery_pair_is_unblocked(
  viewer_id uuid,
  candidate_id uuid
)
returns boolean
language sql
stable
set search_path = ''
as $$
  select viewer_id is not null and candidate_id is not null;
$$;

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

revoke all on function public.get_discovery_feed(integer) from public, anon;
grant execute on function public.get_discovery_feed(integer) to authenticated;


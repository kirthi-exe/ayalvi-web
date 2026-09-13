create or replace function public.get_editable_profile()
returns jsonb
language plpgsql
security definer
stable
set search_path = ''
as $$
declare
  requesting_user_id uuid := (select auth.uid());
  result jsonb;
begin
  if requesting_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'first_name', owned_profile.first_name,
    'gender', owned_profile.gender,
    'interested_in', owned_profile.interested_in,
    'city', owned_profile.city,
    'languages', owned_profile.languages,
    'dating_intention', owned_profile.dating_intention,
    'bio', owned_profile.bio,
    'religion', owned_profile.religion,
    'drinking', owned_profile.drinking,
    'smoking', owned_profile.smoking,
    'exercise', owned_profile.exercise,
    'interest_ids', coalesce((
      select jsonb_agg(owned_interest.interest_id order by definition.sort_order)
      from public.profile_interests as owned_interest
      join public.interest_definitions as definition
        on definition.id = owned_interest.interest_id
      where owned_interest.user_id = requesting_user_id
    ), '[]'::jsonb),
    'prompt_answers', coalesce((
      select jsonb_agg(jsonb_build_object(
        'prompt_id', owned_answer.prompt_id,
        'answer', owned_answer.answer,
        'position', owned_answer.position
      ) order by owned_answer.position)
      from public.profile_prompt_answers as owned_answer
      where owned_answer.user_id = requesting_user_id
    ), '[]'::jsonb),
    'photos', coalesce((
      select jsonb_agg(jsonb_build_object(
        'storage_path', owned_photo.storage_path,
        'position', owned_photo.position
      ) order by owned_photo.position)
      from public.profile_photos as owned_photo
      where owned_photo.user_id = requesting_user_id
    ), '[]'::jsonb)
  )
  into result
  from public.profiles as owned_profile
  where owned_profile.user_id = requesting_user_id;

  if result is null then
    raise exception 'Profile not found' using errcode = 'P0002';
  end if;

  return result;
end;
$$;

create or replace function public.update_editable_profile(
  requested_first_name text,
  requested_interested_in text[],
  requested_city text,
  requested_languages text[],
  requested_dating_intention text,
  requested_bio text,
  requested_religion text,
  requested_drinking text,
  requested_smoking text,
  requested_exercise text,
  requested_interest_ids text[],
  requested_prompt_answers jsonb,
  requested_photos jsonb
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  requesting_user_id uuid := (select auth.uid());
  normalized_first_name text := nullif(pg_catalog.btrim(requested_first_name), '');
  normalized_city text := nullif(pg_catalog.btrim(requested_city), '');
  normalized_bio text := nullif(pg_catalog.btrim(requested_bio), '');
  normalized_religion text := nullif(pg_catalog.btrim(requested_religion), '');
begin
  if requesting_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if normalized_first_name is null or char_length(normalized_first_name) > 50 then
    raise exception 'Invalid first name' using errcode = '23514';
  end if;
  if normalized_city is null or char_length(normalized_city) > 120 then
    raise exception 'Invalid city' using errcode = '23514';
  end if;
  if requested_interested_in is null
    or cardinality(requested_interested_in) not between 1 and 3
    or cardinality(requested_interested_in) <>
      cardinality(array(select distinct unnest(requested_interested_in)))
    or exists (select 1 from unnest(requested_interested_in) value
      where value not in ('women', 'men', 'non_binary'))
  then
    raise exception 'Invalid interested-in selection' using errcode = '23514';
  end if;
  if requested_languages is null
    or cardinality(requested_languages) not between 1 and 8
    or cardinality(requested_languages) <>
      cardinality(array(select distinct unnest(requested_languages)))
    or exists (
      select 1 from unnest(requested_languages) language
      where language not in (
        'Tamil', 'English', 'German', 'French', 'Italian', 'Sinhala',
        'Hindi', 'Malayalam'
      )
    )
  then
    raise exception 'Invalid languages' using errcode = '23514';
  end if;
  if requested_dating_intention not in (
    'long_term', 'relationship_open_to_short', 'casual', 'friendship'
  ) then
    raise exception 'Invalid dating intention' using errcode = '23514';
  end if;
  if normalized_bio is not null and char_length(normalized_bio) > 500 then
    raise exception 'Bio is too long' using errcode = '23514';
  end if;
  if normalized_religion is not null and char_length(normalized_religion) > 80 then
    raise exception 'Religion is too long' using errcode = '23514';
  end if;
  if requested_drinking is not null and requested_drinking <> ''
    and requested_drinking not in ('never', 'sometimes', 'often') then
    raise exception 'Invalid drinking value' using errcode = '23514';
  end if;
  if requested_smoking is not null and requested_smoking <> ''
    and requested_smoking not in ('never', 'sometimes', 'often') then
    raise exception 'Invalid smoking value' using errcode = '23514';
  end if;
  if requested_exercise is not null and requested_exercise <> ''
    and requested_exercise not in ('never', 'sometimes', 'often') then
    raise exception 'Invalid exercise value' using errcode = '23514';
  end if;

  if requested_interest_ids is null
    or cardinality(requested_interest_ids) not between 3 and 5
    or cardinality(requested_interest_ids) <> cardinality(array(select distinct unnest(requested_interest_ids)))
    or exists (
      select 1 from unnest(requested_interest_ids) requested_id
      where not exists (
        select 1 from public.interest_definitions definition
        where definition.id = requested_id and definition.is_active
      )
    )
  then
    raise exception 'Invalid interests' using errcode = '23514';
  end if;

  if requested_prompt_answers is null
    or jsonb_typeof(requested_prompt_answers) <> 'array'
    or jsonb_array_length(requested_prompt_answers) not between 2 and 3
    or exists (
      select 1
      from jsonb_array_elements(requested_prompt_answers) answer
      where nullif(pg_catalog.btrim(answer->>'answer'), '') is null
        or char_length(pg_catalog.btrim(answer->>'answer')) > 300
        or (answer->>'position')::integer not between 1 and 3
        or not exists (
          select 1 from public.prompt_definitions definition
          where definition.id = answer->>'prompt_id' and definition.is_active
        )
    )
    or (select count(distinct answer->>'prompt_id') from jsonb_array_elements(requested_prompt_answers) answer)
      <> jsonb_array_length(requested_prompt_answers)
    or (select count(distinct (answer->>'position')::integer) from jsonb_array_elements(requested_prompt_answers) answer)
      <> jsonb_array_length(requested_prompt_answers)
    or (select min((answer->>'position')::integer) from jsonb_array_elements(requested_prompt_answers) answer) <> 1
    or (select max((answer->>'position')::integer) from jsonb_array_elements(requested_prompt_answers) answer)
      <> jsonb_array_length(requested_prompt_answers)
  then
    raise exception 'Invalid prompt answers' using errcode = '23514';
  end if;

  if requested_photos is null
    or jsonb_typeof(requested_photos) <> 'array'
    or jsonb_array_length(requested_photos) not between 3 and 6
    or exists (
      select 1
      from jsonb_array_elements(requested_photos) photo
      where (photo->>'position')::integer not between 1 and 6
        or photo->>'storage_path' not like requesting_user_id::text || '/%'
        or not exists (
          select 1 from storage.objects object
          where object.bucket_id = 'profile-photos'
            and object.name = photo->>'storage_path'
            and object.owner_id = requesting_user_id::text
        )
    )
    or (select count(distinct (photo->>'position')::integer) from jsonb_array_elements(requested_photos) photo)
      <> jsonb_array_length(requested_photos)
    or (select min((photo->>'position')::integer) from jsonb_array_elements(requested_photos) photo) <> 1
    or (select max((photo->>'position')::integer) from jsonb_array_elements(requested_photos) photo)
      <> jsonb_array_length(requested_photos)
    or (select count(distinct photo->>'storage_path') from jsonb_array_elements(requested_photos) photo)
      <> jsonb_array_length(requested_photos)
  then
    raise exception 'Invalid profile photos' using errcode = '23514';
  end if;

  update public.profiles
  set first_name = normalized_first_name,
      interested_in = requested_interested_in,
      city = normalized_city,
      languages = requested_languages,
      dating_intention = requested_dating_intention,
      bio = normalized_bio,
      religion = normalized_religion,
      drinking = nullif(requested_drinking, ''),
      smoking = nullif(requested_smoking, ''),
      exercise = nullif(requested_exercise, '')
  where user_id = requesting_user_id;

  if not found then
    raise exception 'Profile not found' using errcode = 'P0002';
  end if;

  delete from public.profile_interests where user_id = requesting_user_id;
  insert into public.profile_interests (user_id, interest_id)
  select requesting_user_id, requested_id from unnest(requested_interest_ids) requested_id;

  delete from public.profile_prompt_answers where user_id = requesting_user_id;
  insert into public.profile_prompt_answers (user_id, prompt_id, answer, position)
  select requesting_user_id, answer->>'prompt_id', pg_catalog.btrim(answer->>'answer'),
    (answer->>'position')::smallint
  from jsonb_array_elements(requested_prompt_answers) answer;

  delete from public.profile_photos where user_id = requesting_user_id;
  insert into public.profile_photos (user_id, storage_path, position)
  select requesting_user_id, photo->>'storage_path', (photo->>'position')::smallint
  from jsonb_array_elements(requested_photos) photo;

  return true;
end;
$$;

-- Onboarding stages owner-scoped rows before calling this function. Keep its
-- completion invariant aligned with profile editing without changing DOB.
create or replace function public.complete_onboarding()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  requesting_user_id uuid := (select auth.uid());
  birth_date date;
begin
  if requesting_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select private_account.date_of_birth
  into birth_date
  from public.account_private as private_account
  where private_account.user_id = requesting_user_id;

  if birth_date is null or birth_date > (current_date - interval '18 years')::date then
    raise exception 'An eligible date of birth is required' using errcode = '23514';
  end if;
  if not exists (
    select 1 from public.profiles as profile
    where profile.user_id = requesting_user_id
  ) then
    raise exception 'Profile details are required' using errcode = '23514';
  end if;
  if (
    select count(*) from public.profile_photos as photo
    where photo.user_id = requesting_user_id
  ) not between 3 and 6 then
    raise exception 'Between 3 and 6 profile photos are required' using errcode = '23514';
  end if;
  if (
    select count(*) from public.profile_interests as interest
    where interest.user_id = requesting_user_id
  ) not between 3 and 5 then
    raise exception 'Between 3 and 5 interests are required' using errcode = '23514';
  end if;
  if (
    select count(*) from public.profile_prompt_answers as answer
    where answer.user_id = requesting_user_id
  ) not between 2 and 3 then
    raise exception 'Between 2 and 3 prompt answers are required' using errcode = '23514';
  end if;

  update public.account_private
  set onboarding_completed_at = now()
  where user_id = requesting_user_id;
end;
$$;

revoke all on function public.get_editable_profile() from public, anon;
revoke all on function public.update_editable_profile(
  text, text[], text, text[], text, text, text, text, text, text, text[], jsonb, jsonb
) from public, anon;
revoke all on function public.complete_onboarding() from public, anon;
grant execute on function public.get_editable_profile() to authenticated;
grant execute on function public.update_editable_profile(
  text, text[], text, text[], text, text, text, text, text, text, text[], jsonb, jsonb
) to authenticated;
grant execute on function public.complete_onboarding() to authenticated;

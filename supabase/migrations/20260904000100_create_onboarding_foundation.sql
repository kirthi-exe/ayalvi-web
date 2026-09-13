create extension if not exists pgcrypto with schema extensions;

create table public.account_private (
  user_id uuid primary key references auth.users (id) on delete cascade,
  date_of_birth date not null,
  onboarding_completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  first_name text not null check (char_length(first_name) between 1 and 50),
  gender text not null check (gender in ('woman', 'man', 'non_binary', 'prefer_not_to_say')),
  interested_in text[] not null check (cardinality(interested_in) between 1 and 3),
  city text not null check (char_length(city) between 1 and 120),
  languages text[] not null check (cardinality(languages) between 1 and 8),
  dating_intention text not null check (
    dating_intention in (
      'long_term',
      'relationship_open_to_short',
      'casual',
      'friendship'
    )
  ),
  bio text check (bio is null or char_length(bio) <= 500),
  religion text check (religion is null or char_length(religion) <= 80),
  drinking text check (drinking is null or drinking in ('never', 'sometimes', 'often')),
  smoking text check (smoking is null or smoking in ('never', 'sometimes', 'often')),
  exercise text check (exercise is null or exercise in ('never', 'sometimes', 'often')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.interest_definitions (
  id text primary key,
  label text not null unique,
  category text not null,
  is_active boolean not null default true,
  sort_order integer not null default 0
);

create table public.profile_interests (
  user_id uuid not null references auth.users (id) on delete cascade,
  interest_id text not null references public.interest_definitions (id),
  created_at timestamptz not null default now(),
  primary key (user_id, interest_id)
);

create table public.prompt_definitions (
  id text primary key,
  prompt text not null unique,
  is_tamil_specific boolean not null default false,
  is_active boolean not null default true,
  sort_order integer not null default 0
);

create table public.profile_prompt_answers (
  user_id uuid not null references auth.users (id) on delete cascade,
  prompt_id text not null references public.prompt_definitions (id),
  answer text not null check (char_length(answer) between 1 and 300),
  position smallint not null check (position between 1 and 3),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, position),
  unique (user_id, prompt_id)
);

create table public.profile_photos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  storage_path text not null unique,
  position smallint not null check (position between 1 and 6),
  created_at timestamptz not null default now(),
  unique (user_id, position)
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger account_private_set_updated_at
before update on public.account_private
for each row execute function public.set_updated_at();

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create trigger profile_prompt_answers_set_updated_at
before update on public.profile_prompt_answers
for each row execute function public.set_updated_at();

create or replace function public.enforce_adult_date_of_birth()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.date_of_birth > (current_date - interval '18 years')::date then
    raise exception 'Users must be at least 18 years old' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger account_private_enforce_adult
before insert or update of date_of_birth on public.account_private
for each row execute function public.enforce_adult_date_of_birth();

create or replace function public.enforce_profile_interest_limit()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (
    select count(*)
    from public.profile_interests
    where user_id = new.user_id
  ) >= 5 then
    raise exception 'A profile can have at most 5 interests' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger profile_interests_enforce_limit
before insert on public.profile_interests
for each row execute function public.enforce_profile_interest_limit();

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

  select date_of_birth
  into birth_date
  from public.account_private
  where user_id = requesting_user_id;

  if birth_date is null or birth_date > (current_date - interval '18 years')::date then
    raise exception 'An eligible date of birth is required' using errcode = '23514';
  end if;

  if not exists (
    select 1 from public.profiles where user_id = requesting_user_id
  ) then
    raise exception 'Profile details are required' using errcode = '23514';
  end if;

  if (
    select count(*) from public.profile_photos where user_id = requesting_user_id
  ) < 3 then
    raise exception 'At least 3 profile photos are required' using errcode = '23514';
  end if;

  if (
    select count(*) from public.profile_interests where user_id = requesting_user_id
  ) not between 1 and 5 then
    raise exception 'Between 1 and 5 interests are required' using errcode = '23514';
  end if;

  if (
    select count(*) from public.profile_prompt_answers where user_id = requesting_user_id
  ) < 2 then
    raise exception 'At least 2 prompt answers are required' using errcode = '23514';
  end if;

  update public.account_private
  set onboarding_completed_at = now()
  where user_id = requesting_user_id;
end;
$$;

revoke all on function public.complete_onboarding() from public, anon;
grant execute on function public.complete_onboarding() to authenticated;

insert into public.interest_definitions (id, label, category, sort_order)
values
  ('travel', 'Travel', 'Lifestyle', 10),
  ('fitness', 'Fitness', 'Lifestyle', 20),
  ('cooking', 'Cooking', 'Food', 30),
  ('coffee', 'Coffee', 'Food', 40),
  ('photography', 'Photography', 'Creative', 50),
  ('reading', 'Reading', 'Creative', 60),
  ('gaming', 'Gaming', 'Entertainment', 70),
  ('live_music', 'Live music', 'Music', 80),
  ('hiking', 'Hiking', 'Outdoors', 90),
  ('pets', 'Pets', 'Lifestyle', 100),
  ('tamil_cinema', 'Tamil cinema', 'Entertainment', 110),
  ('tamil_music', 'Tamil music', 'Music', 120),
  ('tamil_cuisine', 'Tamil cuisine', 'Food', 130),
  ('carnatic_music', 'Carnatic music', 'Music', 140),
  ('kollywood_dance', 'Kollywood dance', 'Creative', 150);

insert into public.prompt_definitions (
  id,
  prompt,
  is_tamil_specific,
  sort_order
)
values
  ('perfect_sunday', 'My perfect Sunday looks like...', false, 10),
  ('green_flags', 'A green flag I look for is...', false, 20),
  ('simple_pleasure', 'My simple pleasure is...', false, 30),
  ('known_for', 'I am known for...', false, 40),
  ('first_date', 'My ideal first date is...', false, 50),
  ('tamil_movie', 'My favourite Tamil movie is...', true, 60),
  ('tamil_food', 'The Tamil food I could eat forever is...', true, 70),
  ('tamil_song', 'My go-to Tamil song is...', true, 80);

alter table public.account_private enable row level security;
alter table public.profiles enable row level security;
alter table public.interest_definitions enable row level security;
alter table public.profile_interests enable row level security;
alter table public.prompt_definitions enable row level security;
alter table public.profile_prompt_answers enable row level security;
alter table public.profile_photos enable row level security;

revoke all on table public.account_private from anon, authenticated;
revoke all on table public.profiles from anon, authenticated;
revoke all on table public.interest_definitions from anon, authenticated;
revoke all on table public.profile_interests from anon, authenticated;
revoke all on table public.prompt_definitions from anon, authenticated;
revoke all on table public.profile_prompt_answers from anon, authenticated;
revoke all on table public.profile_photos from anon, authenticated;

grant select, insert on table public.account_private to authenticated;
grant update (user_id, date_of_birth) on table public.account_private to authenticated;
grant select, insert, update, delete on table public.profiles to authenticated;
grant select on table public.interest_definitions to authenticated;
grant select, insert, delete on table public.profile_interests to authenticated;
grant select on table public.prompt_definitions to authenticated;
grant select, insert, update, delete on table public.profile_prompt_answers to authenticated;
grant select, insert, update, delete on table public.profile_photos to authenticated;

create policy "Users can view their private account data"
on public.account_private for select to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can create their private account data"
on public.account_private for insert to authenticated
with check ((select auth.uid()) = user_id);

create policy "Users can update their private account data"
on public.account_private for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "Users can view their own profile"
on public.profiles for select to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can create their own profile"
on public.profiles for insert to authenticated
with check ((select auth.uid()) = user_id);

create policy "Users can update their own profile"
on public.profiles for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "Users can delete their own profile"
on public.profiles for delete to authenticated
using ((select auth.uid()) = user_id);

create policy "Authenticated users can view active interests"
on public.interest_definitions for select to authenticated
using (is_active);

create policy "Users can view their own interests"
on public.profile_interests for select to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can add their own interests"
on public.profile_interests for insert to authenticated
with check ((select auth.uid()) = user_id);

create policy "Users can delete their own interests"
on public.profile_interests for delete to authenticated
using ((select auth.uid()) = user_id);

create policy "Authenticated users can view active prompts"
on public.prompt_definitions for select to authenticated
using (is_active);

create policy "Users can view their own prompt answers"
on public.profile_prompt_answers for select to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can add their own prompt answers"
on public.profile_prompt_answers for insert to authenticated
with check ((select auth.uid()) = user_id);

create policy "Users can update their own prompt answers"
on public.profile_prompt_answers for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "Users can delete their own prompt answers"
on public.profile_prompt_answers for delete to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can view their own photo metadata"
on public.profile_photos for select to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can add their own photo metadata"
on public.profile_photos for insert to authenticated
with check (
  (select auth.uid()) = user_id
  and storage_path like (select auth.uid())::text || '/%'
);

create policy "Users can update their own photo metadata"
on public.profile_photos for update to authenticated
using ((select auth.uid()) = user_id)
with check (
  (select auth.uid()) = user_id
  and storage_path like (select auth.uid())::text || '/%'
);

create policy "Users can delete their own photo metadata"
on public.profile_photos for delete to authenticated
using ((select auth.uid()) = user_id);

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'profile-photos',
  'profile-photos',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "Users can view their own profile photos"
on storage.objects for select to authenticated
using (
  bucket_id = 'profile-photos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create policy "Users can upload their own profile photos"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'profile-photos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create policy "Users can update their own profile photos"
on storage.objects for update to authenticated
using (
  bucket_id = 'profile-photos'
  and owner_id = (select auth.uid())::text
)
with check (
  bucket_id = 'profile-photos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create policy "Users can delete their own profile photos"
on storage.objects for delete to authenticated
using (
  bucket_id = 'profile-photos'
  and owner_id = (select auth.uid())::text
);

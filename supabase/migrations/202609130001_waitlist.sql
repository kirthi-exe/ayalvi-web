-- Dedicated website waitlist. Never joins or references mobile profile tables.
create table public.waitlist_entries (
 id uuid primary key default gen_random_uuid(),
 email text not null unique check (email = lower(btrim(email)) and char_length(email) between 3 and 254),
 city_region text not null check (char_length(btrim(city_region)) between 2 and 100),
 gender text not null check (gender in ('Woman','Man','Non-binary','Prefer not to say')),
 interested_in text not null check (interested_in in ('Women','Men','Everyone','Prefer not to say')),
 is_18_plus boolean not null check (is_18_plus = true),
 heard_from text check (char_length(heard_from) <= 120),
 referral_code text unique,
 referred_by uuid references public.waitlist_entries(id) on delete set null,
 referral_count integer not null default 0 check (referral_count >= 0),
 status text not null default 'waiting' check (status in ('waiting','priority','invited','beta','blocked')),
 utm_source text check (char_length(utm_source) <= 120),
 utm_medium text check (char_length(utm_medium) <= 120),
 utm_campaign text check (char_length(utm_campaign) <= 120),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 constraint no_self_referral check (referred_by is null or referred_by <> id)
);
create index waitlist_status_created_idx on public.waitlist_entries(status,created_at);
create index waitlist_referred_by_idx on public.waitlist_entries(referred_by);
alter table public.waitlist_entries enable row level security;
-- No browser policies: anon and authenticated cannot perform any operation.
revoke all on table public.waitlist_entries from public, anon, authenticated, service_role;
grant insert on table public.waitlist_entries to service_role;
create function public.waitlist_touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end;
$$;
revoke execute on function public.waitlist_touch_updated_at() from public, anon, authenticated;
create trigger waitlist_updated_at before update on public.waitlist_entries
for each row execute function public.waitlist_touch_updated_at();


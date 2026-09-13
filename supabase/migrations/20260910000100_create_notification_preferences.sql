create table public.notification_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  new_match_enabled boolean not null default true,
  new_message_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger notification_preferences_set_updated_at
before update on public.notification_preferences
for each row execute function public.set_updated_at();

alter table public.notification_preferences enable row level security;

revoke all on table public.notification_preferences
from public, anon, authenticated;
revoke all on table public.notification_preferences from service_role;

create or replace function public.get_notification_preferences()
returns table (
  new_match_enabled boolean,
  new_message_enabled boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
begin
  if caller_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  return query
  select
    coalesce(preferences.new_match_enabled, true),
    coalesce(preferences.new_message_enabled, true)
  from (select caller_id as user_id) as caller
  left join public.notification_preferences as preferences
    on preferences.user_id = caller.user_id;
end;
$$;

create or replace function public.update_notification_preferences(
  requested_new_match_enabled boolean,
  requested_new_message_enabled boolean
)
returns table (
  new_match_enabled boolean,
  new_message_enabled boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
begin
  if caller_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  if requested_new_match_enabled is null
    or requested_new_message_enabled is null then
    raise exception 'notification preferences are required'
      using errcode = '22004';
  end if;

  insert into public.notification_preferences (
    user_id,
    new_match_enabled,
    new_message_enabled
  )
  values (
    caller_id,
    requested_new_match_enabled,
    requested_new_message_enabled
  )
  on conflict (user_id) do update
  set
    new_match_enabled = excluded.new_match_enabled,
    new_message_enabled = excluded.new_message_enabled;

  return query
  select
    preferences.new_match_enabled,
    preferences.new_message_enabled
  from public.notification_preferences as preferences
  where preferences.user_id = caller_id;
end;
$$;

revoke all on function public.get_notification_preferences()
from public, anon;
revoke all on function public.update_notification_preferences(boolean, boolean)
from public, anon;

grant execute on function public.get_notification_preferences()
to authenticated;
grant execute on function public.update_notification_preferences(boolean, boolean)
to authenticated;

grant select on table public.notification_preferences to service_role;

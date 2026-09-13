create table public.push_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  fcm_token text not null unique check (
    char_length(fcm_token) between 20 and 4096
  ),
  platform text not null check (platform in ('android', 'ios')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  is_active boolean not null default true
);

create index push_devices_active_user_idx
on public.push_devices (user_id)
where is_active;

create trigger push_devices_set_updated_at
before update on public.push_devices
for each row execute function public.set_updated_at();

create table public.notification_outbox (
  id uuid primary key default gen_random_uuid(),
  recipient_user_id uuid not null references auth.users (id) on delete cascade,
  notification_type text not null check (
    notification_type in ('new_match', 'new_message')
  ),
  match_id uuid not null references public.matches (id) on delete cascade,
  source_message_id uuid references public.messages (id) on delete cascade,
  dedupe_key text not null unique,
  created_at timestamptz not null default now(),
  available_at timestamptz not null default now(),
  claimed_at timestamptz,
  processed_at timestamptz,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  delivered_device_ids uuid[] not null default '{}',
  last_error text
);

create index notification_outbox_pending_idx
on public.notification_outbox (available_at, created_at)
where processed_at is null and attempt_count < 5;

alter table public.push_devices enable row level security;
alter table public.notification_outbox enable row level security;

-- Tokens and delivery metadata are RPC/server-only. There are deliberately no
-- client policies on either table.
revoke all on table public.push_devices from public, anon, authenticated;
revoke all on table public.notification_outbox
from public, anon, authenticated;

create or replace function public.register_push_device(
  requested_fcm_token text,
  requested_platform text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  requesting_user_id uuid := (select auth.uid());
  normalized_token text := pg_catalog.btrim(requested_fcm_token);
  normalized_platform text := pg_catalog.lower(
    pg_catalog.btrim(requested_platform)
  );
begin
  if requesting_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if normalized_token is null
    or char_length(normalized_token) not between 20 and 4096
  then
    raise exception 'Invalid push token' using errcode = '22023';
  end if;

  if normalized_platform is null
    or normalized_platform not in ('android', 'ios')
  then
    raise exception 'Unsupported push platform' using errcode = '22023';
  end if;

  insert into public.push_devices (
    user_id,
    fcm_token,
    platform,
    last_seen_at,
    is_active
  ) values (
    requesting_user_id,
    normalized_token,
    normalized_platform,
    now(),
    true
  )
  on conflict (fcm_token) do update
  set
    user_id = requesting_user_id,
    platform = normalized_platform,
    last_seen_at = now(),
    is_active = true;

  return true;
end;
$$;

create or replace function public.unregister_push_device(
  requested_fcm_token text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  requesting_user_id uuid := (select auth.uid());
  normalized_token text := pg_catalog.btrim(requested_fcm_token);
begin
  if requesting_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if normalized_token is null or normalized_token = '' then
    return true;
  end if;

  update public.push_devices as owned_device
  set
    is_active = false,
    last_seen_at = now()
  where owned_device.user_id = requesting_user_id
    and owned_device.fcm_token = normalized_token;

  -- Idempotent and deliberately does not reveal whether another user owns it.
  return true;
end;
$$;

create or replace function private.enqueue_new_match_notifications()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if private.discovery_pair_is_unblocked(new.user_a_id, new.user_b_id) then
    insert into public.notification_outbox (
      recipient_user_id,
      notification_type,
      match_id,
      dedupe_key
    ) values
      (
        new.user_a_id,
        'new_match',
        new.id,
        'new_match:' || new.id::text || ':' || new.user_a_id::text
      ),
      (
        new.user_b_id,
        'new_match',
        new.id,
        'new_match:' || new.id::text || ':' || new.user_b_id::text
      )
    on conflict (dedupe_key) do nothing;
  end if;

  return new;
end;
$$;

create trigger matches_enqueue_push_notifications
after insert on public.matches
for each row execute function private.enqueue_new_match_notifications();

create or replace function private.enqueue_new_message_notification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  recipient_id uuid;
begin
  select case
    when active_match.user_a_id = new.sender_id then active_match.user_b_id
    else active_match.user_a_id
  end
  into recipient_id
  from public.matches as active_match
  where active_match.id = new.match_id
    and active_match.status = 'active'
    and new.sender_id in (
      active_match.user_a_id,
      active_match.user_b_id
    )
    and private.discovery_pair_is_unblocked(
      active_match.user_a_id,
      active_match.user_b_id
    );

  if recipient_id is not null and recipient_id <> new.sender_id then
    insert into public.notification_outbox (
      recipient_user_id,
      notification_type,
      match_id,
      source_message_id,
      dedupe_key
    ) values (
      recipient_id,
      'new_message',
      new.match_id,
      new.id,
      'new_message:' || new.id::text || ':' || recipient_id::text
    )
    on conflict (dedupe_key) do nothing;
  end if;

  return new;
end;
$$;

create trigger messages_enqueue_push_notification
after insert on public.messages
for each row execute function private.enqueue_new_message_notification();

-- Atomically leases retryable rows so concurrent workers cannot deliver the
-- same event at the same time. A five-minute lease recovers abandoned claims.
create or replace function public.claim_notification_outbox(
  requested_limit integer default 25
)
returns table (
  id uuid,
  recipient_user_id uuid,
  notification_type text,
  match_id uuid,
  source_message_id uuid,
  attempt_count integer,
  delivered_device_ids uuid[]
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.role()) is distinct from 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;

  return query
  with claimable as (
    select pending.id
    from public.notification_outbox as pending
    where pending.processed_at is null
      and pending.attempt_count < 5
      and pending.available_at <= now()
      and (
        pending.claimed_at is null
        or pending.claimed_at < now() - interval '5 minutes'
      )
    order by pending.available_at, pending.created_at
    for update skip locked
    limit least(greatest(coalesce(requested_limit, 25), 1), 100)
  )
  update public.notification_outbox as claimed
  set
    claimed_at = now(),
    attempt_count = claimed.attempt_count + 1
  from claimable
  where claimed.id = claimable.id
  returning
    claimed.id,
    claimed.recipient_user_id,
    claimed.notification_type,
    claimed.match_id,
    claimed.source_message_id,
    claimed.attempt_count,
    claimed.delivered_device_ids;
end;
$$;

revoke all on function public.register_push_device(text, text)
from public, anon;
revoke all on function public.unregister_push_device(text)
from public, anon;
revoke all on function public.claim_notification_outbox(integer)
from public, anon, authenticated;

grant execute on function public.register_push_device(text, text)
to authenticated;
grant execute on function public.unregister_push_device(text)
to authenticated;
grant execute on function public.claim_notification_outbox(integer)
to service_role;

-- Exact worker privileges. No token/outbox access is granted to anon or normal
-- authenticated clients.
grant select, update on table public.push_devices to service_role;
grant select, update on table public.notification_outbox to service_role;
grant select on table public.matches to service_role;
grant select on table public.messages to service_role;
grant select on table public.blocks to service_role;

revoke all on function private.enqueue_new_match_notifications()
from public, anon, authenticated;
revoke all on function private.enqueue_new_message_notification()
from public, anon, authenticated;

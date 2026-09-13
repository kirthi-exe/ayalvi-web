create table public.messages (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches (id) on delete cascade,
  sender_id uuid not null references auth.users (id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  constraint messages_body_is_valid check (
    char_length(btrim(body)) between 1 and 2000
  )
);

create index messages_recent_by_match_idx
on public.messages (match_id, created_at desc, id desc);

alter table public.messages enable row level security;

revoke all on table public.messages from anon, authenticated;
grant select on table public.messages to authenticated;

create policy "Active match participants can read messages"
on public.messages for select to authenticated
using (
  exists (
    select 1
    from public.matches as active_match
    where active_match.id = messages.match_id
      and active_match.status = 'active'
      and (
        (select auth.uid()) = active_match.user_a_id
        or (select auth.uid()) = active_match.user_b_id
      )
  )
);

create or replace function public.send_message(
  requested_match_id uuid,
  requested_body text
)
returns table (
  id uuid,
  match_id uuid,
  sender_id uuid,
  body text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  requesting_user_id uuid := (select auth.uid());
  normalized_body text := btrim(requested_body);
begin
  if requesting_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if normalized_body is null or char_length(normalized_body) = 0 then
    raise exception 'Message cannot be empty' using errcode = '22023';
  end if;

  if char_length(normalized_body) > 2000 then
    raise exception 'Message is too long' using errcode = '22001';
  end if;

  -- Serialize send/unmatch operations for this match. If send obtains the lock
  -- first, its message precedes unmatch; otherwise the inactive check rejects it.
  perform 1
  from public.matches as active_match
  where active_match.id = requested_match_id
    and active_match.status = 'active'
    and requesting_user_id in (
      active_match.user_a_id,
      active_match.user_b_id
    )
  for update;

  if not found then
    raise exception 'Active match not found' using errcode = '42501';
  end if;

  return query
  insert into public.messages as new_message (match_id, sender_id, body)
  values (requested_match_id, requesting_user_id, normalized_body)
  returning
    new_message.id,
    new_message.match_id,
    new_message.sender_id,
    new_message.body,
    new_message.created_at;
end;
$$;

revoke all on function public.send_message(uuid, text) from public, anon;
grant execute on function public.send_message(uuid, text) to authenticated;

create or replace function public.is_match_active(requested_match_id uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.matches as active_match
    where (select auth.uid()) is not null
      and active_match.id = requested_match_id
      and active_match.status = 'active'
      and (
        (select auth.uid()) = active_match.user_a_id
        or (select auth.uid()) = active_match.user_b_id
      )
  );
$$;

revoke all on function public.is_match_active(uuid) from public, anon;
grant execute on function public.is_match_active(uuid) to authenticated;

do $$
begin
  if not exists (
    select 1
    from pg_catalog.pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'messages'
  ) then
    execute 'alter publication supabase_realtime add table public.messages';
  end if;
end;
$$;

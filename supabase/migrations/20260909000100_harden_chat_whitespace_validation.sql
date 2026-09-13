alter table public.messages
drop constraint messages_body_is_valid;

-- PostgreSQL btrim(text) removes ordinary spaces only. Use POSIX whitespace
-- at the two edges so spaces, tabs, line feeds, and carriage returns are all
-- ignored for validation while meaningful internal whitespace is preserved.
-- NOT VALID avoids rejecting deployment if a legacy whitespace-only message
-- was stored before this fix; PostgreSQL still enforces it for new/updated rows.
do $$
declare
  whitespace_pattern constant text := '^[[:space:]]+|[[:space:]]+$';
begin
  if pg_catalog.regexp_replace('   ', whitespace_pattern, '', 'g') <> ''
    or pg_catalog.regexp_replace(E'\t\t', whitespace_pattern, '', 'g') <> ''
    or pg_catalog.regexp_replace(E'\n\n', whitespace_pattern, '', 'g') <> ''
    or pg_catalog.regexp_replace(E'\r\n', whitespace_pattern, '', 'g') <> ''
    or pg_catalog.regexp_replace(
      E' \t\r\n \t',
      whitespace_pattern,
      '',
      'g'
    ) <> ''
    or pg_catalog.regexp_replace(
      ' hello ',
      whitespace_pattern,
      '',
      'g'
    ) <> 'hello'
    or pg_catalog.regexp_replace(
      'hello   world',
      whitespace_pattern,
      '',
      'g'
    ) <> 'hello   world'
  then
    raise exception 'Message whitespace normalization self-check failed';
  end if;
end;
$$;

alter table public.messages
add constraint messages_body_is_valid check (
  char_length(
    pg_catalog.regexp_replace(
      body,
      '^[[:space:]]+|[[:space:]]+$',
      '',
      'g'
    )
  ) between 1 and 2000
) not valid;

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
  normalized_body text := pg_catalog.regexp_replace(
    requested_body,
    '^[[:space:]]+|[[:space:]]+$',
    '',
    'g'
  );
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

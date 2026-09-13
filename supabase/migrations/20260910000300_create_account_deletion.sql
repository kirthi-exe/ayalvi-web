create or replace function public.delete_my_account()
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

  -- Serialize repeated deletion attempts for the same account. The caller ID
  -- is derived only from the authenticated JWT; no target user is accepted.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(requesting_user_id::text, 0)
  );

  -- Remove queued notifications first. Rows addressed to this account cascade
  -- from auth.users later, while rows tied to its matches may target the other
  -- participant and must also be cancelled.
  delete from public.notification_outbox as pending_notification
  where pending_notification.recipient_user_id = requesting_user_id
    or pending_notification.match_id in (
      select account_match.id
      from public.matches as account_match
      where account_match.user_a_id = requesting_user_id
        or account_match.user_b_id = requesting_user_id
    );

  -- Privacy-first MVP: reports involving a deleted account are erased rather
  -- than retaining an identifiable reporter or reported-user reference.
  delete from public.reports as account_report
  where account_report.reporter_user_id = requesting_user_id
    or account_report.reported_user_id = requesting_user_id;

  -- Removing the full conversation prevents the other participant from seeing
  -- historical messages or a deleted sender identity.
  delete from public.messages as account_message
  where account_message.sender_id = requesting_user_id
    or account_message.match_id in (
      select account_match.id
      from public.matches as account_match
      where account_match.user_a_id = requesting_user_id
        or account_match.user_b_id = requesting_user_id
    );

  delete from public.matches as account_match
  where account_match.user_a_id = requesting_user_id
    or account_match.user_b_id = requesting_user_id;

  delete from public.swipes as account_swipe
  where account_swipe.swiper_user_id = requesting_user_id
    or account_swipe.target_user_id = requesting_user_id;

  delete from public.blocks as account_block
  where account_block.blocker_user_id = requesting_user_id
    or account_block.blocked_user_id = requesting_user_id;

  delete from public.push_devices as account_device
  where account_device.user_id = requesting_user_id;

  delete from public.notification_preferences as account_preferences
  where account_preferences.user_id = requesting_user_id;

  delete from public.profile_prompt_answers as account_prompt
  where account_prompt.user_id = requesting_user_id;

  delete from public.profile_interests as account_interest
  where account_interest.user_id = requesting_user_id;

  delete from public.profile_photos as account_photo
  where account_photo.user_id = requesting_user_id;

  delete from public.profiles as account_profile
  where account_profile.user_id = requesting_user_id;

  delete from public.account_private as private_account
  where private_account.user_id = requesting_user_id;

  return true;
end;
$$;

revoke all on function public.delete_my_account() from public, anon, authenticated;
grant execute on function public.delete_my_account() to authenticated;

comment on function public.delete_my_account() is
  'Deletes only the authenticated caller application data before server-side Auth deletion.';

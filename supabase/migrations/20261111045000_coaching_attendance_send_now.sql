-- Share today's outbox between the admin action and the scheduled delivery.
create function private.enqueue_coaching_attendance_for_day(p_at timestamptz)
returns integer language plpgsql set search_path='' as $$
declare
  session_day date := (p_at at time zone 'Asia/Kolkata')::date;
  roster jsonb;
  queued_count integer;
begin
  if session_day is null or not coalesce((select email_enabled from private.coaching_settings where id), false) then
    return 0;
  end if;

  select jsonb_agg(jsonb_build_object('registrationId', child.id) order by child.created, child.id)
  into roster
  from (
    select registration.id, registration.created
    from public.registrations registration
    where private.coaching_live_registration(registration.id)
    order by registration.created, registration.id
    limit 101
  ) child;

  if roster is null then
    return 0;
  end if;
  if jsonb_array_length(roster) > 100 then
    raise exception using errcode='54000', message='The attendance roster exceeds the 100-child email limit.';
  end if;

  insert into private.coaching_email_tickets(recipient_email, session_date, roster, expires_at, next_attempt_at)
  select admin.email, session_day, roster, p_at + interval '48 hours', p_at
  from public.allowed_admins admin
  order by admin.email
  on conflict(recipient_email, session_date) do nothing;

  get diagnostics queued_count = row_count;
  return queued_count;
end;
$$;
revoke all on function private.enqueue_coaching_attendance_for_day(timestamptz) from public, anon, authenticated;

create or replace function private.enqueue_coaching_attendance_at(p_at timestamptz)
returns integer language sql security definer set search_path='' as $$
  select case
    when (p_at at time zone 'Asia/Kolkata')::time >= time '21:00'
    then private.enqueue_coaching_attendance_for_day(p_at)
    else 0
  end;
$$;

create function private.coaching_attendance_email_status_for_day(p_day date)
returns jsonb language sql stable set search_path='' as $$
  select jsonb_build_object(
    'sessionDate', p_day,
    'emailEnabled', settings.enabled,
    'queued', 0,
    'pending', delivery.pending,
    'sent', delivery.sent,
    'failed', delivery.failed
  )
  from (select coalesce((select email_enabled from private.coaching_settings where id), false) as enabled) settings
  cross join lateral (
    select
      count(*) filter (where ticket.state in ('pending', 'processing') and ticket.expires_at > now()) as pending,
      count(*) filter (where ticket.state = 'sent' and ticket.sent_at is not null) as sent,
      count(*) filter (where ticket.state in ('failed', 'cancelled')
        or (ticket.state in ('pending', 'processing') and ticket.expires_at <= now())) as failed
    from public.allowed_admins admin
    join private.coaching_email_tickets ticket on ticket.recipient_email = admin.email and ticket.session_date = p_day
    where settings.enabled
  ) delivery;
$$;
revoke all on function private.coaching_attendance_email_status_for_day(date) from public, anon, authenticated;

create function public.get_coaching_attendance_email_status()
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  perform private.require_google_user();
  if not private.is_allowed_admin() then
    raise exception using errcode='42501', message='Admin access is required.';
  end if;

  return private.coaching_attendance_email_status_for_day((now() at time zone 'Asia/Kolkata')::date);
end;
$$;
revoke all on function public.get_coaching_attendance_email_status() from public, anon, authenticated, service_role;
grant execute on function public.get_coaching_attendance_email_status() to authenticated;

create function public.send_coaching_attendance_now()
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  session_day date := (now() at time zone 'Asia/Kolkata')::date;
  queued_count integer;
begin
  perform private.lock_google_registration_user();
  if not private.is_allowed_admin() then
    raise exception using errcode='42501', message='Admin access is required.';
  end if;

  queued_count := private.enqueue_coaching_attendance_for_day(now());
  if queued_count > 0 then
    -- pg_net starts the existing worker request after this transaction commits.
    perform private.wake_coaching_worker();
  end if;

  return private.coaching_attendance_email_status_for_day(session_day) || jsonb_build_object('queued', queued_count);
end;
$$;
revoke all on function public.send_coaching_attendance_now() from public, anon, authenticated, service_role;
grant execute on function public.send_coaching_attendance_now() to authenticated;

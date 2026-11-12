-- Keep the existing staff projection for old callers and let each workspace
-- explicitly select its own role for new reads.
create function private.list_coaching_staff_tracker(p_date date, p_scope text)
returns jsonb language plpgsql stable set search_path='' as $$
declare
  today date := (now() at time zone 'Asia/Kolkata')::date;
  day date := coalesce(p_date, today);
  allowed_admin boolean := private.is_allowed_admin();
  admin_scope boolean := coalesce(p_scope = 'admin', allowed_admin);
  actor_email text := lower(coalesce(auth.jwt()->>'email', ''));
  ids uuid[];
  children jsonb;
begin
  perform private.require_google_user();
  if admin_scope and not allowed_admin then
    raise exception using errcode='42501', message='Admin access is required.';
  end if;
  if day > today or day < today - 364 then
    raise exception using errcode='22023', message='Choose a date in the last 12 months.';
  end if;

  select array_agg(r.id order by r.created, r.id),
    jsonb_agg(jsonb_build_object(
      'registrationId', r.id, 'childName', r.metadata->>'childName',
      'sport', r.metadata->>'sport', 'community', r.metadata->>'community',
      'coachEmail', coalesce(a.coach_email, ''), 'weekdays', coalesce(to_jsonb(a.weekdays), '[]'::jsonb),
      'startsOn', a.starts_on, 'assignmentRevision', coalesce(a.revision, 0)
    ) order by r.created, r.id)
  into ids, children
  from public.registrations r
  left join private.coaching_assignments a on a.registration_id = r.id
  where private.coaching_live_registration(r.id)
    and (admin_scope or (a.coach_email = actor_email and a.coach_email <> '' and a.starts_on <= today));

  return jsonb_build_object(
    'isAdmin', admin_scope, 'children', coalesce(children, '[]'::jsonb),
    'attendance', (
      select coalesce(jsonb_agg(private.coaching_attendance_row(a) order by a.registration_id), '[]'::jsonb)
      from private.coaching_attendance a where a.registration_id = any(ids) and a.session_date = day
    ),
    'feedback', (
      select coalesce(jsonb_agg(private.coaching_feedback_row(f) order by f.week_start desc, f.id), '[]'::jsonb)
      from private.coaching_feedback f
      where f.registration_id = any(ids) and f.week_start >= date_trunc('week', today::timestamp)::date - 357
    ),
    'emailEnabled', p_scope is distinct from 'coach' and (select email_enabled from private.coaching_settings where id),
    'sessionDate', day
  );
end;
$$;
revoke all on function private.list_coaching_staff_tracker(date, text) from public, anon, authenticated;

create or replace function public.list_staff_tracker(p_date date default null)
returns jsonb language sql stable security definer set search_path='' as $$
  select private.list_coaching_staff_tracker(p_date, null);
$$;

create function public.list_staff_tracker(p_date date, p_scope text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  if p_scope is null or p_scope not in ('admin', 'coach') then
    raise exception using errcode='22023', message='Choose a tracker workspace.';
  end if;
  return private.list_coaching_staff_tracker(p_date, p_scope);
end;
$$;
revoke all on function public.list_staff_tracker(date, text) from public, anon, authenticated;
grant execute on function public.list_staff_tracker(date, text) to authenticated;

create function public.has_coaching_assignments()
returns boolean language plpgsql stable security definer set search_path='' as $$
begin
  perform private.require_google_user();
  return exists (
    select 1 from private.coaching_assignments a
    where a.coach_email = lower(coalesce(auth.jwt()->>'email', ''))
      and a.coach_email <> ''
      and a.starts_on <= (now() at time zone 'Asia/Kolkata')::date
      and private.coaching_live_registration(a.registration_id)
  );
end;
$$;
revoke all on function public.has_coaching_assignments() from public, anon, authenticated;
grant execute on function public.has_coaching_assignments() to authenticated;

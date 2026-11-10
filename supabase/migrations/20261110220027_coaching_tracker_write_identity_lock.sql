-- Serialize authenticated tracker writes with whole-account deletion.
-- Stable parent/staff reads keep their read-only transaction contract.

create or replace function public.set_coaching_assignment(p_registration_id uuid,p_coach_email text,p_weekdays integer[],p_starts_on date,p_expected_revision bigint)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.lock_google_registration_user();saved private.coaching_assignments%rowtype;mail text:=lower(btrim(coalesce(p_coach_email,'')));days integer[];
begin
  if not private.is_allowed_admin() then raise exception using errcode='42501',message='Admin access is required.';end if;
  if p_expected_revision is null or p_expected_revision<0 or p_expected_revision>9007199254740990
    or (mail<>'' and (char_length(mail)>254 or mail!~'^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' or p_starts_on is null))
    or p_weekdays is null or not(p_weekdays<@array[1,2,3,4,5,6,7]) then raise exception using errcode='22023',message='Check the coach email and schedule.';end if;
  select coalesce(array_agg(distinct d order by d),'{}'::integer[]) into days from unnest(p_weekdays) d;
  perform 1 from public.registrations where id=p_registration_id for update;
  if not private.coaching_live_registration(p_registration_id) then raise exception using errcode='42501',message='This enrolment is unavailable.';end if;
  select * into saved from private.coaching_assignments where registration_id=p_registration_id for update;
  if coalesce(saved.revision,0)<>p_expected_revision then raise exception using errcode='40001',message='The coach assignment changed. Refresh and retry.';end if;
  insert into private.coaching_assignments(registration_id,coach_email,weekdays,starts_on)
    values(p_registration_id,mail,case when mail='' then '{}'::integer[] else days end,case when mail='' then null else p_starts_on end)
    on conflict(registration_id) do update set coach_email=excluded.coach_email,weekdays=excluded.weekdays,starts_on=excluded.starts_on,revision=coaching_assignments.revision+1,updated_at=now() returning * into saved;
  return jsonb_build_object('registrationId',saved.registration_id,'coachEmail',saved.coach_email,'weekdays',saved.weekdays,'startsOn',saved.starts_on,'assignmentRevision',saved.revision);
end;
$$;
revoke all on function public.set_coaching_assignment(uuid,text,integer[],date,bigint) from public,anon,authenticated;
grant execute on function public.set_coaching_assignment(uuid,text,integer[],date,bigint) to authenticated;

create or replace function public.save_coaching_attendance(p_session_date date,p_rows jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.lock_google_registration_user();begin
  return jsonb_build_object('ok',true,'attendance',private.apply_coaching_attendance(p_session_date,p_rows,actor,private.coaching_actor_name()));
end;
$$;
revoke all on function public.save_coaching_attendance(date,jsonb) from public,anon,authenticated;
grant execute on function public.save_coaching_attendance(date,jsonb) to authenticated;

create or replace function public.save_coaching_feedback(p_registration_id uuid,p_week_start date,p_summary text,p_next_step text,p_expected_revision bigint)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.lock_google_registration_user();saved private.coaching_feedback%rowtype;summary text;next_step text;
begin
  summary:=private.registration_text(to_jsonb(p_summary),'summary',1500);next_step:=private.registration_text(to_jsonb(p_next_step),'nextStep',500,true);
  if p_week_start is null or extract(isodow from p_week_start)<>1 or p_week_start>(now() at time zone 'Asia/Kolkata')::date
    or p_week_start<date_trunc('week',((now() at time zone 'Asia/Kolkata')::date)::timestamp)::date-357 or p_expected_revision is null or p_expected_revision not between 0 and 9007199254740990 then
    raise exception using errcode='22023',message='Choose a week in the last 52 weeks.';end if;
  perform 1 from public.registrations where id=p_registration_id for update;
  if not private.coaching_can_edit(p_registration_id,p_week_start+6) then raise exception using errcode='42501',message='This child is not assigned to you.';end if;
  select * into saved from private.coaching_feedback where registration_id=p_registration_id and week_start=p_week_start for update;
  if coalesce(saved.revision,0)<>p_expected_revision then raise exception using errcode='40001',message='Feedback changed. Refresh before saving.';end if;
  insert into private.coaching_feedback(registration_id,week_start,summary,next_step,written_by,coach_name)
    values(p_registration_id,p_week_start,summary,next_step,actor,private.coaching_actor_name())
    on conflict(registration_id,week_start) do update set summary=excluded.summary,next_step=excluded.next_step,written_by=excluded.written_by,coach_name=excluded.coach_name,revision=coaching_feedback.revision+1,published_at=now() returning * into saved;
  return private.coaching_feedback_row(saved);
end;
$$;
revoke all on function public.save_coaching_feedback(uuid,date,text,text,bigint) from public,anon,authenticated;
grant execute on function public.save_coaching_feedback(uuid,date,text,text,bigint) to authenticated;

-- Acceptance starts the enrolment. The separate Register follow-up can still
-- be New or Contacted when the student joins the roster.
create or replace function private.coaching_student_registration(p_registration_id uuid)
returns boolean language sql stable set search_path='' as $$
  select private.coaching_live_registration(p_registration_id) and exists(
    select 1 from public.registrations
    where id=p_registration_id and status<>'closed'
  );
$$;

drop trigger record_default_coaching_assignment on public.registrations;
create trigger record_default_coaching_assignment
  after update of status,review_decision on public.registrations
  for each row when (
    new.status<>'closed' and new.review_decision='accepted'
    and (old.status='closed' or old.review_decision<>'accepted')
  )
  execute function private.record_default_coaching_assignment();

-- Reuse the separately verified default and assign only students the old
-- confirmed-only rule missed. Named coach assignments take precedence.
insert into private.coaching_assignments(registration_id,coach_email,starts_on)
select r.id,s.confirmed_students_default_email,(now() at time zone 'Asia/Kolkata')::date
from public.registrations r
cross join private.coaching_settings s
where s.id and s.confirmed_students_default_email=s.default_coach_email
  and r.status in ('new','contacted') and private.coaching_student_registration(r.id)
on conflict(registration_id) do update set
  coach_email=excluded.coach_email,starts_on=excluded.starts_on,
  revision=coaching_assignments.revision+1,updated_at=now()
where coaching_assignments.coach_email='';

alter table private.coaching_practice drop constraint coaching_practice_result;
alter table private.coaching_practice add constraint coaching_practice_result check ((
  (exercise in ('warm_up','strength') and duration_ms is null and reps is null and distance_meters is null)
  or (exercise='sprint' and duration_ms>0 and reps is null and distance_meters between 1 and 10000)
  or (exercise='push_ups' and duration_ms is null and reps>0 and distance_meters is null)
  or (exercise='body_balance' and duration_ms>0 and reps is null and distance_meters is null)
) is true);

create function private.coaching_student_billing(p_registration_id uuid)
returns jsonb language sql stable set search_path='' as $$
  with account as (
    select a.id,a.status,
      date_trunc('month',now() at time zone 'Asia/Kolkata')::date as current_month,
      (date_trunc('month',now() at time zone 'Asia/Kolkata')+interval '1 month')::date as next_month
    from private.billing_accounts a where a.registration_id=p_registration_id
  ), invoices as (
    select i.*,
      case
        when i.status='creating' and i.provider_invoice_id is null and exists(
          select 1 from private.billing_jobs j where j.invoice_id=i.id and j.kind='create_invoice' and j.state='failed'
        ) then 'failed'
        when i.status='pending' and i.due_date<now() then 'overdue'
        else i.status
      end as display_status
    from private.billing_invoices i join account a on a.id=i.account_id
    where i.kind='monthly'
  )
  select jsonb_build_object(
    'accountStatus',a.status,'currency','INR',
    'monthlyAmountPaise',private.billing_amount_for_month(a.id,a.current_month),
    'nextMonthAmountPaise',case when a.status='active' then private.billing_amount_for_month(a.id,a.next_month) end,
    'nextMonth',case when a.status='active' then a.next_month end,
    'outstandingPaise',coalesce((
      select sum(i.amount_paise-i.paid_paise) from invoices i where i.status in ('creating','pending')
    ),0),
    'nextDueAt',(
      select min(i.due_date) from invoices i
      where i.status in ('creating','pending') and i.paid_paise<i.amount_paise
    ),
    'invoices',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',i.id,'periodStart',i.period_start,'dueAt',i.due_date,'paidAt',i.paid_at,
        'amountPaise',i.amount_paise,'paidPaise',i.paid_paise,'refundedPaise',i.refunded_paise,
        'status',i.display_status
      ) order by i.period_start desc,i.id desc)
      from invoices i
    ),'[]'::jsonb)
  ) from account a;
$$;
revoke all on function private.coaching_student_billing(uuid) from public,anon,authenticated,service_role;

create function public.list_coaching_student_profile(p_registration_id uuid,p_scope text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare
  today date := (now() at time zone 'Asia/Kolkata')::date;
  actor_email text := lower(coalesce(auth.jwt()->>'email',''));
  student public.registrations%rowtype;
  feedback jsonb;
begin
  perform private.require_google_user();
  if p_scope is null or p_scope not in ('admin','coach') then
    raise exception using errcode='22023',message='Choose a Students workspace.';
  end if;
  if p_scope='admin' and not private.is_allowed_admin() then
    raise exception using errcode='42501',message='Admin access is required.';
  end if;

  select r.* into student from public.registrations r
  where r.id=p_registration_id and private.coaching_student_registration(r.id)
    and (p_scope='admin' or exists(
      select 1 from private.coaching_assignments a
      where a.registration_id=r.id and a.coach_email=actor_email and a.coach_email<>'' and a.starts_on<=today
    ));
  if not found then
    raise exception using errcode='42501',message='This student is not available to you.';
  end if;

  select coalesce(jsonb_agg(private.coaching_feedback_row(f) order by f.week_start desc,f.id),'[]'::jsonb)
  into feedback from private.coaching_feedback f
  where f.registration_id=student.id
    and f.week_start between date_trunc('week',today::timestamp)::date-357 and today;

  return jsonb_build_object(
    'registrationId',student.id,'childName',student.metadata->>'childName',
    'age',student.metadata->>'age','school',nullif(btrim(student.metadata->>'school'),''),
    'sport',student.metadata->>'sport','community',student.metadata->>'community',
    'parentName',student.full_name,'parentEmail',student.email,'parentPhone',student.phone,
    'phoneCountry',student.metadata->>'phoneCountry','address',student.metadata->>'address',
    'parentNote',student.metadata->>'note','followUpStatus',student.status,
    'submittedAt',student.created,'acceptedAt',student.reviewed_at,
    'guardianConsent',student.metadata->'guardianConsent','termsAccepted',student.metadata->'termsAccepted',
    'consentVersion',student.metadata->>'consentVersion','termsVersion',student.metadata->>'termsVersion',
    'feedback',feedback
  ) || case when p_scope='admin' then jsonb_build_object(
    'followUpNote',student.notes,'billingConsent',student.metadata->'billingConsent',
    'billingTermsVersion',student.metadata->>'billingTermsVersion',
    'billing',private.coaching_student_billing(student.id)
  ) else '{}'::jsonb end;
end;
$$;
revoke all on function public.list_coaching_student_profile(uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.list_coaching_student_profile(uuid,text) to authenticated;

-- A manual send uses saved marks and the same outbox as attendance saves.
-- Sent or uncertain deliveries keep their existing durable one-send boundary.
create function public.queue_students_attendance_email(
  p_session_date date,p_scope text,p_registration_id uuid default null
)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  today date := (now() at time zone 'Asia/Kolkata')::date;
  actor_email text := lower(coalesce(auth.jwt()->>'email',''));
  eligible integer;
  queued integer;
begin
  perform private.lock_google_registration_user();
  if p_scope is null or p_scope not in ('admin','coach') then
    raise exception using errcode='22023',message='Choose a Students workspace.';
  end if;
  if p_scope='admin' and not private.is_allowed_admin() then
    raise exception using errcode='42501',message='Admin access is required.';
  end if;
  if p_session_date is null or p_session_date>today or p_session_date<today-364 then
    raise exception using errcode='22023',message='Choose a date in the last 12 months.';
  end if;
  if not coalesce((select parent_attendance_email_enabled from private.coaching_settings where id),false) then
    raise exception using errcode='PT409',message='Parent attendance email is disabled.';
  end if;

  with marks as materialized (
    select attendance.id,attendance.status
    from private.coaching_attendance attendance
    where attendance.session_date=p_session_date and attendance.status in ('present','absent')
      and (p_registration_id is null or attendance.registration_id=p_registration_id)
      and private.coaching_student_registration(attendance.registration_id)
      and (p_scope='admin' or exists(
        select 1 from private.coaching_assignments a
        where a.registration_id=attendance.registration_id and a.coach_email=actor_email
          and a.coach_email<>'' and a.starts_on<=p_session_date
      ))
    order by attendance.registration_id for share of attendance
  ), enqueued as (
    insert into private.parent_attendance_email_outbox(attendance_id,mark_status)
    select id,status from marks
    on conflict(attendance_id) do update set
      state='pending',mark_status=excluded.mark_status,queued_at=now()
    where parent_attendance_email_outbox.state='cancelled'
      or (parent_attendance_email_outbox.state='pending'
        and parent_attendance_email_outbox.mark_status<>excluded.mark_status)
    returning attendance_id
  )
  select (select count(*) from marks),(select count(*) from enqueued) into eligible,queued;

  if eligible>0 then perform private.wake_coaching_worker(); end if;
  return jsonb_build_object('queued',queued,'alreadyQueued',eligible-queued,'eligible',eligible);
end;
$$;
revoke all on function public.queue_students_attendance_email(date,text,uuid) from public,anon,authenticated,service_role;
grant execute on function public.queue_students_attendance_email(date,text,uuid) to authenticated;

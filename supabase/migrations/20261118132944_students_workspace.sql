-- Students are approved enrolments with a confirmed follow-up and a live guardian.
create function private.coaching_student_registration(p_registration_id uuid)
returns boolean language sql stable set search_path='' as $$
  select private.coaching_live_registration(p_registration_id) and exists(
    select 1 from public.registrations
    where id=p_registration_id and status='confirmed'
  );
$$;
revoke all on function private.coaching_student_registration(uuid) from public,anon,authenticated;

create function public.list_coaching_students(p_date date,p_scope text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare
  today date := (now() at time zone 'Asia/Kolkata')::date;
  day date := coalesce(p_date,today);
  actor_email text := lower(coalesce(auth.jwt()->>'email',''));
begin
  perform private.require_google_user();
  if p_scope is null or p_scope not in ('admin','coach') then
    raise exception using errcode='22023',message='Choose a Students workspace.';
  end if;
  if p_scope='admin' and not private.is_allowed_admin() then
    raise exception using errcode='42501',message='Admin access is required.';
  end if;
  if day>today or day<today-364 then
    raise exception using errcode='22023',message='Choose a date in the last 12 months.';
  end if;

  return (
    with roster as (
      select r.id,r.created,r.metadata,a.coach_email,a.weekdays,a.starts_on,a.revision
      from public.registrations r
      left join private.coaching_assignments a on a.registration_id=r.id
      where private.coaching_student_registration(r.id)
        and (p_scope='admin' or (a.coach_email=actor_email and a.coach_email<>'' and a.starts_on<=today))
    )
    select jsonb_build_object(
      'isAdmin',p_scope='admin',
      'children',coalesce((
        select jsonb_agg(jsonb_build_object(
          'registrationId',r.id,'childName',r.metadata->>'childName',
          'sport',r.metadata->>'sport','community',r.metadata->>'community',
          'coachEmail',coalesce(r.coach_email,''),'weekdays',coalesce(to_jsonb(r.weekdays),'[]'::jsonb),
          'startsOn',r.starts_on,'assignmentRevision',coalesce(r.revision,0)
        ) order by r.created,r.id) from roster r
      ),'[]'::jsonb),
      'attendance',coalesce((
        select jsonb_agg(private.coaching_attendance_row(a) order by a.registration_id)
        from private.coaching_attendance a
        join roster on roster.id=a.registration_id
        where a.session_date=day
      ),'[]'::jsonb),
      'feedback','[]'::jsonb,'emailEnabled',false,'sessionDate',day
    )
  );
end;
$$;
revoke all on function public.list_coaching_students(date,text) from public,anon,authenticated;
grant execute on function public.list_coaching_students(date,text) to authenticated;

-- Only an exact, separately verified setting can activate the confirmed roster
-- default. The existing registration follow-up assignment remains independent.
alter table private.coaching_settings
  add column confirmed_students_default_email text
    check (confirmed_students_default_email=lower(btrim(confirmed_students_default_email))
      and char_length(confirmed_students_default_email)<=254
      and confirmed_students_default_email~'^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'),
  add column parent_attendance_email_enabled boolean not null default false;

drop trigger record_default_coaching_assignment on public.registrations;
create or replace function private.record_default_coaching_assignment()
returns trigger language plpgsql security definer set search_path='' as $$
declare coach text;
begin
  if not private.coaching_student_registration(new.id) then return new; end if;
  select confirmed_students_default_email into coach
  from private.coaching_settings
  where id and confirmed_students_default_email=default_coach_email;
  if coach is null then return new; end if;

  insert into private.coaching_assignments(registration_id,coach_email,starts_on)
  values(new.id,coach,(now() at time zone 'Asia/Kolkata')::date)
  on conflict(registration_id) do update set
    coach_email=excluded.coach_email,starts_on=excluded.starts_on,
    revision=coaching_assignments.revision+1,updated_at=now()
  where coaching_assignments.coach_email='';
  return new;
end;
$$;
create trigger record_default_coaching_assignment
  after update of status,review_decision on public.registrations
  for each row when (
    new.status='confirmed' and new.review_decision='accepted'
    and (old.status<>'confirmed' or old.review_decision<>'accepted')
  )
  execute function private.record_default_coaching_assignment();

create function private.activate_confirmed_students_default(p_verified_email text)
returns integer language plpgsql set search_path='' as $$
declare changed integer;
begin
  -- Serialize confirmation transitions during the one-time activation.
  lock table public.registrations in share row exclusive mode;
  update private.coaching_settings
  set confirmed_students_default_email=default_coach_email
  where id and default_coach_email=lower(btrim(p_verified_email));
  if not found then
    raise exception using errcode='22023',message='The verified coach must match the configured email.';
  end if;

  insert into private.coaching_assignments(registration_id,coach_email,starts_on)
  select r.id,lower(btrim(p_verified_email)),(now() at time zone 'Asia/Kolkata')::date
  from public.registrations r
  left join private.coaching_assignments a on a.registration_id=r.id
  where private.coaching_student_registration(r.id) and coalesce(a.coach_email,'')=''
  on conflict(registration_id) do update set
    coach_email=excluded.coach_email,starts_on=excluded.starts_on,
    revision=coaching_assignments.revision+1,updated_at=now()
  where coaching_assignments.coach_email='';
  get diagnostics changed=row_count;
  return changed;
end;
$$;
revoke all on function private.activate_confirmed_students_default(text) from public,anon,authenticated,service_role;

create or replace function private.archive_coach_default()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  update private.coaching_settings
  set default_coach_email=case when default_coach_email=lower(new.identity_snapshot->>'email')
    then null else default_coach_email end,
    confirmed_students_default_email=case when confirmed_students_default_email=lower(new.identity_snapshot->>'email')
    then null else confirmed_students_default_email end
  where id and lower(new.identity_snapshot->>'email') in (default_coach_email,confirmed_students_default_email);
  return new;
end;
$$;

-- One immutable row per attempt. A repeated request may only acknowledge the
-- previously saved result for the same student and attempt ID.
create table private.coaching_practice(
  registration_id uuid not null references public.registrations(id) on delete restrict,
  id uuid not null,
  exercise text not null,
  duration_ms integer,
  reps integer,
  distance_meters integer,
  recorded_at timestamptz not null default clock_timestamp(),
  recorded_by uuid references auth.users(id) on delete set null,
  primary key(registration_id,id),
  constraint coaching_practice_result check ((
    (exercise in ('warm_up','strength') and duration_ms is null and reps is null and distance_meters is null)
    or (exercise='sprint' and duration_ms>0 and reps is null and distance_meters in (5,10,100))
    or (exercise='push_ups' and duration_ms is null and reps>0 and distance_meters is null)
    or (exercise='body_balance' and duration_ms>0 and reps is null and distance_meters is null)
  ) is true)
);
create index coaching_practice_history_idx on private.coaching_practice(registration_id,recorded_at desc,id desc);
create index coaching_practice_actor_idx on private.coaching_practice(recorded_by) where recorded_by is not null;
alter table private.coaching_practice enable row level security;
revoke all on private.coaching_practice from public,anon,authenticated;

create function private.coaching_practice_row(p private.coaching_practice)
returns jsonb language sql stable set search_path='' as $$
  select jsonb_build_object(
    'id',p.id,'registrationId',p.registration_id,'exercise',p.exercise,
    'durationMs',p.duration_ms,'reps',p.reps,'distanceMeters',p.distance_meters,
    'recordedAt',p.recorded_at,'sessionDate',(p.recorded_at at time zone 'Asia/Kolkata')::date
  );
$$;
revoke all on function private.coaching_practice_row(private.coaching_practice) from public,anon,authenticated;

create function public.save_coaching_practice(
  p_registration_id uuid,p_attempt_id uuid,p_exercise text,
  p_duration_ms integer,p_reps integer,p_distance_meters integer
)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  actor uuid := private.lock_google_registration_user();
  today date := (now() at time zone 'Asia/Kolkata')::date;
  saved private.coaching_practice%rowtype;
begin
  if p_attempt_id is null or p_exercise is null then
    raise exception using errcode='22023',message='Check the practice result.';
  end if;
  perform 1 from public.registrations where id=p_registration_id for update;
  if not private.coaching_student_registration(p_registration_id)
    or not private.coaching_can_edit(p_registration_id,today) then
    raise exception using errcode='42501',message='This student is not available to you.';
  end if;

  insert into private.coaching_practice(registration_id,id,exercise,duration_ms,reps,distance_meters,recorded_by)
  values(p_registration_id,p_attempt_id,p_exercise,p_duration_ms,p_reps,p_distance_meters,actor)
  on conflict(registration_id,id) do nothing
  returning * into saved;
  if not found then
    select * into saved from private.coaching_practice
    where registration_id=p_registration_id and id=p_attempt_id;
    if row(saved.exercise,saved.duration_ms,saved.reps,saved.distance_meters)
      is distinct from row(p_exercise,p_duration_ms,p_reps,p_distance_meters) then
      raise exception using errcode='40001',message='This attempt already has a saved result.';
    end if;
  end if;
  return private.coaching_practice_row(saved);
exception when check_violation then
  raise exception using errcode='22023',message='Check the practice result.';
end;
$$;
revoke all on function public.save_coaching_practice(uuid,uuid,text,integer,integer,integer) from public,anon,authenticated;
grant execute on function public.save_coaching_practice(uuid,uuid,text,integer,integer,integer) to authenticated;

create function public.list_coaching_practice(
  p_registration_id uuid,p_scope text,p_from date default null,p_to date default null,
  p_before_at timestamptz default null,p_before_id uuid default null
)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare
  actor uuid := private.require_google_user();
  today date := (now() at time zone 'Asia/Kolkata')::date;
  lower_bound timestamptz := p_from::timestamp at time zone 'Asia/Kolkata';
  upper_bound timestamptz := (p_to+1)::timestamp at time zone 'Asia/Kolkata';
  permitted boolean;
begin
  if p_scope is null or p_scope not in ('admin','coach','parent')
    or (p_from is not null and not isfinite(p_from))
    or (p_to is not null and not isfinite(p_to))
    or p_from>p_to
    or (p_before_at is null)<>(p_before_id is null)
    or (p_before_at is not null and not isfinite(p_before_at)) then
    raise exception using errcode='22023',message='Check the practice date range.';
  end if;
  case p_scope
    when 'parent' then
      permitted:=private.coaching_live_registration(p_registration_id) and exists(
        select 1 from public.registrations where id=p_registration_id and parent_user_id=actor
      );
    when 'admin' then
      permitted:=private.coaching_student_registration(p_registration_id) and private.is_allowed_admin();
    when 'coach' then
      permitted:=private.coaching_student_registration(p_registration_id) and exists(
        select 1 from private.coaching_assignments
        where registration_id=p_registration_id and starts_on<=today and coach_email<>''
          and coach_email=lower(coalesce(auth.jwt()->>'email',''))
      );
  end case;
  if not permitted then
    raise exception using errcode='42501',message='This student is not available to you.';
  end if;

  return (
    with candidate as materialized (
      select p.* from private.coaching_practice p
      where p.registration_id=p_registration_id
        and (lower_bound is null or p.recorded_at>=lower_bound)
        and (upper_bound is null or p.recorded_at<upper_bound)
        and (p_before_at is null or (p.recorded_at,p.id)<(p_before_at,p_before_id))
      order by p.recorded_at desc,p.id desc limit 41
    ), page as (
      select * from candidate order by recorded_at desc,id desc limit 40
    )
    select jsonb_build_object(
      'attempts',coalesce((select jsonb_agg(private.coaching_practice_row(page) order by recorded_at desc,id desc)
        from page),'[]'::jsonb),
      'nextCursor',case when (select count(*) from candidate)>40 then (
        select jsonb_build_object('recordedAt',recorded_at,'id',id)
        from page order by recorded_at,id limit 1
      ) end
    )
  );
end;
$$;
revoke all on function public.list_coaching_practice(uuid,text,date,date,timestamptz,uuid) from public,anon,authenticated;
grant execute on function public.list_coaching_practice(uuid,text,date,date,timestamptz,uuid) to authenticated;

create function private.archive_coaching_practice()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  delete from private.coaching_practice p using public.registrations r
  where p.registration_id=r.id and r.parent_user_id=new.old_auth_user_id;
  return new;
end;
$$;
revoke all on function private.archive_coaching_practice() from public,anon,authenticated;
create trigger archive_coaching_practice after insert on private.account_deletions
  for each row execute function private.archive_coaching_practice();

-- Queue references the saved attendance ID, so refreshes and corrections do not
-- introduce another send. The current registration supplies the recipient.
create table private.parent_attendance_email_outbox(
  attendance_id uuid primary key references private.coaching_attendance(id) on delete cascade,
  mark_status text not null check(mark_status in ('present','absent')),
  state text not null default 'pending' check(state in ('pending','sending','sent','unconfirmed','cancelled')),
  queued_at timestamptz not null default now(),
  sending_at timestamptz,
  lease_token uuid,
  sent_at timestamptz,
  check((state='sending')=(lease_token is not null)),
  check((state='sent')=(sent_at is not null))
);
create index parent_attendance_email_pending_idx on private.parent_attendance_email_outbox(queued_at,attendance_id)
  where state='pending';
create index parent_attendance_email_sending_idx on private.parent_attendance_email_outbox(sending_at,attendance_id)
  where state='sending';
alter table private.parent_attendance_email_outbox enable row level security;
revoke all on private.parent_attendance_email_outbox from public,anon,authenticated;

create function private.queue_parent_attendance_email()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if tg_op='UPDATE' and new.status=old.status then return new; end if;

  if new.status='no_session' then
    update private.parent_attendance_email_outbox set state='cancelled'
    where attendance_id=new.id and state='pending';
  elsif (select parent_attendance_email_enabled from private.coaching_settings where id)
    and private.coaching_student_registration(new.registration_id) then
    insert into private.parent_attendance_email_outbox(attendance_id,mark_status)
    values(new.id,new.status)
    on conflict(attendance_id) do update set mark_status=excluded.mark_status,state='pending'
    where parent_attendance_email_outbox.state in ('pending','cancelled');
  end if;
  return new;
end;
$$;
revoke all on function private.queue_parent_attendance_email() from public,anon,authenticated;
create trigger queue_parent_attendance_email
  after insert or update of status on private.coaching_attendance
  for each row execute function private.queue_parent_attendance_email();

create function public.claim_parent_attendance_email()
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  delivery record;
  token uuid;
begin
  if not coalesce((select parent_attendance_email_enabled from private.coaching_settings where id),false) then
    return null;
  end if;

  -- An expired send might already have reached SMTP. Keep its outcome
  -- unconfirmed and prevent retries from contacting the parent again.
  update private.parent_attendance_email_outbox
  set state='unconfirmed',lease_token=null
  where state='sending' and sending_at<=now()-interval '2 minutes';

  with invalid as (
    select job.attendance_id from private.parent_attendance_email_outbox job
    join private.coaching_attendance attendance on attendance.id=job.attendance_id
    where job.state='pending' and (job.mark_status<>attendance.status
      or not private.coaching_student_registration(attendance.registration_id))
    order by job.queued_at,job.attendance_id
    limit 20 for update of job skip locked
  )
  update private.parent_attendance_email_outbox job set state='cancelled'
  from invalid where job.attendance_id=invalid.attendance_id;

  select job.attendance_id as id,job.mark_status,attendance.session_date,
    registration.email,registration.metadata->>'childName' as child_name
  into delivery
  from private.parent_attendance_email_outbox job
  join private.coaching_attendance attendance on attendance.id=job.attendance_id
  join public.registrations registration on registration.id=attendance.registration_id
  where job.state='pending' and job.mark_status=attendance.status
    and private.coaching_student_registration(attendance.registration_id)
  order by job.queued_at,job.attendance_id
  limit 1 for update of job skip locked;
  if not found then return null; end if;

  -- The one-time send boundary is durable before any SMTP request can start.
  update private.parent_attendance_email_outbox
  set state='sending',lease_token=gen_random_uuid(),sending_at=now()
  where attendance_id=delivery.id returning lease_token into token;

  return jsonb_build_object(
    'id',delivery.id,'leaseToken',token,'recipientEmail',delivery.email,
    'childName',delivery.child_name,'sessionDate',delivery.session_date,'status',delivery.mark_status
  );
end;
$$;
revoke all on function public.claim_parent_attendance_email() from public,anon,authenticated;
grant execute on function public.claim_parent_attendance_email() to service_role;

create function public.finish_parent_attendance_email(p_id uuid,p_lease_token uuid,p_outcome text)
returns boolean language plpgsql security definer set search_path='' as $$
begin
  if p_outcome is null or p_outcome not in ('sent','unconfirmed') then
    raise exception using errcode='22023',message='Invalid attendance email outcome.';
  end if;
  update private.parent_attendance_email_outbox
  set state=p_outcome,lease_token=null,sent_at=case when p_outcome='sent' then now() end
  where attendance_id=p_id and state='sending' and lease_token=p_lease_token;
  return found;
end;
$$;
revoke all on function public.finish_parent_attendance_email(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.finish_parent_attendance_email(uuid,uuid,text) to service_role;

-- Reuse the existing one-minute scheduler and authenticated coaching worker.
create or replace function private.wake_coaching_worker()
returns void language plpgsql security definer set search_path='' as $$
declare worker_url text;worker_secret text;
begin
  perform private.enqueue_coaching_attendance_at(now());
  if to_regnamespace('net') is null or to_regclass('vault.decrypted_secrets') is null then return; end if;
  if not exists(
      select 1 from private.coaching_email_tickets
      where expires_at>now() and private.coaching_email_mode_enabled(delivery_mode)
        and ((state='pending' and next_attempt_at<=now()) or (state='processing' and lease_until<=now()))
    ) and not (
      (select parent_attendance_email_enabled from private.coaching_settings where id) and exists(
        select 1 from private.parent_attendance_email_outbox
        where state='pending' or (state='sending' and sending_at<=now()-interval '2 minutes')
      )
    ) then return; end if;
  execute 'select decrypted_secret from vault.decrypted_secrets where name=$1 limit 1'
    into worker_url using 'letsaimit_notification_worker_url';
  execute 'select decrypted_secret from vault.decrypted_secrets where name=$1 limit 1'
    into worker_secret using 'letsaimit_notification_worker_secret';
  if worker_url is null or worker_url!~'^https://[a-z0-9]+[.]supabase[.]co/functions/v1/admin-notifications$'
    or char_length(coalesce(worker_secret,''))<32 then return; end if;
  worker_url:=replace(worker_url,'/admin-notifications','/coaching-worker');
  perform net.http_post(url:=worker_url,
    headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||worker_secret),
    body:='{}'::jsonb,timeout_milliseconds:=145000);
exception when others then return;
end;
$$;

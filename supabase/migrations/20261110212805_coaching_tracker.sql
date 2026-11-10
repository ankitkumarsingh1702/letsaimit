-- Coach work and parent tracking use the existing permanent enrolment IDs.
-- Nightly email stays OFF until the AMP sender and target configuration are ready.
create table private.coaching_assignments(
  registration_id uuid primary key references public.registrations(id) on delete restrict,
  coach_email text not null default '' check(coach_email='' or (coach_email=lower(btrim(coach_email)) and coach_email~'^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' and char_length(coach_email)<=254)),
  weekdays integer[] not null default '{}' check(weekdays<@array[1,2,3,4,5,6,7] and cardinality(weekdays)<=7),
  starts_on date,
  revision bigint not null default 1 check(revision between 1 and 9007199254740991),
  updated_at timestamptz not null default now(),
  check((coach_email='')=(starts_on is null))
);
create index coaching_assignments_email_idx on private.coaching_assignments(coach_email,registration_id) where coach_email<>'';
create table private.coaching_attendance(
  id uuid primary key default gen_random_uuid(),
  registration_id uuid not null references public.registrations(id) on delete restrict,
  session_date date not null,
  status text not null check(status in ('present','absent','no_session')),
  revision bigint not null default 1 check(revision between 1 and 9007199254740991),
  recorded_by uuid references auth.users(id) on delete set null,
  coach_name text not null default 'Coach' check(char_length(coach_name)<=80),
  updated_at timestamptz not null default now(),
  unique(registration_id,session_date)
);
create index coaching_attendance_date_idx on private.coaching_attendance(session_date,registration_id);
create index coaching_attendance_actor_idx on private.coaching_attendance(recorded_by) where recorded_by is not null;
create table private.coaching_feedback(
  id uuid primary key default gen_random_uuid(),
  registration_id uuid not null references public.registrations(id) on delete restrict,
  week_start date not null check(extract(isodow from week_start)=1),
  summary text not null check(char_length(summary) between 1 and 1500),
  next_step text not null default '' check(char_length(next_step)<=500),
  revision bigint not null default 1 check(revision between 1 and 9007199254740991),
  written_by uuid references auth.users(id) on delete set null,
  coach_name text not null default 'Coach' check(char_length(coach_name)<=80),
  published_at timestamptz not null default now(),
  unique(registration_id,week_start)
);
create index coaching_feedback_week_idx on private.coaching_feedback(week_start,registration_id);
create index coaching_feedback_actor_idx on private.coaching_feedback(written_by) where written_by is not null;
create table private.coaching_settings(id boolean primary key default true check(id),email_enabled boolean not null default false);
insert into private.coaching_settings(id) values(true);
-- One durable, recipient-bound ticket also acts as the delivery outbox.
-- The roster holds IDs only. Child names are projected only after current access checks.
create table private.coaching_email_tickets(
  id uuid primary key default gen_random_uuid(),
  recipient_email text not null check(char_length(recipient_email)<=254),
  session_date date not null,
  roster jsonb not null check(jsonb_typeof(roster)='array' and jsonb_array_length(roster) between 1 and 100),
  token_hash text check(token_hash~'^[0-9a-f]{64}$'),
  expires_at timestamptz not null,
  state text not null default 'pending' check(state in ('pending','processing','sent','failed','cancelled')),
  attempts smallint not null default 0 check(attempts between 0 and 5),
  next_attempt_at timestamptz not null default now(),
  lease_token uuid,lease_until timestamptz,
  error_code text not null default '' check(error_code in ('','transport_failure','configuration_error','recipient_revoked','roster_changed','lease_expired')),
  created_at timestamptz not null default now(),sent_at timestamptz,
  used_at timestamptz,saved_payload_hash text,
  unique(recipient_email,session_date)
);
create index coaching_email_due_idx on private.coaching_email_tickets(next_attempt_at,created_at) where state in ('pending','processing');
create index coaching_email_expiry_idx on private.coaching_email_tickets(expires_at) where state not in ('failed','cancelled');
alter table private.coaching_assignments enable row level security;
alter table private.coaching_attendance enable row level security;
alter table private.coaching_feedback enable row level security;
alter table private.coaching_settings enable row level security;
alter table private.coaching_email_tickets enable row level security;
revoke all on private.coaching_assignments,private.coaching_attendance,private.coaching_feedback,private.coaching_settings,private.coaching_email_tickets from public,anon,authenticated;

create function private.coaching_live_registration(p_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.registrations r where r.id=p_id and r.deleted_at is null and r.parent_user_id is not null
    and r.review_decision='accepted' and r.metadata->>'formType'='enrol'
    and exists(select 1 from auth.users where id=r.parent_user_id)
    and not exists(select 1 from private.account_deletions where old_auth_user_id=r.parent_user_id));
$$;
create function private.coaching_can_edit(p_id uuid,p_date date)
returns boolean language sql stable security definer set search_path='' as $$
  select private.coaching_live_registration(p_id) and (private.is_allowed_admin() or exists(
    select 1 from private.coaching_assignments a where a.registration_id=p_id
      and a.coach_email=lower(coalesce(auth.jwt()->>'email','')) and a.coach_email<>''
      and a.starts_on<=(now() at time zone 'Asia/Kolkata')::date and a.starts_on<=p_date));
$$;
create function private.coaching_actor_name()
returns text language sql stable set search_path='' as $$
  select coalesce(nullif(left(regexp_replace(coalesce(auth.jwt()->'user_metadata'->>'full_name',auth.jwt()->'user_metadata'->>'name',''),'[[:cntrl:]]','','g'),80),''),'Coach');
$$;
create function private.coaching_attendance_row(p private.coaching_attendance)
returns jsonb language sql stable set search_path='' as $$
  select jsonb_build_object('id',p.id,'registrationId',p.registration_id,'sessionDate',p.session_date,'status',p.status,
    'updatedAt',p.updated_at,'coachName',p.coach_name,'revision',p.revision);
$$;
create function private.coaching_feedback_row(p private.coaching_feedback)
returns jsonb language sql stable set search_path='' as $$
  select jsonb_build_object('id',p.id,'registrationId',p.registration_id,'weekStart',p.week_start,'summary',p.summary,
    'nextStep',p.next_step,'coachName',p.coach_name,'publishedAt',p.published_at,'revision',p.revision);
$$;
revoke all on function private.coaching_live_registration(uuid),private.coaching_can_edit(uuid,date),private.coaching_actor_name(),
  private.coaching_attendance_row(private.coaching_attendance),private.coaching_feedback_row(private.coaching_feedback) from public,anon,authenticated;

create function public.list_my_tracker()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=private.require_google_user();today date:=(now() at time zone 'Asia/Kolkata')::date;ids uuid[];children jsonb;
begin
  select array_agg(r.id order by r.created,r.id),jsonb_agg(jsonb_build_object('registrationId',r.id,'childName',r.metadata->>'childName','sport',r.metadata->>'sport','community',r.metadata->>'community') order by r.created,r.id)
    into ids,children from public.registrations r where r.parent_user_id=actor and private.coaching_live_registration(r.id);
  return jsonb_build_object('children',coalesce(children,'[]'::jsonb),
    'attendance',(select coalesce(jsonb_agg(private.coaching_attendance_row(a) order by a.session_date desc,a.id),'[]'::jsonb) from private.coaching_attendance a where a.registration_id=any(ids) and a.session_date between today-364 and today),
    'feedback',(select coalesce(jsonb_agg(private.coaching_feedback_row(f) order by f.week_start desc,f.id),'[]'::jsonb) from private.coaching_feedback f where f.registration_id=any(ids) and f.week_start between date_trunc('week',today::timestamp)::date-357 and today),
    'range',jsonb_build_object('from',today-364,'to',today,'feedbackFrom',date_trunc('week',today::timestamp)::date-357));
end;
$$;
revoke all on function public.list_my_tracker() from public,anon,authenticated;
grant execute on function public.list_my_tracker() to authenticated;

create function public.list_staff_tracker(p_date date default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=private.require_google_user();day date:=coalesce(p_date,(now() at time zone 'Asia/Kolkata')::date);admin boolean:=private.is_allowed_admin();ids uuid[];children jsonb;
begin
  if day>(now() at time zone 'Asia/Kolkata')::date or day<(now() at time zone 'Asia/Kolkata')::date-364 then raise exception using errcode='22023',message='Choose a date in the last 12 months.';end if;
  select array_agg(r.id order by r.created,r.id),jsonb_agg(jsonb_build_object('registrationId',r.id,'childName',r.metadata->>'childName','sport',r.metadata->>'sport','community',r.metadata->>'community',
      'coachEmail',coalesce(a.coach_email,''),'weekdays',coalesce(to_jsonb(a.weekdays),'[]'::jsonb),'startsOn',a.starts_on,'assignmentRevision',coalesce(a.revision,0)) order by r.created,r.id)
    into ids,children from public.registrations r left join private.coaching_assignments a on a.registration_id=r.id
    where private.coaching_live_registration(r.id) and (admin or (a.coach_email=lower(auth.jwt()->>'email') and a.coach_email<>'' and a.starts_on<=(now() at time zone 'Asia/Kolkata')::date));
  return jsonb_build_object('isAdmin',admin,'children',coalesce(children,'[]'::jsonb),
    'attendance',(select coalesce(jsonb_agg(private.coaching_attendance_row(a) order by a.registration_id),'[]'::jsonb) from private.coaching_attendance a where a.registration_id=any(ids) and a.session_date=day),
    'feedback',(select coalesce(jsonb_agg(private.coaching_feedback_row(f) order by f.week_start desc,f.id),'[]'::jsonb) from private.coaching_feedback f where f.registration_id=any(ids) and f.week_start>=date_trunc('week',((now() at time zone 'Asia/Kolkata')::date)::timestamp)::date-357),
    'emailEnabled',(select email_enabled from private.coaching_settings where id),'sessionDate',day);
end;
$$;
revoke all on function public.list_staff_tracker(date) from public,anon,authenticated;
grant execute on function public.list_staff_tracker(date) to authenticated;

create function public.set_coaching_assignment(p_registration_id uuid,p_coach_email text,p_weekdays integer[],p_starts_on date,p_expected_revision bigint)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.require_google_user();saved private.coaching_assignments%rowtype;mail text:=lower(btrim(coalesce(p_coach_email,'')));days integer[];
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

-- All callers use this exact atomic, revision-checked write. Email callers are
-- separately authenticated by their ticket and pass no invented Google identity.
create function private.apply_coaching_attendance(p_date date,p_rows jsonb,p_actor uuid,p_name text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare item jsonb;rid uuid;expected bigint;saved private.coaching_attendance%rowtype;result jsonb:='[]'::jsonb;
begin
  if p_date is null or p_date>(now() at time zone 'Asia/Kolkata')::date or p_date<(now() at time zone 'Asia/Kolkata')::date-364
    or jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows) not between 1 and 100 or octet_length(p_rows::text)>64000 then
    raise exception using errcode='22023',message='Check the attendance date and rows.';end if;
  if (select count(distinct v->>'registrationId') from jsonb_array_elements(p_rows) v)<>jsonb_array_length(p_rows) then raise exception using errcode='22023',message='Each child must appear once.';end if;
  for item in select value from jsonb_array_elements(p_rows) order by value->>'registrationId' loop
    if jsonb_typeof(item) is distinct from 'object' or item->>'registrationId'!~'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      or coalesce(item->>'status','') not in ('present','absent','no_session') or jsonb_typeof(item->'revision') is distinct from 'number'
      or item->>'revision'!~'^(0|[1-9][0-9]{0,15})$' then raise exception using errcode='22023',message='Choose Present, Absent or No session.';end if;
    rid:=(item->>'registrationId')::uuid;expected:=(item->>'revision')::bigint;
    perform 1 from public.registrations where id=rid for update;
    if not private.coaching_live_registration(rid) then raise exception using errcode='42501',message='This enrolment is unavailable.';end if;
    if p_actor is not null and not private.coaching_can_edit(rid,p_date) then raise exception using errcode='42501',message='This child is not assigned to you.';end if;
    select * into saved from private.coaching_attendance where registration_id=rid and session_date=p_date for update;
    if coalesce(saved.revision,0)<>expected or expected>=9007199254740991 then raise exception using errcode='40001',message='Attendance changed. Refresh before saving.';end if;
    insert into private.coaching_attendance(registration_id,session_date,status,recorded_by,coach_name)
      values(rid,p_date,item->>'status',p_actor,p_name) on conflict(registration_id,session_date) do update set status=excluded.status,recorded_by=excluded.recorded_by,coach_name=excluded.coach_name,revision=coaching_attendance.revision+1,updated_at=now() returning * into saved;
    result:=result||jsonb_build_array(private.coaching_attendance_row(saved));
  end loop;
  return result;
end;
$$;
revoke all on function private.apply_coaching_attendance(date,jsonb,uuid,text) from public,anon,authenticated;
create function public.save_coaching_attendance(p_session_date date,p_rows jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.require_google_user();begin
  return jsonb_build_object('ok',true,'attendance',private.apply_coaching_attendance(p_session_date,p_rows,actor,private.coaching_actor_name()));
end;
$$;
revoke all on function public.save_coaching_attendance(date,jsonb) from public,anon,authenticated;
grant execute on function public.save_coaching_attendance(date,jsonb) to authenticated;
create function public.save_coaching_feedback(p_registration_id uuid,p_week_start date,p_summary text,p_next_step text,p_expected_revision bigint)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.require_google_user();saved private.coaching_feedback%rowtype;summary text;next_step text;
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

create function private.coaching_ticket_access(p private.coaching_email_tickets)
returns boolean language sql stable security definer set search_path='' as $$
  select p.expires_at>now() and p.state not in ('failed','cancelled') and exists(select 1 from public.allowed_admins where email=p.recipient_email)
    and not exists(select 1 from jsonb_array_elements(p.roster) v where not private.coaching_live_registration((v->>'registrationId')::uuid));
$$;
revoke all on function private.coaching_ticket_access(private.coaching_email_tickets) from public,anon,authenticated;
create function private.coaching_ticket_projection(p private.coaching_email_tickets)
returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object('ticketId',p.id,'recipientEmail',p.recipient_email,'sessionDate',p.session_date,'expiresAt',p.expires_at,'used',p.used_at is not null,
    'rows',(select jsonb_agg(jsonb_build_object('registrationId',r.id,'childName',r.metadata->>'childName','sport',r.metadata->>'sport','community',r.metadata->>'community',
      'status',coalesce(a.status,'unmarked'),'revision',coalesce(a.revision,0)) order by x.ordinality)
      from jsonb_array_elements(p.roster) with ordinality x(v,ordinality) join public.registrations r on r.id=(x.v->>'registrationId')::uuid
      left join private.coaching_attendance a on a.registration_id=r.id and a.session_date=p.session_date));
$$;
revoke all on function private.coaching_ticket_projection(private.coaching_email_tickets) from public,anon,authenticated;
create function private.enqueue_coaching_attendance_at(p_at timestamptz)
returns integer language plpgsql security definer set search_path='' as $$
declare day date:=(p_at at time zone 'Asia/Kolkata')::date;roster jsonb;n integer;
begin
  if not coalesce((select email_enabled from private.coaching_settings where id),false) or (p_at at time zone 'Asia/Kolkata')::time<time '21:00' then return 0;end if;
  select jsonb_agg(jsonb_build_object('registrationId',id) order by created,id) into roster from public.registrations where private.coaching_live_registration(id);
  if roster is null then return 0;end if;
  if jsonb_array_length(roster)>100 then raise exception using errcode='54000',message='The attendance roster exceeds the 100-child email limit.';end if;
  insert into private.coaching_email_tickets(recipient_email,session_date,roster,expires_at,next_attempt_at)
    select email,day,roster,p_at+interval '48 hours',p_at from public.allowed_admins on conflict(recipient_email,session_date) do nothing;
  get diagnostics n=row_count;return n;
end;
$$;
revoke all on function private.enqueue_coaching_attendance_at(timestamptz) from public,anon,authenticated;
create function public.enqueue_coaching_attendance()
returns integer language sql security definer set search_path='' as $$select private.enqueue_coaching_attendance_at(now());$$;
revoke all on function public.enqueue_coaching_attendance() from public,anon,authenticated;
grant execute on function public.enqueue_coaching_attendance() to service_role;
create function public.claim_coaching_email()
returns jsonb language plpgsql security definer set search_path='' as $$
declare job private.coaching_email_tickets%rowtype;
begin
  if not coalesce((select email_enabled from private.coaching_settings where id),false) then return null;end if;
  update private.coaching_email_tickets set state='failed',error_code='lease_expired',lease_token=null,lease_until=null where state='processing' and lease_until<=now() and attempts>=5;
  select * into job from private.coaching_email_tickets where expires_at>now() and attempts<5 and
    ((state='pending' and next_attempt_at<=now()) or (state='processing' and lease_until<=now())) order by next_attempt_at,created_at,id for update skip locked limit 1;
  if not found then return null;end if;
  update private.coaching_email_tickets set state='processing',attempts=attempts+1,lease_token=gen_random_uuid(),lease_until=now()+interval '2 minutes' where id=job.id returning * into job;
  return jsonb_build_object('id',job.id,'leaseToken',job.lease_token,'recipientEmail',job.recipient_email,'sessionDate',job.session_date,'expiresAt',job.expires_at);
end;
$$;
revoke all on function public.claim_coaching_email() from public,anon,authenticated;
grant execute on function public.claim_coaching_email() to service_role;
create function public.prepare_coaching_email(p_id uuid,p_lease_token uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare job private.coaching_email_tickets%rowtype;
begin
  select * into job from private.coaching_email_tickets where id=p_id and state='processing' and lease_token=p_lease_token and lease_until>now() for update;
  if not found or not coalesce((select email_enabled from private.coaching_settings where id),false) then return null;end if;
  if not private.coaching_ticket_access(job) then
    update private.coaching_email_tickets set state='cancelled',error_code='recipient_revoked',lease_token=null,lease_until=null where id=job.id;return null;end if;
  return private.coaching_ticket_projection(job)||jsonb_build_object('state','ready');
end;
$$;
revoke all on function public.prepare_coaching_email(uuid,uuid) from public,anon,authenticated;
grant execute on function public.prepare_coaching_email(uuid,uuid) to service_role;
create function public.set_coaching_email_token(p_id uuid,p_lease_token uuid,p_token_hash text)
returns boolean language plpgsql security definer set search_path='' as $$
declare job private.coaching_email_tickets%rowtype;
begin
  if p_token_hash is null or p_token_hash!~'^[0-9a-f]{64}$' then raise exception using errcode='22023',message='Invalid attendance ticket.';end if;
  select * into job from private.coaching_email_tickets where id=p_id and state='processing' and lease_token=p_lease_token and lease_until>now() for update;
  if not found or not coalesce((select email_enabled from private.coaching_settings where id),false)
    or not private.coaching_ticket_access(job) or (job.token_hash is not null and job.token_hash<>p_token_hash) then return false;end if;
  update private.coaching_email_tickets set token_hash=p_token_hash where id=job.id;return true;
end;
$$;
revoke all on function public.set_coaching_email_token(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.set_coaching_email_token(uuid,uuid,text) to service_role;
create function public.finish_coaching_email(p_id uuid,p_lease_token uuid,p_outcome text,p_error_code text default '')
returns boolean language plpgsql security definer set search_path='' as $$
declare job private.coaching_email_tickets%rowtype;
begin
  if p_outcome is null or p_outcome not in ('sent','retry') or p_error_code is null or p_error_code not in ('','transport_failure','configuration_error') then raise exception using errcode='22023',message='Invalid attendance email result.';end if;
  select * into job from private.coaching_email_tickets where id=p_id and state='processing' and lease_token=p_lease_token and lease_until>now() for update;
  if not found then return false;end if;
  update private.coaching_email_tickets set state=case when not private.coaching_ticket_access(job) then 'cancelled' when p_outcome='sent' then 'sent' when attempts>=5 then 'failed' else 'pending' end,
    sent_at=case when p_outcome='sent' then now() else sent_at end,error_code=p_error_code,lease_token=null,lease_until=null,
    next_attempt_at=case when p_outcome='retry' then now()+make_interval(secs=>least(7200,30*power(4,greatest(attempts-1,0)))::integer) else next_attempt_at end where id=job.id;
  return true;
end;
$$;
revoke all on function public.finish_coaching_email(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.finish_coaching_email(uuid,uuid,text,text) to service_role;
create function private.require_coaching_ticket(p_ticket_id uuid,p_token text)
returns private.coaching_email_tickets language plpgsql stable security definer set search_path='' as $$
declare job private.coaching_email_tickets%rowtype;
begin
  if p_token is null or p_token!~'^[A-Za-z0-9_-]{43}$' then raise exception using errcode='42501',message='This attendance email is unavailable.';end if;
  select * into job from private.coaching_email_tickets where id=p_ticket_id and token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex');
  if not found or not private.coaching_ticket_access(job) then raise exception using errcode='42501',message='This attendance email is unavailable.';end if;
  return job;
end;
$$;
revoke all on function private.require_coaching_ticket(uuid,text) from public,anon,authenticated;
create function public.read_coaching_email_attendance(p_ticket_id uuid,p_token text)
returns jsonb language sql stable security definer set search_path='' as $$select private.coaching_ticket_projection(private.require_coaching_ticket(p_ticket_id,p_token));$$;
revoke all on function public.read_coaching_email_attendance(uuid,text) from public,anon,authenticated;
grant execute on function public.read_coaching_email_attendance(uuid,text) to service_role;
create function public.save_coaching_email_attendance(p_ticket_id uuid,p_token text,p_rows jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare job private.coaching_email_tickets%rowtype;normal jsonb;payload_hash text;ignored jsonb;
begin
  job:=private.require_coaching_ticket(p_ticket_id,p_token);
  -- Use the same registration-before-ticket lock order as whole-account deletion.
  -- This also serializes concurrent replies from different administrators.
  perform 1 from public.registrations where id in (select (v->>'registrationId')::uuid from jsonb_array_elements(job.roster) v) order by id for update;
  perform 1 from private.coaching_email_tickets where id=p_ticket_id for update;
  job:=private.require_coaching_ticket(p_ticket_id,p_token);
  if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows)<>jsonb_array_length(job.roster) then raise exception using errcode='22023',message='Mark every child in this attendance email.';end if;
  if exists((select v->>'registrationId' from jsonb_array_elements(p_rows) v except select v->>'registrationId' from jsonb_array_elements(job.roster) v))
    or exists((select v->>'registrationId' from jsonb_array_elements(job.roster) v except select v->>'registrationId' from jsonb_array_elements(p_rows) v)) then raise exception using errcode='42501',message='This attendance email is unavailable.';end if;
  select jsonb_agg(value order by value->>'registrationId') into normal from jsonb_array_elements(p_rows);
  payload_hash:=encode(sha256(convert_to(normal::text,'UTF8')),'hex');
  if job.used_at is not null then
    if job.saved_payload_hash=payload_hash then return jsonb_build_object('ok',true,'saved',true,'ticketId',job.id,'count',jsonb_array_length(job.roster));end if;
    raise exception using errcode='40001',message='This email already saved attendance.';
  end if;
  ignored:=private.apply_coaching_attendance(job.session_date,p_rows,null,'Admin');
  -- Recheck after registration locks: deletion/revocation can commit while waiting.
  if not private.coaching_ticket_access(job) then raise exception using errcode='42501',message='This attendance email is unavailable.';end if;
  update private.coaching_email_tickets set used_at=now(),saved_payload_hash=payload_hash where id=job.id;
  return jsonb_build_object('ok',true,'saved',true,'ticketId',job.id,'count',jsonb_array_length(job.roster));
end;
$$;
revoke all on function public.save_coaching_email_attendance(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.save_coaching_email_attendance(uuid,text,jsonb) to service_role;

-- Deletion never reconnects tracker data by email. Scrub child free text and
-- revoke all outstanding roster capabilities atomically with existing archival.
create function private.archive_coaching_tracker()
returns trigger language plpgsql security definer set search_path='' as $$
declare mail text:=lower(coalesce(new.identity_snapshot->>'email',''));
begin
  update private.coaching_email_tickets set state='cancelled',error_code='recipient_revoked',lease_token=null,lease_until=null
    where recipient_email=mail or exists(select 1 from jsonb_array_elements(roster) v join public.registrations r on r.id=(v->>'registrationId')::uuid where r.parent_user_id=new.old_auth_user_id);
  delete from private.coaching_feedback f using public.registrations r where f.registration_id=r.id and r.parent_user_id=new.old_auth_user_id;
  delete from private.coaching_attendance a using public.registrations r where a.registration_id=r.id and r.parent_user_id=new.old_auth_user_id;
  delete from private.coaching_assignments a using public.registrations r where a.registration_id=r.id and r.parent_user_id=new.old_auth_user_id;
  update private.coaching_assignments set coach_email='',weekdays='{}',starts_on=null,revision=revision+1,updated_at=now() where coach_email=mail;
  update private.coaching_attendance set coach_name='Coach' where recorded_by=new.old_auth_user_id;
  update private.coaching_feedback set coach_name='Coach' where written_by=new.old_auth_user_id;
  return new;
end;
$$;
revoke all on function private.archive_coaching_tracker() from public,anon,authenticated;
create trigger archive_coaching_tracker after insert on private.account_deletions for each row execute function private.archive_coaching_tracker();
create function private.wake_coaching_worker()
returns void language plpgsql security definer set search_path='' as $$
declare worker_url text;worker_secret text;
begin
  perform private.enqueue_coaching_attendance_at(now());
  if not coalesce((select email_enabled from private.coaching_settings where id),false)
    or not exists(select 1 from private.coaching_email_tickets where state in ('pending','processing') and next_attempt_at<=now() and expires_at>now())
    or to_regnamespace('net') is null or to_regclass('vault.decrypted_secrets') is null then return;end if;
  execute 'select decrypted_secret from vault.decrypted_secrets where name=$1 limit 1' into worker_url using 'letsaimit_notification_worker_url';
  execute 'select decrypted_secret from vault.decrypted_secrets where name=$1 limit 1' into worker_secret using 'letsaimit_notification_worker_secret';
  if worker_url is null or worker_url!~'^https://[a-z0-9]+[.]supabase[.]co/functions/v1/admin-notifications$' or char_length(coalesce(worker_secret,''))<32 then return;end if;
  worker_url:=replace(worker_url,'/admin-notifications','/coaching-worker');
  perform net.http_post(url:=worker_url,headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||worker_secret),body:='{}'::jsonb,timeout_milliseconds:=145000);
exception when others then return;
end;
$$;
revoke all on function private.wake_coaching_worker() from public,anon,authenticated;
do $$begin
  if to_regnamespace('cron') is not null then
    if not exists(select 1 from cron.job where jobname='letsaimit-coaching-attendance') then
      perform cron.schedule('letsaimit-coaching-attendance','* * * * *','select private.wake_coaching_worker();');
    end if;
  end if;
end;$$;

-- Public intake and the private staff register share one validated persistence path.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema public to anon, authenticated;

create table public.allowed_admins (
  email text primary key check (email = lower(btrim(email)) and email ~ '^[^[:space:]@]+@gmail\.com$'),
  is_owner boolean not null default false,
  created_at timestamptz not null default now(),
  created_by text not null default ''
);

create table public.registrations (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null unique,
  full_name text not null check (char_length(full_name) between 1 and 80),
  email text not null check (char_length(email) <= 254 and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
  phone text not null check (phone ~ '^\+[1-9][0-9]{7,14}$'),
  metadata jsonb not null check (jsonb_typeof(metadata) = 'object'),
  fingerprint text not null check (fingerprint ~ '^[0-9a-f]{64}$'),
  status text not null default 'new' check (status in ('new', 'contacted', 'confirmed', 'closed')),
  notes text not null default '' check (char_length(notes) <= 2000),
  assignee text not null default '' check (char_length(assignee) <= 254),
  revision bigint not null default 1 check (revision between 1 and 9007199254740991),
  created timestamptz not null default now(),
  updated timestamptz not null default now(),
  updated_by text not null default ''
);
create index registrations_created_idx on public.registrations (created desc, id);

alter table public.allowed_admins enable row level security;
alter table public.registrations enable row level security;

create function private.is_allowed_admin()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select (select auth.uid()) is not null
    and coalesce((select auth.jwt()) -> 'app_metadata' ->> 'provider', '') = 'google'
    and exists (
      select 1 from public.allowed_admins
      where email = lower(coalesce((select auth.jwt()) ->> 'email', ''))
    );
$$;
revoke all on function private.is_allowed_admin() from public, anon, authenticated;
grant usage on schema private to authenticated;
grant execute on function private.is_allowed_admin() to authenticated;

create function public.is_admin()
returns boolean
language sql stable security definer set search_path = ''
as $$ select private.is_allowed_admin(); $$;
revoke all on function public.is_admin() from public, anon, authenticated;
grant execute on function public.is_admin() to anon, authenticated;

create function public.registration_health()
returns boolean
language sql stable security invoker set search_path = ''
as $$ select true; $$;
revoke all on function public.registration_health() from public, anon, authenticated;
grant execute on function public.registration_health() to anon, authenticated;

create function private.registration_text(value jsonb, field_name text, maximum integer, optional boolean default false)
returns text
language plpgsql immutable set search_path = ''
as $$
declare cleaned text;
begin
  if optional and (value is null or value = 'null'::jsonb) then return ''; end if;
  if jsonb_typeof(value) is distinct from 'string' then
    raise exception using errcode = '22023', message = 'Please check this registration field.', detail = field_name;
  end if;
  cleaned := btrim(value #>> '{}');
  if (not optional and cleaned = '') or char_length(cleaned) > maximum
    or regexp_replace(cleaned, E'[\n\r\t]', '', 'g') ~ '[[:cntrl:]]' then
    raise exception using errcode = '22023', message = 'Please complete or shorten this registration field.', detail = field_name;
  end if;
  return cleaned;
end;
$$;
revoke all on function private.registration_text(jsonb, text, integer, boolean) from public, anon, authenticated;

create function private.normalized_registration(payload jsonb)
returns jsonb
language plpgsql immutable set search_path = ''
as $$
declare
  meta jsonb;
  form_kind text;
  request_id text;
  age_value text;
  sport_value text;
  email_value text;
  phone_value text;
  country_value text;
begin
  if jsonb_typeof(payload) is distinct from 'object' or octet_length(payload::text) > 16000 then
    raise exception using errcode = '22023', message = 'Please submit the registration form again.';
  end if;
  meta := payload -> 'metadata';
  if jsonb_typeof(meta) is distinct from 'object' then
    raise exception using errcode = '22023', message = 'Please complete the registration form.', detail = 'metadata';
  end if;
  request_id := lower(private.registration_text(meta -> 'submissionId', 'submissionId', 36));
  if request_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    raise exception using errcode = '22023', message = 'Please start a new registration.', detail = 'submissionId';
  end if;
  form_kind := private.registration_text(meta -> 'formType', 'formType', 10);
  if form_kind not in ('trial', 'enrol') then
    raise exception using errcode = '22023', message = 'Choose a trial or registration.', detail = 'formType';
  end if;
  if meta -> 'guardianConsent' is distinct from 'true'::jsonb or meta ->> 'consentVersion' is distinct from '2026-11-09' then
    raise exception using errcode = '22023', message = 'A parent or guardian must accept the current privacy notice.', detail = 'guardianConsent';
  end if;
  if form_kind = 'enrol' and (meta -> 'termsAccepted' is distinct from 'true'::jsonb or meta ->> 'termsVersion' is distinct from '2026-11-05') then
    raise exception using errcode = '22023', message = 'Please accept the programme terms and cancellation policy.', detail = 'termsAccepted';
  end if;
  age_value := private.registration_text(meta -> 'age', 'age', 5);
  if age_value !~ '^([5-9]|1[0-4])$' and not (form_kind = 'trial' and age_value = 'other') then
    raise exception using errcode = '22023', message = 'Choose an age from 5 to 14.', detail = 'age';
  end if;
  sport_value := private.registration_text(meta -> 'sport', 'sport', 30);
  if sport_value not in ('Football', 'Basketball', 'Not sure') then
    raise exception using errcode = '22023', message = 'Choose a sport.', detail = 'sport';
  end if;
  email_value := lower(private.registration_text(payload -> 'email', 'email', 254));
  if email_value !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception using errcode = '22023', message = 'Enter a valid email address.', detail = 'email';
  end if;
  phone_value := private.registration_text(payload -> 'phone', 'phone', 16);
  country_value := private.registration_text(meta -> 'phoneCountry', 'phoneCountry', 2);
  if phone_value !~ '^\+[1-9][0-9]{7,14}$' or country_value !~ '^[A-Z]{2}$'
    or (country_value = 'IN' and phone_value !~ '^\+91[0-9]{10}$') then
    raise exception using errcode = '22023', message = 'Enter a valid phone number for the selected country.', detail = 'phone';
  end if;
  return jsonb_build_object(
    'full_name', private.registration_text(payload -> 'full_name', 'parentName', 80),
    'email', email_value,
    'phone', phone_value,
    'metadata', jsonb_build_object(
      'submissionId', request_id, 'formType', form_kind,
      'childName', case when form_kind = 'enrol' then private.registration_text(meta -> 'childName', 'childName', 80) else '' end,
      'age', age_value, 'community', private.registration_text(meta -> 'community', 'community', 120),
      'sport', sport_value, 'phoneCountry', country_value,
      'address', case when form_kind = 'enrol' then private.registration_text(meta -> 'address', 'address', 500) else '' end,
      'note', case when form_kind = 'enrol' then private.registration_text(meta -> 'note', 'note', 500, true) else '' end,
      'guardianConsent', true, 'termsAccepted', form_kind = 'enrol',
      'consentVersion', '2026-11-09', 'termsVersion', case when form_kind = 'enrol' then '2026-11-05' else '' end
    )
  );
end;
$$;
revoke all on function private.normalized_registration(jsonb) from public, anon, authenticated;

create function private.guard_registration()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare normalized jsonb;
begin
  if tg_op = 'INSERT' then
    normalized := private.normalized_registration(jsonb_build_object('full_name', new.full_name, 'email', new.email, 'phone', new.phone, 'metadata', new.metadata));
    new.id := gen_random_uuid();
    new.full_name := normalized ->> 'full_name';
    new.email := normalized ->> 'email';
    new.phone := normalized ->> 'phone';
    new.metadata := normalized -> 'metadata';
    new.submission_id := (new.metadata ->> 'submissionId')::uuid;
    new.fingerprint := encode(sha256(convert_to(normalized::text, 'UTF8')), 'hex');
    new.status := 'new'; new.notes := ''; new.assignee := ''; new.revision := 1;
    new.created := now(); new.updated := new.created; new.updated_by := '';
  else
    if not private.is_allowed_admin() then
      raise exception using errcode = '42501', message = 'Admin access is required.';
    end if;
    if row(new.id, new.submission_id, new.full_name, new.email, new.phone, new.metadata, new.fingerprint, new.created, new.revision)
      is distinct from row(old.id, old.submission_id, old.full_name, old.email, old.phone, old.metadata, old.fingerprint, old.created, old.revision) then
      raise exception using errcode = '42501', message = 'Only follow-up status, notes and assignee may be edited.';
    end if;
    new.notes := private.registration_text(to_jsonb(new.notes), 'notes', 2000, true);
    new.assignee := private.registration_text(to_jsonb(new.assignee), 'assignee', 254, true);
    new.revision := old.revision + 1;
    new.updated := now();
    new.updated_by := lower(auth.jwt() ->> 'email');
  end if;
  return new;
end;
$$;
revoke all on function private.guard_registration() from public, anon, authenticated;
create trigger guard_registration before insert or update on public.registrations
for each row execute function private.guard_registration();

create function public.submit_registration(payload jsonb)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  normalized jsonb;
  request_id uuid;
  expected_fingerprint text;
  saved public.registrations%rowtype;
  is_duplicate boolean := false;
begin
  normalized := private.normalized_registration(payload);
  request_id := (normalized -> 'metadata' ->> 'submissionId')::uuid;
  expected_fingerprint := encode(sha256(convert_to(normalized::text, 'UTF8')), 'hex');
  insert into public.registrations (full_name, email, phone, metadata)
  values (normalized ->> 'full_name', normalized ->> 'email', normalized ->> 'phone', normalized -> 'metadata')
  on conflict (submission_id) do nothing returning * into saved;
  if not found then
    select * into strict saved from public.registrations where submission_id = request_id;
    if saved.fingerprint <> expected_fingerprint then
      raise exception using errcode = 'PT409', message = 'These details have changed. Start a new registration.', detail = 'SUBMISSION_CONFLICT';
    end if;
    is_duplicate := true;
  end if;
  return jsonb_build_object('ok', true, 'submissionId', saved.submission_id, 'savedAt', saved.created, 'duplicate', is_duplicate, 'id', saved.id);
end;
$$;
revoke all on function public.submit_registration(jsonb) from public, anon, authenticated;
grant execute on function public.submit_registration(jsonb) to anon, authenticated;

create function private.guard_allowed_admins()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare app_request boolean := coalesce(current_setting('role', true), '') in ('anon', 'authenticated');
begin
  perform pg_advisory_xact_lock(hashtext('letsaimit.allowed_admins'));
  if app_request and not private.is_allowed_admin() then
    raise exception using errcode = '42501', message = 'Admin access is required.';
  end if;
  if tg_op = 'DELETE' then
    if old.is_owner then
      raise exception using errcode = '42501', message = 'The owner admin cannot be removed.';
    end if;
    if (select count(*) from public.allowed_admins) <= 1 then
      raise exception using errcode = '42501', message = 'At least one admin must remain.';
    end if;
    return old;
  end if;
  if tg_op = 'UPDATE' and app_request then
    raise exception using errcode = '42501', message = 'Remove and add the admin email to change access.';
  end if;
  new.email := lower(btrim(new.email));
  if app_request then
    new.is_owner := false;
    new.created_at := now();
    new.created_by := lower(auth.jwt() ->> 'email');
  end if;
  return new;
end;
$$;
revoke all on function private.guard_allowed_admins() from public, anon, authenticated;
create trigger guard_allowed_admins before insert or update or delete on public.allowed_admins
for each row execute function private.guard_allowed_admins();

revoke all on public.registrations, public.allowed_admins from public, anon, authenticated;
grant insert (full_name, email, phone, metadata) on public.registrations to anon;
grant select on public.registrations to authenticated;
grant update (status, notes, assignee) on public.registrations to authenticated;
grant delete on public.registrations to authenticated;
grant select on public.allowed_admins to authenticated;
grant insert (email) on public.allowed_admins to authenticated;
grant delete on public.allowed_admins to authenticated;

-- Explicit public INSERT matches the intake requirement. The mandatory trigger
-- validates all fields and consent even when callers bypass the receipt RPC.
create policy registrations_public_create on public.registrations
for insert to anon with check (true);
create policy registrations_admin_read on public.registrations
for select to authenticated using ((select private.is_allowed_admin()));
create policy registrations_admin_update on public.registrations
for update to authenticated
using ((select private.is_allowed_admin())) with check ((select private.is_allowed_admin()));
create policy registrations_admin_delete on public.registrations
for delete to authenticated using ((select private.is_allowed_admin()));
create policy allowed_admins_read on public.allowed_admins
for select to authenticated using ((select private.is_allowed_admin()));
create policy allowed_admins_add on public.allowed_admins
for insert to authenticated with check ((select private.is_allowed_admin()));
create policy allowed_admins_remove on public.allowed_admins
for delete to authenticated using ((select private.is_allowed_admin()));

-- Realtime is opt-in and continues to apply the SELECT/RLS authorization above.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.registrations;
  end if;
end;
$$;

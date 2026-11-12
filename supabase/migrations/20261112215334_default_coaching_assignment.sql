-- Select the coach's Google sign-in address separately on each target.
alter table private.coaching_settings add column default_coach_email text
  check (default_coach_email = lower(btrim(default_coach_email))
    and char_length(default_coach_email) <= 254
    and default_coach_email ~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$');

-- PostgreSQL runs same-event triggers in name order. guard_registration first
-- validates the submission and clears any client-supplied follow-up assignee.
create function private.set_default_registration_assignee()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  select default_coach_email into new.assignee
  from private.coaching_settings where id and default_coach_email is not null for share;
  new.assignee := coalesce(new.assignee, '');
  return new;
end;
$$;
revoke all on function private.set_default_registration_assignee() from public, anon, authenticated;

create trigger set_default_registration_assignee before insert on public.registrations
  for each row when (new.assignee = '' and new.metadata->>'formType' = 'enrol')
  execute function private.set_default_registration_assignee();

-- Insert the tracker assignment after the registration exists. Its existing
-- access rules continue to withhold the child until the enrolment is approved.
create function private.record_default_coaching_assignment()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into private.coaching_assignments(registration_id, coach_email, starts_on)
  values (new.id, new.assignee, (new.created at time zone 'Asia/Kolkata')::date)
  on conflict (registration_id) do nothing;
  return new;
end;
$$;
revoke all on function private.record_default_coaching_assignment() from public, anon, authenticated;

create trigger record_default_coaching_assignment after insert on public.registrations
  for each row when (new.assignee <> '' and new.metadata->>'formType' = 'enrol')
  execute function private.record_default_coaching_assignment();

-- Clear this setting before archive_coaching_tracker revokes existing rows.
-- The settings lock above lets that revocation see any in-flight assignment.
create function private.archive_coach_default()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update private.coaching_settings set default_coach_email = null
  where id and default_coach_email = lower(new.identity_snapshot->>'email');
  return new;
end;
$$;
revoke all on function private.archive_coach_default() from public, anon, authenticated;

create trigger archive_coach_default after insert on private.account_deletions
  for each row execute function private.archive_coach_default();

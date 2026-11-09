-- Approved Google admins may invite Gmail accounts and revoke non-owner access.
-- Operator-seeded company Google identities remain valid existing members.
-- No identity is seeded by this migration.
create or replace function private.guard_allowed_admins()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  app_request boolean := coalesce(current_setting('role', true), '') in ('anon', 'authenticated');
  local_part text;
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
    local_part := split_part(new.email, '@', 1);
    if new.email is null or char_length(new.email) > 254
      or char_length(local_part) > 64
      or new.email !~ '^[a-z0-9.!#$%&''*+/=?^_`{|}~-]+@gmail[.]com$'
      or left(local_part, 1) = '.' or right(local_part, 1) = '.'
      or position('..' in local_part) > 0 then
      raise exception using errcode = '22023', message = 'Enter a valid Gmail address.', detail = 'email';
    end if;
    new.is_owner := false;
    new.created_at := now();
    new.created_by := lower(auth.jwt() ->> 'email');
  end if;
  return new;
end;
$$;
revoke all on function private.guard_allowed_admins() from public, anon, authenticated;

-- An app cannot forge audit fields, promote an owner or rename an identity.
revoke insert, update on public.allowed_admins from public, anon, authenticated;
revoke insert (email, is_owner, created_at, created_by),
  update (email, is_owner, created_at, created_by)
  on public.allowed_admins from public, anon, authenticated;
grant insert (email) on public.allowed_admins to authenticated;
grant delete on public.allowed_admins to authenticated;

create policy allowed_admins_add on public.allowed_admins
for insert to authenticated with check (
  (select private.is_allowed_admin()) and email ~ '@gmail[.]com$'
);
create policy allowed_admins_remove on public.allowed_admins
for delete to authenticated using ((select private.is_allowed_admin()));

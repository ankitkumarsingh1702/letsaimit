-- Operator-only step, after the schema migration, in this UAT project's SQL editor.
-- Replace the placeholder locally with the exact owner Gmail. Do not commit it.
-- Do not run through the browser client or change RLS/grants to make this work.
do $bootstrap_owner$
declare
  owner_email text := 'REPLACE_WITH_OWNER_GMAIL';
begin
  owner_email := lower(btrim(owner_email));
  if owner_email !~ '^[^[:space:]@]+@gmail\.com$' then
    raise exception 'Replace the owner placeholder with the exact Gmail address before running this operator step.';
  end if;
  if exists (select 1 from public.allowed_admins where is_owner and email <> owner_email) then
    raise exception 'An owner already exists. Review owner changes as a separate privileged operation.';
  end if;
  insert into public.allowed_admins (email, is_owner, created_by)
  values (owner_email, true, 'operator bootstrap')
  on conflict (email) do update set is_owner = true;
end;
$bootstrap_owner$;

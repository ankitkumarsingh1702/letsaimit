-- Read-only, BEFORE the ordered migrations. Supply both refs from release-targets.json:
-- SET letsaimit.production_ref = '<production ref>';
-- SET letsaimit.uat_ref = '<uat ref>';
-- The operator must also select that exact production project/remote endpoint.
begin read only;
do $preflight$
declare production_ref text:=current_setting('letsaimit.production_ref',true);
  uat_ref text:=current_setting('letsaimit.uat_ref',true);
begin
  if production_ref is null or production_ref!~'^[a-z0-9]{20}$'
    or uat_ref is null or uat_ref!~'^[a-z0-9]{20}$' or production_ref=uat_ref then
    raise exception 'FRESH_BACKEND_TARGET_REQUIRED';
  end if;
  if to_regclass('auth.users') is null or not exists(select 1 from pg_roles where rolname='service_role') then
    raise exception 'FRESH_BACKEND_PLATFORM_MISSING';
  end if;
  if exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname in ('public','private') and c.relkind in ('r','p')) then
    raise exception 'FRESH_BACKEND_APP_SCHEMA_NOT_EMPTY';
  end if;
  if exists(select 1 from auth.users) then raise exception 'FRESH_BACKEND_AUTH_NOT_EMPTY';end if;
end;
$preflight$;
select 'fresh_preflight_passed' as result,
  current_setting('letsaimit.production_ref') as expected_project_ref,
  'operator_must_verify_actual_remote_endpoint' as connection_verification;
select name,installed_version from pg_available_extensions
  where name in ('pg_net','pg_cron','supabase_vault') order by name;
commit;

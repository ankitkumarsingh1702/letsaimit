-- The wrapper needs no elevated rights. Its private lookup retains the narrow
-- definer boundary used by the existing RLS policies.
alter function public.is_admin() security invoker;
revoke execute on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

-- Supabase's optional dashboard-created event trigger runs as its owner.
-- It does not need a callable Data API endpoint or grants to application roles.
do $$
begin
  if pg_catalog.to_regprocedure('public.rls_auto_enable()') is not null then
    execute 'revoke execute on function public.rls_auto_enable() from public, anon, authenticated';
  end if;
end;
$$;

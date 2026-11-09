-- Google identities can use Gmail or a company domain. Membership still comes
-- exclusively from this operator-maintained table, not a browser role choice.
-- The approved identities are configured separately, outside public source.
alter table public.allowed_admins
  drop constraint allowed_admins_email_check;
alter table public.allowed_admins
  add constraint allowed_admins_email_check check (
    email = lower(btrim(email))
    and char_length(email) <= 254
    and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  );

-- Table and column grants are independent: the original INSERT(email) grant
-- must be revoked explicitly, along with any direct column UPDATE grants.
revoke insert, update, delete on public.allowed_admins
  from public, anon, authenticated;
revoke insert (email, is_owner, created_at, created_by),
  update (email, is_owner, created_at, created_by)
  on public.allowed_admins from public, anon, authenticated;

drop policy if exists allowed_admins_add on public.allowed_admins;
drop policy if exists allowed_admins_remove on public.allowed_admins;

-- Keep the Google/provider + current-membership read policy, private lookup,
-- protected-owner trigger and registration permissions unchanged. Applying
-- this migration alone neither grants access to a new identity nor seeds data.

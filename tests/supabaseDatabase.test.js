import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";

const migrationDirectory = new URL("../supabase/migrations/", import.meta.url);
const migrationNames = (await readdir(migrationDirectory)).filter(name => name.endsWith(".sql")).sort();
const migrations = await Promise.all(migrationNames.map(name => readFile(new URL(name, migrationDirectory), "utf8")));
const ownerEmail = "owner@example.com";
const secondEmail = "second@company.test";
const invitedEmail = "invited.admin@gmail.com";
const invitedId = "10000000-0000-4000-8000-000000000003";
const ownerId = "10000000-0000-4000-8000-000000000001";
const secondId = "10000000-0000-4000-8000-000000000002";

function payload(formType = "trial") {
  return {
    full_name: 'Synthetic Parent, "Test"', email: " PARENT@example.test ", phone: "+919876543210",
    metadata: {
      submissionId: randomUUID(), formType, childName: "Synthetic Child", age: "14",
      community: "Nambiar Ellegenza", sport: "Basketball", phoneCountry: "IN",
      address: "Synthetic address", note: "=literal note\r\n第二行",
      guardianConsent: true, termsAccepted: formType === "enrol",
      consentVersion: "2026-11-09", termsVersion: formType === "enrol" ? "2026-11-05" : "",
    },
  };
}

test("Supabase migration validates persistence, RLS, idempotency and controlled admin invitations in PostgreSQL", async context => {
  const database = new PGlite();
  context.after(() => database.close());
  // Supabase Auth normally supplies these functions and roles. The test supplies
  // signed-claim fixtures to exercise database authorization, not Google login.
  await database.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin;
    create schema auth;
    create table auth.users (id uuid primary key);
    insert into auth.users (id) values ('10000000-0000-4000-8000-000000000001'), ('10000000-0000-4000-8000-000000000002'), ('10000000-0000-4000-8000-000000000003');
    create function auth.jwt() returns jsonb language sql stable as $$
      select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb;
    $$;
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(auth.jwt() ->> 'sub', '')::uuid;
    $$;
    grant usage on schema auth to anon, authenticated;
    grant execute on function auth.jwt(), auth.uid() to anon, authenticated;
  `);
  await database.exec(`
    create function public.rls_auto_enable() returns event_trigger
    language plpgsql security definer as $$
    begin
      perform set_config('test.auto_rls_event_ran', 'yes', false);
    end;
    $$;
    create event trigger test_auto_rls on ddl_command_end
      when tag in ('CREATE TABLE') execute function public.rls_auto_enable();
  `);
  for (const migration of migrations) await database.exec(migration);
  await database.query("insert into public.allowed_admins (email, is_owner) values ($1, true)", [ownerEmail]);

  async function asRole(role, claims, operation) {
    assert.ok(["anon", "authenticated"].includes(role));
    await database.query("select set_config('request.jwt.claims', $1, false)", [JSON.stringify(claims)]);
    await database.exec(`set role ${role}`);
    try { return await operation(); }
    finally {
      await database.exec("reset role");
      await database.query("select set_config('request.jwt.claims', '{}', false)");
    }
  }
  const google = (email = ownerEmail, sub = ownerId) => ({ sub, email, app_metadata: { provider: "google" } });
  const submit = async input => (await database.query("select public.submit_registration($1::jsonb) as receipt", [JSON.stringify(input)])).rows[0].receipt;
  let receipt;
  const first = payload("enrol");

  await context.test("health RPC returns only availability and no register data", async () => {
    assert.deepEqual((await asRole("anon", {}, () => database.query("select public.registration_health() as healthy"))).rows, [{ healthy: true }]);
  });

  await context.test("Google-authenticated RPC commits canonical data and returns only a safe receipt", async () => {
    receipt = await asRole("authenticated", google(), () => submit(first));
    assert.equal(receipt.ok, true);
    assert.equal(receipt.submissionId, first.metadata.submissionId);
    assert.equal(receipt.duplicate, false);
    assert.ok(Number.isFinite(Date.parse(receipt.savedAt)));
    assert.deepEqual(Object.keys(receipt).sort(), ["duplicate", "id", "ok", "savedAt", "submissionId"]);
    const stored = (await database.query("select * from public.registrations where id = $1", [receipt.id])).rows[0];
    assert.equal(stored.email, "parent@example.test");
    assert.equal(stored.metadata.note, first.metadata.note);
    assert.equal(stored.metadata.termsVersion, "2026-11-05");
    assert.equal(stored.metadata.consentVersion, "2026-11-09");
    assert.equal(Number(stored.revision), 1);
  });

  await context.test("anonymous requests cannot select or update saved parent records", async () => {
    await asRole("anon", {}, async () => {
      await assert.rejects(database.query("select * from public.registrations"), { code: "42501" });
      await assert.rejects(database.query("update public.registrations set notes = 'forged' where id = $1", [receipt.id]), { code: "42501" });
      await assert.rejects(database.query("select * from public.allowed_admins"), { code: "42501" });
    });
  });

  await context.test("anonymous submission and direct INSERT are no longer accepted", async () => {
    const input = payload();
    await asRole("anon", {}, async () => {
      await assert.rejects(submit(input), { code: "42501" });
      await assert.rejects(database.query("insert into public.registrations (full_name,email,phone,metadata) values ($1,$2,$3,$4::jsonb)", [input.full_name,input.email,input.phone,JSON.stringify(input.metadata)]), { code: "42501" });
    });
    await asRole("authenticated", google(), () => assert.rejects(database.query("insert into public.registrations (full_name,email,phone,metadata) values ($1,$2,$3,$4::jsonb)", [input.full_name,input.email,input.phone,JSON.stringify(input.metadata)]), { code: "42501" }));
  });

  await context.test("same-ID retry returns the existing row and changed details conflict", async () => {
    const retry = await asRole("authenticated", google(), () => submit(first));
    assert.deepEqual(retry, { ...receipt, duplicate: true });
    await asRole("authenticated", google(), () => assert.rejects(submit({ ...first, full_name: "Changed" }), { code: "PT409" }));
    assert.equal((await database.query("select count(*)::int as count from public.registrations where submission_id = $1", [first.metadata.submissionId])).rows[0].count, 1);
  });

  await context.test("parallel save calls retain independent IDs and deduplicate repeated IDs", async () => {
    const repeated = payload();
    const results = await asRole("authenticated", google(), () => Promise.all([repeated, repeated, payload()].map(submit)));
    assert.equal(results[0].id, results[1].id);
    assert.equal(results.filter(result => result.duplicate).length, 1);
    assert.notEqual(results[0].id, results[2].id);
  });

  await context.test("server validation covers the current consent, terms, age and enrolment fields", async () => {
    for (const [field, value] of [["guardianConsent", false], ["consentVersion", "2026-11-05"], ["termsVersion", "old"], ["termsAccepted", false], ["age", "15"], ["sport", "unknown"], ["childName", ""], ["address", ""]]) {
      const input = payload("enrol");
      input.metadata[field] = value;
      await asRole("authenticated", google(), () => assert.rejects(submit(input), { code: "22023" }));
    }
    const other = payload();
    other.metadata.age = "other";
    assert.equal((await asRole("authenticated", google(), () => submit(other))).ok, true);
  });

  await context.test("Google identity, current allowlist and non-null user ID are all required", async () => {
    for (const claims of [google("outsider@example.test", secondId), { email: ownerEmail, app_metadata: { provider: "google" } }, { sub: ownerId, email: ownerEmail, app_metadata: { provider: "email" }, user_metadata: { provider: "google", admin: true } }]) {
      await asRole("authenticated", claims, async () => {
        assert.equal((await database.query("select public.is_admin() as allowed")).rows[0].allowed, false);
        assert.equal((await database.query("select * from public.registrations")).rows.length, 0);
        await assert.rejects(database.query("insert into public.allowed_admins (email) values ('intruder@example.test')"), { code: "42501" });
      });
    }
    assert.equal((await asRole("authenticated", google(), () => database.query("select public.is_admin() as allowed"))).rows[0].allowed, true);
  });

  await context.test("authorized edits bump revisions and preserve immutable submission data", async () => {
    await asRole("authenticated", google(), async () => {
      const updated = await database.query("update public.registrations set status='contacted', notes=$1 where id=$2 and revision=1 returning *", ["Synthetic follow-up", receipt.id]);
      assert.equal(updated.rows.length, 1);
      assert.equal(Number(updated.rows[0].revision), 2);
      assert.equal(updated.rows[0].updated_by, ownerEmail);
      assert.equal(updated.rows[0].full_name, first.full_name);
      assert.equal(updated.rows[0].metadata.submissionId, first.metadata.submissionId);
      const stale = await database.query("update public.registrations set notes='stale' where id=$1 and revision=1 returning id", [receipt.id]);
      assert.equal(stale.rows.length, 0);
      await assert.rejects(database.query("update public.registrations set full_name='Changed' where id=$1", [receipt.id]), { code: "42501" });
    });
    assert.equal((await asRole("authenticated", google(), () => submit(first))).duplicate, true);
  });

  await context.test("operator-seeded company Google identities remain valid members", async () => {
    await database.query("insert into public.allowed_admins (email, created_by) values ($1, 'operator test')", [` ${secondEmail.toUpperCase()} `]);
    const added = (await database.query("select * from public.allowed_admins where email=$1", [secondEmail])).rows[0];
    assert.equal(added.email, secondEmail);
    assert.equal(added.is_owner, false);
    assert.equal(added.created_by, "operator test");
    assert.equal((await asRole("authenticated", google(secondEmail, secondId), () => database.query("select public.is_admin() as allowed"))).rows[0].allowed, true);
    assert.ok((await asRole("authenticated", google(secondEmail, secondId), () => database.query("select id from public.registrations"))).rows.length > 0);
    await assert.rejects(database.query("insert into public.allowed_admins (email) values ('not-an-email')"), { code: "23514" });
    // Owner protection remains a database boundary even for privileged callers.
    await assert.rejects(database.query("delete from public.allowed_admins where email=$1", [ownerEmail]), { code: "42501" });
  });

  await context.test("current Google admins can invite normalized Gmail accounts with server-owned audit fields", async () => {
    // A current company-domain Google member can also invite, not just an owner.
    await asRole("authenticated", google(secondEmail, secondId), async () => {
      const inserted = await database.query("insert into public.allowed_admins (email) values ($1) returning *", [` ${invitedEmail.toUpperCase()} `]);
      assert.equal(inserted.rows[0].email, invitedEmail);
      assert.equal(inserted.rows[0].is_owner, false);
      assert.equal(inserted.rows[0].created_by, secondEmail);
      assert.ok(Number.isFinite(Date.parse(inserted.rows[0].created_at)));
      await assert.rejects(database.query("insert into public.allowed_admins (email) values ($1)", [invitedEmail.toUpperCase()]), { code: "23505" });
      for (const email of ["new@company.test", "not-an-email", "user@gmail.com.evil.test", ".user@gmail.com", "user.@gmail.com", "user..name@gmail.com", "bad\\u0001@gmail.com", "x".repeat(65) + "@gmail.com"]) {
        const input = email.replace("\\u0001", "\u0001");
        await assert.rejects(database.query("insert into public.allowed_admins (email) values ($1)", [input]), { code: "22023" });
      }
    });
    assert.equal((await asRole("authenticated", google(invitedEmail, invitedId), () => database.query("select public.is_admin() as allowed"))).rows[0].allowed, true);
    await asRole("authenticated", google(invitedEmail, invitedId), async () => {
      // Invited admins receive the same controlled invite/revoke capability.
      await database.query("insert into public.allowed_admins (email) values ('nested.invite@gmail.com')");
      await database.query("delete from public.allowed_admins where email='nested.invite@gmail.com'");
    });
  });

  await context.test("admin invitation grants exclude owner promotion, audit forgery and identity updates", async () => {
    await asRole("authenticated", google(), async () => {
      await assert.rejects(database.query("insert into public.allowed_admins (email,is_owner) values ('forged@gmail.com',true)"), { code: "42501" });
      await assert.rejects(database.query("insert into public.allowed_admins (email,created_by) values ('forged@gmail.com','someone else')"), { code: "42501" });
      await assert.rejects(database.query("update public.allowed_admins set email='changed@gmail.com' where email=$1", [secondEmail]), { code: "42501" });
      await assert.rejects(database.query("update public.allowed_admins set is_owner=true where email=$1", [secondEmail]), { code: "42501" });
      await assert.rejects(database.query("delete from public.allowed_admins where email=$1", [ownerEmail]), { code: "42501" });
    });
    const privileges = await database.query(`
      select has_table_privilege('authenticated', 'public.allowed_admins', 'select') as can_read,
        has_table_privilege('authenticated', 'public.allowed_admins', 'insert') as can_insert_any_column,
        has_column_privilege('authenticated', 'public.allowed_admins', 'email', 'insert') as can_invite_email,
        has_column_privilege('authenticated', 'public.allowed_admins', 'is_owner', 'insert') as can_set_owner,
        has_any_column_privilege('authenticated', 'public.allowed_admins', 'update') as can_update,
        has_table_privilege('authenticated', 'public.allowed_admins', 'delete') as can_delete
    `);
    assert.deepEqual(privileges.rows[0], { can_read: true, can_insert_any_column: false, can_invite_email: true, can_set_owner: false, can_update: false, can_delete: true });
    const policies = await database.query("select polcmd from pg_policy where polrelid='public.allowed_admins'::regclass order by polcmd");
    assert.deepEqual(policies.rows, [{ polcmd: "a" }, { polcmd: "d" }, { polcmd: "r" }]);
  });

  await context.test("anonymous and unlisted Google accounts cannot invite or remove members", async () => {
    await asRole("anon", {}, async () => {
      await assert.rejects(database.query("insert into public.allowed_admins (email) values ('outsider@gmail.com')"), { code: "42501" });
      await assert.rejects(database.query("delete from public.allowed_admins where email=$1", [invitedEmail]), { code: "42501" });
    });
    await asRole("authenticated", google("outsider@gmail.com", invitedId), async () => {
      await assert.rejects(database.query("insert into public.allowed_admins (email) values ('outsider@gmail.com')"), { code: "42501" });
      assert.deepEqual((await database.query("delete from public.allowed_admins where email=$1 returning email", [invitedEmail])).rows, []);
      assert.deepEqual((await database.query("select email from public.allowed_admins")).rows, []);
    });
  });

  await context.test("admin revocation denies an invited Gmail even with its stale Google JWT", async () => {
    const removed = await asRole("authenticated", google(), () => database.query("delete from public.allowed_admins where email=$1 returning email", [invitedEmail]));
    assert.deepEqual(removed.rows, [{ email: invitedEmail }]);
    await asRole("authenticated", google(invitedEmail, invitedId), async () => {
      assert.equal((await database.query("select public.is_admin() as allowed")).rows[0].allowed, false);
      assert.equal((await database.query("select * from public.registrations")).rows.length, 0);
      await assert.rejects(database.query("insert into public.allowed_admins (email) values ('new.invite@gmail.com')"), { code: "42501" });
      assert.deepEqual((await database.query("delete from public.allowed_admins where email=$1 returning email", [ownerEmail])).rows, []);
    });
  });

  await context.test("operator revocation denies a company account even with the same stale Google JWT", async () => {
    await database.query("delete from public.allowed_admins where email=$1", [secondEmail]);
    await asRole("authenticated", google(secondEmail, secondId), async () => {
      assert.equal((await database.query("select public.is_admin() as allowed")).rows[0].allowed, false);
      assert.equal((await database.query("select * from public.registrations")).rows.length, 0);
      assert.equal((await database.query("select * from public.allowed_admins")).rows.length, 0);
      assert.equal((await database.query("update public.registrations set notes='revoked' where id=$1 returning id", [receipt.id])).rows.length, 0);
      await assert.rejects(database.query("insert into public.allowed_admins (email) values ($1)", [secondEmail]), { code: "42501" });
    });
  });

  await context.test("only allowlisted Google admins can delete registration records", async () => {
    const saved = await asRole("authenticated", google(), () => submit(payload()));
    await asRole("anon", {}, () => assert.rejects(database.query("delete from public.registrations where id=$1", [saved.id]), { code: "42501" }));
    await asRole("authenticated", google("outsider@gmail.com", secondId), async () => {
      const denied = await database.query("delete from public.registrations where id=$1 returning id", [saved.id]);
      assert.equal(denied.rows.length, 0);
    });
    const removed = await asRole("authenticated", google(), () => database.query("delete from public.registrations where id=$1 returning id", [saved.id]));
    assert.deepEqual(removed.rows, [{ id: saved.id }]);
    assert.equal((await database.query("select count(*)::int as count from public.registrations where id=$1", [saved.id])).rows[0].count, 0);
  });

  await context.test("private helpers cannot be invoked as public validation or data endpoints", async () => {
    await asRole("anon", {}, async () => {
      await assert.rejects(database.query("select public.is_admin()"), { code: "42501" });
      await assert.rejects(database.query("select private.normalized_registration($1::jsonb)", [JSON.stringify(payload())]), { code: "42501" });
    });
  });

  await context.test("admin wrapper is invoker-only and dashboard event trigger remains usable", async () => {
    const mode = await database.query("select prosecdef from pg_proc where oid='public.is_admin()'::regprocedure");
    assert.equal(mode.rows[0].prosecdef, false);
    const permissions = await database.query(`
      select has_function_privilege('anon', 'public.is_admin()', 'execute') as anonymous_admin,
        has_function_privilege('authenticated', 'public.is_admin()', 'execute') as signed_in_admin,
        has_function_privilege('anon', 'public.rls_auto_enable()', 'execute') as anonymous_trigger,
        has_function_privilege('authenticated', 'public.rls_auto_enable()', 'execute') as signed_in_trigger
    `);
    assert.deepEqual(permissions.rows[0], { anonymous_admin: false, signed_in_admin: true, anonymous_trigger: false, signed_in_trigger: false });
    await database.exec("select set_config('test.auto_rls_event_ran', 'no', false); create table public.auto_rls_probe (id integer)");
    assert.equal((await database.query("select current_setting('test.auto_rls_event_ran') as ran")).rows[0].ran, "yes");
    await database.exec("drop table public.auto_rls_probe");
  });

  await context.test("the database also protects the last non-owner admin", async () => {
    // Privileged SQL is the documented recovery boundary for changing owners.
    await database.query("update public.allowed_admins set is_owner=false where email=$1", [ownerEmail]);
    await asRole("authenticated", google(), () => assert.rejects(database.query("delete from public.allowed_admins where email=$1", [ownerEmail]), { code: "42501" }));
    await assert.rejects(database.query("delete from public.allowed_admins where email=$1", [ownerEmail]), { code: "42501" });
    assert.equal((await database.query("select count(*)::int as count from public.allowed_admins")).rows[0].count, 1);
  });
});

test("function privilege cleanup supports projects without the optional dashboard trigger", async context => {
  const database = new PGlite();
  context.after(() => database.close());
  await database.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create function public.is_admin() returns boolean language sql security definer as $$ select false; $$;
  `);
  const cleanupIndex = migrationNames.indexOf("20261109083344_registration_function_privileges.sql");
  assert.notEqual(cleanupIndex, -1);
  await database.exec(migrations[cleanupIndex]);
  assert.equal((await database.query("select to_regprocedure('public.rls_auto_enable()') as trigger_function")).rows[0].trigger_function, null);
  await assert.rejects(database.exec("set role anon; select public.is_admin()"), { code: "42501" });
});

test("membership lockdown upgrades existing Gmail rows and revokes legacy column grants", async context => {
  const database = new PGlite();
  context.after(() => database.close());
  await database.exec(`
    create role anon nologin;
    create role authenticated nologin;
    grant usage on schema public to anon, authenticated;
    create table public.allowed_admins (
      email text primary key check (email = lower(btrim(email)) and email ~ '^[^[:space:]@]+@gmail\\.com$'),
      is_owner boolean not null default false,
      created_at timestamptz not null default now(),
      created_by text not null default ''
    );
    insert into public.allowed_admins (email,is_owner) values ('legacy.owner@gmail.com',true);
    alter table public.allowed_admins enable row level security;
    grant select, delete on public.allowed_admins to authenticated;
    grant insert (email), update (email) on public.allowed_admins to authenticated;
    create policy allowed_admins_read on public.allowed_admins for select to authenticated using (true);
    create policy allowed_admins_add on public.allowed_admins for insert to authenticated with check (true);
    create policy allowed_admins_remove on public.allowed_admins for delete to authenticated using (true);
  `);
  assert.equal((await database.query("select has_any_column_privilege('authenticated','public.allowed_admins','insert') as allowed")).rows[0].allowed, true);
  const lockIndex = migrationNames.findIndex(name => name.endsWith("_lock_admin_membership_to_operator.sql"));
  assert.notEqual(lockIndex, -1);
  await database.exec(migrations[lockIndex]);
  assert.deepEqual((await database.query("select email,is_owner from public.allowed_admins")).rows, [{ email: "legacy.owner@gmail.com", is_owner: true }]);
  await database.query("insert into public.allowed_admins (email) values ($1)", [secondEmail]);
  const privileges = await database.query(`
    select has_any_column_privilege('authenticated','public.allowed_admins','insert') as can_insert,
      has_any_column_privilege('authenticated','public.allowed_admins','update') as can_update,
      has_table_privilege('authenticated','public.allowed_admins','delete') as can_delete
  `);
  assert.deepEqual(privileges.rows[0], { can_insert: false, can_update: false, can_delete: false });
  await database.exec("set role authenticated");
  assert.equal((await database.query("select email from public.allowed_admins")).rows.length, 2);
  await assert.rejects(database.query("insert into public.allowed_admins (email) values ('new@company.test')"), { code: "42501" });
  await assert.rejects(database.query("update public.allowed_admins set email='renamed@company.test' where email=$1", [secondEmail]), { code: "42501" });
  await assert.rejects(database.query("delete from public.allowed_admins where email=$1", [secondEmail]), { code: "42501" });
});

import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";

const migration = await readFile(new URL("../supabase/migrations/20261109080830_registration_register.sql", import.meta.url), "utf8");
const ownerEmail = "owner@gmail.com";
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

test("Supabase migration validates persistence, RLS, idempotency and admin management in PostgreSQL", async context => {
  const database = new PGlite();
  context.after(() => database.close());
  // Supabase Auth normally supplies these functions and roles. The test supplies
  // signed-claim fixtures to exercise database authorization, not Google login.
  await database.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create schema auth;
    create function auth.jwt() returns jsonb language sql stable as $$
      select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb;
    $$;
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(auth.jwt() ->> 'sub', '')::uuid;
    $$;
    grant usage on schema auth to anon, authenticated;
    grant execute on function auth.jwt(), auth.uid() to anon, authenticated;
  `);
  await database.exec(migration);
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

  await context.test("anonymous RPC commits canonical data and returns only a safe receipt", async () => {
    receipt = await asRole("anon", {}, () => submit(first));
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

  await context.test("public direct INSERT is validated and cannot set internal fields", async () => {
    const input = payload();
    await asRole("anon", {}, async () => {
      await database.query("insert into public.registrations (full_name, email, phone, metadata) values ($1,$2,$3,$4::jsonb)", [input.full_name, input.email, input.phone, JSON.stringify(input.metadata)]);
      const invalid = payload();
      invalid.metadata.guardianConsent = false;
      await assert.rejects(database.query("insert into public.registrations (full_name,email,phone,metadata) values ($1,$2,$3,$4::jsonb)", [invalid.full_name, invalid.email, invalid.phone, JSON.stringify(invalid.metadata)]), { code: "22023" });
      await assert.rejects(database.query("insert into public.registrations (full_name,email,phone,metadata,status) values ($1,$2,$3,$4::jsonb,'confirmed')", [input.full_name, input.email, input.phone, JSON.stringify(input.metadata)]), { code: "42501" });
    });
  });

  await context.test("same-ID retry returns the existing row and changed details conflict", async () => {
    const retry = await asRole("anon", {}, () => submit(first));
    assert.deepEqual(retry, { ...receipt, duplicate: true });
    await asRole("anon", {}, () => assert.rejects(submit({ ...first, full_name: "Changed" }), { code: "PT409" }));
    assert.equal((await database.query("select count(*)::int as count from public.registrations where submission_id = $1", [first.metadata.submissionId])).rows[0].count, 1);
  });

  await context.test("parallel save calls retain independent IDs and deduplicate repeated IDs", async () => {
    const repeated = payload();
    const results = await asRole("anon", {}, () => Promise.all([repeated, repeated, payload()].map(submit)));
    assert.equal(results[0].id, results[1].id);
    assert.equal(results.filter(result => result.duplicate).length, 1);
    assert.notEqual(results[0].id, results[2].id);
  });

  await context.test("server validation covers the current consent, terms, age and enrolment fields", async () => {
    for (const [field, value] of [["guardianConsent", false], ["consentVersion", "2026-11-05"], ["termsVersion", "old"], ["termsAccepted", false], ["age", "15"], ["sport", "unknown"], ["childName", ""], ["address", ""]]) {
      const input = payload("enrol");
      input.metadata[field] = value;
      await asRole("anon", {}, () => assert.rejects(submit(input), { code: "22023" }));
    }
    const other = payload();
    other.metadata.age = "other";
    assert.equal((await asRole("anon", {}, () => submit(other))).ok, true);
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
    assert.equal((await asRole("anon", {}, () => submit(first))).duplicate, true);
  });

  await context.test("admins can share and revoke access without trusting stale JWT role metadata", async () => {
    await asRole("authenticated", google(), async () => {
      await database.query("insert into public.allowed_admins (email) values (' SECOND@gmail.com ')");
      const added = (await database.query("select * from public.allowed_admins where email='second@gmail.com'")).rows[0];
      assert.equal(added.is_owner, false);
      assert.equal(added.created_by, ownerEmail);
      await assert.rejects(database.query("insert into public.allowed_admins (email,is_owner) values ('forged@gmail.com',true)"), { code: "42501" });
      await assert.rejects(database.query("insert into public.allowed_admins (email) values ('admin@other.test')"), { code: "23514" });
      await assert.rejects(database.query("delete from public.allowed_admins where email=$1", [ownerEmail]), { code: "42501" });
    });
    assert.equal((await asRole("authenticated", google("second@gmail.com", secondId), () => database.query("select public.is_admin() as allowed"))).rows[0].allowed, true);
    await asRole("authenticated", google(), () => database.query("delete from public.allowed_admins where email='second@gmail.com'"));
    await asRole("authenticated", google("second@gmail.com", secondId), async () => {
      assert.equal((await database.query("select public.is_admin() as allowed")).rows[0].allowed, false);
      assert.equal((await database.query("select * from public.registrations")).rows.length, 0);
    });
  });

  await context.test("only allowlisted Google admins can delete registration records", async () => {
    const saved = await asRole("anon", {}, () => submit(payload()));
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
      assert.equal((await database.query("select public.is_admin() as allowed")).rows[0].allowed, false);
      await assert.rejects(database.query("select private.normalized_registration($1::jsonb)", [JSON.stringify(payload())]), { code: "42501" });
    });
  });

  await context.test("the database also protects the last non-owner admin", async () => {
    // Privileged SQL is the documented recovery boundary for changing owners.
    await database.query("update public.allowed_admins set is_owner=false where email=$1", [ownerEmail]);
    await asRole("authenticated", google(), () => assert.rejects(database.query("delete from public.allowed_admins where email=$1", [ownerEmail]), { code: "42501" }));
    assert.equal((await database.query("select count(*)::int as count from public.allowed_admins")).rows[0].count, 1);
  });
});

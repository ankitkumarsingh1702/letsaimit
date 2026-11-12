import test from 'node:test';
import assert from 'node:assert/strict';
import { copyFile,mkdtemp,mkdir,writeFile,rm,readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { buildBackendParity } from '../scripts/backendParity.js';

const targets={uat:{branch:'uat',origin:'https://uat.letsaimit.com',supabaseProjectRef:'aaaaaaaaaaaaaaaaaaaa'},production:{branch:'main',origin:'https://letsaimit.com',supabaseProjectRef:null}};
async function fixture(t){
  const root=await mkdtemp(join(tmpdir(),'letsaimit-parity-'));t.after(()=>rm(root,{recursive:true,force:true}));
  for(const path of ['deployment','supabase/migrations','supabase/functions/_shared','supabase/functions/mail'])await mkdir(join(root,path),{recursive:true});
  await copyFile(new URL('../deployment/automations.json',import.meta.url),join(root,'deployment/automations.json'));
  await writeFile(join(root,'supabase/migrations/20261109000002_second.sql'),'select 2;\n');
  await writeFile(join(root,'supabase/migrations/20261109000001_first.sql'),'select 1;\n');
  await writeFile(join(root,'supabase/functions/_shared/mail.js'),'export const title="LetsAimIt";\n');
  await writeFile(join(root,'supabase/functions/mail/index.ts'),'import { title } from "../_shared/mail.js";\nexport { title };\n');
  await writeFile(join(root,'supabase/config.toml'),'[functions.mail]\n# Handler verifies its own bearer.\nverify_jwt = false\n');
  return root;
}

test('one deterministic source inventory prepares both targets without claiming remote verification',async t=>{
  const root=await fixture(t),plan=await buildBackendParity({root,targets});
  assert.deepEqual(await buildBackendParity({root,targets}),plan);
  assert.equal(plan.scope,'source-plan-only');assert.equal(plan.brand.name,'LetsAimIt');assert.equal(plan.brand.origin,'https://letsaimit.com');
  assert.equal(plan.emailAutomations.targets.uat.interactiveAttendance,'paused');
  assert.equal(plan.emailAutomations.targets.production.transactionalTransport,null);
  assert.equal(plan.emailAutomations.transports[plan.emailAutomations.targets.uat.transactionalTransport].settings.from,'SMTP_FROM_EMAIL');
  assert.ok(plan.requiredBackendSecrets.operatorProvided.includes(plan.emailAutomations.transports.attendanceAmp.settings.providerReady));
  const healthCron=JSON.parse(await readFile(new URL('../deployment/uat-health/vercel.json',import.meta.url),'utf8')).crons[0];
  assert.equal(plan.otherAutomations.uatDatabaseHealth.route,healthCron.path);
  assert.equal(plan.otherAutomations.uatDatabaseHealth.cronSchedule,healthCron.schedule);
  assert.deepEqual(plan.migrations.map(m=>m.version),['20261109000001','20261109000002']);
  assert.ok(plan.migrations.every(m=>/^[a-f0-9]{64}$/.test(m.sha256)));
  assert.equal(plan.functions[0].verify_jwt,false);
  assert.deepEqual(plan.functions[0].files.map(f=>f.path),['supabase/functions/_shared/mail.js','supabase/functions/mail/index.ts']);
  assert.deepEqual(plan.targets.map(x=>[x.target,x.status,x.code]),[['uat','planned','SOURCE_PLAN_AVAILABLE'],['production','pending','BACKEND_NOT_CONFIGURED']]);
  assert.ok(plan.targets.every(x=>x.backendArtifactDigest===plan.backendArtifactDigest&&x.appliedBackend==='not_verified'&&x.liveJourney==='not_verified'));
  assert.equal(plan.targets[1].expectedUrls.supabase,null);assert.equal(plan.targets[1].expectedUrls.oauthCallback,null);
  assert.equal((await buildBackendParity({root,targets,target:'uat'})).backendArtifactDigest,plan.backendArtifactDigest);
  assert.deepEqual((await buildBackendParity({root,targets,target:'production'})).targets.map(x=>x.target),['production']);
});

test('migration, imported module and gateway configuration changes alter the source fingerprint',async t=>{
  const root=await fixture(t),initial=await buildBackendParity({root,targets});
  await writeFile(join(root,'supabase/migrations/20261109000002_second.sql'),'select 3;\n');
  const changedSql=await buildBackendParity({root,targets});assert.notEqual(changedSql.backendArtifactDigest,initial.backendArtifactDigest);
  await writeFile(join(root,'supabase/functions/_shared/mail.js'),'export const title="Changed";\n');
  const changedShared=await buildBackendParity({root,targets});assert.notEqual(changedShared.backendArtifactDigest,changedSql.backendArtifactDigest);
  await writeFile(join(root,'supabase/config.toml'),'[functions.mail]\nverify_jwt = true\n');
  const changedConfig=await buildBackendParity({root,targets});assert.notEqual(changedConfig.backendArtifactDigest,changedShared.backendArtifactDigest);assert.equal(changedConfig.functions[0].verify_jwt,true);
  await writeFile(join(root,'deno.lock'),'{"version":"5","specifiers":{}}\n');
  const locked=await buildBackendParity({root,targets});assert.notEqual(locked.backendArtifactDigest,changedConfig.backendArtifactDigest);
  assert.deepEqual(locked.dependencyMetadata.map(item=>item.path),['deno.lock']);
  await writeFile(join(root,'deno.lock'),'{"version":"5","specifiers":{"npm:example@1":"1.0.0"}}\n');
  const changedLock=await buildBackendParity({root,targets});assert.notEqual(changedLock.backendArtifactDigest,locked.backendArtifactDigest);
  await writeFile(join(root,'supabase/functions/deno.json'),'{"imports":{}}\n');
  assert.notEqual((await buildBackendParity({root,targets})).backendArtifactDigest,changedLock.backendArtifactDigest);
});

test('duplicate migration versions and unparseable function settings fail closed',async t=>{
  const root=await fixture(t);
  const collision=join(root,'supabase/migrations/20261109000001_collision.sql');await writeFile(collision,'select 9;');
  await assert.rejects(buildBackendParity({root,targets}),{code:'PARITY_MIGRATION_VERSION_DUPLICATE'});
  await rm(collision);await writeFile(join(root,'supabase/config.toml'),'[functions.mail]\n');
  await assert.rejects(buildBackendParity({root,targets}),{code:'PARITY_FUNCTION_CONFIG_MISSING'});
});

test('invalid and shared targets cannot be silently redirected to UAT',async t=>{
  await assert.rejects(buildBackendParity({root:'/does-not-exist',target:'prod'}),{code:'PARITY_TARGET_INVALID'});
  const root=await fixture(t),shared={...targets,production:{...targets.production,supabaseProjectRef:targets.uat.supabaseProjectRef}};
  assert.ok((await buildBackendParity({root,targets:shared})).targets.every(x=>x.status==='blocked'&&x.code==='BACKEND_NOT_SEPARATE'));
  const separate={...targets,production:{...targets.production,supabaseProjectRef:'bbbbbbbbbbbbbbbbbbbb'}};
  const plan=await buildBackendParity({root,targets:separate});assert.ok(plan.targets.every(x=>x.status==='planned'));
  assert.equal(plan.targets[1].expectedUrls.oauthCallback,'https://bbbbbbbbbbbbbbbbbbbb.supabase.co/auth/v1/callback');
});

test('relative imports cannot make the planner read outside backend source',async t=>{
  const root=await fixture(t);
  await writeFile(join(root,'supabase/functions/mail/index.ts'),'import "../../../private-secret.js";');
  await assert.rejects(buildBackendParity({root,targets}),{code:'PARITY_IMPORT_OUTSIDE_FUNCTIONS'});
});

test('CLI emits JSON only, never reads secret env values, and leaves source files unchanged',async()=>{
  const script=fileURLToPath(new URL('../scripts/backend-parity.mjs',import.meta.url));
  const file=new URL('../deployment/release-targets.json',import.meta.url),before=await readFile(file,'utf8');
  const result=spawnSync(process.execPath,[script,'--target','all'],{env:{...process.env,SMTP_PASSWORD:'private_smtp_test_marker',RAZORPAY_KEY_SECRET:'private_razorpay_test_marker'},encoding:'utf8'});
  assert.equal(result.status,0);const plan=JSON.parse(result.stdout);assert.equal(plan.targets.length,2);assert.equal(result.stderr,'');
  assert.ok(plan.requiredBackendSecrets.operatorProvided.includes('RAZORPAY_KEY_SECRET'));
  assert.doesNotMatch(result.stdout,/private_smtp_test_marker|private_razorpay_test_marker/);
  assert.equal(await readFile(file,'utf8'),before);
  const invalid=spawnSync(process.execPath,[script,'--target','other'],{encoding:'utf8'});assert.equal(invalid.status,1);assert.equal(JSON.parse(invalid.stderr).code,'PARITY_TARGET_INVALID');
});

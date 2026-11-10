import { readFile, readdir, realpath } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PUBLIC_BRAND } from '../src/lib/publicBrand.js';

const ROOT=fileURLToPath(new URL('../',import.meta.url));
const TARGETS=['uat','production'];
const digest=value=>createHash('sha256').update(value).digest('hex');
const sourcePath=(root,path)=>relative(root,path).split(sep).join('/');
export class BackendParityError extends Error {
  constructor(code){super(code);this.code=code;}
}
const fail=code=>{throw new BackendParityError(code);};
const inside=(directory,path)=>path===directory||path.startsWith(directory+sep);

async function functionFiles(root,entrypoint,directory){
  const files=new Map();
  async function visit(path){
    if(!inside(directory,path))fail('PARITY_IMPORT_OUTSIDE_FUNCTIONS');
    const actual=await realpath(path);
    if(!inside(directory,actual))fail('PARITY_IMPORT_OUTSIDE_FUNCTIONS');
    const name=sourcePath(root,path);
    if(files.has(name))return;
    const content=await readFile(path,'utf8');
    files.set(name,{path:name,sha256:digest(content)});
    const imports=content.matchAll(/(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s*)["'](\.{1,2}\/[^"']+)["']/g);
    for(const [,specifier]of imports)await visit(resolve(dirname(path),specifier));
  }
  await visit(entrypoint);
  for(const name of ['deno.json','deno.lock']){
    const path=resolve(dirname(entrypoint),name);
    try{const content=await readFile(path);files.set(sourcePath(root,path),{path:sourcePath(root,path),sha256:digest(content)});}
    catch(error){if(error.code!=='ENOENT')throw error;}
  }
  return [...files.values()].sort((a,b)=>a.path.localeCompare(b.path,'en'));
}

function gatewaySetting(config,name){
  let section=null;
  for(const line of config.split(/\r?\n/)){
    const header=line.trim().match(/^\[([^\]]+)\]$/);
    if(header){if(section)break;if(header[1]===`functions.${name}`)section=[];}
    else if(section)section.push(line);
  }
  if(!section)fail('PARITY_FUNCTION_CONFIG_MISSING');
  const setting=section.join('\n').match(/^verify_jwt\s*=\s*(true|false)\s*(?:#.*)?$/m);
  if(!setting)fail('PARITY_FUNCTION_CONFIG_MISSING');
  return setting[1]==='true';
}

function targetPlan(target,targets,backendArtifactDigest){
  const item=targets[target]||{};
  const other=targets[target==='uat'?'production':'uat'];
  const project=item.supabaseProjectRef??null;
  const validRef=typeof project==='string'&&/^[a-z0-9]{20}$/.test(project);
  let code='SOURCE_PLAN_AVAILABLE',status='planned';
  try{
    const url=new URL(item.origin);
    if(url.protocol!=='https:'||url.origin!==item.origin||url.username||url.password)throw new Error();
  }catch{status='blocked';code='TARGET_ORIGIN_INVALID';}
  if(typeof item.branch!=='string'||!/^[A-Za-z0-9][A-Za-z0-9/_.-]{0,99}$/.test(item.branch)){status='blocked';code='TARGET_BRANCH_INVALID';}
  if(project===null&&status!=='blocked'){status='pending';code='BACKEND_NOT_CONFIGURED';}
  else if(!validRef){status='blocked';code='BACKEND_REFERENCE_INVALID';}
  else if(project===other?.supabaseProjectRef){status='blocked';code='BACKEND_NOT_SEPARATE';}
  const supabase=validRef?`https://${project}.supabase.co`:null;
  return {target,branch:item.branch??null,origin:item.origin??null,supabaseProjectRef:project,status,code,backendArtifactDigest,
    expectedUrls:{supabase,oauthCallback:supabase?`${supabase}/auth/v1/callback`:null,admin:typeof item.origin==='string'?`${item.origin}/admin/`:null},
    appliedBackend:'not_verified',liveJourney:'not_verified'};
}

/** Read-only source inventory. It does not read env values, apply SQL or contact providers. */
export async function buildBackendParity({root=ROOT,target='all',targets}={}){
  if(target!=='all'&&!TARGETS.includes(target))fail('PARITY_TARGET_INVALID');
  root=await realpath(resolve(root));
  targets??=JSON.parse(await readFile(resolve(root,'deployment/release-targets.json'),'utf8'));
  const migrationDirectory=resolve(root,'supabase/migrations');
  const migrationNames=(await readdir(migrationDirectory)).filter(name=>name.endsWith('.sql')).sort();
  if(!migrationNames.length)fail('PARITY_MIGRATIONS_MISSING');
  const versions=new Set(),migrations=[];
  for(const name of migrationNames){
    const match=name.match(/^(\d{14})_[A-Za-z0-9_]+\.sql$/);
    if(!match)fail('PARITY_MIGRATION_NAME_INVALID');
    if(versions.has(match[1]))fail('PARITY_MIGRATION_VERSION_DUPLICATE');
    versions.add(match[1]);
    migrations.push({version:match[1],path:`supabase/migrations/${name}`,sha256:digest(await readFile(resolve(migrationDirectory,name)))});
  }
  const functionsDirectory=await realpath(resolve(root,'supabase/functions'));
  const config=await readFile(resolve(root,'supabase/config.toml'),'utf8');
  const functions=[];
  for(const item of (await readdir(functionsDirectory,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name,'en'))){
    if(!item.isDirectory()||item.name.startsWith('_')||item.name.startsWith('.'))continue;
    const entrypoint=resolve(functionsDirectory,item.name,'index.ts');
    try{await realpath(entrypoint);}catch(error){if(error.code==='ENOENT')fail('PARITY_FUNCTION_ENTRYPOINT_MISSING');throw error;}
    functions.push({name:item.name,entrypoint:sourcePath(root,entrypoint),verify_jwt:gatewaySetting(config,item.name),files:await functionFiles(root,entrypoint,functionsDirectory)});
  }
  if(!functions.length)fail('PARITY_FUNCTIONS_MISSING');
  const dependencyMetadata=[];
  for(const path of ['deno.json','deno.lock','supabase/functions/deno.json','supabase/functions/deno.lock']){
    try{dependencyMetadata.push({path,sha256:digest(await readFile(resolve(root,path)))});}
    catch(error){if(error.code!=='ENOENT')throw error;}
  }
  const artifacts={brand:PUBLIC_BRAND,migrations,functions,dependencyMetadata,config:{path:'supabase/config.toml',sha256:digest(config)}};
  const backendArtifactDigest=digest(JSON.stringify(artifacts));
  return {schemaVersion:1,scope:'source-plan-only',backendArtifactDigest,...artifacts,
    requiredBackendSecrets:{operatorProvided:['ADMIN_DASHBOARD_ORIGIN','NOTIFICATION_CRON_SECRET','RAZORPAY_KEY_ID','RAZORPAY_KEY_SECRET','RAZORPAY_WEBHOOK_SECRET','SMTP_FROM_EMAIL','SMTP_HOST','SMTP_PASSWORD','SMTP_PORT','SMTP_USER'],runtimeProvided:['SUPABASE_SERVICE_ROLE_KEY','SUPABASE_URL']},
    targets:(target==='all'?TARGETS:[target]).map(name=>targetPlan(name,targets,backendArtifactDigest))};
}

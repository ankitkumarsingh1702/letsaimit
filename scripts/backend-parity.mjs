#!/usr/bin/env node
import { BackendParityError,buildBackendParity } from './backendParity.js';

try{
  const args=process.argv.slice(2);
  const target=args.length===0?'all':args.length===2&&args[0]==='--target'?args[1]:args.length===1&&args[0].startsWith('--target=')?args[0].slice(9):null;
  if(!target)throw new BackendParityError('PARITY_ARGUMENTS_INVALID');
  const plan=await buildBackendParity({target});
  process.stdout.write(JSON.stringify(plan,null,2)+'\n');
  if(plan.targets.some(item=>item.status==='blocked'))process.exitCode=1;
}catch(error){
  process.stderr.write(JSON.stringify({ok:false,scope:'source-plan-only',code:error instanceof BackendParityError?error.code:'PARITY_SOURCE_UNAVAILABLE'})+'\n');
  process.exitCode=1;
}

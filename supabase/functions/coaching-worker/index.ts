import nodemailer from 'npm:nodemailer@10.4.0';
import {createCoachingHandler} from '../_shared/coaching-worker.js';
import {readCoachingLinkSmtpConfiguration, readCoachingSmtpConfiguration} from '../_shared/coaching-smtp.js';

const env=(name:string)=>Deno.env.get(name)||'';
const {senderEmail,transportOptions}=readCoachingSmtpConfiguration(env);
const linkSmtp = readCoachingLinkSmtpConfiguration(env);
const supabaseUrl=env('SUPABASE_URL'),serviceKey=env('SUPABASE_SERVICE_ROLE_KEY');
function assertBackend(){if(!/^https:\/\/[a-z0-9]{20}\.supabase\.co$/.test(supabaseUrl)||!serviceKey)throw new Error('configuration_error');}
async function rpc(name:string,body:Record<string,unknown>){
  const result=await fetch(`${supabaseUrl}/rest/v1/rpc/${name}`,{method:'POST',headers:{'Content-Type':'application/json',apikey:serviceKey,Authorization:`Bearer ${serviceKey}`},body:JSON.stringify(body),signal:AbortSignal.timeout(8000)});
  if(!result.ok){let code='';try{const value=await result.json();if(typeof value?.code==='string'&&/^[A-Z0-9]{5}$/.test(value.code))code=value.code;}catch{/* No private provider body or error is logged. */}throw Object.assign(new Error('rpc_failed'),{code});}
  return result.json();
}
type AttendanceMessage = { recipientEmail:string; subject:string; html:string; amp?:string; text:string; messageId:string };
async function sendEmail(message: AttendanceMessage, from: string, options: NonNullable<typeof transportOptions>) {
  const transport=nodemailer.createTransport(options);
  let timer:ReturnType<typeof setTimeout>|undefined;
  try{
    const result=await Promise.race([transport.sendMail({from:{name:'LetsAimIt',address:from},to:message.recipientEmail,subject:message.subject,text:message.text,amp:message.amp,html:message.html,messageId:message.messageId}),new Promise<never>((_resolve,reject)=>{timer=setTimeout(()=>{transport.close();reject(new Error('transport_timeout'));},20000);})]);
    return {accepted:Array.isArray(result.accepted)&&result.accepted.some((email:unknown)=>typeof email==='string'&&email.toLowerCase()===message.recipientEmail.toLowerCase())};
  }finally{if(timer)clearTimeout(timer);transport.close();}
}
Deno.serve(createCoachingHandler({
  secret:env('NOTIFICATION_CRON_SECRET'),signingSecret:env('COACHING_EMAIL_SIGNING_SECRET'),senderEmail,
  actionUrl:`${supabaseUrl}/functions/v1/coaching-worker/attendance`,
  dynamicEmailReady:env('COACHING_DYNAMIC_EMAIL_READY')==='true' && !!transportOptions,
  dashboardOrigin:linkSmtp.dashboardOrigin,
  sendLinkEmail:linkSmtp.transportOptions
    ? (message: AttendanceMessage) => sendEmail(message, linkSmtp.senderEmail, linkSmtp.transportOptions!)
    : null,
  sendEmail:(message: AttendanceMessage) => {
    if (!transportOptions) throw new Error('configuration_error');
    return sendEmail(message, senderEmail, transportOptions);
  },
  rpc,
  assertReady:assertBackend,assertActionReady:assertBackend,
}));

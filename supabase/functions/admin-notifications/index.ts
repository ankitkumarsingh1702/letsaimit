import nodemailer from "npm:nodemailer@10.4.0";
import { createNotificationHandler, validateMailConfiguration } from "../_shared/notification-worker.js";

const env = (name: string) => Deno.env.get(name) || "";
const config = {
  smtpHost: env("SMTP_HOST"), smtpPort: Number(env("SMTP_PORT") || "465"),
  smtpUser: env("SMTP_USER"), smtpPassword: env("SMTP_PASSWORD").replace(/ /g, ""),
  senderEmail: env("SMTP_FROM_EMAIL"), dashboardOrigin: env("ADMIN_DASHBOARD_ORIGIN"),
};
const supabaseUrl = env("SUPABASE_URL");
const serviceKey = env("SUPABASE_SERVICE_ROLE_KEY");

async function rpc(name: string, body: Record<string, unknown>) {
  const result = await fetch(`${supabaseUrl}/rest/v1/rpc/${name}`, {
    method: "POST", headers: { "Content-Type": "application/json", apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
    body: JSON.stringify(body), signal: AbortSignal.timeout(8000),
  });
  if (!result.ok) throw new Error("rpc_failed");
  return result.json();
}

async function sendEmail(message: { recipientEmail: string; subject: string; html: string; text: string; messageId: string }) {
  const transport = nodemailer.createTransport({
    host: config.smtpHost, port: 465, secure: true,
    auth: { user: config.smtpUser, pass: config.smtpPassword },
    connectionTimeout: 8000, greetingTimeout: 8000, socketTimeout: 12000,
    tls: { minVersion: "TLSv1.2", rejectUnauthorized: true },
    disableFileAccess: true, disableUrlAccess: true, logger: false, debug: false,
  });
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const result = await Promise.race([
      transport.sendMail({ from: { name: "LetsAimIt", address: config.senderEmail }, to: message.recipientEmail, subject: message.subject, html: message.html, text: message.text, messageId: message.messageId }),
      new Promise<never>((_resolve, reject) => { timer = setTimeout(() => { transport.close(); reject(new Error("transport_timeout")); }, 20000); }),
    ]);
    return { accepted: Array.isArray(result.accepted) && result.accepted.some((email: unknown) => typeof email === "string" && email.toLowerCase() === message.recipientEmail.toLowerCase()) };
  } finally {
    if (timer) clearTimeout(timer);
    transport.close();
  }
}

Deno.serve(createNotificationHandler({
  secret: env("NOTIFICATION_CRON_SECRET"), dashboardOrigin: config.dashboardOrigin,
  assertReady: () => {
    validateMailConfiguration(config);
    if (!/^https:\/\/[a-z0-9]+\.supabase\.co$/.test(supabaseUrl) || !serviceKey) throw new Error("configuration_error");
  },
  rpc, sendEmail,
}));

import { isSingleMailbox, validateMailConfiguration } from './notification-worker.js';

const SMTP_HOSTNAME = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/i;

function smtpOptions(host, port, user, pass) {
  return {
    host,
    port,
    secure: port === 465,
    requireTLS: port === 587,
    auth: { user, pass },
    connectionTimeout: 8000,
    greetingTimeout: 8000,
    socketTimeout: 12000,
    tls: /** @type {const} */ ({ minVersion: 'TLSv1.2', rejectUnauthorized: true }),
    disableFileAccess: true,
    disableUrlAccess: true,
    logger: false,
    debug: false,
  };
}

/** @param {(name: string) => string | undefined} getEnv */
export function readCoachingLinkSmtpConfiguration(getEnv) {
  const senderEmail = (getEnv('SMTP_FROM_EMAIL') || '').trim();
  const dashboardOrigin = (getEnv('ADMIN_DASHBOARD_ORIGIN') || '').trim();
  const smtpHost = (getEnv('SMTP_HOST') || '').trim();
  const smtpPort = Number(getEnv('SMTP_PORT') || '465');
  const smtpUser = (getEnv('SMTP_USER') || '').trim();
  const smtpPassword = (getEnv('SMTP_PASSWORD') || '').replace(/ /g, '');
  try {
    validateMailConfiguration({ senderEmail, dashboardOrigin, smtpHost, smtpPort, smtpUser, smtpPassword });
  } catch {
    return { senderEmail: '', dashboardOrigin, transportOptions: null };
  }
  return { senderEmail, dashboardOrigin, transportOptions: smtpOptions(smtpHost, smtpPort, smtpUser, smtpPassword) };
}

/** @param {(name: string) => string | undefined} getEnv */
export function readCoachingSmtpConfiguration(getEnv) {
  const from = (getEnv('COACHING_FROM_EMAIL') || '').trim();
  const senderEmail = isSingleMailbox(from) && from.split('@')[1].toLowerCase() === 'letsaimit.com' ? from : '';
  const host = (getEnv('COACHING_SMTP_HOST') || '').trim();
  const port = (getEnv('COACHING_SMTP_PORT') || '').trim();
  const user = (getEnv('COACHING_SMTP_USER') || '').trim();
  const pass = getEnv('COACHING_SMTP_PASSWORD') || '';

  if (!senderEmail || host.length > 253 || !SMTP_HOSTNAME.test(host)
      || !['465', '587'].includes(port) || !user || !pass.trim()) {
    return { senderEmail, transportOptions: null };
  }

  return {
    senderEmail,
    transportOptions: smtpOptions(host, Number(port), user, pass),
  };
}

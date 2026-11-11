import { isSingleMailbox } from './notification-worker.js';

const SMTP_HOSTNAME = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/i;

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
    transportOptions: {
      host,
      port: Number(port),
      secure: port === '465',
      requireTLS: port === '587',
      auth: { user, pass },
      connectionTimeout: 8000,
      greetingTimeout: 8000,
      socketTimeout: 12000,
      tls: /** @type {const} */ ({ minVersion: 'TLSv1.2', rejectUnauthorized: true }),
      disableFileAccess: true,
      disableUrlAccess: true,
      logger: false,
      debug: false,
    },
  };
}

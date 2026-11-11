import test from 'node:test';
import assert from 'node:assert/strict';
import { readCoachingSmtpConfiguration } from '../supabase/functions/_shared/coaching-smtp.js';

const dedicatedEnv = {
  COACHING_FROM_EMAIL: 'attendance@letsaimit.com',
  COACHING_SMTP_HOST: 'smtp.example.test',
  COACHING_SMTP_PORT: '465',
  COACHING_SMTP_USER: 'example-smtp-user',
  COACHING_SMTP_PASSWORD: 'synthetic password with spaces',
};
const config = values => readCoachingSmtpConfiguration(name => values[name]);

test('coaching SMTP cannot inherit the registration sender or connect as an unowned From address', () => {
  const legacyEnv = { SMTP_HOST: 'smtp.gmail.com', SMTP_PORT: '465', SMTP_FROM_EMAIL: 'sender@gmail.com', SMTP_USER: 'sender@gmail.com', SMTP_PASSWORD: 'legacy-test-value' };
  assert.deepEqual(config(legacyEnv), { senderEmail: '', transportOptions: null });
  for (const from of ['sender@gmail.com', 'a@letsaimit.com.example.test', 'LetsAimIt <a@letsaimit.com>', 'a@letsaimit.com,b@letsaimit.com']) {
    assert.deepEqual(config({ ...dedicatedEnv, COACHING_FROM_EMAIL: from }), { senderEmail: '', transportOptions: null });
  }
  assert.deepEqual(config({ ...legacyEnv, COACHING_FROM_EMAIL: dedicatedEnv.COACHING_FROM_EMAIL }), { senderEmail: dedicatedEnv.COACHING_FROM_EMAIL, transportOptions: null });
});

test('coaching SMTP allows implicit TLS or required STARTTLS with certificate verification', () => {
  for (const [port, secure, requireTLS] of [['465', true, false], ['587', false, true]]) {
    const { senderEmail, transportOptions } = config({ ...dedicatedEnv, COACHING_SMTP_PORT: port });
    assert.equal(senderEmail, dedicatedEnv.COACHING_FROM_EMAIL);
    assert.equal(transportOptions.port, Number(port));
    assert.equal(transportOptions.secure, secure);
    assert.equal(transportOptions.requireTLS, requireTLS);
    assert.deepEqual(transportOptions.tls, { minVersion: 'TLSv1.2', rejectUnauthorized: true });
    assert.deepEqual(transportOptions.auth, { user: dedicatedEnv.COACHING_SMTP_USER, pass: dedicatedEnv.COACHING_SMTP_PASSWORD });
  }
  for (const invalid of [{ COACHING_SMTP_PORT: '25' }, { COACHING_SMTP_PORT: '587.0' }, { COACHING_SMTP_HOST: 'smtp.example.test:465' }, { COACHING_SMTP_HOST: 'smtp://user:pass@smtp.example.test' }, { COACHING_SMTP_PASSWORD: '' }]) {
    assert.equal(config({ ...dedicatedEnv, ...invalid }).transportOptions, null);
  }
});

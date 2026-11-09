import test from 'node:test';
import assert from 'node:assert/strict';
import { submitRegistration } from '../src/lib/leadCapture.js';

const request = {
  formType: 'trial',
  submissionId: '4b54ca80-c499-4a20-bfc0-52e0085d7088',
  data: { parentName: 'Test parent', email: 'parent@example.test', phone: '+919876543210', age: '8', community: 'Test community', sport: 'Basketball' },
  consent: { agreed: true, guardian: true, terms: false },
};
const receipt = { ok: true, id: 'abcdefghijklmno', submissionId: request.submissionId, savedAt: '2026-11-09T10:00:00.000Z', duplicate: false };
const response = result => ({ data: result, error: null });
const client = action => ({ rpc: (name, payload) => ({ abortSignal: signal => action(name, payload, signal) }) });

test('billing terms changes require renewed consent without exposing raw provider errors', async () => {
  await assert.rejects(submitRegistration(request, {
    client: client(async () => ({ error: { code: 'PT412', message: 'sensitive internal detail' } })), onSaved: () => assert.fail('must not count a save'),
  }), error => error.code === 'billing_terms_changed' && error.field === 'billingConsent' && /Review the updated details/.test(error.message) && !error.message.includes('sensitive'));
  await assert.rejects(submitRegistration(request, {
    client: client(async () => ({ error: { code: '22023', details: 'billingConsent', message: 'sensitive internal detail' } })), onSaved: () => assert.fail('must not count a save'),
  }), error => error.field === 'billingConsent' && /accept the monthly payment details/.test(error.message) && !error.message.includes('sensitive'));
});

test('parent data is sent to the submission RPC and a durable receipt is awaited before success', async () => {
  let release;
  const saved = [];
  const pending = submitRegistration(request, {
    client: client(async (name, { payload: body }) => {
      assert.equal(name, 'submit_registration');
      assert.equal(body.full_name, 'Test parent');
      assert.equal(body.metadata.submissionId, request.submissionId);
      assert.equal(body.metadata.guardianConsent, true);
      assert.equal(body.metadata.termsAccepted, false);
      assert.equal(body.metadata.consentVersion, '2026-11-09');
      return new Promise(resolve => { release = result => resolve(response(result)); });
    }),
    onSaved: kind => saved.push(kind),
  });
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(saved, []);
  release(receipt);
  assert.deepEqual(await pending, receipt);
  assert.deepEqual(saved, ['trial']);
});

test('identical retries use the same id and duplicate receipt does not count another saved lead', async () => {
  const ids = [];
  const saved = [];
  for (const duplicate of [false, true]) {
    await submitRegistration(request, {
      client: client(async (_, { payload }) => {
        ids.push(payload.metadata.submissionId);
        return response({ ...receipt, duplicate });
      }), onSaved: kind => saved.push(kind),
    });
  }
  assert.deepEqual(ids, [request.submissionId, request.submissionId]);
  assert.deepEqual(saved, ['trial']);
});

for (const [name, result] of Object.entries({
  rejected: { ...receipt, ok: false },
  mismatchedId: { ...receipt, submissionId: 'different' },
  missingDuplicate: { ...receipt, duplicate: undefined },
  invalidDate: { ...receipt, savedAt: 'not-a-date' },
  missingRecord: { ...receipt, id: '' },
})) {
  test(`${name} receipt cannot show saved confirmation`, async () => {
    let saved = false;
    await assert.rejects(submitRegistration(request, {
      client: client(async () => response(result)), onSaved: () => { saved = true; },
    }), /confirm/);
    assert.equal(saved, false);
  });
}

for (const code of ['23502', '42501', '23505', 'PT409', 'PGRST301', '57014', 'connection_error']) {
  test(`backend ${code} preserves a failed save rather than a receipt`, async () => {
    await assert.rejects(submitRegistration(request, {
      client: client(async () => ({ data: null, error: { code } })), onSaved: () => assert.fail('saved event'),
    }));
  });
}

test('a conflicting retry asks for an edit instead of repeatedly retrying changed details', async () => {
  await assert.rejects(submitRegistration(request, {
    client: client(async () => ({ data: null, error: { code: 'PT409' } })),
    onSaved: () => assert.fail('saved event'),
  }), /Edit the form and submit again/);
});

test('network failures and unreadable JSON never emit saved', async () => {
  for (const error of [new TypeError('network'), new SyntaxError('invalid JSON')]) {
    await assert.rejects(submitRegistration(request, {
      client: client(async () => { throw error; }), onSaved: () => assert.fail('saved event'),
    }), /connection/);
  }
});

test('timeout aborts the request and offers a safe retry', async () => {
  await assert.rejects(submitRegistration(request, {
    timeoutMs: 2,
    client: client(async (_, __, signal) => new Promise((_, reject) => {
      signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
    })), onSaved: () => assert.fail('saved event'),
  }), /Retry safely/);
});

test('missing backend does not fabricate a success or send the request elsewhere', async () => {
  await assert.rejects(submitRegistration(request, { client: null }), /connect to registration/);
});

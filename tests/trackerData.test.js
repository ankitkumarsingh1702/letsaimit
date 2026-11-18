import test from 'node:test';
import assert from 'node:assert/strict';
import { trackerSnapshot, fetchTracker, saveAttendance, saveWeeklyFeedback, saveCoachAssignment, validTrackerDate, todayIST, coachingEmailStatus } from '../src/features/tracker/trackerData.js';
import { fetchCoachingPractice, formatPracticeResult, practiceLabel, saveCoachingPractice } from '../src/features/tracker/practiceData.js';

const child = { registrationId: '10000000-0000-4000-8000-000000000001', childName: 'Child', sport: 'Football', community: 'Community', privateEmail: 'do-not-return@example.com' };
const actor = { id: 'actor-a', isGoogle: true }, verify = async () => actor;
const attendance = { id: '20000000-0000-4000-8000-000000000001', registrationId: child.registrationId, sessionDate: '2026-11-10', status: 'no_session', revision: 1, coachName: 'Coach', updatedAt: '2026-11-10T16:00:00Z' };
const feedback = { id: '30000000-0000-4000-8000-000000000001', registrationId: child.registrationId, weekStart: '2026-11-09', summary: 'Steady balance.', nextStep: 'Practise short passes.', coachName: 'Coach', publishedAt: '2026-11-10T16:00:00Z', revision: 1 };
const snapshot = () => ({ children: [child], attendance: [attendance], feedback: [feedback], range: { from: '2025-11-11', to: '2026-11-10', feedbackFrom: '2025-11-17' } });
const options = client => ({ client, userId: actor.id, verifyGoogleUser: verify, checkAccess: async () => true });

test('manual email dispatch takes no client roster or recipients and distinguishes queue from send', async () => {
  const calls = [];
  const value = { sessionDate: '2026-11-11', emailEnabled: true, scheduledEnabled: false, deliveryMode: 'link', queued: 4, pending: 4, sent: 0, failed: 0 };
  const config = options({ rpc(...args) { calls.push(args); return { data: { ...value, recipientEmail: 'private@example.test' } }; } });
  assert.deepEqual(await coachingEmailStatus(config, { send: true }), value);
  assert.deepEqual(calls, [['send_coaching_attendance_now']]);
  await assert.rejects(coachingEmailStatus(config), /Email status is unavailable/);
});

test('email send rejects changed identity and malformed or denied receipts', async () => {
  let calls = 0;
  const client = { rpc() { ++calls; return { data: { sessionDate: '2026-11-11', emailEnabled: false, queued: 2, pending: 0, sent: 0, failed: 0 } }; } };
  await assert.rejects(coachingEmailStatus({ ...options(client), verifyGoogleUser: async () => ({ ...actor, id: 'other' }) }, { send: true }), { code: 'identity_changed' });
  assert.equal(calls, 0);
  await assert.rejects(coachingEmailStatus(options(client), { send: true }), /Send was not confirmed/);
  await assert.rejects(coachingEmailStatus(options({ rpc: () => ({ error: { code: '42501' } }) }), { send: true }), { code: 'access_denied' });
});

test('tracker view model retains explicit No session and excludes private fields and unrelated ownership', () => {
  const value = trackerSnapshot(snapshot());
  assert.equal(value.attendance[0].status, 'no_session'); assert.equal(value.children[0].privateEmail, undefined);
  assert.equal(value.feedback[0].summary, 'Steady balance.');
  assert.throws(() => trackerSnapshot({ ...snapshot(), attendance: [{ ...attendance, registrationId: '10000000-0000-4000-8000-000000000002' }] }), { code: 'access_denied' });
  assert.throws(() => trackerSnapshot({ ...snapshot(), attendance: [attendance, { ...attendance, id: '20000000-0000-4000-8000-000000000002' }] }), /could not be confirmed/);
});

test('strict calendar dates, Monday feedback and history bounds reject malformed snapshots', () => {
  assert.equal(validTrackerDate('2026-02-31'), false); assert.equal(validTrackerDate('2028-02-29'), true);
  assert.equal(todayIST(new Date('2026-11-10T18:30:00Z')), '2026-11-11');
  assert.throws(() => trackerSnapshot({ ...snapshot(), attendance: [{ ...attendance, status: 'unmarked' }] }));
  assert.throws(() => trackerSnapshot({ ...snapshot(), feedback: [{ ...feedback, weekStart: '2026-11-10' }] }));
  assert.throws(() => trackerSnapshot({ ...snapshot(), attendance: [{ ...attendance, sessionDate: '2027-01-01' }] }));
});

test('tracker uses ownership RPC and checks Google identity on both sides of a read', async () => {
  const calls = [], client = { rpc: async (...args) => { calls.push(args); return { data: snapshot() }; } };
  assert.equal((await fetchTracker(options(client))).children.length, 1);
  assert.deepEqual(calls, [['list_my_tracker']]);
  await assert.rejects(fetchTracker({ ...options(client), verifyGoogleUser: async () => null }), { code: 'identity_changed' });
  assert.equal(calls.length, 1);
  const identities = [actor, { id: 'actor-b', isGoogle: true }];
  await assert.rejects(fetchTracker({ ...options(client), verifyGoogleUser: async () => identities.shift() }), { code: 'identity_changed' });
});

test('staff snapshots cannot invent admin capability and use the selected date', async () => {
  const raw = { ...snapshot(), sessionDate: '2026-11-10', isAdmin: false, emailEnabled: false, children: [{ ...child, coachEmail: 'coach@example.com', weekdays: [1, 3], startsOn: '2026-11-01', assignmentRevision: 1 }] };
  let request;
  const client = { rpc: async (...args) => { request = args; return { data: raw }; } };
  const value = await fetchTracker({ ...options(client), staff: true, date: '2026-11-10' });
  assert.equal(value.isAdmin, false); assert.deepEqual(request, ['list_staff_tracker', { p_date: '2026-11-10' }]);
  assert.throws(() => trackerSnapshot({ ...raw, isAdmin: 'true' }, { staff: true }));
  await assert.rejects(fetchTracker({ ...options({ rpc: async () => ({ data: { ...raw, sessionDate: '2026-11-09' } }) }), staff: true, date: '2026-11-10' }), /selected attendance date/);
});

test('staff workspaces request explicit scope and reject snapshots for a different role', async () => {
  const date = '2026-11-10';
  const calls = [];
  const raw = { children: [], attendance: [], feedback: [], sessionDate: date, isAdmin: false, emailEnabled: false };
  const client = { rpc: async (...args) => { calls.push(args); return { data: raw }; } };
  const staff = { ...options(client), staff: true, date };
  assert.equal((await fetchTracker({ ...staff, scope: 'coach' })).isAdmin, false);
  assert.deepEqual(calls[0], ['list_staff_tracker', { p_date: date, p_scope: 'coach' }]);
  await assert.rejects(fetchTracker({ ...staff, scope: 'admin' }), { code: 'access_denied' });
  assert.deepEqual(calls[1], ['list_staff_tracker', { p_date: date, p_scope: 'admin' }]);
  raw.isAdmin = true;
  await assert.rejects(fetchTracker({ ...staff, scope: 'coach' }), { code: 'access_denied' });
  assert.equal((await fetchTracker({ ...staff, scope: 'admin' })).isAdmin, true);
  assert.equal((await fetchTracker({ ...staff, scope: 'admin', students: true })).isAdmin, true);
  assert.deepEqual(calls.at(-1), ['list_coaching_students', { p_date: date, p_scope: 'admin' }]);
  await assert.rejects(fetchTracker({ ...staff, students: true }), /Choose a students workspace/);
});

test('atomic attendance saves only the explicit draft and requires a confirmed receipt', async () => {
  const rows = [{ registrationId: child.registrationId, status: 'present', revision: 0, private: 'drop' }];
  let request;
  const client = { rpc: async (...args) => { request = args; return { data: { ok: true, attendance: [{ ...attendance, status: 'present' }] } }; } };
  const result = await saveAttendance({ ...options(client), date: attendance.sessionDate, rows });
  assert.equal(result[0].status, 'present');
  assert.deepEqual(request, ['save_coaching_attendance', { p_session_date: attendance.sessionDate, p_rows: [{ registrationId: child.registrationId, status: 'present', revision: 0 }] }]);
  const bad = { rpc: async () => ({ data: { ok: true, attendance: [] } }) };
  await assert.rejects(saveAttendance({ ...options(bad), date: attendance.sessionDate, rows }), /not confirmed/);
  await assert.rejects(saveAttendance({ ...options(client), date: attendance.sessionDate, rows: [{ ...rows[0], status: 'unmarked' }] }), /Check the attendance/);
});

test('attendance conflicts are surfaced without automatic retry or a successful local mark', async () => {
  let calls = 0;
  const client = { rpc: async () => { ++calls; return { error: { code: '40001', message: 'private server detail' } }; } };
  await assert.rejects(saveAttendance({ ...options(client), date: attendance.sessionDate, rows: [{ registrationId: child.registrationId, status: 'present', revision: 0 }] }), error => error.code === 'conflict' && !error.message.includes('private server'));
  assert.equal(calls, 1);
});

test('feedback publication respects revision and exact displayed text', async () => {
  const client = { rpc: async () => ({ data: feedback }) };
  const result = await saveWeeklyFeedback({ ...options(client), registrationId: child.registrationId, weekStart: feedback.weekStart, summary: feedback.summary, nextStep: feedback.nextStep, expectedRevision: 0 });
  assert.equal(result.revision, 1);
  await assert.rejects(saveWeeklyFeedback({ ...options(client), registrationId: child.registrationId, weekStart: feedback.weekStart, summary: 'Changed text', expectedRevision: 0 }), /not confirmed/);
});

test('coach access requires fresh admin permission and a matching mutation receipt, including revocation', async () => {
  let calls = 0;
  const client = { rpc: async () => { ++calls; return { data: { registrationId: child.registrationId, coachEmail: '', weekdays: [], startsOn: null, assignmentRevision: 2 } }; } };
  const draft = { ...options(client), registrationId: child.registrationId, coachEmail: '', weekdays: [1], startsOn: '2026-11-10', expectedRevision: 1 };
  await assert.rejects(saveCoachAssignment({ ...draft, checkAccess: async () => false }), { code: 'access_denied' });
  assert.equal(calls, 0);
  assert.equal((await saveCoachAssignment(draft)).assignmentRevision, 2);
});

test('practice uses the scoped keyset cursor, retaining equal attempts on the same day', async () => {
  const registrationId = child.registrationId;
  const recordedAt = '2026-11-18T18:30:00.123456Z';
  const attempts = Array.from({ length: 41 }, (_, index) => ({
    id: `40000000-0000-4000-8000-${String(50 - index).padStart(12, '0')}`,
    registrationId, exercise: 'sprint', durationMs: 4125, reps: null, distanceMeters: 10, recordedAt, sessionDate: '2026-11-19',
  }));
  const calls = [];
  const config = {
    ...options({
      async rpc(name, args) {
        calls.push({ name, args });
        if (args.p_before_id) return { data: { attempts: attempts.slice(40), nextCursor: null } };
        return { data: { attempts: attempts.slice(0, 40), nextCursor: { recordedAt, id: attempts[39].id } } };
      },
    }),
    registrationId, scope: 'parent', from: '2026-11-19', to: '2026-11-19',
  };
  const current = await fetchCoachingPractice(config);
  const older = await fetchCoachingPractice({ ...config, cursor: current.nextCursor });
  assert.deepEqual([...current.attempts, ...older.attempts], attempts);
  assert.deepEqual(calls[1], { name: 'list_coaching_practice', args: {
    p_registration_id: registrationId, p_scope: 'parent', p_from: '2026-11-19', p_to: '2026-11-19', p_before_at: recordedAt, p_before_id: attempts[39].id,
  } });
  const responseWith = overrides => options({ rpc: async () => ({ data: { attempts: [{ ...attempts[0], ...overrides }], nextCursor: null } }) });
  await assert.rejects(fetchCoachingPractice({ ...config, ...responseWith({ sessionDate: '2026-11-18' }) }), /confirm the practice attempt/);
  await assert.rejects(fetchCoachingPractice({ ...config, ...responseWith({ registrationId: '10000000-0000-4000-8000-000000000002' }) }), { code: 'access_denied' });
});

test('a practice save sends the stable attempt key and confirms the exact result', async () => {
  const attemptId = '40000000-0000-4000-8000-000000000001';
  const registrationId = child.registrationId;
  const saved = { id: attemptId, registrationId, exercise: 'push_ups', durationMs: null, reps: 12, distanceMeters: null, sessionDate: '2026-11-19', recordedAt: '2026-11-18T18:31:00Z' };
  const calls = [];
  const client = { rpc: async (...args) => { calls.push(args); return { data: saved }; } };
  const draft = { ...options(client), registrationId, attemptId, exercise: 'push_ups', reps: 12 };
  assert.deepEqual(await saveCoachingPractice(draft), saved);
  assert.deepEqual(calls[0], ['save_coaching_practice', {
    p_registration_id: registrationId, p_attempt_id: attemptId, p_exercise: 'push_ups', p_duration_ms: null, p_reps: 12, p_distance_meters: null,
  }]);
  await assert.rejects(saveCoachingPractice({ ...draft, reps: 11 }), /confirm the attempt/);
});

test('a custom sprint reaches the save RPC and appears with its distance and time in parent history', async () => {
  const registrationId = child.registrationId;
  const attemptId = '40000000-0000-4000-8000-000000000001';
  const recordedAt = '2026-11-18T18:31:00Z';
  const saved = { id: attemptId, registrationId, exercise: 'sprint', durationMs: 9275, reps: null, distanceMeters: 275, sessionDate: '2026-11-19', recordedAt };
  const previous = { ...saved, id: '40000000-0000-4000-8000-000000000002', distanceMeters: 5, durationMs: 1510 };
  let writes = 0;
  const client = { async rpc(name, args) {
    if (name === 'save_coaching_practice') {
      writes++;
      assert.equal(args.p_distance_meters, 275);
      assert.equal(args.p_duration_ms, 9275);
      return { data: saved };
    }
    assert.equal(name, 'list_coaching_practice');
    return { data: { attempts: [saved, previous], nextCursor: null } };
  } };
  const draft = { ...options(client), registrationId, attemptId, exercise: 'sprint', durationMs: 9275, distanceMeters: 275 };
  await assert.rejects(saveCoachingPractice({ ...draft, distanceMeters: 10001 }), /Check the result/);
  assert.equal(writes, 0);
  await saveCoachingPractice(draft);
  const { attempts } = await fetchCoachingPractice({ ...options(client), registrationId, scope: 'parent' });
  assert.deepEqual(attempts.map(lap => [practiceLabel(lap), formatPracticeResult(lap)]), [
    ['275 m sprint', '9.275 s'],
    ['5 m sprint', '1.51 s'],
  ]);
});

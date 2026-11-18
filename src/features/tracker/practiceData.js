import { rpcError, validTrackerDate, verifyActor } from './trackerData.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PAGE_SIZE = 40;
const maximumInteger = 2147483647;
const scopes = new Set(['parent', 'coach', 'admin']);
const distances = new Set([5, 10, 100]);
const calendar = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' });
const seconds = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 3 });
const exercises = { warm_up: 'Warm-up', strength: 'Strength', sprint: 'Sprint', push_ups: 'Push-ups', body_balance: 'Body balance' };
const positiveInteger = value => Number.isInteger(value) && value > 0 && value <= maximumInteger;
const timestamp = value => typeof value === 'string' && Number.isFinite(Date.parse(value));
const problem = message => new Error(message);
const loadError = 'Couldn’t load practice.';
const saveError = 'Couldn’t confirm the attempt. Try again.';

function validResult({ exercise, durationMs, reps, distanceMeters }) {
  if (exercise === 'sprint') return positiveInteger(durationMs) && reps === null && distances.has(distanceMeters);
  if (exercise === 'body_balance') return positiveInteger(durationMs) && reps === null && distanceMeters === null;
  if (exercise === 'push_ups') return durationMs === null && positiveInteger(reps) && distanceMeters === null;
  return ['warm_up', 'strength'].includes(exercise) && durationMs === null && reps === null && distanceMeters === null;
}

export function practiceAttempt(row) {
  if (!row || !UUID.test(row.id || '') || !UUID.test(row.registrationId || '') || !timestamp(row.recordedAt)
    || !validTrackerDate(row.sessionDate) || calendar.format(new Date(row.recordedAt)) !== row.sessionDate
    || !validResult(row)) throw problem('Couldn’t confirm the practice attempt.');
  const { id, registrationId, exercise, durationMs, reps, distanceMeters, recordedAt, sessionDate } = row;
  return { id, registrationId, exercise, durationMs, reps, distanceMeters, recordedAt, sessionDate };
}

export function practiceLabel({ exercise, distanceMeters }) {
  return exercise === 'sprint' ? `${distanceMeters} m sprint` : exercises[exercise];
}

export function formatPracticeResult({ durationMs, reps }) {
  if (durationMs !== null) return `${seconds.format(durationMs / 1000)} s`;
  if (reps !== null) return `${reps} ${reps === 1 ? 'rep' : 'reps'}`;
  return 'Completed';
}

function validCursor(cursor) {
  return cursor === null || (cursor && UUID.test(cursor.id || '') && timestamp(cursor.recordedAt));
}

export async function fetchCoachingPractice(options) {
  const { client, registrationId, scope, from = null, to = null, cursor = null } = options;
  if (!UUID.test(registrationId || '') || !scopes.has(scope) || !validCursor(cursor)
    || (from !== null && !validTrackerDate(from)) || (to !== null && !validTrackerDate(to))
    || (from && to && from > to)) throw problem(loadError);
  await verifyActor(options);
  const { data, error } = await client.rpc('list_coaching_practice', {
    p_registration_id: registrationId, p_scope: scope, p_from: from, p_to: to,
    p_before_at: cursor?.recordedAt ?? null, p_before_id: cursor?.id ?? null,
  });
  if (error) throw rpcError(error, loadError);
  await verifyActor(options);
  if (!Array.isArray(data?.attempts) || data.attempts.length > PAGE_SIZE || !validCursor(data.nextCursor)) throw problem(loadError);
  const attempts = data.attempts.map(practiceAttempt);
  if (attempts.some(row => row.registrationId !== registrationId)) {
    throw Object.assign(problem('Practice access is unavailable for this child.'), { code: 'access_denied' });
  }
  if (new Set(attempts.map(attempt => attempt.id)).size !== attempts.length
    || attempts.some(row => row.id === cursor?.id || (from && row.sessionDate < from) || (to && row.sessionDate > to))) throw problem(loadError);

  const last = attempts.at(-1);
  const nextCursor = data.nextCursor;
  if (nextCursor && (attempts.length !== PAGE_SIZE || last?.id !== nextCursor.id || last.recordedAt !== nextCursor.recordedAt)) throw problem(loadError);
  return { attempts, nextCursor: nextCursor ? { recordedAt: nextCursor.recordedAt, id: nextCursor.id } : null };
}

export async function saveCoachingPractice(options) {
  const { client, registrationId, attemptId, exercise, durationMs = null, reps = null, distanceMeters = null } = options;
  const result = { exercise, durationMs, reps, distanceMeters };
  if (!UUID.test(registrationId || '') || !UUID.test(attemptId || '') || !validResult(result)) throw problem('Check the result before saving.');
  await verifyActor(options);
  const { data, error } = await client.rpc('save_coaching_practice', {
    p_registration_id: registrationId, p_attempt_id: attemptId, p_exercise: exercise,
    p_duration_ms: durationMs, p_reps: reps, p_distance_meters: distanceMeters,
  });
  if (error) throw rpcError(error, saveError);
  await verifyActor(options);
  const saved = practiceAttempt(data);
  if (saved.id !== attemptId || saved.registrationId !== registrationId || Object.keys(result).some(key => result[key] !== saved[key])) throw problem(saveError);
  return saved;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STATUSES = new Set(['present', 'absent', 'no_session']);
const text = value => typeof value === 'string' ? value : '';
const revision = value => Number.isSafeInteger(value) && value >= 0;
const timestamp = value => typeof value === 'string' && Number.isFinite(Date.parse(value));
const problem = (message, code = 'request_failed') => Object.assign(new Error(message), { code });

export function validTrackerDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function todayIST(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function childRow(row, staff) {
  if (!row || !UUID.test(row.registrationId || '') || !text(row.childName)) throw problem('The child list could not be confirmed.');
  const result = { registrationId: row.registrationId, childName: row.childName, sport: text(row.sport), community: text(row.community) };
  if (staff) {
    if (!revision(row.assignmentRevision) || !Array.isArray(row.weekdays) || row.weekdays.some(day => !Number.isInteger(day) || day < 1 || day > 7)
      || row.startsOn !== null && !validTrackerDate(row.startsOn)) throw problem('Coach assignments could not be confirmed.');
    Object.assign(result, { coachEmail: text(row.coachEmail), weekdays: [...new Set(row.weekdays)], startsOn: row.startsOn, assignmentRevision: row.assignmentRevision });
  }
  return result;
}

export function attendanceRow(row) {
  if (!row || !UUID.test(row.id || '') || !UUID.test(row.registrationId || '') || !validTrackerDate(row.sessionDate)
    || !STATUSES.has(row.status) || !revision(row.revision) || row.revision < 1 || !timestamp(row.updatedAt)) throw problem('Attendance could not be confirmed.');
  return { id: row.id, registrationId: row.registrationId, sessionDate: row.sessionDate, status: row.status, updatedAt: row.updatedAt, coachName: text(row.coachName), revision: row.revision };
}

export function feedbackRow(row) {
  if (!row || !UUID.test(row.id || '') || !UUID.test(row.registrationId || '') || !validTrackerDate(row.weekStart)
    || new Date(`${row.weekStart}T00:00:00Z`).getUTCDay() !== 1 || !text(row.summary) || !revision(row.revision)
    || row.revision < 1 || !timestamp(row.publishedAt)) throw problem('Weekly feedback could not be confirmed.');
  return { id: row.id, registrationId: row.registrationId, weekStart: row.weekStart, summary: row.summary, nextStep: text(row.nextStep), coachName: text(row.coachName), publishedAt: row.publishedAt, revision: row.revision };
}

/** Project only the agreed view model. Never forward raw private RPC properties. */
export function trackerSnapshot(value, { staff = false } = {}) {
  if (!value || !Array.isArray(value.children) || !Array.isArray(value.attendance) || !Array.isArray(value.feedback)) throw problem('Tracker could not load. Please retry.');
  const children = value.children.map(row => childRow(row, staff));
  const ids = new Set(children.map(row => row.registrationId));
  if (ids.size !== children.length) throw problem('The child list could not be confirmed.');
  const attendance = value.attendance.map(attendanceRow), feedback = value.feedback.map(feedbackRow);
  for (const rows of [attendance, feedback]) {
    if (new Set(rows.map(row => row.id)).size !== rows.length || rows.some(row => !ids.has(row.registrationId))) throw problem('Tracker ownership could not be confirmed.', 'access_denied');
  }
  if (new Set(attendance.map(row => `${row.registrationId}:${row.sessionDate}`)).size !== attendance.length
    || new Set(feedback.map(row => `${row.registrationId}:${row.weekStart}`)).size !== feedback.length) throw problem('Tracker rows could not be confirmed.');
  const result = { children, attendance, feedback };
  if (value.range) {
    const { from, to, feedbackFrom } = value.range;
    if (![from, to, feedbackFrom].every(validTrackerDate) || from > to || feedbackFrom > to
      || attendance.some(row => row.sessionDate < from || row.sessionDate > to)
      || feedback.some(row => row.weekStart < feedbackFrom || row.weekStart > to)) throw problem('Tracker dates could not be confirmed.');
    result.range = { from, to, feedbackFrom };
  }
  if (staff) {
    if (typeof value.isAdmin !== 'boolean' || typeof value.emailEnabled !== 'boolean') throw problem('Coaching access could not be confirmed.');
    Object.assign(result, { isAdmin: value.isAdmin, emailEnabled: value.emailEnabled });
  }
  return result;
}

async function verifyActor({ verifyGoogleUser, userId }) {
  const user = await verifyGoogleUser();
  if (!user?.isGoogle || user.id !== userId) throw problem('Sign in with the same Google account.', 'identity_changed');
}

function rpcError(error, fallback) {
  if (['42501', 'PGRST301', 'PGRST302', 'PGRST303'].includes(error?.code)) return problem('Tracker access is unavailable for this account.', 'access_denied');
  if (['40001', 'PT409'].includes(error?.code)) return problem('This row changed. Load the latest values before saving.', 'conflict');
  return problem(fallback);
}

export async function fetchTracker(options) {
  const { client, staff = false, date } = options;
  if (staff && !validTrackerDate(date)) throw problem('Choose a valid session date.');
  await verifyActor(options);
  const { data, error } = staff ? await client.rpc('list_staff_tracker', { p_date: date }) : await client.rpc('list_my_tracker');
  if (error) throw rpcError(error, 'Tracker could not load. Please retry.');
  await verifyActor(options);
  if (staff && (data?.sessionDate !== date || !Array.isArray(data.attendance) || data.attendance.some(row => row.sessionDate !== date))) throw problem('The selected attendance date could not be confirmed.');
  return trackerSnapshot(data, { staff });
}

/** Validate drafts locally; the database still checks current permissions and revisions. */
export async function saveAttendance(options) {
  const { client, date, rows } = options;
  if (!validTrackerDate(date) || !Array.isArray(rows) || !rows.length || rows.length > 100 || new Set(rows.map(row => row?.registrationId)).size !== rows.length
    || rows.some(row => !UUID.test(row?.registrationId || '') || !STATUSES.has(row.status) || !revision(row.revision))) throw problem('Check the attendance rows before saving.');
  await verifyActor(options);
  const { data, error } = await client.rpc('save_coaching_attendance', { p_session_date: date, p_rows: rows.map(({ registrationId, status, revision }) => ({ registrationId, status, revision })) });
  if (error) throw rpcError(error, 'Attendance was not confirmed. Please retry.');
  await verifyActor(options);
  if (data?.ok !== true || !Array.isArray(data.attendance)) throw problem('Attendance was not confirmed. Refresh the tracker.');
  const saved = data.attendance.map(attendanceRow);
  if (saved.length !== rows.length || rows.some(draft => !saved.some(row => row.registrationId === draft.registrationId && row.sessionDate === date && row.status === draft.status && row.revision > draft.revision))) throw problem('Attendance was not confirmed. Refresh the tracker.');
  return saved;
}

export async function saveWeeklyFeedback(options) {
  const { client, registrationId, weekStart, summary, nextStep = '', expectedRevision } = options;
  const cleanSummary = text(summary).trim(), cleanNext = text(nextStep).trim();
  if (!UUID.test(registrationId || '') || !validTrackerDate(weekStart) || new Date(`${weekStart}T00:00:00Z`).getUTCDay() !== 1 || !revision(expectedRevision)
    || !cleanSummary || cleanSummary.length > 1500 || cleanNext.length > 500) throw problem('Choose a Monday and add a short weekly update.');
  await verifyActor(options);
  const { data, error } = await client.rpc('save_coaching_feedback', { p_registration_id: registrationId, p_week_start: weekStart, p_summary: cleanSummary, p_next_step: cleanNext, p_expected_revision: expectedRevision });
  if (error) throw rpcError(error, 'Feedback was not confirmed. Please retry.');
  await verifyActor(options);
  const saved = feedbackRow(Array.isArray(data) ? data[0] : data);
  if (saved.registrationId !== registrationId || saved.weekStart !== weekStart || saved.summary !== cleanSummary || saved.nextStep !== cleanNext || saved.revision <= expectedRevision) throw problem('Feedback was not confirmed. Refresh the tracker.');
  return saved;
}

export async function saveCoachAssignment(options) {
  const { client, registrationId, coachEmail, weekdays, startsOn, expectedRevision, checkAccess } = options;
  const email = text(coachEmail).trim().toLowerCase();
  if (!UUID.test(registrationId || '') || !revision(expectedRevision) || email && (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254)
    || !Array.isArray(weekdays) || !weekdays.length || weekdays.some(day => !Number.isInteger(day) || day < 1 || day > 7) || !validTrackerDate(startsOn)) throw problem('Check the coach email and start date.');
  await verifyActor(options);
  if (!await checkAccess()) throw problem('Admin access is required.', 'access_denied');
  const { data, error } = await client.rpc('set_coaching_assignment', { p_registration_id: registrationId, p_coach_email: email, p_weekdays: [...new Set(weekdays)].sort(), p_starts_on: startsOn, p_expected_revision: expectedRevision });
  if (error) throw rpcError(error, 'Coach assignment was not confirmed. Please retry.');
  await verifyActor(options);
  if (!await checkAccess()) throw problem('Admin access is required.', 'access_denied');
  const expectedDays = email ? [...new Set(weekdays)].sort() : [];
  if (!data || data.registrationId !== registrationId || data.coachEmail !== email || !revision(data.assignmentRevision)
    || data.assignmentRevision <= expectedRevision || !Array.isArray(data.weekdays) || data.weekdays.some(day => !Number.isInteger(day) || day < 1 || day > 7)
    || JSON.stringify(data.weekdays) !== JSON.stringify(expectedDays) || data.startsOn !== (email ? startsOn : null)) throw problem('Coach assignment was not confirmed. Refresh the tracker.');
  return { registrationId, coachEmail: data.coachEmail, weekdays: [...data.weekdays], startsOn: data.startsOn, assignmentRevision: data.assignmentRevision };
}

export async function coachingEmailStatus(options, { send = false } = {}) {
  const { client } = options;
  await verifyActor(options);
  const { data, error } = await client.rpc(send ? 'send_coaching_attendance_now' : 'get_coaching_attendance_email_status');
  const fallback = send ? 'Send was not confirmed. Check today’s email status before retrying.' : 'Email status is unavailable.';
  if (error) throw rpcError(error, fallback);
  await verifyActor(options);
  if (!validTrackerDate(data?.sessionDate) || typeof data.emailEnabled !== 'boolean' ||
      !['queued', 'pending', 'sent', 'failed'].every(key => Number.isSafeInteger(data[key]) && data[key] >= 0) ||
      data.queued > data.pending || (!send && data.queued !== 0) ||
      (!data.emailEnabled && (data.pending || data.sent || data.failed))) throw problem(fallback);
  const { sessionDate, emailEnabled, queued, pending, sent, failed } = data;
  const scheduledEnabled = data.scheduledEnabled === undefined ? emailEnabled : data.scheduledEnabled;
  const deliveryMode = data.deliveryMode === undefined ? (emailEnabled ? 'interactive' : null) : data.deliveryMode;
  if (typeof scheduledEnabled !== 'boolean' || (emailEnabled ? !['link', 'interactive'].includes(deliveryMode) : deliveryMode !== null)) throw problem(fallback);
  return { sessionDate, emailEnabled, scheduledEnabled, deliveryMode, queued, pending, sent, failed };
}

export const ATTENDANCE_LABELS = { present: 'Present', absent: 'Absent', no_session: 'No session', unmarked: 'Not marked' };

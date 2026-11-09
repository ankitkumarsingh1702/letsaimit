
/** Pure presentation helpers for saved, server-authorised registration records. */
export const TIMEZONE = 'Asia/Kolkata';
export const STATUS_OPTIONS = [
  { value: 'new', label: 'New' },
  { value: 'contacted', label: 'Contacted' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'closed', label: 'Closed' },
];
export const FORM_LABELS = { trial: 'Trial', enrol: 'Enrolment' };
export const ADMIN_NOTE_LIMIT = 2000;
export const ASSIGNEE_LIMIT = 254;

export function formatAge(age) {
  if (age === 'other') return 'Under 5 or over 14';
  const years = Number(age);
  return Number.isInteger(years) && years >= 5 && years <= 14 ? `${years} years` : 'Not provided';
}

const statuses = STATUS_OPTIONS.map(({ value }) => value);
const collator = new Intl.Collator('en-IN', { numeric: true, sensitivity: 'base' });
const text = (value) => String(value ?? '');
const searchable = (value) => text(value).normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase();
const dateValue = (value) => value == null || value === '' ? NaN : new Date(value).getTime();

/** No inferred test exclusions: UAT counts contain every saved request. */
export function filterRows(rows, filters = {}) {
  const query = searchable(filters.query).trim();
  const tokens = query.split(/\s+/).filter(Boolean);
  const phoneQuery = /^[+\d\s().-]+$/.test(query) ? query.replace(/\D/g, '') : '';
  const period = filters.period || {};
  const start = period.startInclusiveUtc == null ? -Infinity : dateValue(period.startInclusiveUtc);
  const end = period.endExclusiveUtc == null ? Infinity : dateValue(period.endExclusiveUtc);
  const dateField = period.dateField === 'updated' ? 'updatedAt' : 'submittedAt';
  const hasPeriod = start !== -Infinity || end !== Infinity;
  const exactFields = ['formType', 'status', 'community', 'sport', 'assignee'];
  const matches = rows.filter((row) => {
    if (exactFields.some((field) => filters[field] != null && filters[field] !== '' && row[field] !== filters[field])) return false;
    if (filters.onlyUnassigned && text(row.assignee).trim()) return false;
    if (hasPeriod) {
      const date = dateValue(row[dateField]);
      if (!(date >= start && date < end)) return false;
    }
    if (query) {
      const haystack = searchable([
        row.parentName, row.childName, row.email, row.phone, row.parentNote,
        row.adminNotes, row.community, row.sport, row.assignee, row.id, row.submissionId,
      ].join(' '));
      const matchesText = tokens.every((token) => haystack.includes(token));
      const matchesPhone = phoneQuery && text(row.phone).replace(/\D/g, '').includes(phoneQuery);
      if (!matchesText && !matchesPhone) return false;
    }
    return true;
  });
  const allowedSorts = ['submittedAt', 'updatedAt', 'parentName', 'status', 'community', 'sport', 'formType', 'age', 'assignee'];
  const field = allowedSorts.includes(filters.sort?.field) ? filters.sort.field : 'submittedAt';
  const direction = filters.sort?.direction === 'asc' ? 1 : -1;
  const valueFor = (row) => {
    if (field.endsWith('At')) return dateValue(row[field]);
    if (field === 'age') return Number(row.age);
    if (field === 'status') return statuses.indexOf(row.status);
    return text(row[field]);
  };
  return matches.sort((a, b) => {
    const left = valueFor(a);
    const right = valueFor(b);
    const comparison = typeof left === 'number' ? (left - right || 0) : collator.compare(left, right);
    return comparison * direction || collator.compare(text(a.id), text(b.id));
  });
}

export function paginateRows(rows, page = 1, pageSize = 25) {
  const size = Math.min(100, Math.max(1, Math.trunc(Number(pageSize)) || 25));
  const totalPages = Math.max(1, Math.ceil(rows.length / size));
  const current = Math.min(totalPages, Math.max(1, Math.trunc(Number(page)) || 1));
  return {
    rows: rows.slice((current - 1) * size, current * size),
    page: current,
    pageSize: size,
    total: rows.length,
    totalPages,
    hasNextPage: current < totalPages,
  };
}

export function dateKeyIST(value) {
  const timestamp = dateValue(value);
  if (!Number.isFinite(timestamp)) return '';
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(timestamp);
  const part = (type) => parts.find((entry) => entry.type === type)?.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

export function formatIST(value, style = 'datetime') {
  const timestamp = dateValue(value);
  if (!Number.isFinite(timestamp)) return '—';
  const dateOptions = { day: 'numeric', month: 'short', year: 'numeric' };
  const timeOptions = { hour: 'numeric', minute: '2-digit', hour12: true };
  const options = style === 'date' ? dateOptions : style === 'time' ? timeOptions : { ...dateOptions, ...timeOptions };
  return new Intl.DateTimeFormat('en-IN', { timeZone: TIMEZONE, ...options }).format(timestamp);
}

/** IST calendar windows use an inclusive start and exclusive next-midnight end. */
export function periodForPreset(preset = 'all', referenceIso = new Date().toISOString()) {
  if (preset === 'all') return { dateField: 'created', startInclusiveUtc: null, endExclusiveUtc: null };
  const day = dateKeyIST(referenceIso);
  if (!day) throw new TypeError('A valid reference date is required.');
  const start = Date.parse(`${day}T00:00:00+05:30`);
  return {
    dateField: 'created',
    startInclusiveUtc: new Date(start - (preset === 'last7' ? 6 : 0) * 86400000).toISOString(),
    endExclusiveUtc: new Date(start + 86400000).toISOString(),
  };
}

export function deriveSummary(rows) {
  const metric = (value) => ({ value, availability: 'available', unit: 'requests' });
  const byStatus = Object.fromEntries(statuses.map((status) => [status, 0]));
  const sports = new Map(['Football', 'Basketball', 'Not sure'].map((sport) => [sport, 0]));
  const communities = new Map(['Nambiar Ellegenza', 'Nambiar Bellezea'].map((community) => [community, 0]));
  const daily = new Map();
  for (const row of rows) {
    if (Object.hasOwn(byStatus, row.status)) byStatus[row.status] += 1;
    const sport = row.sport || 'Not sure';
    const community = row.community || 'Not specified';
    sports.set(sport, (sports.get(sport) || 0) + 1);
    communities.set(community, (communities.get(community) || 0) + 1);
    const date = dateKeyIST(row.submittedAt);
    if (date) {
      if (!daily.has(date)) daily.set(date, { date, trial: 0, enrol: 0 });
      if (row.formType === 'trial' || row.formType === 'enrol') daily.get(date)[row.formType] += 1;
    }
  }
  return {
    savedRequests: metric(rows.length),
    awaitingFollowUp: metric(byStatus.new),
    confirmedEnrolmentRequests: metric(rows.filter((row) => row.formType === 'enrol' && row.status === 'confirmed').length),
    trialRequests: metric(rows.filter((row) => row.formType === 'trial').length),
    enrolmentRequests: metric(rows.filter((row) => row.formType === 'enrol').length),
    byStatus,
    bySport: [...sports].map(([sport, requests]) => ({ sport, requests })),
    byCommunity: [...communities].map(([community, requests]) => ({ community, requests })),
    dailyRequests: [...daily.values()].sort((a, b) => a.date.localeCompare(b.date)),
    websiteEngagement: {
      averageActiveSessionSeconds: { value: null, availability: 'not_tracked', unit: 'seconds' },
    },
  };
}

const CSV_COLUMNS = [
  ['id', (row) => row.id],
  ['submission_id', (row) => row.submissionId],
  ['submitted_at_utc', (row) => row.submittedAt],
  ['submitted_at_ist', (row) => formatIST(row.submittedAt)],
  ['form_type', (row) => row.formType],
  ['parent_name', (row) => row.parentName],
  ['child_name', (row) => row.childName],
  ['email', (row) => row.email],
  ['phone', (row) => row.phone, true],
  ['phone_country', (row) => row.phoneCountry],
  ['age', (row) => row.age],
  ['community', (row) => row.community],
  ['sport', (row) => row.sport],
  ['address', (row) => row.address],
  ['parent_note', (row) => row.parentNote],
  ['status', (row) => row.status],
  ['assignee', (row) => row.assignee],
  ['admin_notes', (row) => row.adminNotes],
  ['guardian_consent', (row) => row.consent?.guardianConsent],
  ['terms_accepted', (row) => row.consent?.termsAccepted],
  ['consent_version', (row) => row.consent?.consentVersion],
  ['terms_version', (row) => row.consent?.termsVersion],
  ['revision', (row) => row.revision],
  ['updated_at_utc', (row) => row.updatedAt],
  ['updated_by', (row) => row.updatedBy],
];
export const CSV_HEADERS = CSV_COLUMNS.map(([header]) => header);

function csvCell(value, forceText = false) {
  let cell = text(value);
  // Quote escaping alone does not stop spreadsheet formulas. Keep phone numbers as text too.
  const formula = /^[\s\u200B-\u200F\u2060\uFEFF]*[=+@-]/u.test(cell);
  const leadingControl = /^[\s\u200B-\u200F\u2060\uFEFF]*[\t\r\n]/u.test(cell);
  if (cell && (forceText || formula || leadingControl)) cell = `'${cell}`;
  return `"${cell.replace(/"/g, '""')}"`;
}

/** Pass the full SAVED collection. Pagination, selection and unsaved drafts are never exported. */
export function buildRegisterCsv(allSavedRows, filters = {}, { referenceIso = new Date().toISOString() } = {}) {
  const rows = filterRows(allSavedRows, filters);
  const lines = [CSV_HEADERS.map((header) => csvCell(header)).join(',')];
  for (const row of rows) lines.push(CSV_COLUMNS.map(([, read, forceText]) => csvCell(read(row), forceText)).join(','));
  return {
    text: `\uFEFF${lines.join('\r\n')}\r\n`,
    rowCount: rows.length,
    filename: `letsaimit-register-${dateKeyIST(referenceIso) || 'export'}.csv`,
  };
}

export function defaultFilters(referenceIso = new Date().toISOString()) {
  return { query: '', period: periodForPreset('all', referenceIso), formType: null, status: null, community: null, sport: null, assignee: null, onlyUnassigned: false, page: 1, pageSize: 10, sort: { field: 'submittedAt', direction: 'desc' } };
}

export function toAdminRequest(record) {
  const meta = record.metadata && typeof record.metadata === 'object' ? record.metadata : {};
  const phone = record.phone || '';
  const email = record.email || '';
  return {
    id: record.id, submissionId: record.submission_id || meta.submissionId || record.id,
    submittedAt: record.created, updatedAt: record.updated, updatedBy: record.updated_by || '',
    formType: meta.formType || 'trial', parentName: record.full_name || '', childName: meta.childName || '',
    email, phone, phoneCountry: meta.phoneCountry || '', age: meta.age || '',
    community: meta.community || '', sport: meta.sport || 'Not sure', address: meta.address || '', parentNote: meta.note || '',
    consent: { guardianConsent: meta.guardianConsent === true, termsAccepted: meta.termsAccepted === true, consentVersion: meta.consentVersion || '', termsVersion: meta.termsVersion || '' },
    status: record.status || 'new', assignee: record.assignee || '', adminNotes: record.notes || '', revision: Number(record.revision),
    links: { call: /^\+[1-9]\d{7,14}$/.test(phone) ? `tel:${phone}` : null, email: /^[^\s@?]+@[^\s@?]+$/.test(email) ? `mailto:${email}` : null, whatsapp: /^\+[1-9]\d{7,14}$/.test(phone) ? `https://wa.me/${phone.slice(1)}` : null },
  };
}

export function followUpPatch(patch) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch) || Object.keys(patch).some(key => !['status', 'assignee', 'adminNotes'].includes(key))) throw new TypeError('Only follow-up fields can change.');
  if (!statuses.includes(patch.status)) throw new TypeError('Choose a valid status.');
  if (typeof patch.assignee !== 'string' || patch.assignee.length > ASSIGNEE_LIMIT) throw new TypeError('Check the assignee.');
  if (typeof patch.adminNotes !== 'string' || patch.adminNotes.length > ADMIN_NOTE_LIMIT) throw new TypeError('Keep team notes under 2,001 characters.');
  return { status: patch.status, assignee: patch.assignee.trim(), notes: patch.adminNotes };
}

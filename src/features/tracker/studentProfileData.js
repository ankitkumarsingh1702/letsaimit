import { studentBillingDetails } from './studentBillingData.js';
import { feedbackRow, rpcError, verifyActor } from './trackerData.js';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const scopeOptions = ['admin', 'coach'];
const text = value => typeof value === 'string' ? value.trim() : '';
const timestamp = value => typeof value === 'string' && Number.isFinite(Date.parse(value));
const optionalTimestamp = value => timestamp(value) ? value : null;
const recordedConsent = value => typeof value === 'boolean' ? value : null;

export async function fetchStudentProfile(options) {
  const { client, registrationId, scope } = options;
  if (!uuid.test(registrationId || '') || !scopeOptions.includes(scope)) throw new Error('Choose a student.');
  await verifyActor(options);
  const { data, error } = await client.rpc('list_coaching_student_profile', { p_registration_id: registrationId, p_scope: scope });
  if (error) throw rpcError(error, 'Couldn’t load the student profile. Try again.');
  await verifyActor(options);

  if (data?.registrationId !== registrationId || !text(data.childName) || !Array.isArray(data.feedback)) {
    throw new Error('The student profile could not be confirmed.');
  }
  const feedback = data.feedback.map(feedbackRow);
  if (feedback.some(row => row.registrationId !== registrationId)) throw new Error('Student feedback could not be confirmed.');
  return {
    registrationId,
    childName: text(data.childName),
    age: text(data.age),
    school: text(data.school),
    sport: text(data.sport),
    community: text(data.community),
    parentName: text(data.parentName),
    parentEmail: text(data.parentEmail),
    parentPhone: text(data.parentPhone),
    phoneCountry: text(data.phoneCountry),
    address: text(data.address),
    parentNote: text(data.parentNote),
    followUpStatus: text(data.followUpStatus),
    followUpNote: scope === 'admin' ? text(data.followUpNote) : '',
    submittedAt: optionalTimestamp(data.submittedAt),
    acceptedAt: optionalTimestamp(data.acceptedAt),
    guardianConsent: recordedConsent(data.guardianConsent),
    termsAccepted: recordedConsent(data.termsAccepted),
    consentVersion: text(data.consentVersion),
    termsVersion: text(data.termsVersion),
    billingConsent: scope === 'admin' ? recordedConsent(data.billingConsent) : null,
    billingTermsVersion: scope === 'admin' ? text(data.billingTermsVersion) : '',
    billing: scope === 'admin' ? studentBillingDetails(data.billing, registrationId) : null,
    feedback,
  };
}

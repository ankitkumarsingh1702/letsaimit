/**
 * Legacy LetsAimIt society/school enquiry storage for Apps Script (V8 runtime).
 *
 * Owner setup: run setupLeadSheet(), then deploy as a Web app executing as you.
 * The workbook remains private. Anonymous visitors can only submit an enquiry;
 * this script never returns records, spreadsheet URLs, or personal details.
 * Parent trial/enrolment submissions require Google on the canonical website.
 *
 * See README.md before deployment. No email alerts, paid API, or client secret.
 */
const LEAD_CONFIG = Object.freeze({
  consentVersion: '2026-11-05',
  sheetProperty: 'LETSAIMIT_LEAD_SHEET_ID',
  siteOrigin: 'https://letsaimit.com',
  maxBodyBytes: 16384,
  phone: '+91 88688 86074',
});

// Retired parent tab metadata stays for historical submission-ID checks only.
const LEAD_SCHEMAS = Object.freeze({
  trial: {
    tab: 'Trial',
    title: 'LetsAimIt — Free first session',
    fields: ['parentName', 'phone', 'age', 'community', 'sport'],
    labels: ['Parent name', 'Phone', 'Child age', 'Community', 'Sport'],
  },
  enrol: {
    tab: 'Enrolment',
    title: 'LetsAimIt — Child registration',
    fields: ['parentName', 'phone', 'childName', 'age', 'community', 'sport'],
    labels: ['Parent name', 'Phone', 'Child name', 'Child age', 'Community', 'Sport'],
  },
  society: {
    tab: 'Societies',
    title: 'LetsAimIt — Your society',
    fields: ['societyName', 'locality', 'contactName', 'phone', 'role', 'childrenCount', 'space', 'message'],
    labels: ['Society', 'Locality', 'Contact name', 'Phone', 'Contact role', 'Children expected', 'Available space', 'Message'],
  },
  school: {
    tab: 'Schools',
    title: 'LetsAimIt — School enquiry',
    fields: ['schoolName', 'city', 'contactName', 'phone', 'role', 'needs'],
    labels: ['School', 'City', 'Contact name', 'Phone', 'Contact role', 'Support needed'],
  },
});
const ACTIVE_LEGACY_FORM_TYPES = Object.freeze(['society', 'school']);

const LEAD_BASE_HEADERS = Object.freeze([
  'Submission ID', 'Received (UTC)', 'Consent version', 'Consent recorded (UTC)',
  'Parent or guardian confirmed', 'Terms accepted', 'Terms version',
]);

/** A GET request never exposes configuration or saved responses. */
function doGet() {
  return jsonResponse_({
    ok: false,
    code: 'METHOD_NOT_ALLOWED',
    message: 'Use the website registration form to submit a request.',
  });
}

/** The only public write operation. Returns success only after row readback. */
function doPost(event) {
  let lock;
  let lockHeld = false;
  try {
    const request = parseRequest_(event);
    const lead = validateLead_(request);
    const sheetId = PropertiesService.getScriptProperties().getProperty(LEAD_CONFIG.sheetProperty);
    if (!sheetId) {
      throw leadError_('NOT_CONFIGURED', 'Registration is not connected yet. Please use the contact option.');
    }

    lock = LockService.getScriptLock();
    lockHeld = lock.tryLock(10000);
    if (!lockHeld) {
      throw leadError_('SERVICE_UNAVAILABLE', 'We could not confirm the save. Please retry.');
    }

    const workbook = SpreadsheetApp.openById(sheetId);
    const fingerprint = payloadFingerprint_(lead);
    const existing = findSubmission_(workbook, lead.submissionId);
    if (existing) {
      if (existing.formType !== lead.formType || existing.fingerprint !== fingerprint) {
        throw leadError_('SUBMISSION_CONFLICT', 'These details have changed. Please submit them as a new request.');
      }
      return jsonResponse_({
        ok: true,
        submissionId: lead.submissionId,
        savedAt: existing.savedAt,
        duplicate: true,
      });
    }

    const schema = LEAD_SCHEMAS[lead.formType];
    const sheet = workbook.getSheetByName(schema.tab);
    assertHeaders_(sheet, lead.formType);
    const savedAt = new Date().toISOString();
    const row = [
      lead.submissionId, savedAt, LEAD_CONFIG.consentVersion, savedAt,
      lead.guardian ? 'Yes' : 'Not applicable',
      lead.terms ? 'Yes' : 'Not applicable',
      lead.terms ? LEAD_CONFIG.consentVersion : '',
    ].concat(schema.fields.map(function (field) { return lead.data[field]; }), [fingerprint]);

    const rowIndex = sheet.getLastRow() + 1;
    if (rowIndex > sheet.getMaxRows()) {
      sheet.insertRowsAfter(sheet.getMaxRows(), Math.max(100, rowIndex - sheet.getMaxRows()));
    }
    const range = sheet.getRange(rowIndex, 1, 1, row.length);
    range.setNumberFormat('@');
    range.setValues([row.map(escapeCell_)]);
    SpreadsheetApp.flush();
    const saved = range.getValues()[0];
    if (String(saved[0]) !== lead.submissionId || String(saved[saved.length - 1]) !== fingerprint) {
      throw leadError_('SERVICE_UNAVAILABLE', 'We could not confirm the save. Please retry.');
    }

    return jsonResponse_({ok: true, submissionId: lead.submissionId, savedAt: savedAt, duplicate: false});
  } catch (error) {
    // Do not return or log raw exceptions: they can contain private data.
    const result = {
      ok: false,
      code: error && error.leadCode ? error.leadCode : 'SERVICE_UNAVAILABLE',
      message: error && error.leadMessage ? error.leadMessage : 'We could not confirm the save. Please retry.',
    };
    if (error && error.leadField) result.field = error.leadField;
    return jsonResponse_(result);
  } finally {
    if (lockHeld) lock.releaseLock();
  }
}

function parseRequest_(event) {
  if (!event || !event.postData || typeof event.postData.contents !== 'string') {
    throw leadError_('INVALID_REQUEST', 'Please submit the website form again.');
  }
  const raw = event.postData.contents;
  if (!raw || raw.length > LEAD_CONFIG.maxBodyBytes || Number(event.postData.length) > LEAD_CONFIG.maxBodyBytes) {
    throw leadError_('INVALID_REQUEST', 'The request is too large or empty.');
  }
  let request;
  try { request = JSON.parse(raw); } catch (error) {
    throw leadError_('INVALID_REQUEST', 'Please submit the website form again.');
  }
  if (!request || typeof request !== 'object' || Array.isArray(request)) {
    throw leadError_('INVALID_REQUEST', 'Please submit the website form again.');
  }
  return request;
}

function validateLead_(request) {
  const formType = request.formType;
  rejectRetiredParentForm_(formType);
  if (typeof formType !== 'string' || !Object.prototype.hasOwnProperty.call(LEAD_SCHEMAS, formType)) {
    throw leadError_('VALIDATION_ERROR', 'Choose a valid form.', 'formType');
  }
  if (typeof request.submissionId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(request.submissionId)) {
    throw leadError_('VALIDATION_ERROR', 'Please start a new request.', 'submissionId');
  }
  const consent = request.consent || {};
  const parentForm = formType === 'trial' || formType === 'enrol';
  if (consent.agreed !== true || consent.version !== LEAD_CONFIG.consentVersion) {
    throw leadError_('CONSENT_REQUIRED', 'Please read and accept the current privacy notice.', 'consent');
  }
  if (parentForm && consent.guardian !== true) {
    throw leadError_('CONSENT_REQUIRED', 'A parent or legal guardian must submit this form.', 'consent');
  }
  if (formType === 'enrol' && consent.terms !== true) {
    throw leadError_('CONSENT_REQUIRED', 'Please accept the enrolment terms and cancellation policy.', 'terms');
  }
  const source = request.data;
  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    throw leadError_('VALIDATION_ERROR', 'Please complete the form.', 'data');
  }
  const data = {};
  const limits = {
    parentName: 100, contactName: 100, childName: 100, phone: 28, age: 10,
    community: 160, sport: 30, societyName: 160, locality: 160, role: 100,
    childrenCount: 20, space: 200, message: 800, schoolName: 160, city: 100, needs: 800,
  };
  LEAD_SCHEMAS[formType].fields.forEach(function (field) {
    const optional = field === 'message' || field === 'needs' || (formType === 'school' && field === 'role');
    data[field] = textField_(source[field], field, limits[field], !optional);
  });
  if (!/^\+?[\d\s()-]+$/.test(data.phone)) {
    throw leadError_('VALIDATION_ERROR', 'Enter a valid phone number.', 'phone');
  }
  const digits = data.phone.replace(/\D/g, '');
  if (digits.length < 8 || digits.length > 15) {
    throw leadError_('VALIDATION_ERROR', 'Enter a valid phone number.', 'phone');
  }
  data.phone = (data.phone.charAt(0) === '+' ? '+' : '') + digits;

  if (parentForm) {
    const ageValid = /^(?:[5-9]|1[0-4])$/.test(data.age) || (formType === 'trial' && data.age === 'other');
    if (!ageValid) throw leadError_('VALIDATION_ERROR', 'Choose your child’s age.', 'age');
    if (['Football', 'Basketball', 'Not sure'].indexOf(data.sport) === -1) {
      throw leadError_('VALIDATION_ERROR', 'Choose a sport.', 'sport');
    }
  }
  if (formType === 'society') {
    if (/^not sure$/i.test(data.childrenCount)) data.childrenCount = 'Not sure';
    if (data.childrenCount !== 'Not sure' && !/^[1-9]\d{0,3}$/.test(data.childrenCount)) {
      throw leadError_('VALIDATION_ERROR', 'Enter a number of children, or Not sure.', 'childrenCount');
    }
  }
  return {
    submissionId: request.submissionId.toLowerCase(), formType: formType,
    guardian: parentForm, terms: formType === 'enrol', data: data,
  };
}

function rejectRetiredParentForm_(kind) {
  if (['trial', 'enrol', 'enroll'].indexOf(kind) === -1) return;
  const message = 'Parent trial and enrolment submissions have moved. Use https://letsaimit.com/ and sign in with Google before submitting.';
  const error = leadError_('PARENT_REGISTRATION_RETIRED', message, 'formType');
  error.message = message; // Also clear when an owner calls a native-form helper.
  throw error;
}

function textField_(value, field, limit, required) {
  if (value === undefined || value === null) value = '';
  if (typeof value !== 'string' && typeof value !== 'number') {
    throw leadError_('VALIDATION_ERROR', 'Please check this field.', field);
  }
  const text = String(value).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim();
  if (required && !text) throw leadError_('VALIDATION_ERROR', 'Please complete this field.', field);
  if (text.length > limit) throw leadError_('VALIDATION_ERROR', 'Please shorten this answer.', field);
  return text;
}

/** Prefix spreadsheet formula characters, including after leading whitespace. */
function escapeCell_(value) {
  const text = String(value === undefined || value === null ? '' : value);
  return /^[\s\u0000-\u001F]*[=+\-@]/.test(text) ? "'" + text : text;
}

function payloadFingerprint_(lead) {
  const input = JSON.stringify([lead.formType, LEAD_CONFIG.consentVersion, lead.guardian, lead.terms, lead.data]);
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, input, Utilities.Charset.UTF_8)
    .map(function (byte) { return ('0' + (byte & 255).toString(16)).slice(-2); }).join('');
}

function headersFor_(formType) {
  return LEAD_BASE_HEADERS.concat(LEAD_SCHEMAS[formType].labels, ['Payload fingerprint']);
}

function assertHeaders_(sheet, formType) {
  const headers = headersFor_(formType);
  if (!sheet || sheet.getLastRow() < 1 || JSON.stringify(sheet.getRange(1, 1, 1, headers.length).getValues()[0]) !== JSON.stringify(headers)) {
    throw leadError_('NOT_CONFIGURED', 'Registration is not connected yet. Please use the contact option.');
  }
}

function findSubmission_(workbook, submissionId) {
  const kinds = Object.keys(LEAD_SCHEMAS);
  for (let index = 0; index < kinds.length; index += 1) {
    const kind = kinds[index];
    const sheet = workbook.getSheetByName(LEAD_SCHEMAS[kind].tab);
    assertHeaders_(sheet, kind);
    if (sheet.getLastRow() < 2) continue;
    const match = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1)
      .createTextFinder(submissionId).matchEntireCell(true).findNext();
    if (!match) continue;
    const values = sheet.getRange(match.getRow(), 1, 1, headersFor_(kind).length).getValues()[0];
    return {formType: kind, savedAt: String(values[1]), fingerprint: String(values[values.length - 1])};
  }
  return null;
}

function leadError_(code, message, field) {
  const error = new Error(code);
  error.leadCode = code;
  error.leadMessage = message;
  error.leadField = field || '';
  return error;
}

function jsonResponse_(value) {
  return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON);
}

/** Owner-only setup in the Apps Script editor. Never called by doGet/doPost. */
function setupLeadSheet() {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const properties = PropertiesService.getScriptProperties();
    let sheetId = properties.getProperty(LEAD_CONFIG.sheetProperty);
    let workbook;
    if (sheetId) {
      workbook = SpreadsheetApp.openById(sheetId);
    } else {
      workbook = SpreadsheetApp.create('LetsAimIt — Registrations');
      sheetId = workbook.getId();
      properties.setProperty(LEAD_CONFIG.sheetProperty, sheetId);
      workbook.getSheets()[0].setName(LEAD_SCHEMAS.trial.tab);
    }
    workbook.setSpreadsheetTimeZone('Asia/Kolkata');
    Object.keys(LEAD_SCHEMAS).forEach(function (kind) {
      const schema = LEAD_SCHEMAS[kind];
      let sheet = workbook.getSheetByName(schema.tab);
      if (!sheet) sheet = workbook.insertSheet(schema.tab);
      const headers = headersFor_(kind);
      if (sheet.getLastRow() === 0) {
        sheet.getRange(1, 1, 1, headers.length).setValues([headers])
          .setBackground('#143e35').setFontColor('#ffffff').setFontWeight('bold').setWrap(true);
        sheet.setFrozenRows(1);
        sheet.setColumnWidths(1, headers.length, 180);
      }
      assertHeaders_(sheet, kind);
    });
    SpreadsheetApp.flush();
    const result = {spreadsheetUrl: workbook.getUrl(), consentVersion: LEAD_CONFIG.consentVersion};
    console.log(JSON.stringify(result)); // Only the signed-in owner sees setup output.
    return result;
  } finally {
    lock.releaseLock();
  }
}

/**
 * Optional: create society/school native Google Forms for this private workbook.
 * Google creates separate response tabs for these forms. They do not write to
 * the direct web-app tabs above. Running this again reuses completed forms.
 */
function setupRegistrationForms() {
  setupLeadSheet();
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const properties = PropertiesService.getScriptProperties();
    const sheetId = properties.getProperty(LEAD_CONFIG.sheetProperty);
    const origin = (properties.getProperty('LETSAIMIT_SITE_ORIGIN') || LEAD_CONFIG.siteOrigin).replace(/\/$/, '');
    if (!/^https:\/\/[^\s?#]+$/.test(origin)) throw new Error('Set LETSAIMIT_SITE_ORIGIN to the public HTTPS site origin.');
    const links = {privacy: origin + '/privacy/', terms: origin + '/terms/', refunds: origin + '/refunds/'};
    const output = {};

    ACTIVE_LEGACY_FORM_TYPES.forEach(function (kind) {
      const idKey = 'LETSAIMIT_FORM_' + kind.toUpperCase();
      const readyKey = idKey + '_READY_VERSION';
      const savedId = properties.getProperty(idKey);
      let form;
      if (savedId) {
        form = FormApp.openById(savedId);
        if (properties.getProperty(readyKey) !== LEAD_CONFIG.consentVersion) {
          throw new Error('An existing ' + kind + ' form needs owner review. No questions were changed or duplicated. See README.');
        }
      } else {
        form = FormApp.create(LEAD_SCHEMAS[kind].title, false);
        properties.setProperty(idKey, form.getId());
        configureNativeForm_(form, kind, links);
        form.setDestination(FormApp.DestinationType.SPREADSHEET, sheetId);
        if (form.supportsAdvancedResponderPermissions()) form.setPublished(true);
        form.setAcceptingResponses(true);
        properties.setProperty(readyKey, LEAD_CONFIG.consentVersion);
      }
      if (form.getDestinationId() !== sheetId || form.getDestinationType() !== FormApp.DestinationType.SPREADSHEET) {
        throw new Error('The ' + kind + ' form is not linked to the expected workbook. Check its response destination.');
      }
      output[kind] = {responderUrl: form.getPublishedUrl(), editorUrl: form.getEditUrl()};
    });
    console.log(JSON.stringify(output));
    return output;
  } finally {
    lock.releaseLock();
  }
}

function configureNativeForm_(form, kind, links) {
  rejectRetiredParentForm_(kind);
  const parentForm = kind === 'trial' || kind === 'enrol';
  const intro = kind === 'trial'
    ? 'Your first session is free. We’ll confirm a suitable group and time.'
    : kind === 'enrol'
      ? 'Register your child for football or basketball training. We’ll confirm the group before enrolment.'
      : kind === 'society'
        ? 'Tell us about your society and the space available for sport.'
        : 'Consultancy for your existing PE team. Tell us where support would help.';
  form.setDescription(intro + '\n\nPrivacy: ' + links.privacy + '\nQuestions? ' + LEAD_CONFIG.phone)
    .setCollectEmail(false).setLimitOneResponsePerUser(false).setAllowResponseEdits(false)
    .setPublishingSummary(false).setShowLinkToRespondAgain(false)
    .setConfirmationMessage('Thank you. Your request is saved. We’ll contact you about the next step. For questions, call ' + LEAD_CONFIG.phone + '.');

  if (parentForm) {
    nativeText_(form, 'Parent or guardian’s name', true, 100);
    nativePhone_(form);
    if (kind === 'enrol') nativeText_(form, 'Child’s name', true, 100);
    const ages = ['5', '6', '7', '8', '9', '10', '11', '12', '13', '14'];
    if (kind === 'trial') ages.push('Under 5 or over 14 — please advise');
    form.addListItem().setTitle('Child’s age').setChoiceValues(ages).setRequired(true);
    nativeText_(form, 'Community or locality', true, 160);
    form.addMultipleChoiceItem().setTitle('Sport').setChoiceValues(['Football', 'Basketball', 'Not sure']).setRequired(true);
    form.addCheckboxItem().setTitle('Parent consent · ' + LEAD_CONFIG.consentVersion)
      .setHelpText('I am this child’s parent or legal guardian. I agree to LetsAimIt using these details to handle this request and contact me about it. Privacy: ' + links.privacy)
      .setChoiceValues(['I agree']).setRequired(true);
    if (kind === 'enrol') {
      form.addCheckboxItem().setTitle('Enrolment terms · ' + LEAD_CONFIG.consentVersion)
        .setHelpText('I have read the terms and cancellation policy, including the rules on fees and withdrawal. Terms: ' + links.terms + '\nCancellations: ' + links.refunds)
        .setChoiceValues(['I agree']).setRequired(true);
    }
  } else {
    if (kind === 'society') {
      nativeText_(form, 'Society name', true, 160);
      nativeText_(form, 'Locality and city', true, 160);
    } else {
      nativeText_(form, 'School name', true, 160);
      nativeText_(form, 'City', true, 100);
    }
    nativeText_(form, 'Your name', true, 100);
    nativePhone_(form);
    nativeText_(form, 'Your role', kind === 'society', 100);
    if (kind === 'society') {
      form.addTextItem().setTitle('Children expected').setRequired(true)
        .setHelpText('Enter an estimate from 1 to 9999, or Not sure.')
        .setValidation(FormApp.createTextValidation().requireTextMatchesPattern('^(?:[1-9][0-9]{0,3}|[Nn]ot [Ss]ure)$').build());
      nativeText_(form, 'Available space', true, 200).setHelpText('For example, a basketball court or open ground.');
    }
    form.addParagraphTextItem().setTitle(kind === 'society' ? 'Anything else?' : 'Where would support help?')
      .setHelpText('Optional. Please leave out child names and health information.')
      .setRequired(false).setValidation(FormApp.createParagraphTextValidation().requireTextLengthLessThanOrEqualTo(800).build());
    form.addCheckboxItem().setTitle('Contact consent · ' + LEAD_CONFIG.consentVersion)
      .setHelpText('I agree to LetsAimIt using these details to handle this enquiry and contact me about it. Privacy: ' + links.privacy)
      .setChoiceValues(['I agree']).setRequired(true);
  }
}

function nativeText_(form, title, required, maxLength) {
  return form.addTextItem().setTitle(title).setRequired(required)
    .setValidation(FormApp.createTextValidation().requireTextLengthLessThanOrEqualTo(maxLength).build());
}

function nativePhone_(form) {
  return form.addTextItem().setTitle('Phone number').setRequired(true)
    .setHelpText('Add the country code if needed.')
    .setValidation(FormApp.createTextValidation().requireTextMatchesPattern('^\\+?(?:[ ()-]*[0-9]){8,15}[ ()-]*$').build());
}

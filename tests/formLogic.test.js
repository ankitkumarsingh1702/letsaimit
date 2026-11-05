import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FORM_LINKS,
  createInitialDrafts,
  fieldError,
  validateForm,
  prepareMessage,
  createWhatsAppUrl,
} from '../src/lib/formLogic.js';

test('empty trial fields keep the source error copy and first-invalid order', () => {
  assert.deepEqual(validateForm('trial', createInitialDrafts().trial), {
    parentName: 'Enter your name.',
    phone: 'Enter a phone number.',
    age: 'Choose your child’s age.',
    community: 'Choose your community.',
    sport: 'Choose a sport.',
  });
});

test('phone validation preserves international formatting and rejects wrong lengths or letters', () => {
  for (const phone of ['+91 98765 43210', ' (123) 456-7890 ', '12345678', '+123456789012345']) {
    assert.equal(fieldError('phone', phone), '', phone);
  }
  for (const phone of ['1234567', '+1234567890123456', 'call 9876543210', '91+9876543210', '+91.9876543210']) {
    assert.equal(fieldError('phone', phone), 'Enter a valid phone number.', phone);
  }
  assert.equal(fieldError('phone', '  '), 'Enter a phone number.');
});

test('age choice is restricted to 5–14 or the trial guidance option', () => {
  for (const age of ['5', '6', '7', '8', '9', '10', '11', '12', '13', '14', 'other']) {
    assert.equal(fieldError('age', age), '');
  }
  for (const age of ['', '4', '15', 'banana']) {
    assert.equal(fieldError('age', age), 'Choose your child’s age.');
  }
});

test('society validates only the current step and permits an empty optional message', () => {
  const society = createInitialDrafts().society;
  assert.deepEqual(validateForm('society', society, 1), {
    societyName: 'Enter your society’s name.',
    locality: 'Enter the locality and city.',
    childrenCount: 'Enter an estimate, or Not sure.',
    space: 'Tell us about the available space.',
  });
  assert.deepEqual(validateForm('society', { ...society, contactName: '  Asha  ', phone: '+91 98765 43210', role: 'Resident' }, 2), {
    contactName: '', phone: '', role: '', message: '',
  });
});

test('trial WhatsApp draft keeps the chosen sport and consent and encodes punctuation safely', () => {
  const draft = { parentName: '  Asha & Dev  ', phone: '  +91 98765 43210  ', age: '8', community: '  Elm / West  ', sport: 'Basketball' };
  const message = [
    'Hi Coach Dhiraj, I’d like to book a first free session with LetsAimIt.',
    'Parent/guardian: Asha & Dev',
    'Phone: +91 98765 43210',
    'Child’s age: 8 years',
    'Community: Elm / West',
    'Sport: Basketball',
    'Please confirm a suitable group and session time.',
    'Parent/guardian and contact consent: agreed. Privacy version: 2026-11-05.',
  ].join('\n');
  assert.equal(prepareMessage('trial', draft), message);
  const url = new URL(createWhatsAppUrl('trial', draft));
  assert.equal(`${url.origin}${url.pathname}`, FORM_LINKS.whatsapp);
  assert.equal(url.searchParams.get('text'), message);
  assert.match(prepareMessage('trial', { ...draft, age: 'other' }), /Child’s age: Under 5 or over 14 — please advise/);
});

test('society message includes the first-step draft and only a nonblank optional message', () => {
  const draft = {
    societyName: ' Elm ', locality: ' Bengaluru ', contactName: ' Asha ',
    phone: ' +91 98765 43210 ', role: ' Resident ', childrenCount: '12',
    space: ' Covered court ', message: '   ',
  };
  const expected = [
    'Hi Coach Dhiraj, I’d like to discuss sport for our society.',
    'Society: Elm', 'Location: Bengaluru', 'Contact: Asha', 'Role: Resident', 'Phone: +91 98765 43210',
    'Interested children (estimate): 12', 'Available space: Covered court',
    'Contact consent: agreed. Privacy version: 2026-11-05.',
  ].join('\n');
  assert.equal(prepareMessage('society', draft), expected);
  assert.equal(prepareMessage('society', { ...draft, message: '  We have a playing space.  ' }), expected.replace('Contact consent:', 'Message: We have a playing space.\nContact consent:'));
});

test('draft initializer returns independent memory-only objects', () => {
  const first = createInitialDrafts();
  const second = createInitialDrafts();
  first.trial.parentName = 'Asha';
  assert.equal(second.trial.parentName, '');
  assert.equal(first.society.contactName, '');
});

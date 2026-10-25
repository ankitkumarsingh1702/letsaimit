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
    community: 'Enter your society or locality.',
  });
});

test('phone validation preserves international formatting and rejects wrong lengths or letters', () => {
  for (const phone of ['+91 98765 43210', ' (123) 456-7890 ', '12345678', '+123456789012345']) {
    assert.equal(fieldError('phone', phone), '', phone);
  }
  for (const phone of ['1234567', '+1234567890123456', 'call 9876543210', '91+9876543210', '+91.9876543210']) {
    assert.equal(fieldError('phone', phone), 'Enter a valid phone number, with country code if needed.', phone);
  }
  assert.equal(fieldError('phone', '  '), 'Enter a phone number.');
});

test('age choice is restricted to 5–13 or the coach guidance option', () => {
  for (const age of ['5', '6', '7', '8', '9', '10', '11', '12', '13', 'other']) {
    assert.equal(fieldError('age', age), '');
  }
  for (const age of ['', '4', '14', 'banana']) {
    assert.equal(fieldError('age', age), 'Choose your child’s age.');
  }
});

test('society validates only the current step and permits an empty optional message', () => {
  const society = createInitialDrafts().society;
  assert.deepEqual(validateForm('society', society, 1), {
    societyName: 'Enter your society’s name.',
    locality: 'Enter the locality and city.',
  });
  assert.deepEqual(validateForm('society', { ...society, contactName: '  Asha  ', phone: '+91 98765 43210' }, 2), {
    contactName: '', phone: '', message: '',
  });
});

test('trial WhatsApp draft keeps original copy, trims fields and encodes punctuation safely', () => {
  const draft = { parentName: '  Asha & Dev  ', phone: '  +91 98765 43210  ', age: '8', community: '  Elm / West  ' };
  const message = [
    'Hi Coach Dhiraj, I’d like to ask about a free football trial.',
    'Parent/guardian: Asha & Dev',
    'Phone: +91 98765 43210',
    'Child’s age: 8 years',
    'Community: Elm / West',
    'Please let me know the current availability and timing.',
  ].join('\n');
  assert.equal(prepareMessage('trial', draft), message);
  const url = new URL(createWhatsAppUrl('trial', draft));
  assert.equal(`${url.origin}${url.pathname}`, FORM_LINKS.whatsapp);
  assert.equal(url.searchParams.get('text'), message);
  assert.match(prepareMessage('trial', { ...draft, age: 'other' }), /Child’s age: Under 5 or over 13 — please advise on a suitable group/);
});

test('society message includes the first-step draft and only a nonblank optional message', () => {
  const draft = {
    societyName: ' Elm ', locality: ' Bengaluru ', contactName: ' Asha ',
    phone: ' +91 98765 43210 ', message: '   ',
  };
  const expected = [
    'Hi Coach Dhiraj, I’d like to discuss football coaching in our society.',
    'Society: Elm', 'Location: Bengaluru', 'Contact: Asha', 'Phone: +91 98765 43210',
  ].join('\n');
  assert.equal(prepareMessage('society', draft), expected);
  assert.equal(prepareMessage('society', { ...draft, message: '  We have a playing space.  ' }), `${expected}\nMessage: We have a playing space.`);
});

test('draft initializer returns independent memory-only objects', () => {
  const first = createInitialDrafts();
  const second = createInitialDrafts();
  first.trial.parentName = 'Asha';
  assert.equal(second.trial.parentName, '');
  assert.equal(first.society.contactName, '');
});

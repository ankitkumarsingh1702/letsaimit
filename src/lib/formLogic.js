/** Official destinations preserved from the approved LetsAimIt website. */
export const FORM_LINKS = Object.freeze({
  whatsapp: 'https://wa.me/918868886074',
  registration: 'https://forms.gle/zNEWMbwzLcEiA3Ym8',
  societyEnquiry: 'https://forms.gle/H6CmdvR8qxJ4UpVM9',
  privacy: 'https://letsaimit.com/privacy-policy',
});

export const TRIAL_AGES = Object.freeze(
  Array.from({ length: 9 }, (_, index) => String(index + 5)),
);

export function createInitialDrafts() {
  return {
    trial: { parentName: '', phone: '', age: '', community: '' },
    society: { societyName: '', locality: '', contactName: '', phone: '', message: '' },
  };
}

/** Uses the same validation and copy as the original vanilla forms. */
export function fieldError(name, rawValue, required = true) {
  const value = rawValue.trim();
  if (required && !value) {
    if (name === 'age') return 'Choose your child’s age.';
    if (name === 'phone') return 'Enter a phone number.';
    if (name === 'community') return 'Enter your society or locality.';
    if (name === 'societyName') return 'Enter your society’s name.';
    if (name === 'locality') return 'Enter the locality and city.';
    return 'Enter your name.';
  }
  if (name === 'phone' && value) {
    const digits = value.replace(/\D/g, '');
    if (!/^\+?[\d\s()\-]+$/.test(value) || digits.length < 8 || digits.length > 15) {
      return 'Enter a valid phone number, with country code if needed.';
    }
  }
  if (name === 'age' && value && ![...TRIAL_AGES, 'other'].includes(value)) {
    return 'Choose your child’s age.';
  }
  return '';
}

export function visibleFieldNames(mode, societyStep = 1) {
  if (mode === 'trial') return ['parentName', 'phone', 'age', 'community'];
  if (mode === 'society') {
    return societyStep === 1
      ? ['societyName', 'locality']
      : ['contactName', 'phone', 'message'];
  }
  return [];
}

/** Object order matches the visible fields, so the first error can receive focus. */
export function validateForm(mode, draft, societyStep = 1) {
  return Object.fromEntries(
    visibleFieldNames(mode, societyStep).map((name) => [
      name,
      fieldError(name, draft[name], name !== 'message'),
    ]),
  );
}

export function prepareMessage(mode, value) {
  if (mode === 'trial') {
    return [
      'Hi Coach Dhiraj, I’d like to ask about a free football trial.',
      `Parent/guardian: ${value.parentName.trim()}`,
      `Phone: ${value.phone.trim()}`,
      `Child’s age: ${value.age === 'other' ? 'Under 5 or over 13 — please advise on a suitable group' : `${value.age} years`}`,
      `Community: ${value.community.trim()}`,
      'Please let me know the current availability and timing.',
    ].join('\n');
  }
  return [
    'Hi Coach Dhiraj, I’d like to discuss football coaching in our society.',
    `Society: ${value.societyName.trim()}`,
    `Location: ${value.locality.trim()}`,
    `Contact: ${value.contactName.trim()}`,
    `Phone: ${value.phone.trim()}`,
    ...(value.message.trim() ? [`Message: ${value.message.trim()}`] : []),
  ].join('\n');
}

export function createWhatsAppUrl(mode, value) {
  return `${FORM_LINKS.whatsapp}?text=${encodeURIComponent(prepareMessage(mode, value))}`;
}

export const PAGE_TITLES = {
  home: 'Football, close to home',
  programme: 'Programme & fees',
  coach: 'Meet Coach Dhiraj',
  societies: 'Football for your society',
};

/** Keep the original site's hash URLs, including its home fallback. */
export function pageFromHash(hash) {
  const route = hash.replace(/^#\/?/, '').split('?')[0];
  return Object.hasOwn(PAGE_TITLES, route) ? route : 'home';
}

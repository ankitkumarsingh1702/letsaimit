export const PAGE_TITLES = {
  home: 'Sports and fitness, close to home',
  programme: 'Programme & fees',
  coach: 'Meet Coach Dhiraj',
  societies: 'Sports and fitness for your society',
};

/** Keep the original site's hash URLs, including its home fallback. */
export function pageFromHash(hash) {
  const route = hash.replace(/^#\/?/, '').split('?')[0];
  return Object.hasOwn(PAGE_TITLES, route) ? route : 'home';
}

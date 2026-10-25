/** Resolve a bundled public asset for both root and subdirectory deployments. */
export function asset(filename) {
  return `${import.meta.env.BASE_URL}assets/${filename}`;
}

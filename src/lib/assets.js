function asset(filename) {
  return `${import.meta.env.BASE_URL}assets/${filename}`;
}
export { asset };

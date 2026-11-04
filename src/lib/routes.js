var PAGE_TITLES = {
  home: "Sport, close to home",
  programme: "Programme",
  coach: "Meet Coach Dhiraj",
  societies: "Sports for your society",
  schools: "School fitness consultancy",
  events: "Events and match days",
};
function pageFromHash(hash) {
  let page = hash.replace(/^#\/?/, "").split("?")[0];
  return Object.hasOwn(PAGE_TITLES, page) ? page : "home";
}
export { PAGE_TITLES, pageFromHash };

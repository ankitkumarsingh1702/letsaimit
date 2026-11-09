export const SITE_ORIGIN = (import.meta.env.VITE_SITE_ORIGIN || "https://letsaimit-review.one92843.chatgpt.site").replace(/\/$/, "");
export const PAGE_META = {
  home: { path: "/", title: "Sport, close to home", description: "Football and basketball for ages 5–14. Build fitness, confidence and friendships at Nambiar Ellegenza and Nambiar Bellezea, Bengaluru. First session free." },
  programme: { path: "/programme/", title: "Football & basketball training", description: "Ages 5–14. Two sessions a week, 45–60 minutes each. Football and basketball at Nambiar Ellegenza and Nambiar Bellezea. Try your first session free." },
  coach: { path: "/coach/", title: "Meet Coach Dhiraj", description: "Meet Dhiraj, former head coach at Frisco Soccer Association, Texas, and founder of LetsAimIt in Bengaluru. Explore his coaching story and credentials." },
  societies: { path: "/societies/", title: "Sports for your society", description: "Bring football, basketball and active play to your community. LetsAimIt works with society committees in Bengaluru. Start a society enquiry." },
  schools: { path: "/schools/", title: "School fitness consultancy", description: "Practical guidance for your school's existing PE team. Curriculum advice, fitness assessment guidance, coach development and programme support." },
  events: { path: "/events/", title: "Events and match days", description: "Internal games, friendlies and tournaments. See Ellegenza Match Day moments and the football match day planned for 3 December 2026." },
  privacy: { path: "/privacy/", title: "Privacy policy", description: "How LetsAimIt handles parent, guardian and enquiry details, including consent, contact requests and children's information." },
  terms: { path: "/terms/", title: "Programme terms", description: "Terms for LetsAimIt football, basketball and fitness activities. Read enrolment, participation and payment conditions before joining." },
  refunds: { path: "/refunds/", title: "Cancellations & refunds", description: "LetsAimIt payment, withdrawal and cancellation terms. Paid enrolment is non-refundable for personal absence or withdrawal, subject to statutory rights." },
  notfound: { path: "/404/", title: "Page not found", description: "This page is not available. Explore LetsAimIt programmes, community sport and school consultancy." },
  admin: { path: "/admin/", title: "Registration register", description: "Sign in to the private LetsAimIt registration register." },
};
export const PAGE_TITLES = Object.fromEntries(Object.entries(PAGE_META).map(([key, value]) => [key, value.title]));
export function pageFromPath(pathname = "/") {
  let path;
  try { path = decodeURIComponent(pathname).replace(/\/index\.html$/, "/").replace(/\/+$/, "") || "/"; }
  catch { return "notfound"; }
  return Object.entries(PAGE_META).find(([key, value]) => key !== "notfound" && (value.path.replace(/\/$/, "") || "/") === path)?.[0] || "notfound";
}
export function pageFromHash(hash = "") {
  if (!hash || hash === "#" || hash === "#/") return "home";
  return pageFromPath("/" + hash.replace(/^#\/?/, "").split("?")[0]);
}
export function readRoute(location) {
  return location.hash.startsWith("#/") ? pageFromHash(location.hash) : pageFromPath(location.pathname);
}
export function syncPageMeta(page) {
  const meta = PAGE_META[page] || PAGE_META.notfound;
  const title = `${meta.title} — LetsAimIt`;
  document.title = title;
  const values = {
    'meta[name="description"]': meta.description,
    'meta[property="og:title"]': title,
    'meta[property="og:description"]': meta.description,
    'meta[property="og:url"]': SITE_ORIGIN + meta.path,
    'meta[name="twitter:title"]': title,
    'meta[name="twitter:description"]': meta.description,
    'meta[name="robots"]': page === "notfound" || page === "admin" ? "noindex, follow" : "index, follow, max-image-preview:large",
  };
  for (const [selector, value] of Object.entries(values)) document.querySelector(selector)?.setAttribute("content", value);
  document.querySelector('link[rel="canonical"]')?.setAttribute("href", SITE_ORIGIN + meta.path);
}

import media from "../data/media-manifest.json" with { type: "json" };
import { programmeFaqs } from "../data/programmeFaqs.js";
import { blogPosts } from "../features/blog/blog-posts.js";
import { articles } from "../features/blog/articles.js";
import { localPages } from "../features/locations/local-pages.js";
import { PUBLIC_BRAND } from "./publicBrand.js";

export const SITE_ORIGIN = (import.meta.env?.VITE_SITE_ORIGIN || PUBLIC_BRAND.origin).replace(/\/$/, "");

export const PAGE_META = {
  home: { path: "/", title: "Football & Basketball for Kids in Bengaluru", description: "Football and basketball for ages 5–14. Build fitness, confidence and friendships at Nambiar Ellegenza and Nambiar Bellezea, Bengaluru. First session free.", indexable: true, kind: "content" },
  programme: { path: "/programme/", title: "Kids’ Football & Basketball Coaching Programme", description: "Football, basketball and fitness for ages 5–14 in Bengaluru. Two 45–60 minute sessions each week at Nambiar Ellegenza and Bellezea. First session free.", indexable: true, kind: "content" },
  coach: { path: "/coach/", title: "Dhiraj Mishra, Youth Football Coach in Bengaluru", description: "Meet Dhiraj, former head coach at Frisco Soccer Association, Texas, and founder of LetsAimIt in Bengaluru. Explore his coaching story and credentials.", indexable: true, kind: "content" },
  societies: { path: "/societies/", title: "Football & Basketball Coaching for Societies", description: "Bring football, basketball and active play to your Bengaluru community. LetsAimIt works with society committees to plan safe, age-appropriate coaching.", indexable: true, kind: "content" },
  schools: { path: "/schools/", title: "School PE & Fitness Consultancy in Bengaluru", description: "Practical guidance for your school's PE team in Bengaluru, with curriculum advice, fitness assessment, coach development and programme support from LetsAimIt.", indexable: true, kind: "content" },
  events: { path: "/events/", title: "Kids’ Football Events & Match Days in Bengaluru", description: "Community games, friendlies and tournaments with LetsAimIt in Bengaluru. See Ellegenza Match Day photos and the football match day planned for 3 December 2026.", indexable: true, kind: "content" },
  blogs: { path: "/blogs/", title: "Coaching Guides & Coach Dhiraj’s Reading List", description: "Read practical LetsAimIt guides for sports parents and new players, alongside Coach Dhiraj Mishra’s selected articles and reflections on LinkedIn.", indexable: true, kind: "content" },
  ...Object.fromEntries(articles.map(article => [article.page, {
    path: article.path,
    title: article.title,
    description: article.description,
    indexable: true,
    kind: "content",
    sources: ["src/features/blog/articles.js", "src/pages/BlogArticle.jsx"],
  }])),
  ...Object.fromEntries(localPages.map(content => [content.page, {
    path: content.path,
    title: content.title,
    description: content.description,
    indexable: true,
    kind: "content",
    sources: ["src/features/locations/local-pages.js", "src/features/locations/LocalCoaching.jsx"],
  }])),
  privacy: { path: "/privacy/", title: "Privacy Policy for Parents & Guardians", description: "Read how LetsAimIt handles parent and child details, Google sign-in, payment records, photo consent and privacy requests for its community coaching programme.", indexable: true, kind: "policy" },
  terms: { path: "/terms/", title: "Sports Coaching Programme Terms for Parents", description: "Read LetsAimIt coaching terms for enrolment, free trials, monthly payments, safe participation, session changes and parent rights before joining the programme.", indexable: true, kind: "policy" },
  refunds: { path: "/refunds/", title: "Coaching Fees, Cancellations & Refund Policy", description: "Understand LetsAimIt fees, missed sessions, voluntary withdrawal, provider cancellations and payment errors. Read the refund policy and your consumer rights.", indexable: true, kind: "policy" },
  notfound: { path: "/404/", title: "Page not found", description: "This page is not available. Explore LetsAimIt programmes, community sport and school consultancy.", indexable: false, kind: "error" },
  admin: { path: "/admin/", title: "Team dashboard", description: "Sign in to the private LetsAimIt team dashboard and registration register.", indexable: false, kind: "private" },
  signin: { path: "/sign-in/", title: "Sign in", description: "Sign in with your approved Google account to open the LetsAimIt team dashboard.", indexable: false, kind: "utility" },
  register: { path: "/register/", title: "Register your child", description: "Register your child for LetsAimIt coaching.", indexable: false, kind: "utility" },
  parent: { path: "/parent/", title: "Parent dashboard", description: "View your child’s requests, fees, attendance and weekly coaching feedback.", indexable: false, kind: "private" },
  coaching: { path: "/coach-dashboard/", title: "Coaching tracker", description: "Private attendance and weekly feedback for the LetsAimIt coaching team.", indexable: false, kind: "private" },
};

export const PUBLIC_PAGES = Object.entries(PAGE_META)
  .filter(([, meta]) => meta.indexable)
  .map(([page, meta]) => ({ page, ...meta }));
export const INDEXABLE_PAGES = PUBLIC_PAGES;

export function isProductionOrigin(origin = SITE_ORIGIN) {
  return typeof origin === "string" && origin.replace(/\/$/, "") === PUBLIC_BRAND.origin;
}

export function isIndexablePage(page, origin = SITE_ORIGIN) {
  return isProductionOrigin(origin) && PAGE_META[page]?.indexable === true;
}

export function robotsForPage(page, origin = SITE_ORIGIN) {
  return isIndexablePage(page, origin) ? "index, follow, max-image-preview:large" : "noindex, follow";
}

const coachProfile = "https://www.linkedin.com/in/dhiraj-mishra-20274717/";
const articlesByPage = new Map(articles.map(article => [article.page, article]));
const localPagesByPage = new Map(localPages.map(content => [content.page, content]));
const heroImages = {
  home: ["football-film-poster.jpg", "Children practising football in the stock film"],
  programme: ["Initial_days_of_kids_training.jpg", "Children running together during Coach Dhiraj’s football training"],
  coach: ["Coach_Goalie_conversation_before_the_game.jpg", "Coach Dhiraj talking with a young goalkeeper before a game in Frisco, Texas"],
  societies: ["image2.jpeg", "Children train on the football court at Nambiar Ellegenza in Bengaluru"],
  schools: ["Strategy-for-game-against-opponent.jpg", "Coach gives instructions to young football players"],
  events: ["ellegenza-match-action.jpg", "Children playing football at Ellegenza Match Day"],
  blogs: ["Coach_Goalie_conversation_before_the_game.jpg", "Coach Dhiraj talking with a young goalkeeper before a game in Frisco, Texas"],
};

function schemaImage(filename, origin, id, caption) {
  const image = media.images[filename];
  const variant = image.variants.at(-1);
  return {
    "@type": "ImageObject",
    "@id": id,
    url: `${origin}/assets/${variant.src}`,
    contentUrl: `${origin}/assets/${variant.src}`,
    width: variant.width,
    height: variant.height,
    caption,
  };
}

function schemaDate(value) {
  if (value == null) return undefined;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2}))?$/.test(value)
    || !Number.isFinite(Date.parse(value))) throw new Error("Structured data requires a valid ISO date.");
  const calendarDate = value.slice(0, 10);
  if (new Date(calendarDate + "T00:00:00Z").toISOString().slice(0, 10) !== calendarDate) {
    throw new Error("Structured data requires a valid ISO date.");
  }
  return value;
}

/** Shared by initial HTML and client navigation, so article tags cannot leak to another route. */
export function pageSocialMeta(page, { origin = SITE_ORIGIN, dateModified } = {}) {
  const article = articlesByPage.get(page);
  if (!article) return {
    type: "website",
    image: {
      url: origin + "/assets/share-letsaimit-1200x630.png",
      type: "image/png",
      width: 1200,
      height: 630,
      alt: "LetsAimIt. Sport, close to home. Football, basketball and fitness. First session free.",
    },
  };
  const image = schemaImage(article.image.file, origin, origin + article.path + "#primary-image", article.image.caption);
  return {
    type: "article",
    image: { url: image.url, type: "image/webp", width: image.width, height: image.height, alt: article.image.alt },
    article: {
      publishedTime: schemaDate(article.publishedAt),
      ...(dateModified ? { modifiedTime: schemaDate(dateModified) } : {}),
      author: origin + "/",
    },
  };
}

/** Public site facts only. Authenticated records are never inputs to this graph. */
export function buildPageGraph(page, { origin = SITE_ORIGIN, datePublished, dateModified } = {}) {
  const base = new URL(origin);
  if (base.protocol !== "https:" || base.origin !== origin || base.username || base.password) {
    throw new Error("Structured data requires a complete HTTPS origin.");
  }
  const key = Object.hasOwn(PAGE_META, page) ? page : "notfound";
  const article = articlesByPage.get(key);
  const local = localPagesByPage.get(key);
  const meta = PAGE_META[key];
  const url = origin + meta.path;
  const organizationId = origin + "/#organization";
  const websiteId = origin + "/#website";
  const personId = origin + "/#coach-dhiraj";
  const pageId = url + "#webpage";
  const breadcrumbId = url + "#breadcrumb";
  const logo = schemaImage("logo.png", origin, origin + "/#logo", "LetsAimIt");
  const webpage = {
    "@type": key === "blogs" ? ["WebPage", "CollectionPage"] : key === "coach" ? ["WebPage", "AboutPage"] : "WebPage",
    "@id": pageId,
    url,
    name: `${meta.title} — ${PUBLIC_BRAND.name}`,
    description: meta.description,
    inLanguage: "en-IN",
    isPartOf: { "@id": websiteId },
    about: { "@id": organizationId },
    breadcrumb: { "@id": breadcrumbId },
    ...(article?.publishedAt || datePublished ? { datePublished: schemaDate(article?.publishedAt || datePublished) } : {}),
    ...(dateModified ? { dateModified: schemaDate(dateModified) } : {}),
  };
  const graph = [
    {
      "@type": "Organization",
      "@id": organizationId,
      name: PUBLIC_BRAND.name,
      url: origin + "/",
      logo: { "@id": logo["@id"] },
      description: "Football, basketball and fitness coaching for children aged 5–14 at Nambiar Ellegenza and Nambiar Bellezea, Bengaluru.",
      founder: { "@id": personId },
      telephone: "+918868886074",
      address: { "@type": "PostalAddress", addressLocality: "Bengaluru", addressRegion: "Karnataka", addressCountry: "IN" },
      sameAs: ["https://www.instagram.com/lets_aimit/"],
    },
    logo,
    {
      "@type": "Person",
      "@id": personId,
      name: "Dhiraj Mishra",
      url: origin + "/coach/",
      jobTitle: "Youth football coach",
      description: "Founder of LetsAimIt and former Head Coach at Frisco Soccer Association, Texas.",
      worksFor: { "@id": organizationId },
      sameAs: [coachProfile],
    },
    {
      "@type": "WebSite",
      "@id": websiteId,
      url: origin + "/",
      name: PUBLIC_BRAND.name,
      inLanguage: "en-IN",
      publisher: { "@id": organizationId },
    },
    webpage,
    {
      "@type": "BreadcrumbList",
      "@id": breadcrumbId,
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: origin + "/" },
        ...(article ? [
          { "@type": "ListItem", position: 2, name: "Blogs", item: origin + "/blogs/" },
          { "@type": "ListItem", position: 3, name: meta.title, item: url },
        ] : local && key !== "local-bengaluru" ? [
          { "@type": "ListItem", position: 2, name: "Bengaluru coaching", item: origin + "/bengaluru/" },
          { "@type": "ListItem", position: 3, name: meta.title, item: url },
        ] : key === "home" ? [] : [{ "@type": "ListItem", position: 2, name: meta.title, item: url }]),
      ],
    },
  ];
  if (article || local?.image || heroImages[key]) {
    const [filename, caption] = article ? [article.image.file, article.image.caption] : local?.image ? [local.image.file, local.image.caption] : heroImages[key];
    const image = schemaImage(filename, origin, url + "#primary-image", caption);
    graph.push(image);
    webpage.primaryImageOfPage = { "@id": image["@id"] };
  }
  if (key === "coach") webpage.mainEntity = { "@id": personId };
  if (["programme", "societies", "schools"].includes(key)) {
    const service = {
      "@type": "Service",
      "@id": url + "#service",
      name: key === "schools" ? "School PE and fitness consultancy" : "Children’s football, basketball and fitness coaching",
      serviceType: key === "schools" ? "School PE consultancy" : "Community sports coaching",
      description: meta.description,
      url,
      provider: { "@id": organizationId },
      mainEntityOfPage: { "@id": pageId },
    };
    if (key !== "schools") {
      service.areaServed = { "@type": "City", name: "Bengaluru" };
      service.audience = { "@type": "PeopleAudience", suggestedMinAge: 5, suggestedMaxAge: 14 };
    }
    graph.push(service);
    webpage.mainEntity = { "@id": service["@id"] };
  }
  if (key === "programme") {
    const faq = {
      "@type": "FAQPage",
      "@id": url + "#programme-faq",
      isPartOf: { "@id": pageId },
      mainEntity: programmeFaqs.map(([question, answer]) => ({
        "@type": "Question",
        name: question,
        acceptedAnswer: { "@type": "Answer", text: answer },
      })),
    };
    graph.push(faq);
    webpage.hasPart = [{ "@id": faq["@id"] }];
  }
  if (local) {
    const cityId = origin + "/bengaluru/#city";
    const communities = localPages.filter(content => content.society && (!local.society || local.society === content.society));
    const places = communities.map(content => ({
      "@type": "Place",
      "@id": origin + content.path + "#society",
      name: content.society,
      containedInPlace: { "@id": cityId },
      ...(content.location?.address ? { address: content.location.address } : {}),
      ...(content.location?.sourceUrl ? { subjectOf: { "@type": "WebPage", url: content.location.sourceUrl } } : {}),
    }));
    const service = {
      "@type": "Service",
      "@id": url + "#service",
      name: local.heading,
      serviceType: local.sport ? `${local.sport} coaching for children` : "Children’s football and basketball coaching",
      description: local.description,
      url,
      provider: { "@id": organizationId },
      mainEntityOfPage: { "@id": pageId },
      areaServed: places.map(place => ({ "@id": place["@id"] })),
      audience: { "@type": "PeopleAudience", suggestedMinAge: 5, suggestedMaxAge: 14 },
    };
    graph.push({ "@type": "City", "@id": cityId, name: "Bengaluru", alternateName: "Bangalore", containedInPlace: { "@type": "Country", name: "India" } }, ...places, service);
    webpage.mainEntity = { "@id": service["@id"] };
    if (local.faq?.length) {
      const faq = {
        "@type": "FAQPage",
        "@id": url + "#local-faq",
        isPartOf: { "@id": pageId },
        mainEntity: local.faq.map(({ question, answer }) => ({ "@type": "Question", name: question, acceptedAnswer: { "@type": "Answer", text: answer } })),
      };
      graph.push(faq);
      webpage.hasPart = [{ "@id": faq["@id"] }];
    }
  }
  if (key === "blogs") {
    // These are links to incomplete, off-site previews, not social posts hosted
    // by LetsAimIt. A WebPage reference does not claim forum rich-result metadata.
    const works = blogPosts.map(post => ({
      "@type": "WebPage",
      "@id": post.url,
      url: post.url,
      name: post.title,
      description: post.summary,
      author: { "@id": personId },
      inLanguage: "en",
      ...(post.publishedAt ? { datePublished: schemaDate(post.publishedAt) } : {}),
    }));
    const list = {
      "@type": "ItemList",
      "@id": url + "#selected-writing",
      name: "Selected posts and articles by Dhiraj Mishra",
      itemListElement: works.map((work, index) => ({ "@type": "ListItem", position: index + 1, item: { "@id": work["@id"] } })),
    };
    const guides = articles.map(item => ({
      "@type": "WebPage",
      "@id": origin + item.path + "#webpage",
      url: origin + item.path,
      name: item.title,
      description: item.summary,
      isPartOf: { "@id": websiteId },
    }));
    const guideList = {
      "@type": "ItemList",
      "@id": url + "#coaching-guides",
      name: "Coaching guides from the LetsAimIt team",
      itemListElement: guides.map((guide, index) => ({ "@type": "ListItem", position: index + 1, item: { "@id": guide["@id"] } })),
    };
    graph.push(guideList, ...guides, list, ...works);
    webpage.mainEntity = { "@id": guideList["@id"] };
    webpage.hasPart = guides.map(guide => ({ "@id": guide["@id"] }));
    webpage.citation = works.map(work => ({ "@id": work["@id"] }));
  }
  if (article) {
    const body = [article.intro, ...article.sections.flatMap(section => [section.heading, ...section.paragraphs, ...(section.bullets ?? [])])].join("\n\n");
    const articleNode = {
      "@type": "Article",
      "@id": url + "#article",
      url,
      headline: article.title,
      description: article.description,
      articleBody: body,
      articleSection: article.category,
      wordCount: body.split(/\s+/).filter(Boolean).length,
      inLanguage: "en-IN",
      author: { "@id": organizationId },
      publisher: { "@id": organizationId },
      image: webpage.primaryImageOfPage,
      datePublished: schemaDate(article.publishedAt),
      ...(dateModified ? { dateModified: schemaDate(dateModified) } : {}),
      mainEntityOfPage: { "@id": pageId },
      isPartOf: { "@id": origin + "/blogs/#webpage" },
      citation: article.reading.map(reference => new URL(reference.url, origin).href),
    };
    graph.push({
      "@type": ["WebPage", "CollectionPage"],
      "@id": origin + "/blogs/#webpage",
      url: origin + "/blogs/",
      name: PAGE_META.blogs.title,
      isPartOf: { "@id": websiteId },
    }, articleNode);
    webpage.mainEntity = { "@id": articleNode["@id"] };
  }
  if (key === "home" || key === "programme") {
    const video = {
      "@type": "VideoObject",
      "@id": origin + "/#football-film",
      name: "Children practising football",
      description: "Silent stock footage of children practising football. Credit to Marsel Sharipov / Pexels.",
      thumbnailUrl: schemaImage("football-film-poster.jpg", origin, origin + "/#football-film-poster", "").url,
      contentUrl: origin + "/assets/" + media.videos["football-film.mp4"].src,
      duration: "PT12S",
      width: 1280,
      height: 720,
      creditText: "Marsel Sharipov / Pexels",
      isBasedOn: "https://www.pexels.com/video/little-boys-training-in-a-soccer-football-field-12954458/",
    };
    graph.push(video);
    webpage.video = { "@id": video["@id"] };
  }
  return { "@context": "https://schema.org", "@graph": graph };
}

export function serializeJsonLd(value) {
  return JSON.stringify(value).replace(/</g, "\\u003c").replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
}

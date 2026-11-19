import * as React from "react";
import { renderToString } from "react-dom/server";
import App from "./App.jsx";
export { PAGE_META, SITE_ORIGIN, PUBLIC_PAGES, isIndexablePage, robotsForPage } from "./lib/routes.js";
export { buildPageGraph, serializeJsonLd } from "./lib/seo.js";
export function render(page) { return renderToString(<App initialPage={page} />); }

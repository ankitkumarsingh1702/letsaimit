import * as React from "react";
import { renderToString } from "react-dom/server";
import App from "./App.jsx";
export { PAGE_META, SITE_ORIGIN } from "./lib/routes.js";
export function render(page) { return renderToString(<App initialPage={page} />); }

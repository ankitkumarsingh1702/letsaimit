import * as React from "react";
import * as ReactDOM from "react-dom/client";
import App from "./App.jsx";
import { readRoute } from "./lib/routes.js";
import "./styles/site.css";
import "./styles/responsive-footer.css";
import "./features/schools/schools.css";
import "./features/events/events.css";
import "./styles/navigation.css";
import "./styles/social-dock.css";
import "./features/stories/parent-stories.css";
import "./features/stories/coach-story.css";
import "./styles/site-updates.css";

const root = document.getElementById("root");
const app = <React.StrictMode><App /></React.StrictMode>;
// Old hash links can target a different page than the static entry document.
if (root.hasChildNodes() && root.dataset.prerenderPage === readRoute(window.location) && !window.location.hash.startsWith("#/")) ReactDOM.hydrateRoot(root, app);
else ReactDOM.createRoot(root).render(app);

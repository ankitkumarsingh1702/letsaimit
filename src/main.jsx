import * as React from "react";
import * as ReactDOM from "react-dom/client";
import App from "./App.jsx";
import "./styles/site.css";
import "./styles/responsive-footer.css";
import "./features/schools/schools.css";
import "./features/events/events.css";
import "./styles/navigation.css";
import "./features/stories/parent-stories.css";
import "./features/stories/coach-story.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

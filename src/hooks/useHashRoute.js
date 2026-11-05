import * as React from "react";
import { readRoute } from "../lib/routes.js";
function useHashRoute(initialPage = "home") {
  let [page, setPage] = React.useState(() => typeof window === "undefined" ? initialPage : readRoute(window.location));
  React.useEffect(() => {
    let handleHashChange = () => {
      const next = readRoute(window.location);
      if (window.location.hash.startsWith("#/")) {
        const [path, query] = window.location.hash.slice(2).split("?");
        const safePath = (path || "").replace(/^\/+|\/+$/g, "");
        const clean = "/" + (safePath ? safePath + "/" : "") + (query ? "?" + query : "");
        try { window.history.replaceState(window.history.state, "", clean); } catch { /* Keep malformed legacy links on the 404 view. */ }
      }
      setPage(next);
    };
    handleHashChange();
    window.addEventListener("hashchange", handleHashChange);
    window.addEventListener("popstate", handleHashChange);
    return () => {
      window.removeEventListener("hashchange", handleHashChange);
      window.removeEventListener("popstate", handleHashChange);
    };
  }, []);
  return page;
}
export { useHashRoute };
export default useHashRoute;

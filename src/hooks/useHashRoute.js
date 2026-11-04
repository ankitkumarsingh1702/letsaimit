import * as React from "react";
import { pageFromHash } from "../lib/routes.js";
function useHashRoute() {
  let [page, setPage] = React.useState(() =>
    pageFromHash(window.location.hash),
  );
  React.useEffect(() => {
    let handleHashChange = () => setPage(pageFromHash(window.location.hash));
    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);
  return page;
}
export { useHashRoute };
export default useHashRoute;

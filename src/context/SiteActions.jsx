import * as React from "react";
var SiteActions = React.createContext(null);
function SiteActionsProvider({ value, children }) {
  return <SiteActions.Provider value={value}>{children}</SiteActions.Provider>;
}
function useSiteActions() {
  let actions = React.useContext(SiteActions);
  if (!actions)
    throw Error("useSiteActions must be used inside SiteActionsProvider.");
  return actions;
}
export { SiteActions, SiteActionsProvider, useSiteActions };
export default SiteActions;

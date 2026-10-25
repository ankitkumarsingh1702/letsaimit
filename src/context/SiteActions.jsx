import { createContext, useContext } from 'react';

const SiteActions = createContext(null);

export function SiteActionsProvider({ value, children }) {
  return <SiteActions.Provider value={value}>{children}</SiteActions.Provider>;
}

export function useSiteActions() {
  const actions = useContext(SiteActions);
  if (!actions) throw new Error('useSiteActions must be used inside SiteActionsProvider.');
  return actions;
}

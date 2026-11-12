import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchTracker, todayIST } from './trackerData.js';

/** Auth-scoped snapshots; visible pages reconcile silently without a document reload. */
export function useParentTracker(auth, { staff = false, date = null, scope } = {}) {
  const userId = auth.user?.id, client = auth.client;
  const [state, setState] = useState({ owner: null, snapshot: null, loading: true, error: '', lastSynced: null });
  const actor = useRef(auth); actor.current = auth;
  const generation = useRef(0), pending = useRef(null), queued = useRef(false), alive = useRef(false);
  const refreshRef = useRef(null);
  const key = `${userId}:${staff}:${date || ''}:${scope || ''}:${staff && auth.phase === 'authorized' ? 'admin' : 'member'}`;
  const refresh = useCallback(() => {
    if (!alive.current || !userId || !client || document.visibilityState === 'hidden') return Promise.resolve();
    if (pending.current?.key === key) { queued.current = true; return pending.current.promise; }
    const ticket = generation.current;
    const work = (async () => {
      try {
        const snapshot = await fetchTracker({ client, userId, verifyGoogleUser: actor.current.verifyGoogleUser, staff, date: date || todayIST(), scope });
        if (alive.current && generation.current === ticket && actor.current.user?.id === userId) setState({ owner: key, snapshot, loading: false, error: '', lastSynced: new Date().toISOString() });
      } catch (error) {
        if (alive.current && generation.current === ticket && actor.current.user?.id === userId) setState(previous => ({
          owner: key, snapshot: ['access_denied', 'identity_changed'].includes(error.code) || previous.owner !== key ? null : previous.snapshot,
          loading: false, error: error.message || 'Tracker could not load. Please retry.', lastSynced: ['access_denied', 'identity_changed'].includes(error.code) ? null : previous.lastSynced,
        }));
      } finally {
        if (pending.current?.promise === work) pending.current = null;
        if (alive.current && generation.current === ticket && queued.current) { queued.current = false; queueMicrotask(() => { void refreshRef.current?.(); }); }
      }
    })();
    pending.current = { key, promise: work };
    return work;
  }, [client, userId, staff, date, scope, key]);
  refreshRef.current = refresh;
  useEffect(() => {
    alive.current = true; ++generation.current; pending.current = null; queued.current = false;
    setState({ owner: key, snapshot: null, loading: true, error: '', lastSynced: null });
    void refresh();
    const update = () => { if (document.visibilityState === 'visible') void refresh(); };
    const timer = window.setInterval(update, 5000);
    window.addEventListener('focus', update);
    window.addEventListener('letsaimit:tracker-changed', update);
    document.addEventListener('visibilitychange', update);
    return () => {
      alive.current = false; ++generation.current; pending.current = null; queued.current = false;
      window.clearInterval(timer); window.removeEventListener('focus', update);
      window.removeEventListener('letsaimit:tracker-changed', update); document.removeEventListener('visibilitychange', update);
    };
  }, [key, refresh]);
  const current = state.owner === key ? state : { snapshot: null, loading: true, error: '', lastSynced: null };
  return { ...current, refresh, liveState: current.error ? 'reconnecting' : current.snapshot ? 'synced' : 'connecting' };
}

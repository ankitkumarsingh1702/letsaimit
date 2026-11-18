import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchCoachingPractice } from './practiceData.js';

const firstPage = [null];
const noAttempts = [];

/** Keep the current page visible during a refresh. Older pages use immutable keyset boundaries. */
export function useCoachingPractice(auth, { registrationId, scope, from = null, to = null, enabled = true }) {
  const client = auth?.client;
  const userId = auth?.user?.id;
  const active = Boolean(enabled && client && userId && registrationId);
  const key = JSON.stringify([userId, registrationId, scope, from, to]);
  const [navigation, setNavigation] = useState(null);
  const cursors = navigation?.key === key ? navigation.cursors : firstPage;
  const cursor = cursors.at(-1);
  const pageKey = `${key}:${cursor?.id ?? ''}`;
  const [state, setState] = useState(null);
  const current = active && state?.key === pageKey && state.client === client ? state : null;
  const actor = useRef(auth);
  actor.current = auth;
  const request = useRef(null);
  const lifecycle = useRef(null);

  const refresh = useCallback(() => {
    const ticket = lifecycle.current;
    if (!active || ticket?.pageKey !== pageKey || ticket.client !== client || document.visibilityState === 'hidden') return Promise.resolve();
    if (request.current?.ticket === ticket) return request.current.work;
    const work = (async () => {
      try {
        const page = await fetchCoachingPractice({ client, userId, verifyGoogleUser: actor.current.verifyGoogleUser, registrationId, scope, from, to, cursor });
        if (lifecycle.current === ticket && actor.current?.user?.id === userId) {
          setState(previous => {
            // Saved attempts are immutable. Keep the same page when the poll returns the same rows.
            if (previous?.key === pageKey && previous.client === client && !previous.error
              && previous.nextCursor?.id === page.nextCursor?.id && previous.attempts.length === page.attempts.length
              && previous.attempts.every((attempt, index) => attempt.id === page.attempts[index].id)) return previous;
            return { key: pageKey, client, ...page, error: '' };
          });
        }
      } catch (error) {
        if (lifecycle.current !== ticket || actor.current?.user?.id !== userId) return;
        const denyAccess = ['identity_changed', 'access_denied'].includes(error.code);
        setState(previous => {
          const keep = !denyAccess && previous?.key === pageKey && previous.client === client;
          return { key: pageKey, client, attempts: keep ? previous.attempts : noAttempts, nextCursor: keep ? previous.nextCursor : null, error: error.message };
        });
      } finally {
        if (request.current?.ticket === ticket) request.current = null;
      }
    })();
    request.current = { ticket, work };
    return work;
  }, [active, client, userId, registrationId, scope, from, to, cursor, pageKey]);

  useEffect(() => {
    if (!active) return;
    const ticket = { pageKey, client };
    lifecycle.current = ticket;
    const update = () => { void refresh(); };
    update();
    const timer = cursor ? null : window.setInterval(update, 5000);
    const event = 'letsaimit:tracker-changed';
    window.addEventListener('focus', update);
    document.addEventListener('visibilitychange', update);
    if (!cursor) window.addEventListener(event, update);
    return () => {
      lifecycle.current = null;
      if (timer !== null) window.clearInterval(timer);
      window.removeEventListener('focus', update);
      document.removeEventListener('visibilitychange', update);
      if (!cursor) window.removeEventListener(event, update);
    };
  }, [active, client, cursor, pageKey, refresh]);

  return {
    attempts: current?.attempts ?? noAttempts,
    loading: active && !current,
    error: current?.error ?? '',
    canOlder: Boolean(current?.nextCursor),
    canNewer: cursors.length > 1,
    older() {
      if (current?.nextCursor) setNavigation({ key, cursors: [...cursors, current.nextCursor] });
    },
    newer() {
      if (cursors.length > 1) setNavigation({ key, cursors: cursors.slice(0, -1) });
    },
    refresh,
    async refreshLatest() {
      if (cursor) {
        setNavigation({ key, cursors: firstPage });
        return;
      }
      const previous = request.current;
      if (previous?.ticket === lifecycle.current) await previous.work;
      await refresh();
    },
  };
}

import { useEffect, useReducer, useState } from 'react';
import { fetchStudentProfile } from './studentProfileData.js';

export function useStudentProfile(auth, { registrationId, scope, enabled = true }) {
  const { client, user, verifyGoogleUser } = auth;
  const userId = user?.id;
  const active = Boolean(enabled && client && userId && registrationId);
  const key = active ? `${userId}:${scope}:${registrationId}` : '';
  const [load, refresh] = useReducer(count => count + 1, 0);
  const [state, setState] = useState(null);
  const current = active && state?.key === key && state.client === client ? state : null;

  useEffect(() => {
    if (!active) return;
    let mounted = true;
    fetchStudentProfile({ client, userId, verifyGoogleUser, registrationId, scope }).then(profile => {
      if (mounted) setState({ key, client, load, profile, error: '' });
    }, error => {
      if (mounted) setState({ key, client, load, profile: null, error: error.message });
    });
    return () => { mounted = false; };
  }, [active, client, key, load, registrationId, scope, userId, verifyGoogleUser]);

  return {
    profile: current?.profile ?? null,
    loading: active && current?.load !== load,
    error: current?.error ?? '',
    refresh,
  };
}

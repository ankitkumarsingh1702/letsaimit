import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { getSupabaseClient } from "../lib/supabase.js";
import { createAuthorizationGate, createSingleFlight, googleSignInOptions, readGuardedAdminSession } from "../lib/adminAuth.js";

const AdminAuth = createContext(null);
const initialState = { phase: "checking", user: null, error: "" };
const deniedCodes = new Set(["42501", "PGRST301", "PGRST302", "PGRST303"]);

export function AdminAuthProvider({ children }) {
  const client = useMemo(() => typeof window === "undefined" ? null : getSupabaseClient(), []);
  const [auth, setAuth] = useState(initialState);
  const current = useRef(initialState);
  const epoch = useRef(0);
  const gate = useRef(createAuthorizationGate());
  const coalesce = useRef(createSingleFlight());
  const authTimers = useRef(new Set());
  const mounted = useRef(false);
  const publish = useCallback(next => { current.current = next; setAuth(next); }, []);
  const checkAccess = useCallback(() => {
    if (gate.current.isBlocked()) return Promise.resolve(false);
    const requestEpoch = epoch.current;
    return coalesce.current(requestEpoch, async () => {
    try {
      const next = await readGuardedAdminSession(client, gate.current);
      if (!next || gate.current.isBlocked()) return false;
      if (!mounted.current || epoch.current !== requestEpoch) return false;
      publish(next);
      return next.phase === "authorized";
    } catch (error) {
      if (gate.current.isBlocked()) return false;
      if (!mounted.current || epoch.current !== requestEpoch) return false;
      if ([401, 403].includes(error?.status) || deniedCodes.has(error?.code)) {
        publish({ phase: "denied", user: current.current.user, error: "" });
        return false;
      }
      const message = "We couldn’t check access. Please check your connection and try again.";
      publish(current.current.phase === "authorized" ? { ...current.current, error: message } : { phase: "error", user: current.current.user, error: message });
      throw error;
    }
    });
  }, [client, publish]);

  useEffect(() => {
    mounted.current = true;
    void checkAccess().catch(() => {});
    const listener = client?.auth.onAuthStateChange((_event, session) => {
      if (gate.current.isBlocked()) return;
      ++epoch.current;
      if (!session) {
        publish({ phase: "signed_out", user: null, error: "" });
        return;
      }
      if (session.user?.id !== current.current.user?.id) publish(initialState);
      // Avoid calling Supabase Auth synchronously inside its state-change callback.
      const timer = window.setTimeout(() => {
        authTimers.current.delete(timer);
        void checkAccess().catch(() => {});
      }, 0);
      authTimers.current.add(timer);
    });
    const refresh = () => {
      if (document.visibilityState === "visible" && ["authorized", "denied"].includes(current.current.phase)) void checkAccess().catch(() => {});
    };
    const interval = window.setInterval(refresh, 5000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      mounted.current = false;
      ++epoch.current;
      listener?.data?.subscription?.unsubscribe();
      authTimers.current.forEach(timer => window.clearTimeout(timer));
      authTimers.current.clear();
      window.clearInterval(interval);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [checkAccess, client, publish]);

  const signIn = useCallback(async () => {
    if (!client) return;
    gate.current.allowSignIn();
    ++epoch.current;
    publish({ phase: "signing_in", user: null, error: "" });
    try {
      const { error } = await client.auth.signInWithOAuth(googleSignInOptions(window.location.origin));
      if (error) throw error;
    } catch (error) {
      publish({ phase: "error", user: null, error: "Google sign-in couldn’t open. Please try again." });
      throw error;
    }
  }, [client, publish]);
  const signOut = useCallback(async () => {
    gate.current.block();
    const signOutEpoch = ++epoch.current;
    authTimers.current.forEach(timer => window.clearTimeout(timer));
    authTimers.current.clear();
    // Clear private UI immediately, including when the network is unavailable.
    publish({ phase: "signing_out", user: null, error: "" });
    try {
      const result = await client?.auth.signOut({ scope: "local" });
      if (result?.error) throw result.error;
      if (mounted.current && epoch.current === signOutEpoch) publish({ phase: "signed_out", user: null, error: "" });
    } catch {
      if (mounted.current && epoch.current === signOutEpoch) publish({ phase: "signed_out", user: null, signOutRetryable: true, error: "Sign-out could not finish. Retry before sharing this browser." });
    }
  }, [client, publish]);
  const value = useMemo(() => ({ client, ...auth, signIn, signOut, checkAccess }), [client, auth, signIn, signOut, checkAccess]);
  return <AdminAuth.Provider value={value}>{children}</AdminAuth.Provider>;
}

export function useAdminAuth() {
  const value = useContext(AdminAuth);
  if (!value) throw new Error("useAdminAuth requires AdminAuthProvider.");
  return value;
}

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { getSupabaseClient } from "../lib/supabase.js";
import { createAuthorizationGate, createAuthIdentityEpoch, createSingleFlight, googleSignInOptions, readGuardedAdminSession, readGuardedGoogleUser, identityAfterAccessFailure, isConfirmedAccessDenial } from "../lib/adminAuth.js";
import { storeAuthReturnTarget, clearAuthReturnTarget } from "../lib/authReturn.js";
import { clearRegistrationDrafts } from "../features/registration/registrationDraft.js";
import { requestAccountDeletion, AccountDeletionError } from "../features/account/accountDeletion.js";

const AdminAuth = createContext(null);
const initialState = { phase: "checking", user: null, error: "" };

export function AdminAuthProvider({ children }) {
  const client = useMemo(() => typeof window === "undefined" ? null : getSupabaseClient(), []);
  const [auth, setAuth] = useState(initialState);
  const current = useRef(initialState);
  const epoch = useRef(createAuthIdentityEpoch());
  const gate = useRef(createAuthorizationGate());
  const coalesce = useRef(createSingleFlight());
  const authTimers = useRef(new Set());
  const mounted = useRef(false);
  const deletionFlight = useRef(null);
  const publish = useCallback(next => {
    const previous = current.current.user;
    if (previous?.isGoogle && (!next.user?.isGoogle || previous.id !== next.user.id)) {
      clearRegistrationDrafts(); clearAuthReturnTarget();
    }
    current.current = next; setAuth(next);
  }, []);
  const checkAccess = useCallback(() => {
    if (gate.current.isBlocked()) return Promise.resolve(false);
    const requestEpoch = epoch.current.ticket();
    return coalesce.current(requestEpoch, async () => {
    try {
      const next = await readGuardedAdminSession(client, gate.current);
      if (!next || gate.current.isBlocked()) return false;
      if (!mounted.current || !epoch.current.allows(requestEpoch)) return false;
      publish(next);
      return next.phase === "authorized";
    } catch (error) {
      if (gate.current.isBlocked()) return false;
      if (!mounted.current || !epoch.current.allows(requestEpoch)) return false;
      const verifiedUser = identityAfterAccessFailure(error, current.current.user);
      if (isConfirmedAccessDenial(error)) {
        publish({ phase: "denied", user: verifiedUser, error: "" });
        return false;
      }
      const message = "We couldn’t check access. Please check your connection and try again.";
      publish(current.current.phase === "authorized" && current.current.user?.id === verifiedUser?.id ? { ...current.current, error: message } : { phase: "error", user: verifiedUser, error: message });
      throw error;
    }
    });
  }, [client, publish]);

  useEffect(() => {
    mounted.current = true;
    void checkAccess().catch(() => {});
    const listener = client?.auth.onAuthStateChange((_event, session) => {
      if (gate.current.isBlocked()) return;
      epoch.current.observe(session);
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
      epoch.current.invalidate();
      listener?.data?.subscription?.unsubscribe();
      authTimers.current.forEach(timer => window.clearTimeout(timer));
      authTimers.current.clear();
      window.clearInterval(interval);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [checkAccess, client, publish]);

  const signIn = useCallback(async (returnTarget = "/admin/") => {
    if (!client) throw new Error("Google sign-in is not configured. Please contact LetsAimIt.");
    gate.current.allowSignIn();
    epoch.current.invalidate();
    publish({ phase: "signing_in", user: null, error: "" });
    // Clear an earlier bound account first; then preserve only this new explicit return intent.
    storeAuthReturnTarget(returnTarget);
    try {
      const { error } = await client.auth.signInWithOAuth(googleSignInOptions(window.location.origin));
      if (error) throw error;
    } catch (error) {
      publish({ phase: "error", user: null, error: "Google sign-in couldn’t open. Please try again." });
      throw error;
    }
  }, [client, publish]);
  const verifyGoogleUser = useCallback(async () => {
    if (!client || gate.current.isBlocked()) return null;
    const ticket = gate.current.ticket();
    const requestEpoch = epoch.current.ticket();
    try {
      const user = await readGuardedGoogleUser(client, gate.current, epoch.current);
      if (!gate.current.allows(ticket) || !epoch.current.allows(requestEpoch)) return null;
      if (!user) publish({ phase: "denied", user: null, error: "Sign in with Google to continue." });
      else if (current.current.user?.id !== user.id) publish({ phase: "denied", user, error: "" });
      return user;
    } catch (error) {
      if (gate.current.allows(ticket) && epoch.current.allows(requestEpoch) && isConfirmedAccessDenial(error)) publish({ phase: "denied", user: null, error: "Sign in with Google again to continue." });
      throw new Error(isConfirmedAccessDenial(error) ? "Sign in with Google again to continue." : "Your Google account could not be checked. Please retry.");
    }
  }, [client, publish]);
  const signOut = useCallback(async () => {
    gate.current.block();
    clearRegistrationDrafts(); clearAuthReturnTarget();
    epoch.current.invalidate();
    const signOutEpoch = epoch.current.ticket();
    authTimers.current.forEach(timer => window.clearTimeout(timer));
    authTimers.current.clear();
    // Clear private UI immediately, including when the network is unavailable.
    publish({ phase: "signing_out", user: null, error: "" });
    try {
      const result = await client?.auth.signOut({ scope: "local" });
      if (result?.error) throw result.error;
      if (mounted.current && epoch.current.allows(signOutEpoch)) publish({ phase: "signed_out", user: null, error: "" });
    } catch {
      if (mounted.current && epoch.current.allows(signOutEpoch)) publish({ phase: "signed_out", user: null, signOutRetryable: true, error: "Sign-out could not finish. Retry before sharing this browser." });
    }
  }, [client, publish]);
  const deleteAccount = useCallback(options => {
    const expected = options?.expectedUserId;
    if (gate.current.isBlocked() || !current.current.user?.isGoogle || current.current.user.id !== expected) return Promise.reject(new AccountDeletionError("identity_changed"));
    if (deletionFlight.current) return deletionFlight.current.userId === expected ? deletionFlight.current.promise : Promise.reject(new AccountDeletionError("identity_changed"));
    const identityTicket = epoch.current.ticket(), gateTicket = gate.current.ticket();
    const work = (async () => {
      const verified = await verifyGoogleUser();
      if (!verified || verified.id !== expected || !gate.current.allows(gateTicket) || !epoch.current.allows(identityTicket)) throw new AccountDeletionError("identity_changed");
      const receipt = await requestAccountDeletion(client, options);
      // A delayed deletion receipt must not sign out an account opened in another tab meanwhile.
      if (current.current.user?.id === expected && gate.current.allows(gateTicket) && epoch.current.allows(identityTicket)) {
        await signOut();
        if (mounted.current && gate.current.isBlocked() && !current.current.user) publish({ ...current.current, deletionStatus: receipt.status });
      }
      return receipt;
    })();
    const promise = work.finally(() => { if (deletionFlight.current?.promise === promise) deletionFlight.current = null; });
    deletionFlight.current = { userId: expected, promise };
    return promise;
  }, [client, verifyGoogleUser, signOut, publish]);
  const value = useMemo(() => ({ client, ...auth, signIn, signOut, deleteAccount, checkAccess, verifyGoogleUser }), [client, auth, signIn, signOut, deleteAccount, checkAccess, verifyGoogleUser]);
  return <AdminAuth.Provider value={value}>{children}</AdminAuth.Provider>;
}

export function useAdminAuth() {
  const value = useContext(AdminAuth);
  if (!value) throw new Error("useAdminAuth requires AdminAuthProvider.");
  return value;
}

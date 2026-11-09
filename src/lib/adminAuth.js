/** Google verifies identity; the current database allowlist grants access. */
export async function readAdminSession(client) {
  if (!client) return { phase: "not_configured", user: null, error: "Team sign-in is not configured. Please contact LetsAimIt." };
  const { data, error } = await client.auth.getUser();
  if (error && error.name !== "AuthSessionMissingError") throw error;
  const identity = data?.user;
  if (!identity) return { phase: "signed_out", user: null, error: "" };
  const email = String(identity.email || "").trim().toLowerCase();
  const user = {
    id: identity.id, email,
    displayName: identity.user_metadata?.full_name || identity.user_metadata?.name || email,
    avatarUrl: identity.user_metadata?.avatar_url || null,
    role: null,
  };
  // User-editable metadata is presentation only, never an authorization source.
  if (!identity.id || !email || identity.app_metadata?.provider !== "google") return { phase: "denied", user, error: "" };
  const access = await client.rpc("is_admin");
  if (access.error) throw access.error;
  if (access.data !== true) return { phase: "denied", user, error: "" };
  const membership = await client.from("allowed_admins").select("is_owner").eq("email", email).maybeSingle();
  if (membership.error) throw membership.error;
  if (!membership.data) return { phase: "denied", user, error: "" };
  return { phase: "authorized", user: { ...user, role: membership.data.is_owner ? "owner" : "admin" }, error: "" };
}

export function googleSignInOptions(origin) {
  const url = new URL(origin);
  const localHttp = url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname);
  if (url.origin !== origin || (url.protocol !== "https:" && !localHttp)) throw new Error("Invalid sign-in origin.");
  return { provider: "google", options: { redirectTo: `${origin}/admin/`, queryParams: { prompt: "select_account" } } };
}

/** A sign-out blocks queued/late checks until the next explicit Google sign-in. */
export function createAuthorizationGate() {
  let blocked = false;
  let generation = 0;
  return {
    block() { blocked = true; ++generation; },
    allowSignIn() { blocked = false; ++generation; },
    isBlocked() { return blocked; },
    ticket() { return generation; },
    allows(ticket) { return !blocked && ticket === generation; },
  };
}

export async function readGuardedAdminSession(client, gate) {
  if (gate.isBlocked()) return null;
  const ticket = gate.ticket();
  const session = await readAdminSession(client);
  return gate.allows(ticket) ? session : null;
}

/** Share overlapping checks for one auth generation; slow replies cannot starve. */
export function createSingleFlight() {
  let flight = null;
  return (key, work) => {
    if (flight?.key === key) return flight.promise;
    const promise = Promise.resolve().then(work);
    flight = { key, promise };
    const clear = () => { if (flight?.promise === promise) flight = null; };
    promise.then(clear, clear);
    return promise;
  };
}

export function accessRequestHref(email = "") {
  const subject = "LetsAimIt admin access request";
  const body = `Hello LetsAimIt team,\n\nPlease review admin access for my Google account: ${email || "[your Google account email]"}.\n\nThank you.`;
  // Existing public programme contact. Opening this link never sends an email.
  return `mailto:dhirajkmishra184@gmail.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

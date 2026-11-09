function profileText(value) {
  if (typeof value !== "string" || /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/u.test(value)) return "";
  return Array.from(value.trim().replace(/\s+/gu, " ")).slice(0, 200).join("");
}

/** Google documents googleusercontent.com profile pictures; other sources use initials. */
export function googleAvatarUrl(value) {
  if (typeof value !== "string" || value.length > 2048 || /[\u0000-\u001F\u007F-\u009F]/u.test(value)) return null;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "https:" || !url.hostname.endsWith(".googleusercontent.com") || url.username || url.password || url.port) return null;
    return url.href;
  } catch { return null; }
}

export function profileInitials(name) {
  const words = profileText(name).split(/\s+/u).filter(Boolean);
  return words.slice(0, 2).map(word => Array.from(word)[0]).join("").toLocaleUpperCase("en-IN") || "?";
}

/** Only presentation comes from Google/profile metadata. Email and access use the verified auth record. */
export function googleProfilePresentation(identity, email) {
  const identities = Array.isArray(identity?.identities) ? identity.identities : [];
  const google = identities.find(entry => entry?.provider === "google")?.identity_data;
  const fallback = identity?.user_metadata;
  const displayName = [google?.full_name, google?.name, fallback?.full_name, fallback?.name, email].map(profileText).find(Boolean) || "Google account";
  const avatarUrl = [google?.avatar_url, google?.picture, fallback?.avatar_url, fallback?.picture].map(googleAvatarUrl).find(Boolean) || null;
  return { displayName, avatarUrl };
}

const verifiedIdentityForError = new WeakMap();
export function verifiedGoogleUserAfterAdminError(error) {
  return error && typeof error === "object" ? verifiedIdentityForError.get(error) || null : null;
}
export function isConfirmedAccessDenial(error) {
  return [401, 403].includes(error?.status) || ["42501", "PGRST301", "PGRST302", "PGRST303"].includes(error?.code);
}
/** Only a fresh identity verified before an admin-only failure may retain parent capability after denial. */
export function identityAfterAccessFailure(error, previousUser) {
  const verified = verifiedGoogleUserAfterAdminError(error);
  return verified || (isConfirmedAccessDenial(error) ? null : previousUser);
}

function authIdentity(identity) {
  const email = String(identity.email || "").trim().toLowerCase();
  return { id: identity.id, email, ...googleProfilePresentation(identity, email), role: null,
    isGoogle: Boolean(identity.id && email && identity.app_metadata?.provider === "google") };
}

/** Parent capability needs verified Google identity, independently of the private admin allowlist. */
export async function readGoogleUser(client) {
  if (!client) return null;
  const { data, error } = await client.auth.getUser();
  if (error && error.name !== "AuthSessionMissingError") throw error;
  const user = data?.user ? authIdentity(data.user) : null;
  return user?.isGoogle ? user : null;
}

/** Google verifies identity; the current database allowlist grants access. */
export async function readAdminSession(client) {
  if (!client) return { phase: "not_configured", user: null, error: "Team sign-in is not configured. Please contact LetsAimIt." };
  const { data, error } = await client.auth.getUser();
  if (error && error.name !== "AuthSessionMissingError") throw error;
  const identity = data?.user;
  if (!identity) return { phase: "signed_out", user: null, error: "" };
  const user = authIdentity(identity);
  const email = user.email;
  // User-editable metadata is presentation only, never an authorization source.
  if (!user.isGoogle) return { phase: "denied", user, error: "" };
  try {
  const access = await client.rpc("is_admin");
  if (access.error) throw access.error;
  if (access.data !== true) return { phase: "denied", user, error: "" };
  const membership = await client.from("allowed_admins").select("is_owner").eq("email", email).maybeSingle();
  if (membership.error) throw membership.error;
  if (!membership.data) return { phase: "denied", user, error: "" };
  return { phase: "authorized", user: { ...user, role: membership.data.is_owner ? "owner" : "admin" }, error: "" };
  } catch (cause) {
    const error = cause && typeof cause === "object" ? cause : new Error("Admin access could not be checked.");
    verifiedIdentityForError.set(error, user);
    throw error;
  }
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

import { followUpPatch, toAdminRequest, validateAdminInvite, toAdminMember } from "./admin-model.js";
import { reviewArguments } from "./review-contract.js";

export const SAFE_COLUMNS = "id,submission_id,full_name,email,phone,metadata,status,notes,assignee,revision,created,updated,updated_by,review_decision,reviewed_at,reviewed_by";
export const MEMBER_COLUMNS = "email,is_owner,created_at,created_by";
const BATCH_SIZE = 500;

/** Read every saved page. The caller checks current access before and after. */
export async function fetchSavedRequests(client) {
  const rows = new Map();
  let offset = 0;
  let batch;
  do {
    const { data, error } = await client.from("registrations").select(SAFE_COLUMNS)
      .order("created", { ascending: false }).order("id", { ascending: false })
      .range(offset, offset + BATCH_SIZE - 1);
    if (error) throw error;
    if (!Array.isArray(data)) throw new Error("Invalid register response.");
    batch = data;
    for (const record of data) rows.set(record.id, toAdminRequest(record));
    offset += BATCH_SIZE;
  } while (batch.length === BATCH_SIZE);
  return [...rows.values()];
}

/** A successful HTTP response alone is not a saved edit: require one returned row. */
export async function saveRequestFollowUp(client, id, patch, expectedRevision) {
  if (!id || !Number.isSafeInteger(expectedRevision) || expectedRevision < 1) {
    throw new TypeError("The saved request revision is missing. Refresh and try again.");
  }
  const changes = followUpPatch(patch);
  const { data, error } = await client.from("registrations").update(changes)
    .eq("id", id).eq("revision", expectedRevision).select(SAFE_COLUMNS);
  if (error) throw error;
  if (data?.length === 1 && data[0].id === id && Number(data[0].revision) > expectedRevision) {
    return { ok: true, row: toAdminRequest(data[0]) };
  }
  if (Array.isArray(data) && data.length === 0) {
    const { data: latest, error: readError } = await client.from("registrations")
      .select(SAFE_COLUMNS).eq("id", id).maybeSingle();
    if (readError) throw readError;
    return latest
      ? { ok: false, code: "conflict", error: "This request changed. Your draft is still here.", latest: toAdminRequest(latest) }
      : { ok: false, code: "not_found", error: "This request is no longer available. Your draft has not been saved." };
  }
  throw new Error("The save could not be confirmed. Your draft is still here.");
}

export function mergeSavedRequests(current, incoming) {
  const previous = new Map(current.map(row => [row.id, row]));
  return incoming.map(row => {
    const saved = previous.get(row.id);
    return saved && saved.revision > row.revision ? saved : row;
  });
}

export async function saveRequestReview(client, id, decision, expectedRevision) {
  const { data, error } = await client.rpc("review_registration", reviewArguments(id, decision, expectedRevision));
  if (error && !["PT409", "P0002"].includes(error.code)) throw error;
  const record = Array.isArray(data) ? data[0] : data;
  if (!error && record?.id === id && record.review_decision === decision && Number(record.revision) >= expectedRevision && Number.isFinite(Date.parse(record.reviewed_at))) {
    return { ok: true, row: toAdminRequest(record) };
  }
  if (error) {
    const { data: latest, error: readError } = await client.from("registrations").select(SAFE_COLUMNS).eq("id", id).maybeSingle();
    if (readError) throw readError;
    return { ok: false, code: latest ? "conflict" : "not_found", latest: latest ? toAdminRequest(latest) : null, error: latest ? "This request changed. Review the latest decision before trying again." : "This request is no longer available." };
  }
  throw new Error("The saved decision could not be confirmed. Refresh before trying again.");
}

function membershipError(message, code = "unconfirmed") {
  return Object.assign(new Error(message), { code });
}

export async function inviteAdminMembership(client, value, members = []) {
  const checked = validateAdminInvite(value, members);
  if (!checked.ok) throw membershipError(checked.error, checked.code);
  const { data, error } = await client.from("allowed_admins").insert({ email: checked.email }).select(MEMBER_COLUMNS);
  if (error) throw error;
  if (data?.length !== 1 || data[0].email !== checked.email || data[0].is_owner !== false) {
    throw membershipError("The invitation could not be confirmed. Refresh the team and try again.");
  }
  const { data: saved, error: readError } = await client.from("allowed_admins").select(MEMBER_COLUMNS).eq("email", checked.email).maybeSingle();
  if (readError) throw readError;
  if (!saved || saved.email !== checked.email || !Number.isFinite(Date.parse(saved.created_at))) {
    throw membershipError("The invitation could not be confirmed. Refresh the team and try again.");
  }
  return toAdminMember(saved);
}

/** A self-removal is confirmed by the caller's fresh access check, never an anonymous table read. */
export async function removeAdminMembership(client, member, { self = false } = {}) {
  if (!member?.email || member.role === "owner") throw membershipError("The owner keeps access.", "protected");
  const { data, error } = await client.from("allowed_admins").delete().eq("email", member.email).select(MEMBER_COLUMNS);
  if (error) throw error;
  if (data?.length !== 1 || data[0].email !== member.email) {
    throw membershipError("This account could not be removed. Refresh the team and try again.");
  }
  if (!self) {
    const { data: stillSaved, error: readError } = await client.from("allowed_admins").select("email").eq("email", member.email).maybeSingle();
    if (readError) throw readError;
    if (stillSaved) throw membershipError("This account still has access. Refresh the team and try again.");
  }
  return { email: member.email, self };
}

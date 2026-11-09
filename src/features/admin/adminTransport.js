import { followUpPatch, toAdminRequest } from "./admin-model.js";

export const SAFE_COLUMNS = "id,submission_id,full_name,email,phone,metadata,status,notes,assignee,revision,created,updated,updated_by";
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

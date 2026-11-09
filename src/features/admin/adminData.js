export function normalizeRegistration(record) {
  const metadata = record.metadata && typeof record.metadata === "object" ? record.metadata : {};
  return { ...metadata, ...record, id: record.id, submissionId: record.submission_id || metadata.submissionId || record.id,
    savedAt: record.created || metadata.savedAt, formType: metadata.formType || metadata.type || "enquiry",
    parentName: record.full_name || metadata.parentName || metadata.fullName || "",
    childName: metadata.childName || "", phone: record.phone || metadata.phone || "", email: record.email || metadata.email || "",
    community: metadata.community || metadata.societyName || "", age: metadata.age || "", sport: metadata.sport || "",
    status: record.status || "new", notes: record.notes || "", assignee: record.assignee || "",
    revision: record.revision ?? record.updated,
  };
}
export function safeCsvValue(value) {
  const text = value == null ? "" : typeof value === "object" ? JSON.stringify(value) : String(value);
  return /^[\s]*[=+@\-]/.test(text) || /^[\t\r\n]/.test(text) ? "'" + text : text;
}

/** A list request begun before a save must not roll that saved revision back. */
export function mergeSavedRegistrations(current, incoming) {
  const saved = new Map(current.map(row => [row.id, row]));
  return incoming.map(row => {
    const previous = saved.get(row.id);
    const oldRevision = Number(previous?.revision);
    const nextRevision = Number(row.revision);
    return previous && Number.isSafeInteger(oldRevision) && Number.isSafeInteger(nextRevision) && oldRevision > nextRevision ? previous : row;
  });
}

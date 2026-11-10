export const ACCOUNT_DELETION_POLICY_VERSION = "2026-11-11";

const uuid = value => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const messages = Object.freeze({
  owner_protected: "Transfer ownership before deleting. Your account is unchanged.",
  identity_changed: "Account changed. Reopen deletion for your current account.",
  confirmation_required: "Confirm permanent deletion and no refund to continue.",
  unauthorized: "Sign in again before deleting your account.",
  deletion_unavailable: "Couldn’t confirm deletion. Try again.",
});

export class AccountDeletionError extends Error {
  constructor(code = "deletion_unavailable") {
    const safeCode = Object.hasOwn(messages, code) ? code : "deletion_unavailable";
    super(messages[safeCode]);
    this.name = "AccountDeletionError";
    this.code = safeCode;
  }
}

export function accountDeletionErrorMessage(cause) {
  return new AccountDeletionError(cause?.code).message;
}

async function responseErrorCode(result) {
  if (result.data?.ok === false) return result.data.code;
  // The SDK puts a non-2xx response in FunctionsHttpError.context.
  // Read a clone so other callers can still inspect the original response.
  const response = result.error?.context || result.response;
  try {
    const body = await response?.clone().json();
    return body?.ok === false ? body.code : undefined;
  } catch { return undefined; }
}

/** The server verifies identity and permissions; expectedUserId only binds the confirmation. */
export async function requestAccountDeletion(client, { expectedUserId, confirmPermanent, acceptForfeit } = {}) {
  if (!uuid(expectedUserId)) throw new AccountDeletionError("identity_changed");
  if (confirmPermanent !== true || acceptForfeit !== true) throw new AccountDeletionError("confirmation_required");
  if (typeof client?.functions?.invoke !== "function") throw new AccountDeletionError();
  let result;
  try {
    result = await client.functions.invoke("delete-account", { body: {
      expectedUserId, policyVersion: ACCOUNT_DELETION_POLICY_VERSION, confirmPermanent: true, acceptForfeit: true,
    } });
  } catch { throw new AccountDeletionError(); }
  if (!result || result.error || result.data?.ok === false) throw new AccountDeletionError(await responseErrorCode(result || {}));
  const receipt = result.data;
  if (receipt?.ok !== true || !["deleted", "deleting"].includes(receipt.status) || receipt.deletedUserId !== expectedUserId) throw new AccountDeletionError();
  return { ok: true, status: receipt.status, deletedUserId: receipt.deletedUserId };
}

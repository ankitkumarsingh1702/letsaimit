export const DEFAULT_MONTHLY_FEE_PAISE = 600000;
export const MIN_MONTHLY_FEE_PAISE = 100;
export const MAX_MONTHLY_FEE_PAISE = 10000000;

export function validMonthlyFeePaise(value) {
  return Number.isSafeInteger(value) && value >= MIN_MONTHLY_FEE_PAISE && value <= MAX_MONTHLY_FEE_PAISE;
}

/** Parse decimal rupees without floating-point rounding or accepting exponent notation. */
export function parseMonthlyFeeInput(value) {
  const input = typeof value === "string" ? value.trim() : "";
  if (!/^(?:0|[1-9]\d{0,5})(?:\.\d{1,2})?$/.test(input)) throw new TypeError("Enter ₹1–₹1,00,000, with up to two decimals.");
  const [rupees, decimals = ""] = input.split(".");
  const amount = Number(rupees) * 100 + Number(decimals.padEnd(2, "0"));
  if (!validMonthlyFeePaise(amount)) throw new TypeError("Enter ₹1–₹1,00,000, with up to two decimals.");
  return amount;
}

export function monthlyFeeInput(paise) {
  if (!validMonthlyFeePaise(paise)) return "";
  const remainder = paise % 100;
  return String(Math.floor(paise / 100)) + (remainder ? `.${String(remainder).padStart(2, "0").replace(/0$/, "")}` : "");
}

export function captureMonthlyFeeBaseline(account) {
  if (!account?.id || !Number.isSafeInteger(account.revision) || account.revision < 1) throw new TypeError("Refresh monthly billing.");
  return Object.freeze({ ...account });
}

export function monthlyFeeBaselineChanged(baseline, current) {
  return baseline.id !== current.id || baseline.revision !== current.revision || baseline.status !== current.status
    || baseline.pricingModel !== current.pricingModel || baseline.nextEffectiveMonth !== current.nextEffectiveMonth
    || baseline.monthlyAmountPaise !== current.monthlyAmountPaise || baseline.nextMonthAmountPaise !== current.nextMonthAmountPaise;
}

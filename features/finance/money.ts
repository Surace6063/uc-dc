// Money is handled in paisa (whole numbers) so sums never drift; the
// database stores NPR with two decimals.

export function toPaisa(value: { toString(): string } | number | string | null | undefined): number {
  if (value === null || value === undefined || value === "") return 0
  const n = Number(typeof value === "number" ? value : value.toString())
  return Number.isFinite(n) ? Math.round(n * 100) : 0
}

// For writing to a Decimal column.
export const toDecimal = (paisa: number) => (paisa / 100).toFixed(2)

const grouping = new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })

// "Rs. 1,25,000.00" (South Asian digit grouping).
export function formatRs(paisa: number | null | undefined) {
  if (paisa === null || paisa === undefined) return "—"
  return `${paisa < 0 ? "-" : ""}Rs. ${grouping.format(Math.abs(paisa) / 100)}`
}

// Shorter, for cards and charts: "Rs. 12.5 lakh", "Rs. 1.2 crore".
export function formatRsShort(paisa: number) {
  const rupees = paisa / 100
  const abs = Math.abs(rupees)
  if (abs >= 1e7) return `Rs. ${(rupees / 1e7).toFixed(2)} crore`
  if (abs >= 1e5) return `Rs. ${(rupees / 1e5).toFixed(2)} lakh`
  return `Rs. ${new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(rupees)}`
}

// A fee's balance and status from its amounts.
export function feeState(fee: { amount: number; discount: number; paid: number; cancelled: boolean }) {
  const balance = Math.max(0, fee.amount - fee.discount - fee.paid)
  const status = fee.cancelled ? "CANCELLED" : balance === 0 ? "PAID" : fee.paid > 0 ? "PARTIAL" : "UNPAID"
  return { balance, status } as const
}

// Splits a payment across fees in the given order (oldest due first),
// never paying a fee beyond its balance. Returns null if it doesn't fit.
export function allocate(amount: number, fees: { id: string; balance: number }[]) {
  let left = amount
  const parts: { studentFeeId: string; amount: number }[] = []
  for (const f of fees) {
    if (left === 0) break
    const take = Math.min(left, f.balance)
    if (take > 0) {
      parts.push({ studentFeeId: f.id, amount: take })
      left -= take
    }
  }
  return left === 0 ? parts : null
}

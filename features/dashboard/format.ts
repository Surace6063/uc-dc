// Display helpers for dashboard figures. Pure functions so they can be unit
// tested and used on the server or the client.

export type Change = { text: string; trend: "up" | "down" | "flat"; label: string }

const trendOf = (delta: number): Change["trend"] => (delta > 0 ? "up" : delta < 0 ? "down" : "flat")
const signed = (n: number, unit: string) => `${n > 0 ? "+" : n < 0 ? "−" : "±"}${Math.abs(n).toFixed(1)}${unit}`

// Relative change of a count against last year. Null without a genuine
// comparison (no previous figure, or a previous figure of zero, where a
// percentage would be meaningless).
export function countChange(current: number, comparison: { previous: number; yearName: string } | null): Change | null {
  if (!comparison || comparison.previous <= 0) return null
  const pct = Math.round(((current - comparison.previous) / comparison.previous) * 1000) / 10
  return { text: signed(pct, "%"), trend: trendOf(pct), label: `vs ${comparison.yearName}` }
}

// Change of a percentage in percentage points ("+2.5 pts").
export function pointsChange(current: number | null, comparison: { previous: number; yearName: string } | null): Change | null {
  if (current === null || !comparison) return null
  const pts = Math.round((current - comparison.previous) * 10) / 10
  return { text: signed(pts, " pts"), trend: trendOf(pts), label: `vs ${comparison.yearName}` }
}

// Nepalese rupees with South Asian digit grouping: "NPR 12,34,567".
const npr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "NPR", currencyDisplay: "code", maximumFractionDigits: 0 })
export const formatNpr = (amount: number) => npr.format(amount).replace(/ /g, " ")

/** Format paise as Indian Rupee string.
 *  formatINR(1500000) → "₹15,000"
 *  formatINR(3527397, true) → "₹35,273.97"  (for receipts/refunds)
 */
export function formatINR(paise: number, showPaise = false): string {
  const rupees = paise / 100
  const opts: Intl.NumberFormatOptions = {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: showPaise ? 2 : 0,
    maximumFractionDigits: showPaise ? 2 : 0,
  }
  return new Intl.NumberFormat('en-IN', opts).format(rupees)
}

/** Compact notation for large amounts on stat cards: ₹24.0L */
export function formatINRCompact(paise: number): string {
  const rupees = paise / 100
  if (rupees >= 10_00_000) return `₹${(rupees / 1_00_000).toFixed(1)}L`
  if (rupees >= 1_000) return `₹${(rupees / 1_000).toFixed(1)}K`
  return formatINR(paise)
}

/** Format date as "10 Oct 2026" */
export function formatDate(d: string | Date, locale = 'en-IN'): string {
  const date = typeof d === 'string' ? new Date(d) : d
  return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric' }).format(date)
}


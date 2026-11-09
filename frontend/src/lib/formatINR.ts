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

/** Convert integer Rupee amount into Indian words (e.g. 30000 -> "Rupees Thirty Thousand Only") */
export function numberToWordsINR(amount: number): string {
  if (!amount || isNaN(amount)) return 'Rupees Zero Only'

  const ones = [
    '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
    'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
    'Seventeen', 'Eighteen', 'Nineteen',
  ]
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety']

  function convertChunk(n: number): string {
    let str = ''
    if (n >= 100) {
      str += ones[Math.floor(n / 100)] + ' Hundred '
      n %= 100
    }
    if (n >= 20) {
      str += tens[Math.floor(n / 10)] + ' '
      n %= 10
    }
    if (n > 0) {
      str += ones[n] + ' '
    }
    return str.trim()
  }

  let n = Math.floor(amount)
  if (n === 0) return 'Rupees Zero Only'

  let words = ''
  if (n >= 10000000) {
    words += convertChunk(Math.floor(n / 10000000)) + ' Crore '
    n %= 10000000
  }
  if (n >= 100000) {
    words += convertChunk(Math.floor(n / 100000)) + ' Lakh '
    n %= 100000
  }
  if (n >= 1000) {
    words += convertChunk(Math.floor(n / 1000)) + ' Thousand '
    n %= 1000
  }
  if (n > 0) {
    words += convertChunk(n)
  }

  return `Rupees ${words.trim()} Only`
}


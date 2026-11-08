/**
 * PaymentReturn.tsx
 *
 * Landing page after Cashfree redirects the customer back to our app.
 * URL: /payment/return?cf_link_id=INST-123-ABC
 *
 * Polls GET /gateway/status/{token} until status is "paid" or "expired".
 */
import { useEffect, useState } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { CheckCircle, XCircle, Loader2 } from 'lucide-react'
import { api } from '../lib/api'
import { formatINR } from '../lib/formatINR'

interface StatusData {
  token: string
  status: 'open' | 'paid' | 'expired'
  amount_paise: number
  student_name: string
  instalment_seq: number
  receipt_id: number | null
}

const MAX_POLLS = 12   // poll up to 12 times
const POLL_MS = 2500  // every 2.5 s

export default function PaymentReturn() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('cf_link_id') ?? ''

  const [data, setData] = useState<StatusData | null>(null)
  const [error, setError] = useState('')
  const [polls, setPolls] = useState(0)

  useEffect(() => {
    if (!token) { setError('Invalid return URL — no payment reference found.'); return }

    let cancelled = false
    let count = 0

    const poll = async () => {
      try {
        const result = await api.get<StatusData>(`/gateway/status/${token}`)
        if (cancelled) return
        setData(result)

        if (result.status === 'open' && count < MAX_POLLS) {
          count++
          setPolls(count)
          setTimeout(poll, POLL_MS)
        }
      } catch (err: any) {
        if (!cancelled) setError(err?.message ?? 'Could not check payment status.')
      }
    }

    poll()
    return () => { cancelled = true }
  }, [token])

  // ── Loading / polling while status is open ──────────────────────────────
  if (!error && (!data || (data.status === 'open' && polls < MAX_POLLS))) {
    return (
      <div className="min-h-screen bg-page-bg flex flex-col items-center justify-center gap-4">
        <Loader2 size={40} className="animate-spin text-primary" />
        <p className="text-gray-700 font-medium">Confirming your payment…</p>
        <p className="text-sm text-muted-foreground">
          {polls > 0 ? `Verifying with bank (${polls}/${MAX_POLLS})…` : 'Checking payment status…'}
        </p>
      </div>
    )
  }

  // ── Error ──────────────────────────────────────────────────────────────
  if (error) {
    return (
      <div className="min-h-screen bg-page-bg flex flex-col items-center justify-center gap-4 px-4">
        <XCircle size={48} className="text-danger" />
        <p className="text-gray-900 font-semibold text-lg">Something went wrong</p>
        <p className="text-sm text-muted-foreground text-center max-w-xs">{error}</p>
        <Link to="/parent" className="btn-primary mt-2">Go to Home</Link>
      </div>
    )
  }

  // ── Paid ───────────────────────────────────────────────────────────────
  if (data?.status === 'paid') {
    return (
      <div className="min-h-screen bg-page-bg flex flex-col items-center justify-center gap-4 px-4">
        <div className="card w-full max-w-sm text-center">
          <CheckCircle size={56} className="text-primary mx-auto mb-3" />
          <h1 className="text-xl font-semibold text-gray-900 mb-1">Payment successful!</h1>
          <p className="text-muted-foreground text-sm mb-4">
            Instalment #{data.instalment_seq} for {data.student_name}
          </p>
          <p className="text-3xl font-semibold tabular-nums text-primary mb-6">
            {formatINR(data.amount_paise)}
          </p>
          <div className="space-y-2">
            <Link
              to={data.receipt_id ? `/parent?receipt=${data.receipt_id}` : '/parent?paid=1'}
              className="btn-primary w-full"
            >
              View Receipt
            </Link>
            <Link to="/parent" className="btn-secondary w-full">
              Back to Home
            </Link>
          </div>
        </div>
      </div>
    )
  }

  // ── Still open after MAX_POLLS (processing delay) ──────────────────────
  if (data?.status === 'open' && polls >= MAX_POLLS) {
    return (
      <div className="min-h-screen bg-page-bg flex flex-col items-center justify-center gap-4 px-4">
        <div className="card w-full max-w-sm text-center">
          <Loader2 size={48} className="text-primary animate-spin mx-auto mb-3" />
          <h1 className="text-lg font-semibold text-gray-900 mb-1">Payment is being processed</h1>
          <p className="text-sm text-muted-foreground mb-4">
            Your payment is being confirmed by the bank. This may take a few minutes.
            Check your receipts in the app shortly.
          </p>
          <Link to="/parent" className="btn-primary w-full">Go to Home</Link>
        </div>
      </div>
    )
  }

  // ── Expired / failed ───────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-page-bg flex flex-col items-center justify-center gap-4 px-4">
      <div className="card w-full max-w-sm text-center">
        <XCircle size={48} className="text-danger mx-auto mb-3" />
        <h1 className="text-lg font-semibold text-gray-900 mb-1">Payment not completed</h1>
        <p className="text-sm text-muted-foreground mb-4">
          The payment link has expired or the transaction was cancelled.
          Please try again from the home screen.
        </p>
        <Link to="/parent" className="btn-primary w-full">Try Again</Link>
      </div>
    </div>
  )
}


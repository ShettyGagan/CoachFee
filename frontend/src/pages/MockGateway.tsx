import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation } from '@tanstack/react-query'
import { AlertTriangle, CheckCircle, XCircle, Loader2 } from 'lucide-react'
import { api, ApiError } from '../lib/api'
import { formatINR } from '../lib/formatINR'
import { useState } from 'react'

interface LinkInfo {
  token: string
  student_name: string
  instalment_seq: number
  amount_paise: number
  institute_name: string
  status: 'pending' | 'paid' | 'expired'
}

export default function MockGateway() {
  const { token } = useParams<{ token: string }>()
  const navigate = useNavigate()
  const [outcome, setOutcome] = useState<string | null>(null)

  const { data, isLoading, error } = useQuery<LinkInfo>({
    queryKey: ['gateway', token],
    queryFn: () => api.get(`/gateway/links/${token}`),
    retry: false,
  })

  const completeMutation = useMutation({
    mutationFn: (outcome: string) =>
      api.post(`/gateway/links/${token}/complete`, { outcome }),
    onSuccess: (_, outcome) => {
      if (outcome === 'success') navigate('/parent?paid=1')
      else setOutcome('failure')
    },
    onError: (err: ApiError) => {
      setOutcome(`error:${err.message}`)
    },
  })

  if (isLoading) {
    return (
      <div className="min-h-screen bg-page-bg flex items-center justify-center">
        <Loader2 size={32} className="animate-spin text-primary" />
      </div>
    )
  }

  const apiErr = error as ApiError | null
  if (apiErr || !data) {
    return (
      <div className="min-h-screen bg-page-bg flex items-center justify-center p-4">
        <div className="card max-w-sm w-full text-center">
          <XCircle size={48} className="text-danger mx-auto mb-3" />
          <h2 className="text-lg font-semibold text-gray-900 mb-1">Link not found</h2>
          <p className="text-sm text-muted-foreground">This payment link is invalid or has expired.</p>
        </div>
      </div>
    )
  }

  if (data.status === 'paid') {
    return (
      <div className="min-h-screen bg-page-bg flex items-center justify-center p-4">
        <div className="card max-w-sm w-full text-center">
          <CheckCircle size={48} className="text-success mx-auto mb-3" />
          <h2 className="text-lg font-semibold text-gray-900 mb-1">Already paid</h2>
          <p className="text-sm text-muted-foreground">This payment has already been processed.</p>
        </div>
      </div>
    )
  }

  if (data.status === 'expired') {
    return (
      <div className="min-h-screen bg-page-bg flex items-center justify-center p-4">
        <div className="card max-w-sm w-full text-center">
          <AlertTriangle size={48} className="text-warning mx-auto mb-3" />
          <h2 className="text-lg font-semibold text-gray-900 mb-1">Link expired</h2>
          <p className="text-sm text-muted-foreground">This payment link has expired. Please request a new one.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-page-bg flex flex-col items-center justify-center p-4">
      {/* TEST MODE banner */}
      <div className="w-full max-w-sm mb-4">
        <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          <AlertTriangle size={16} className="text-amber-600 shrink-0" />
          <p className="text-xs font-semibold text-amber-700">TEST MODE — No real money is charged</p>
        </div>
      </div>

      <div className="card max-w-sm w-full">
        <div className="text-center mb-6">
          <div className="w-12 h-12 bg-primary rounded-xl flex items-center justify-center text-white font-bold text-xl mx-auto mb-3">J</div>
          <p className="text-sm text-muted-foreground">{data.institute_name}</p>
        </div>

        <div className="bg-gray-50 rounded-lg p-4 mb-6 space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Student</span>
            <span className="font-medium text-gray-900">{data.student_name}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Instalment</span>
            <span className="font-medium text-gray-900">#{data.instalment_seq}</span>
          </div>
          <div className="flex justify-between text-sm border-t border-border pt-2 mt-2">
            <span className="font-semibold text-gray-900">Amount</span>
            <span className="font-semibold text-gray-900 text-lg">{formatINR(data.amount_paise)}</span>
          </div>
        </div>

        {outcome === 'failure' && (
          <div className="bg-red-50 border border-red-200 rounded-md p-3 mb-4">
            <p className="text-sm text-danger font-medium">Payment failed. Please try again.</p>
          </div>
        )}
        {outcome?.startsWith('error:') && (
          <div className="bg-red-50 border border-red-200 rounded-md p-3 mb-4">
            <p className="text-sm text-danger">{outcome.slice(6)}</p>
          </div>
        )}

        <button
          onClick={() => completeMutation.mutate('success')}
          disabled={completeMutation.isPending}
          className="btn-primary w-full flex items-center justify-center gap-2 h-12 text-base mb-3"
        >
          {completeMutation.isPending ? <Loader2 size={18} className="animate-spin" /> : null}
          Pay {formatINR(data.amount_paise)}
        </button>

        <button
          onClick={() => completeMutation.mutate('failure')}
          disabled={completeMutation.isPending}
          className="w-full text-sm text-muted-foreground hover:text-gray-700 py-2 transition-colors"
        >
          Simulate failed payment
        </button>
      </div>
    </div>
  )
}


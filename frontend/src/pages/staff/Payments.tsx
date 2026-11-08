import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { CheckCircle, Plus } from 'lucide-react'
import { api } from '../../lib/api'
import { formatINR, formatDate } from '../../lib/formatINR'
import { PageHeader } from '../../components/PageHeader'
import { TableSkeleton, ErrorState } from '../../components/EmptyState'
import { AssignPaymentDialog } from '../../components/AssignPaymentDialog'
import { RecordPaymentDialog } from '../../components/RecordPaymentDialog'

interface UnmatchedPayment {
  payment_id: number
  created_at: string
  method: string
  reference: string | null
  amount_paise: number
  unallocated_paise: number
}

export default function Payments() {
  const [assignPayment, setAssignPayment] = useState<UnmatchedPayment | null>(null)
  const [recordOpen, setRecordOpen] = useState(false)

  const { data, isLoading, error, refetch } = useQuery<{ items: UnmatchedPayment[]; total_unallocated_paise: number }>({
    queryKey: ['unmatched'],
    queryFn: () => api.get('/payments/unmatched'),
  })

  if (isLoading) return <div><PageHeader title="Unmatched payments" /><TableSkeleton /></div>
  if (error) return <div><PageHeader title="Unmatched payments" /><ErrorState message="Could not load payments" onRetry={refetch} /></div>

  const items = data?.items ?? []
  const total = data?.total_unallocated_paise ?? 0

  return (
    <div>
      <PageHeader
        title="Unmatched payments"
        action={
          <button onClick={() => setRecordOpen(true)} className="btn-primary flex items-center gap-1.5">
            <Plus size={16} /> Record payment
          </button>
        }
      />

      {items.length > 0 && (
        <p className="text-sm text-muted-foreground mb-4">
          {items.length} payment{items.length !== 1 ? 's' : ''} · {formatINR(total)} not yet assigned
        </p>
      )}

      {items.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100/90 shadow-xs flex flex-col items-center py-16 text-center p-6">
          <div className="w-14 h-14 rounded-2xl bg-[#E8F8F0] flex items-center justify-center text-[#059669] mb-4">
            <CheckCircle size={32} />
          </div>
          <p className="text-lg font-bold text-gray-900 tracking-tight">All payments are matched</p>
          <p className="text-xs sm:text-sm text-gray-400 mt-1">No unassigned payments in the queue.</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100/90 shadow-xs overflow-hidden">
          {/* Desktop table */}
          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-[#E8F8F0] border-b border-gray-100">
                  <th className="px-6 py-3.5 text-left text-xs font-bold text-[#059669] uppercase tracking-wider">Date</th>
                  <th className="px-6 py-3.5 text-left text-xs font-bold text-[#059669] uppercase tracking-wider">Method</th>
                  <th className="px-6 py-3.5 text-left text-xs font-bold text-[#059669] uppercase tracking-wider">Reference</th>
                  <th className="px-6 py-3.5 text-right text-xs font-bold text-[#059669] uppercase tracking-wider">Amount</th>
                  <th className="px-6 py-3.5 text-right text-xs font-bold text-[#059669] uppercase tracking-wider">Unallocated</th>
                  <th className="px-6 py-3.5 text-center text-xs font-bold text-[#059669] uppercase tracking-wider">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100/90">
                {items.map(p => (
                  <tr key={p.payment_id} className="h-16 hover:bg-[#F9FCFA] transition-colors">
                    <td className="px-6 py-4 text-sm font-medium text-gray-800">{formatDate(p.created_at)}</td>
                    <td className="px-6 py-4">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-700 capitalize">
                        {p.method.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-xs font-mono text-gray-500">{p.reference || '—'}</td>
                    <td className="px-6 py-4 text-sm text-right tabular-nums font-bold text-gray-900">{formatINR(p.amount_paise)}</td>
                    <td className="px-6 py-4 text-sm text-right tabular-nums text-amber-600 font-bold">{formatINR(p.unallocated_paise)}</td>
                    <td className="px-6 py-4 text-center">
                      <button
                        onClick={() => setAssignPayment(p)}
                        className="inline-flex items-center gap-1 px-3 py-1 bg-[#E8F8F0] text-[#059669] hover:bg-[#DCFCE7] font-semibold text-xs rounded-lg transition-colors cursor-pointer"
                      >
                        Assign
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="sm:hidden divide-y divide-gray-100/90">
            {items.map(p => (
              <div key={p.payment_id} className="p-4 space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-xs text-gray-500 font-medium">{formatDate(p.created_at)}</span>
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-700 capitalize">
                    {p.method.replace('_', ' ')}
                  </span>
                </div>
                {p.reference && <p className="text-xs font-mono text-gray-400">{p.reference}</p>}
                <div className="flex justify-between items-center pt-1">
                  <div>
                    <p className="text-sm font-bold text-gray-900 tabular-nums">{formatINR(p.amount_paise)}</p>
                    <p className="text-xs text-amber-600 font-semibold">Unallocated: {formatINR(p.unallocated_paise)}</p>
                  </div>
                  <button
                    onClick={() => setAssignPayment(p)}
                    className="inline-flex items-center gap-1 px-3 py-1 bg-[#E8F8F0] text-[#059669] font-semibold text-xs rounded-lg cursor-pointer"
                  >
                    Assign
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {assignPayment && (
        <AssignPaymentDialog
          open={!!assignPayment}
          onOpenChange={v => !v && setAssignPayment(null)}
          paymentId={assignPayment.payment_id}
          paymentAmount={assignPayment.unallocated_paise}
        />
      )}

      <RecordPaymentDialog open={recordOpen} onOpenChange={setRecordOpen} />
    </div>
  )
}


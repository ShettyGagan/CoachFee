import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Play, X, Loader2, Eye } from 'lucide-react'
import * as Dialog from '@radix-ui/react-dialog'
import { api, ApiError } from '../../lib/api'
import { formatDate } from '../../lib/formatINR'
import { PageHeader } from '../../components/PageHeader'
import { ChipFilterRow } from '../../components/ChipFilterRow'
import { StatusBadge } from '../../components/StatusBadge'
import { TableSkeleton, ErrorState, EmptyState } from '../../components/EmptyState'
import { toast } from 'sonner'
import { clsx } from 'clsx'

interface Reminder {
  reminder_id: number
  student_name: string
  student_code: string
  kind: string
  scheduled_at: string
  status: string
  language: string
  note: string | null
  message_text: string
}

interface RunResult {
  created: number
  sent: number
  skipped: number
}

const KIND_LABELS: Record<string, string> = {
  'd_minus_7': '7 days before',
  'd_minus_1': '1 day before',
  'd_0': 'On due date',
  'd_plus_3': '3 days after',
  'd_plus_7': '7 days after',
  'd_plus_15': '15 days after',
}

const STATUS_FILTERS = [
  { value: '', label: 'All' },
  { value: 'pending', label: 'Pending' },
  { value: 'sent', label: 'Sent' },
  { value: 'skipped', label: 'Skipped' },
  { value: 'cancelled', label: 'Cancelled' },
]

export default function Reminders() {
  const qc = useQueryClient()
  const [statusFilter, setStatusFilter] = useState('')
  const [runResult, setRunResult] = useState<RunResult | null>(null)
  const [viewMessage, setViewMessage] = useState<Reminder | null>(null)

  const params = statusFilter ? `?status=${statusFilter}` : ''
  const { data, isLoading, error, refetch } = useQuery<{ items: Reminder[] }>({
    queryKey: ['reminders', statusFilter],
    queryFn: () => api.get(`/reminders${params}`),
  })

  const runMutation = useMutation({
    mutationFn: () => api.post<RunResult>('/admin/jobs/reminders/run'),
    onSuccess: (result) => {
      setRunResult(result)
      qc.invalidateQueries({ queryKey: ['reminders'] })
    },
    onError: (err: ApiError) => toast.error(err.message),
  })

  if (isLoading) return <div><PageHeader title="Reminders" /><TableSkeleton /></div>
  if (error) return <div><PageHeader title="Reminders" /><ErrorState message="Could not load reminders" onRetry={refetch} /></div>

  const items = data?.items ?? []

  return (
    <div>
      <PageHeader
        title="Reminders"
        subtitle="Automated reminders run daily in the background at 09:00 AM IST based on business rules. You can also trigger an immediate on-demand run anytime."
        action={
          <button
            onClick={() => runMutation.mutate()}
            disabled={runMutation.isPending}
            className="btn-primary flex items-center gap-1.5"
          >
            {runMutation.isPending ? <Loader2 size={15} className="animate-spin" /> : <Play size={15} />}
            Run reminders now
          </button>
        }
      />

      {/* Run result strip */}
      {runResult && (
        <div className="bg-brand-soft border border-green-200 rounded-lg px-4 py-3 mb-4 flex items-center justify-between">
          <p className="text-sm text-gray-800">
            Created <span className="font-semibold">{runResult.created}</span> ·{' '}
            Sent <span className="font-semibold">{runResult.sent}</span> ·{' '}
            Skipped <span className="font-semibold">{runResult.skipped}</span>
          </p>
          <button onClick={() => setRunResult(null)} className="text-muted-foreground hover:text-gray-700"><X size={16} /></button>
        </div>
      )}

      <div className="mb-4">
        <ChipFilterRow options={STATUS_FILTERS} value={statusFilter} onChange={setStatusFilter} />
      </div>

      {items.length === 0 ? (
        <EmptyState
          icon={<Play size={32} className="text-muted-foreground" />}
          title="No reminders yet"
          description="Run reminders now to create them."
          action={
            <button onClick={() => runMutation.mutate()} className="btn-primary flex items-center gap-1.5">
              <Play size={15} /> Run reminders now
            </button>
          }
        />
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100/90 shadow-xs overflow-hidden">
          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-[#E8F8F0] border-b border-gray-100">
                  {['Student', 'Reminder', 'Scheduled for', 'Status', 'Language', 'Note', ''].map(h => (
                    <th key={h} className="px-6 py-3.5 text-left text-xs font-bold text-[#059669] uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100/90">
                {items.map(r => (
                  <tr key={r.reminder_id} className={clsx('h-16 hover:bg-[#F9FCFA] transition-colors', r.status === 'cancelled' && 'opacity-60')}>
                    <td className="px-6 py-4 text-sm">
                      <p className="font-bold text-gray-900">{r.student_name}</p>
                      <p className="text-xs text-gray-400 font-mono">{r.student_code}</p>
                    </td>
                    <td className="px-6 py-4 text-sm font-medium text-gray-700">{KIND_LABELS[r.kind] || r.kind}</td>
                    <td className="px-6 py-4 text-sm text-gray-600">{formatDate(r.scheduled_at)}</td>
                    <td className="px-6 py-4"><StatusBadge status={r.status} /></td>
                    <td className="px-6 py-4">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-700">
                        {r.language.toUpperCase()}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-xs text-gray-400">{r.note || '—'}</td>
                    <td className="px-6 py-4 text-center">
                      <button
                        onClick={() => setViewMessage(r)}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors cursor-pointer"
                        title="View message"
                      >
                        <Eye size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile */}
          <div className="sm:hidden divide-y divide-gray-100/90">
            {items.map(r => (
              <div key={r.reminder_id} className={clsx('p-4 space-y-1', r.status === 'cancelled' && 'opacity-60')}>
                <div className="flex justify-between items-center">
                  <p className="text-sm font-bold text-gray-900">{r.student_name}</p>
                  <StatusBadge status={r.status} />
                </div>
                <p className="text-xs text-gray-500">{KIND_LABELS[r.kind] || r.kind} · {formatDate(r.scheduled_at)}</p>
                {r.note && <p className="text-xs text-gray-400">{r.note}</p>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* View message dialog */}
      <Dialog.Root open={!!viewMessage} onOpenChange={v => !v && setViewMessage(null)}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2 w-full max-w-md bg-white rounded-xl shadow-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <Dialog.Title className="text-base font-semibold text-gray-900">Message text</Dialog.Title>
              <Dialog.Close className="text-muted-foreground hover:text-gray-700"><X size={18} /></Dialog.Close>
            </div>
            {viewMessage && (
              <div>
                <div className="flex gap-2 mb-3">
                  <span className="chip bg-gray-100 text-gray-700 text-xs">{viewMessage.language.toUpperCase()}</span>
                  <span className="text-xs text-muted-foreground">{viewMessage.student_name} · {KIND_LABELS[viewMessage.kind] || viewMessage.kind}</span>
                </div>
                <div className="bg-gray-50 rounded-lg p-3 text-sm text-gray-800 whitespace-pre-wrap font-mono">
                  {viewMessage.message_text}
                </div>
              </div>
            )}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  )
}


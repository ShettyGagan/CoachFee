import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Play, Info, Loader2, X, ShieldAlert } from 'lucide-react'
import * as Dialog from '@radix-ui/react-dialog'
import { api, ApiError } from '../../lib/api'
import { PageHeader } from '../../components/PageHeader'
import { ChipFilterRow } from '../../components/ChipFilterRow'
import { StatusBadge } from '../../components/StatusBadge'
import { RiskReviewDialog } from '../../components/RiskReviewDialog'
import { TableSkeleton, ErrorState, EmptyState } from '../../components/EmptyState'
import { toast } from 'sonner'
import { useMe } from '../../lib/auth'
import { clsx } from 'clsx'

interface RiskFlag {
  flag_id: number
  student_id: number
  student_name: string
  student_code: string
  batch_name: string
  guardian_phone: string
  level: 'high' | 'medium'
  score: number
  reasons: string[]
  status: string
  flagged_at: string
}

interface RunResult {
  scored: number
  flagged: number
  updated: number
  skipped: number
}

const STATUS_FILTERS = [
  { value: 'open', label: 'Open' },
  { value: 'called', label: 'Called' },
  { value: 'false_flag', label: 'False flag' },
]

const LEVEL_OPTIONS = [
  { value: '', label: 'All levels' },
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Medium' },
]

export default function Risk() {
  const qc = useQueryClient()
  const { data: me } = useMe()
  const [statusFilter, setStatusFilter] = useState('open')
  const [levelFilter, setLevelFilter] = useState('')
  const [runResult, setRunResult] = useState<RunResult | null>(null)
  const [reviewFlag, setReviewFlag] = useState<{ flag: RiskFlag; action: 'called' | 'false_flag' } | null>(null)
  const [infoOpen, setInfoOpen] = useState(false)

  const params = new URLSearchParams({ status: statusFilter })
  if (levelFilter) params.set('level', levelFilter)

  const { data, isLoading, error, refetch } = useQuery<{ items: RiskFlag[] }>({
    queryKey: ['risk-flags', statusFilter, levelFilter],
    queryFn: () => api.get(`/risk-flags?${params.toString()}`),
  })

  const runMutation = useMutation({
    mutationFn: () => api.post<RunResult>('/admin/jobs/risk/run'),
    onSuccess: (result) => {
      setRunResult(result)
      qc.invalidateQueries({ queryKey: ['risk-flags'] })
    },
    onError: (err: ApiError) => toast.error(err.message),
  })

  const canRun = me?.role === 'admin' || me?.role === 'accounts'
  const flags = data?.items ?? []

  if (isLoading) return <div><PageHeader title="Risk flags" /><TableSkeleton /></div>
  if (error) return <div><PageHeader title="Risk flags" /><ErrorState message="Could not load risk flags" onRetry={refetch} /></div>

  return (
    <div>
      <PageHeader
        title="Risk flags"
        action={
          <div className="flex items-center gap-2">
            <button onClick={() => setInfoOpen(true)} className="p-2 text-muted-foreground hover:text-gray-700 rounded-md hover:bg-gray-100">
              <Info size={18} />
            </button>
            {canRun && (
              <button
                onClick={() => runMutation.mutate()}
                disabled={runMutation.isPending}
                className="btn-primary flex items-center gap-1.5"
              >
                {runMutation.isPending ? <Loader2 size={15} className="animate-spin" /> : <Play size={15} />}
                Run risk check
              </button>
            )}
          </div>
        }
      />

      {/* Always-visible disclaimer banner */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 mb-4 text-sm text-blue-800">
        <span className="font-semibold">Flags are suggestions for a counsellor call.</span>{' '}
        They never send messages or change fees.
      </div>

      {/* Run result strip */}
      {runResult && (
        <div className="bg-brand-soft border border-green-200 rounded-lg px-4 py-3 mb-4 flex items-center justify-between">
          <p className="text-sm text-gray-800">
            Scored <span className="font-semibold">{runResult.scored}</span> ·{' '}
            Flagged <span className="font-semibold">{runResult.flagged}</span> ·{' '}
            Updated <span className="font-semibold">{runResult.updated}</span> ·{' '}
            Skipped <span className="font-semibold">{runResult.skipped}</span>
          </p>
          <button onClick={() => setRunResult(null)} className="text-muted-foreground hover:text-gray-700"><X size={16} /></button>
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <ChipFilterRow options={STATUS_FILTERS} value={statusFilter} onChange={setStatusFilter} />
        <select
          value={levelFilter}
          onChange={e => setLevelFilter(e.target.value)}
          className="rounded-xl border border-gray-200 bg-white text-xs font-semibold text-gray-700 px-3.5 py-1.5 ml-auto shadow-2xs focus:ring-2 focus:ring-[#059669]/20 focus:border-[#059669] cursor-pointer"
        >
          {LEVEL_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>

      {flags.length === 0 ? (
        <EmptyState
          icon={<ShieldAlert size={32} className="text-gray-400" />}
          title="No open flags"
          description="Run the risk check to refresh."
          action={canRun ? (
            <button onClick={() => runMutation.mutate()} className="btn-primary flex items-center gap-1.5">
              <Play size={15} /> Run risk check
            </button>
          ) : undefined}
        />
      ) : (
        <div className="space-y-3">
          {flags.map(flag => (
            <div key={flag.flag_id} className="bg-white rounded-2xl border border-gray-100/90 shadow-xs p-5 hover:border-gray-200 transition-colors">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <p className="font-bold text-gray-900">{flag.student_name}</p>
                    <span className="text-xs text-gray-400 font-mono">{flag.student_code}</span>
                    <span className={clsx('chip', flag.level === 'high' ? 'chip-overdue' : 'chip-part')}>
                      {flag.level.charAt(0).toUpperCase() + flag.level.slice(1)}
                    </span>
                    <span className="text-xs font-semibold text-gray-600">Score: {flag.score}</span>
                  </div>
                  <p className="text-xs text-gray-400 mb-2">{flag.batch_name} · {flag.guardian_phone}</p>
                  <ul className="space-y-1">
                    {flag.reasons.map((r, i) => (
                      <li key={i} className="flex gap-2 text-xs text-gray-700">
                        <span className="text-amber-500 font-bold">•</span>
                        <span>{r}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                {flag.status === 'open' && (
                  <div className="flex flex-col gap-2 shrink-0">
                    <button
                      onClick={() => setReviewFlag({ flag, action: 'called' })}
                      className="inline-flex items-center justify-center px-3 py-1.5 bg-[#E8F8F0] text-[#059669] hover:bg-[#DCFCE7] font-semibold text-xs rounded-lg transition-colors cursor-pointer whitespace-nowrap"
                    >
                      Mark as called
                    </button>
                    <button
                      onClick={() => setReviewFlag({ flag, action: 'false_flag' })}
                      className="inline-flex items-center justify-center px-3 py-1.5 border border-gray-200 text-gray-500 hover:text-gray-700 hover:bg-gray-50 font-semibold text-xs rounded-lg transition-colors cursor-pointer whitespace-nowrap"
                    >
                      False flag
                    </button>
                  </div>
                )}
                {flag.status !== 'open' && (
                  <StatusBadge status={flag.status} />
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Info popover */}
      <Dialog.Root open={infoOpen} onOpenChange={setInfoOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2 w-full max-w-sm bg-white rounded-xl shadow-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <Dialog.Title className="text-base font-semibold text-gray-900">How is the score worked out?</Dialog.Title>
              <Dialog.Close className="text-muted-foreground hover:text-gray-700"><X size={18} /></Dialog.Close>
            </div>
            <div className="space-y-3 text-sm text-gray-700">
              <div className="flex justify-between py-2 border-b border-border">
                <span>Overdue fees</span>
                <span className="font-semibold">up to 40 pts</span>
              </div>
              <div className="flex justify-between py-2 border-b border-border">
                <span>Attendance drop</span>
                <span className="font-semibold">up to 35 pts</span>
              </div>
              <div className="flex justify-between py-2">
                <span>Test score trend</span>
                <span className="font-semibold">up to 25 pts</span>
              </div>
              <div className="bg-gray-50 rounded-lg p-3 mt-3 space-y-1">
                <p className="font-semibold text-gray-800 mb-1">Levels</p>
                <div className="flex gap-2 items-center"><span className="chip-overdue">High</span> <span>60+ points</span></div>
                <div className="flex gap-2 items-center"><span className="chip-part">Medium</span> <span>30–59 points</span></div>
              </div>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {reviewFlag && (
        <RiskReviewDialog
          open={!!reviewFlag}
          onOpenChange={v => !v && setReviewFlag(null)}
          flagId={reviewFlag.flag.flag_id}
          action={reviewFlag.action}
          studentName={reviewFlag.flag.student_name}
        />
      )}
    </div>
  )
}


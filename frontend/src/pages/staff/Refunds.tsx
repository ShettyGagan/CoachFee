import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { Search, Loader2, Calculator } from 'lucide-react'
import { api, ApiError } from '../../lib/api'
import { formatINR, formatDate } from '../../lib/formatINR'
import { PageHeader } from '../../components/PageHeader'
import { StatusBadge } from '../../components/StatusBadge'
import { ChipFilterRow } from '../../components/ChipFilterRow'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { TableSkeleton, ErrorState, EmptyState } from '../../components/EmptyState'
import { toast } from 'sonner'
import { useDebounce } from '../../lib/useDebounce'

interface RefundPreview {
  student_id: number
  student_name: string
  student_code: string
  total_paid_paise: number
  registration_fee_paise: number
  days_attended: number
  course_days: number
  consumed_fee_paise: number
  refund_paise: number
  due_by: string
  formula: string
}

interface Refund {
  refund_id: number
  student_name: string
  student_code: string
  leave_date: string
  refund_paise: number
  due_by: string
  status: string
  overdue: boolean
}

interface StudentSearchResult {
  student_id: number
  name: string
  student_code: string
  status: string
}

const STATUS_FILTERS = [
  { value: 'draft', label: 'Draft' },
  { value: 'approved', label: 'Approved' },
  { value: 'paid', label: 'Paid' },
]

export default function Refunds() {
  const qc = useQueryClient()
  const [searchParams] = useSearchParams()
  const prefillStudentId = searchParams.get('student_id')

  const [q, setQ] = useState('')
  const [leaveDate, setLeaveDate] = useState('')
  const [selectedStudent, setSelectedStudent] = useState<StudentSearchResult | null>(null)
  const [preview, setPreview] = useState<RefundPreview | null>(null)
  const [calcError, setCalcError] = useState('')
  const [statusFilter, setStatusFilter] = useState('draft')
  const [confirmAction, setConfirmAction] = useState<{ refundId: number; action: 'approved' | 'paid'; name: string } | null>(null)
  const debouncedQ = useDebounce(q, 300)

  // Prefill student if student_id is in query params
  useEffect(() => {
    if (prefillStudentId) {
      api.get<any>(`/students/${prefillStudentId}/ledger`).then(res => {
        if (res) {
          setSelectedStudent({
            student_id: res.student_id,
            name: res.name,
            student_code: res.student_code,
            status: res.status,
          })
          setQ(res.name)
        }
      }).catch(() => { })
    }
  }, [prefillStudentId])

  const { data: studentsData } = useQuery<{ items: StudentSearchResult[] }>({
    queryKey: ['students-active', debouncedQ],
    queryFn: () => api.get(`/students?q=${encodeURIComponent(debouncedQ)}&status=active&limit=10`),
    enabled: debouncedQ.length >= 2 && !selectedStudent,
  })

  const { data: refundsData, isLoading: listLoading, error: listError, refetch: listRefetch } = useQuery<{ items: Refund[] }>({
    queryKey: ['refunds', statusFilter],
    queryFn: () => api.get(`/refunds?status=${statusFilter}`),
  })

  const previewMutation = useMutation({
    mutationFn: (data: { student_id: number; leave_date: string }) =>
      api.post<RefundPreview>('/refunds/preview', data),
    onSuccess: (data) => { setPreview(data); setCalcError('') },
    onError: (err: ApiError) => {
      if (err.code === 'STUDENT_NOT_ACTIVE') setCalcError('Student must be active to calculate a refund.')
      else setCalcError(err.message)
    },
  })

  const saveMutation = useMutation({
    mutationFn: (data: { student_id: number; leave_date: string }) =>
      api.post('/refunds', data),
    onSuccess: () => {
      toast.success('Refund saved as draft.')
      qc.invalidateQueries({ queryKey: ['refunds'] })
      setPreview(null)
      setSelectedStudent(null)
      setQ('')
      setLeaveDate('')
    },
    onError: (err: ApiError) => {
      if (err.code === 'REFUND_ALREADY_EXISTS') setCalcError('A refund for this student already exists.')
      else setCalcError(err.message)
    },
  })

  const statusMutation = useMutation({
    mutationFn: ({ refundId, status }: { refundId: number; status: string }) =>
      api.patch(`/refunds/${refundId}/status`, { status }),
    onSuccess: () => {
      toast.success('Refund status updated.')
      qc.invalidateQueries({ queryKey: ['refunds'] })
      qc.invalidateQueries({ queryKey: ['students'] })
      qc.invalidateQueries({ queryKey: ['reminders'] })
      setConfirmAction(null)
    },
    onError: (err: ApiError) => {
      toast.error(err.message)
      setConfirmAction(null)
    },
  })

  const handleCalculate = () => {
    if (!selectedStudent) { setCalcError('Select a student.'); return }
    if (!leaveDate) { setCalcError('Enter a leave date.'); return }
    setCalcError('')
    previewMutation.mutate({ student_id: selectedStudent.student_id, leave_date: leaveDate })
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Refunds" />

      {/* Calculator */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="card">
          <h2 className="text-base font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Calculator size={18} /> Calculate refund
          </h2>

          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Student (active only)</label>
              <div className="relative">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={selectedStudent ? selectedStudent.name : q}
                  onChange={e => { setQ(e.target.value); setSelectedStudent(null); setPreview(null) }}
                  placeholder="Search name or code…"
                  className="input w-full pl-9"
                />
              </div>
              {!selectedStudent && debouncedQ.length >= 2 && studentsData?.items && (
                <div className="border border-border rounded-md mt-1 max-h-40 overflow-y-auto">
                  {studentsData.items.length === 0 ? (
                    <p className="text-sm text-muted-foreground p-3">No active students found</p>
                  ) : studentsData.items.map(s => (
                    <button
                      key={s.student_id}
                      onClick={() => { setSelectedStudent(s); setQ(s.name) }}
                      className="w-full text-left px-3 py-2 hover:bg-gray-50 text-sm"
                    >
                      <span className="font-medium">{s.name}</span>
                      <span className="text-muted-foreground ml-2">{s.student_code}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Leave date</label>
              <input
                type="date"
                value={leaveDate}
                onChange={e => { setLeaveDate(e.target.value); setPreview(null) }}
                className="input w-full"
              />
            </div>

            {calcError && <p className="text-sm text-danger">{calcError}</p>}

            <button
              onClick={handleCalculate}
              disabled={previewMutation.isPending}
              className="btn-primary w-full flex items-center justify-center gap-2"
            >
              {previewMutation.isPending && <Loader2 size={15} className="animate-spin" />}
              Calculate
            </button>
          </div>
        </div>

        {/* Result card */}
        <div className="card">
          <h2 className="text-base font-semibold text-gray-900 mb-4">Result</h2>
          {!preview ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <Calculator size={32} className="text-muted-foreground mb-2 opacity-30" />
              <p className="text-sm text-muted-foreground">Choose a student and a leave date, then calculate.</p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Fee paid</span>
                  <span className="tabular-nums font-medium">{(preview.total_paid_paise / 100).toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">− Registration fee</span>
                  <span className="tabular-nums text-danger">−{(preview.registration_fee_paise / 100).toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">− Fee for {preview.days_attended} of {preview.course_days} days</span>
                  <span className="tabular-nums text-danger">−{(preview.consumed_fee_paise / 100).toFixed(2)}</span>
                </div>
                <div className="flex justify-between font-semibold text-base pt-2 border-t border-border">
                  <span>Refund</span>
                  <span className="tabular-nums text-success">{(preview.refund_paise / 100).toFixed(2)}</span>
                </div>
                <p className="text-xs text-muted-foreground">Pay by {formatDate(preview.due_by)}</p>
              </div>
              <p className="text-xs text-muted-foreground font-mono bg-gray-50 p-2 rounded">{preview.formula}</p>
              {preview.refund_paise === 0 && (
                <p className="text-sm text-muted-foreground">No refund is due.</p>
              )}
              <button
                onClick={() => saveMutation.mutate({ student_id: preview.student_id, leave_date: leaveDate })}
                disabled={saveMutation.isPending}
                className="btn-primary w-full flex items-center justify-center gap-2"
              >
                {saveMutation.isPending && <Loader2 size={15} className="animate-spin" />}
                Save as draft
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Refund list */}
      <div>
        <div className="mb-4">
          <ChipFilterRow options={STATUS_FILTERS} value={statusFilter} onChange={setStatusFilter} />
        </div>

        {listLoading ? <TableSkeleton /> :
          listError ? <ErrorState message="Could not load refunds" onRetry={listRefetch} /> :
            refundsData?.items.length === 0 ? (
              <EmptyState title="No refund requests" description="No refunds in this status yet." />
            ) : (
              <div className="bg-white rounded-2xl border border-gray-100/90 shadow-xs overflow-hidden">
                <div className="hidden sm:block overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="bg-[#E8F8F0] border-b border-gray-100">
                        {['Student', 'Leave date', 'Refund', 'Due by', 'Status', 'Action'].map(h => (
                          <th key={h} className="px-6 py-3.5 text-left text-xs font-bold text-[#059669] uppercase tracking-wider">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100/90">
                      {refundsData?.items.map(r => (
                        <tr key={r.refund_id} className="h-16 hover:bg-[#F9FCFA] transition-colors">
                          <td className="px-6 py-4 text-sm">
                            <p className="font-bold text-gray-900">{r.student_name}</p>
                            <p className="text-xs text-gray-400 font-mono">{r.student_code}</p>
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-600 font-medium">{formatDate(r.leave_date)}</td>
                          <td className="px-6 py-4 text-sm tabular-nums font-bold text-gray-900">{formatINR(r.refund_paise)}</td>
                          <td className="px-6 py-4 text-sm text-gray-600">
                            <div className="flex items-center gap-2">
                              <span>{formatDate(r.due_by)}</span>
                              {r.overdue && (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-[#FEE2E2] text-[#DC2626]">
                                  Overdue
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-6 py-4"><StatusBadge status={r.status} /></td>
                          <td className="px-6 py-4">
                            {r.status === 'draft' && (
                              <button
                                onClick={() => setConfirmAction({ refundId: r.refund_id, action: 'approved', name: r.student_name })}
                                className="inline-flex items-center gap-1 px-3 py-1 bg-[#E8F8F0] text-[#059669] hover:bg-[#DCFCE7] font-semibold text-xs rounded-lg transition-colors cursor-pointer"
                              >
                                Approve
                              </button>
                            )}
                            {r.status === 'approved' && (
                              <button
                                onClick={() => setConfirmAction({ refundId: r.refund_id, action: 'paid', name: r.student_name })}
                                className="inline-flex items-center gap-1 px-3 py-1 bg-[#E8F8F0] text-[#059669] hover:bg-[#DCFCE7] font-semibold text-xs rounded-lg transition-colors cursor-pointer"
                              >
                                Mark paid
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Mobile */}
                <div className="sm:hidden divide-y divide-gray-100/90">
                  {refundsData?.items.map(r => (
                    <div key={r.refund_id} className="p-4 space-y-2">
                      <div className="flex justify-between items-center">
                        <p className="text-sm font-bold text-gray-900">{r.student_name}</p>
                        <StatusBadge status={r.status} />
                      </div>
                      <p className="text-xs text-gray-400">Leave: {formatDate(r.leave_date)}</p>
                      <p className="text-sm font-bold tabular-nums text-gray-900">{formatINR(r.refund_paise)}</p>
                      <div className="pt-1">
                        {r.status === 'draft' && (
                          <button
                            onClick={() => setConfirmAction({ refundId: r.refund_id, action: 'approved', name: r.student_name })}
                            className="inline-flex items-center gap-1 px-3 py-1 bg-[#E8F8F0] text-[#059669] font-semibold text-xs rounded-lg cursor-pointer"
                          >
                            Approve
                          </button>
                        )}
                        {r.status === 'approved' && (
                          <button
                            onClick={() => setConfirmAction({ refundId: r.refund_id, action: 'paid', name: r.student_name })}
                            className="inline-flex items-center gap-1 px-3 py-1 bg-[#E8F8F0] text-[#059669] font-semibold text-xs rounded-lg cursor-pointer"
                          >
                            Mark paid
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
      </div>

      {/* Confirm dialog */}
      <ConfirmDialog
        open={!!confirmAction}
        onOpenChange={v => !v && setConfirmAction(null)}
        title={confirmAction?.action === 'approved' ? 'Approve refund?' : 'Mark refund as paid?'}
        description={
          confirmAction?.action === 'approved'
            ? `This marks ${confirmAction.name} as left and cancels their pending reminders.`
            : `Confirm that the refund for ${confirmAction?.name} has been paid out.`
        }
        confirmLabel={confirmAction?.action === 'approved' ? 'Approve' : 'Mark paid'}
        loading={statusMutation.isPending}
        onConfirm={() => confirmAction && statusMutation.mutate({ refundId: confirmAction.refundId, status: confirmAction.action })}
      />
    </div>
  )
}


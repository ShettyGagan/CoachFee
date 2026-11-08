import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  CheckCircle, ChevronRight, Loader2, AlertCircle,
  Calendar, Layers, FileText, ArrowRight,
  CreditCard, CalendarCheck, GraduationCap, Award, Check, X
} from 'lucide-react'
import { api, ApiError } from '../../lib/api'
import { formatINR, formatDate } from '../../lib/formatINR'
import { toast } from 'sonner'
import { clsx } from 'clsx'

interface Child {
  student_id: number
  student_name: string
  student_code: string
  total_balance_paise: number
  next_due: NextDue | null
}

interface NextDue {
  instalment_id: number
  seq: number
  due_date: string
  amount_paise: number
  paid_paise: number
  balance_paise: number
  days_overdue: number
  status: string
}

interface DuesData {
  student_id: number
  student_name: string
  instalments: Instalment[]
  next_due: NextDue | null
}

interface Instalment {
  instalment_id: number
  seq: number
  due_date: string
  amount_paise: number
  paid_paise: number
  balance_paise: number
  days_overdue: number
  status: string
}

interface Receipt {
  receipt_id: number
  receipt_no: string
  created_at: string
  total_paise: number
}

interface ReceiptDetail {
  receipt_id: number
  receipt_no: string
  created_at: string
  student_name: string
  student_code: string
  payment_method: string
  reference: string | null
  taxable_paise: number
  cgst_paise: number
  sgst_paise: number
  total_paise: number
}

interface AttendanceRecord {
  id: number
  date: string
  present: boolean
}

interface TestScoreRecord {
  id: number
  test_name: string
  test_date: string
  score: number
  max_score: number
  percentage: number
}

interface AcademicsData {
  student_id: number
  student_name: string
  student_code: string
  attendance: {
    total_days: number
    present_days: number
    absent_days: number
    percentage: number
    records: AttendanceRecord[]
  }
  tests: {
    total_tests: number
    average_percentage: number
    records: TestScoreRecord[]
  }
}

function formatDayOfWeek(dateStr: string): string {
  try {
    const d = new Date(dateStr)
    return d.toLocaleDateString('en-IN', { weekday: 'short' })
  } catch {
    return '—'
  }
}

function ReceiptSheet({ receiptId, onClose }: { receiptId: number; onClose: () => void }) {
  const { data, isLoading } = useQuery<ReceiptDetail>({
    queryKey: ['parent-receipt', receiptId],
    queryFn: () => api.get(`/parent/receipts/${receiptId}`),
  })

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-sm bg-white h-full overflow-y-auto shadow-xl p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="font-semibold text-gray-900">Receipt</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-gray-700 text-sm">Close</button>
        </div>
        {isLoading ? (
          <div className="flex justify-center py-8"><Loader2 size={24} className="animate-spin text-primary" /></div>
        ) : data ? (
          <div className="space-y-4 print:block">
            <div className="text-center border-b border-gray-100 pb-4">
              <img src="/logo.png" alt="CoachFee" className="h-6 mx-auto mb-2 object-contain" />
              <p className="font-bold text-gray-900">Jaipur Coaching Institute</p>
              <p className="text-xs text-gray-400 font-medium">Tax Invoice</p>
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Receipt No.</span>
                <span className="font-medium font-mono">{data.receipt_no}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Date</span>
                <span>{formatDate(data.created_at)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Student</span>
                <span>{data.student_name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Student Code</span>
                <span className="font-mono">{data.student_code}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Payment method</span>
                <span className="capitalize">{data.payment_method.replace('_', ' ')}</span>
              </div>
              {data.reference && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Reference</span>
                  <span className="font-mono text-xs">{data.reference}</span>
                </div>
              )}
            </div>
            <div className="border-t border-border pt-3 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Taxable value</span>
                <span className="font-mono">{(data.taxable_paise / 100).toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">CGST 9%</span>
                <span className="font-mono">{(data.cgst_paise / 100).toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">SGST 9%</span>
                <span className="font-mono">{(data.sgst_paise / 100).toFixed(2)}</span>
              </div>
              <div className="flex justify-between font-semibold text-base border-t border-border pt-2">
                <span>Total</span>
                <span>{formatINR(data.total_paise)}</span>
              </div>
            </div>
            <button
              onClick={() => window.print()}
              className="btn-primary w-full mt-4"
            >
              Print Receipt
            </button>
          </div>
        ) : null}
      </div>
    </div>
  )
}

export default function ParentHome() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const qc = useQueryClient()
  const [selectedChildId, setSelectedChildId] = useState<number | null>(null)
  const [activeTab, setActiveTab] = useState<'fees' | 'attendance' | 'tests'>('fees')
  const [openReceiptId, setOpenReceiptId] = useState<number | null>(null)

  // Show success toast on ?paid=1
  useEffect(() => {
    if (searchParams.get('paid') === '1') {
      toast.success('Payment successful! Your receipt is ready.')
      qc.invalidateQueries({ queryKey: ['parent-dues'] })
      qc.invalidateQueries({ queryKey: ['parent-receipts'] })
    }
  }, [searchParams, qc])

  const { data: children, isLoading: childrenLoading } = useQuery<Child[]>({
    queryKey: ['parent-children'],
    queryFn: () => api.get<{ children: Child[] }>('/parent/children').then(r => r.children),
  })

  const activeChild = selectedChildId
    ? children?.find(c => c.student_id === selectedChildId)
    : children?.[0]

  const { data: dues, isLoading: duesLoading } = useQuery<DuesData>({
    queryKey: ['parent-dues', activeChild?.student_id],
    queryFn: () => api.get(`/parent/children/${activeChild!.student_id}/dues`),
    enabled: !!activeChild,
    staleTime: 0,
  })

  const { data: receiptsData } = useQuery<{ receipts: Receipt[] }>({
    queryKey: ['parent-receipts', activeChild?.student_id],
    queryFn: () => api.get(`/parent/children/${activeChild!.student_id}/receipts`),
    enabled: !!activeChild,
  })

  const { data: academics, isLoading: academicsLoading } = useQuery<AcademicsData>({
    queryKey: ['parent-academics', activeChild?.student_id],
    queryFn: () => api.get(`/parent/children/${activeChild!.student_id}/academics`),
    enabled: !!activeChild,
  })

  const payLinkMutation = useMutation({
    mutationFn: (instalmentId: number) =>
      api.post<{ token: string; pay_url: string }>(`/parent/instalments/${instalmentId}/pay-link`),
    onSuccess: (data) => {
      if (data.pay_url.startsWith('http')) {
        window.location.href = data.pay_url
      } else {
        navigate(data.pay_url)
      }
    },
    onError: (err: ApiError) => toast.error(err.message),
  })

  if (childrenLoading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 size={32} className="animate-spin text-primary" />
      </div>
    )
  }

  if (!children?.length) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <AlertCircle size={48} className="text-muted-foreground mb-3" />
        <p className="text-gray-700 font-medium">No students found</p>
        <p className="text-sm text-muted-foreground">Your account has no linked students. Contact your centre.</p>
      </div>
    )
  }

  const nextDue = dues?.next_due
  const instalments = dues?.instalments ?? []
  const receipts = receiptsData?.receipts ?? []
  const totalBalance = instalments.reduce((sum, i) => sum + i.balance_paise, 0)

  // Academic metrics
  const attendancePercentage = academics?.attendance?.percentage ?? 100
  const attendanceRecords = academics?.attendance?.records ?? []
  const testRecords = academics?.tests?.records ?? []
  const highestScorePct = testRecords.length > 0
    ? Math.max(...testRecords.map(t => t.percentage))
    : 0

  return (
    <div className="max-w-[480px] sm:max-w-[500px] mx-auto py-8 px-4 space-y-4">
      {/* Child selector (only if >1 child) */}
      {children.length > 1 && (
        <div className="flex gap-2 flex-wrap justify-center mb-1">
          {children.map(c => (
            <button
              key={c.student_id}
              onClick={() => setSelectedChildId(c.student_id)}
              className={clsx(
                "px-4 py-1.5 rounded-full text-xs font-semibold transition-all shadow-2xs cursor-pointer",
                activeChild?.student_id === c.student_id
                  ? 'bg-[#059669] text-white shadow-2xs'
                  : 'bg-white border border-gray-200/90 text-gray-600 hover:text-gray-900 hover:bg-gray-50'
              )}
            >
              {c.student_name}
            </button>
          ))}
        </div>
      )}

      {/* Main Feature Tabs: Fees & Dues | Attendance | Test Scores */}
      <div className="flex items-center justify-center p-1 bg-gray-100 rounded-full text-xs font-semibold select-none">
        <button
          type="button"
          onClick={() => setActiveTab('fees')}
          className={clsx(
            "flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-full transition-all cursor-pointer",
            activeTab === 'fees'
              ? "bg-[#059669] text-white shadow-2xs"
              : "text-gray-600 hover:text-gray-900"
          )}
        >
          <CreditCard size={13} />
          <span>Fees & Dues</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('attendance')}
          className={clsx(
            "flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-full transition-all cursor-pointer",
            activeTab === 'attendance'
              ? "bg-[#059669] text-white shadow-2xs"
              : "text-gray-600 hover:text-gray-900"
          )}
        >
          <CalendarCheck size={13} />
          <span>Attendance</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('tests')}
          className={clsx(
            "flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-full transition-all cursor-pointer",
            activeTab === 'tests'
              ? "bg-[#059669] text-white shadow-2xs"
              : "text-gray-600 hover:text-gray-900"
          )}
        >
          <GraduationCap size={13} />
          <span>Test Scores</span>
        </button>
      </div>

      {/* ─────────── TAB 1: FEES & DUES ─────────── */}
      {activeTab === 'fees' && (
        <>
          {duesLoading ? (
            <div className="space-y-4">
              <div className="bg-white rounded-2xl border border-gray-100 p-6 h-56 animate-pulse" />
              <div className="bg-white rounded-2xl border border-gray-100 p-6 h-48 animate-pulse" />
            </div>
          ) : (
            <>
              {/* Card 1: Dues card */}
              <div className="relative bg-white rounded-2xl border border-gray-100/90 shadow-xs p-6 overflow-hidden">
                <div className="absolute top-0 right-0 w-40 h-40 bg-gradient-to-bl from-emerald-100/60 via-emerald-50/20 to-transparent rounded-bl-full pointer-events-none" />

                {!nextDue ? (
                  <div className="flex flex-col items-center py-6 text-center">
                    <div className="w-14 h-14 rounded-2xl bg-[#E8F8F0] flex items-center justify-center text-[#059669] mb-3">
                      <CheckCircle size={32} />
                    </div>
                    <p className="text-lg font-bold text-gray-900 tracking-tight">All fees are paid</p>
                    <p className="text-xs text-gray-400 mt-1 font-medium">Great job! No outstanding dues.</p>
                  </div>
                ) : (
                  <>
                    <div className="flex items-start justify-between relative z-10">
                      <div>
                        <p className="text-xs font-semibold text-gray-500">Amount Due</p>
                        <h2 className={clsx(
                          "text-3xl sm:text-4xl font-extrabold tracking-tight tabular-nums mt-1",
                          nextDue.days_overdue > 0 ? "text-[#DC2626]" : "text-gray-900"
                        )}>
                          {formatINR(nextDue.balance_paise)}
                        </h2>
                        <p className="text-xs font-medium text-gray-500 mt-1">
                          Due: {formatDate(nextDue.due_date)}
                        </p>

                        <div className="mt-2.5">
                          {nextDue.days_overdue > 0 ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold bg-[#FEE2E2] text-[#DC2626]">
                              <AlertCircle size={13} />
                              <span>Overdue ({nextDue.days_overdue}d)</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold bg-[#E8F8F0] text-[#059669]">
                              <Calendar size={13} />
                              <span>Upcoming</span>
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="relative w-16 h-16 rounded-2xl bg-white border border-emerald-100/90 shadow-2xs flex items-center justify-center text-[#059669] shrink-0">
                        <Calendar size={32} className="text-[#059669]" />
                        <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-[#059669] text-white flex items-center justify-center text-xs font-bold shadow-xs">
                          ₹
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => payLinkMutation.mutate(nextDue.instalment_id)}
                      disabled={payLinkMutation.isPending}
                      className="w-full mt-6 py-3.5 px-6 rounded-xl bg-[#059669] hover:bg-[#047857] text-white text-sm font-bold shadow-xs flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50"
                    >
                      {payLinkMutation.isPending && <Loader2 size={16} className="animate-spin" />}
                      <span>Pay {formatINR(nextDue.balance_paise)}</span>
                      <ArrowRight size={16} />
                    </button>

                    {totalBalance > 0 && (
                      <p className="text-xs font-medium text-gray-500 text-center mt-3">
                        Total Remaining: <span className="font-bold text-[#059669]">{formatINR(totalBalance)}</span>
                      </p>
                    )}
                  </>
                )}
              </div>

              {/* Card 2: Instalments */}
              {instalments.length > 0 && (
                <div className="bg-white rounded-2xl border border-gray-100/90 shadow-xs p-6">
                  <div className="flex items-center gap-2 text-sm font-bold text-gray-900 mb-4 tracking-tight">
                    <Layers size={17} className="text-[#059669]" />
                    <span>Instalments</span>
                  </div>

                  <div className="divide-y divide-gray-100/80">
                    {instalments.map(ins => {
                      const isPaid = ins.status === 'paid' || ins.balance_paise === 0
                      const isOverdue = ins.days_overdue > 0

                      return (
                        <div key={ins.instalment_id} className="py-3 flex items-center justify-between text-xs">
                          <div className="flex items-center gap-3">
                            <span className="font-bold text-gray-900">#{ins.seq}</span>
                            <span className="font-medium text-gray-500">{formatDate(ins.due_date)}</span>
                          </div>

                          <div className="flex items-center gap-3">
                            <span className={clsx(
                              "font-bold tabular-nums text-sm",
                              isOverdue ? "text-[#DC2626]" : "text-gray-900"
                            )}>
                              {formatINR(ins.amount_paise)}
                            </span>

                            {isPaid ? (
                              <span className="inline-flex items-center justify-center min-w-[72px] px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#E8F8F0] text-[#059669]">
                                Paid
                              </span>
                            ) : isOverdue ? (
                              <span className="inline-flex items-center justify-center min-w-[72px] px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#FEE2E2] text-[#DC2626]">
                                Overdue
                              </span>
                            ) : (
                              <span className="inline-flex items-center justify-center min-w-[72px] px-2.5 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-600">
                                Upcoming
                              </span>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Card 3: Receipts */}
              {receipts.length > 0 && (
                <div className="bg-white rounded-2xl border border-gray-100/90 shadow-xs p-6">
                  <div className="flex items-center gap-2 text-sm font-bold text-gray-900 mb-3 tracking-tight">
                    <FileText size={17} className="text-[#059669]" />
                    <span>Receipts</span>
                  </div>

                  <div className="divide-y divide-gray-100/80">
                    {receipts.map(r => (
                      <button
                        key={r.receipt_id}
                        type="button"
                        onClick={() => setOpenReceiptId(r.receipt_id)}
                        className="w-full py-3 flex items-center justify-between group hover:bg-gray-50/70 -mx-2 px-2 rounded-xl transition-colors cursor-pointer text-left"
                      >
                        <div>
                          <p className="font-bold text-xs text-gray-900 font-mono group-hover:text-[#059669] transition-colors">
                            {r.receipt_no}
                          </p>
                          <p className="text-[11px] font-medium text-gray-400 mt-0.5">
                            {formatDate(r.created_at)}
                          </p>
                        </div>

                        <div className="flex items-center gap-2">
                          <span className="font-bold text-xs text-gray-900 tabular-nums">
                            {formatINR(r.total_paise)}
                          </span>
                          <ChevronRight size={14} className="text-gray-400 group-hover:text-gray-600 group-hover:translate-x-0.5 transition-all" />
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </>
      )}

      {/* ─────────── TAB 2: ATTENDANCE ─────────── */}
      {activeTab === 'attendance' && (
        <>
          {academicsLoading ? (
            <div className="space-y-4">
              <div className="bg-white rounded-2xl border border-gray-100 p-6 h-52 animate-pulse" />
              <div className="bg-white rounded-2xl border border-gray-100 p-6 h-64 animate-pulse" />
            </div>
          ) : (
            <>
              {/* Card 1: Attendance Rate Summary Card */}
              <div className="relative bg-white rounded-2xl border border-gray-100/90 shadow-xs p-6 overflow-hidden">
                <div className="absolute top-0 right-0 w-40 h-40 bg-gradient-to-bl from-emerald-100/60 via-emerald-50/20 to-transparent rounded-bl-full pointer-events-none" />

                <div className="flex items-start justify-between relative z-10">
                  <div>
                    <p className="text-xs font-semibold text-gray-500">Attendance Rate</p>
                    <h2 className={clsx(
                      "text-3xl sm:text-4xl font-extrabold tracking-tight tabular-nums mt-1",
                      attendancePercentage >= 75 ? "text-gray-900" : "text-[#DC2626]"
                    )}>
                      {attendancePercentage}%
                    </h2>
                    <p className="text-xs font-medium text-gray-500 mt-1">
                      {academics?.attendance?.present_days ?? 0} of {academics?.attendance?.total_days ?? 0} sessions attended
                    </p>

                    <div className="mt-2.5">
                      {attendancePercentage >= 75 ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold bg-[#E8F8F0] text-[#059669]">
                          <CheckCircle size={13} />
                          <span>On Track (≥75%)</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold bg-[#FEE2E2] text-[#DC2626]">
                          <AlertCircle size={13} />
                          <span>Low Attendance (&lt;75%)</span>
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="relative w-16 h-16 rounded-2xl bg-white border border-emerald-100/90 shadow-2xs flex items-center justify-center text-[#059669] shrink-0">
                    <CalendarCheck size={32} className="text-[#059669]" />
                  </div>
                </div>

                {/* Presence bar & breakdown */}
                <div className="mt-5 pt-4 border-t border-gray-100/80">
                  <div className="flex justify-between text-xs font-semibold text-gray-600 mb-1.5">
                    <span>Overall Attendance</span>
                    <span className="font-bold text-[#059669] tabular-nums">{attendancePercentage}%</span>
                  </div>
                  <div className="w-full h-2.5 bg-gray-100 rounded-full overflow-hidden flex">
                    <div
                      className="h-full bg-[#059669] rounded-full transition-all duration-500"
                      style={{ width: `${Math.min(100, Math.max(0, attendancePercentage))}%` }}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3 mt-4 text-xs">
                    <div className="p-3 rounded-xl bg-gray-50/80 border border-gray-100/90">
                      <span className="text-gray-400 font-medium">Attended</span>
                      <p className="text-base font-bold text-[#059669] mt-0.5 tabular-nums">
                        {academics?.attendance?.present_days ?? 0} <span className="text-xs font-normal text-gray-500">days</span>
                      </p>
                    </div>
                    <div className="p-3 rounded-xl bg-gray-50/80 border border-gray-100/90">
                      <span className="text-gray-400 font-medium">Missed</span>
                      <p className="text-base font-bold text-[#DC2626] mt-0.5 tabular-nums">
                        {academics?.attendance?.absent_days ?? 0} <span className="text-xs font-normal text-gray-500">days</span>
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Card 2: Attendance History Table */}
              <div className="bg-white rounded-2xl border border-gray-100/90 shadow-xs p-6">
                <div className="flex items-center justify-between mb-4 tracking-tight">
                  <div className="flex items-center gap-2 text-sm font-bold text-gray-900">
                    <Calendar size={17} className="text-[#059669]" />
                    <span>Attendance Records</span>
                  </div>
                  <span className="text-xs font-semibold text-gray-400">
                    {attendanceRecords.length} entries
                  </span>
                </div>

                {attendanceRecords.length === 0 ? (
                  <div className="text-center py-10 px-4">
                    <div className="w-12 h-12 rounded-2xl bg-[#E8F8F0] flex items-center justify-center text-[#059669] mx-auto mb-2">
                      <CalendarCheck size={22} />
                    </div>
                    <p className="text-xs font-semibold text-gray-800">No attendance records yet</p>
                    <p className="text-[11px] text-gray-400 mt-0.5">Records will appear here once uploaded by the coaching staff.</p>
                  </div>
                ) : (
                  <div className="rounded-xl border border-gray-100/90 overflow-hidden">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-[#E8F8F0] border-b border-gray-100">
                          <th className="px-4 py-3 text-left font-bold text-[#059669] uppercase tracking-wider">Date</th>
                          <th className="px-4 py-3 text-left font-bold text-[#059669] uppercase tracking-wider">Day</th>
                          <th className="px-4 py-3 text-right font-bold text-[#059669] uppercase tracking-wider">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100/80">
                        {attendanceRecords.map(r => (
                          <tr key={r.id} className="hover:bg-[#F9FCFA] transition-colors">
                            <td className="px-4 py-3 font-semibold text-gray-900">{formatDate(r.date)}</td>
                            <td className="px-4 py-3 text-gray-500 font-medium">{formatDayOfWeek(r.date)}</td>
                            <td className="px-4 py-3 text-right">
                              {r.present ? (
                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#E8F8F0] text-[#059669]">
                                  <Check size={11} /> Present
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#FEE2E2] text-[#DC2626]">
                                  <X size={11} /> Absent
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}
        </>
      )}

      {/* ─────────── TAB 3: TEST SCORES ─────────── */}
      {activeTab === 'tests' && (
        <>
          {academicsLoading ? (
            <div className="space-y-4">
              <div className="bg-white rounded-2xl border border-gray-100 p-6 h-52 animate-pulse" />
              <div className="bg-white rounded-2xl border border-gray-100 p-6 h-64 animate-pulse" />
            </div>
          ) : (
            <>
              {/* Card 1: Performance Overview Card */}
              <div className="relative bg-white rounded-2xl border border-gray-100/90 shadow-xs p-6 overflow-hidden">
                <div className="absolute top-0 right-0 w-40 h-40 bg-gradient-to-bl from-emerald-100/60 via-emerald-50/20 to-transparent rounded-bl-full pointer-events-none" />

                <div className="flex items-start justify-between relative z-10">
                  <div>
                    <p className="text-xs font-semibold text-gray-500">Average Test Score</p>
                    <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight tabular-nums mt-1 text-gray-900">
                      {academics?.tests?.average_percentage ?? 0}%
                    </h2>
                    <p className="text-xs font-medium text-gray-500 mt-1">
                      Evaluated across {academics?.tests?.total_tests ?? 0} tests
                    </p>

                    <div className="mt-2.5">
                      {(academics?.tests?.average_percentage ?? 0) >= 75 ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold bg-[#E8F8F0] text-[#059669]">
                          <Award size={13} />
                          <span>Strong Performance</span>
                        </span>
                      ) : (academics?.tests?.average_percentage ?? 0) >= 50 ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold bg-amber-50 text-amber-700">
                          <Award size={13} />
                          <span>Average Performance</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold bg-[#FEE2E2] text-[#DC2626]">
                          <AlertCircle size={13} />
                          <span>Needs Improvement</span>
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="relative w-16 h-16 rounded-2xl bg-white border border-emerald-100/90 shadow-2xs flex items-center justify-center text-[#059669] shrink-0">
                    <GraduationCap size={32} className="text-[#059669]" />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 mt-6 pt-4 border-t border-gray-100/80 text-xs">
                  <div className="p-3 rounded-xl bg-gray-50/80 border border-gray-100/90">
                    <span className="text-gray-400 font-medium">Tests Completed</span>
                    <p className="text-base font-bold text-gray-900 mt-0.5 tabular-nums">
                      {academics?.tests?.total_tests ?? 0}
                    </p>
                  </div>
                  <div className="p-3 rounded-xl bg-gray-50/80 border border-gray-100/90">
                    <span className="text-gray-400 font-medium">Highest Score</span>
                    <p className="text-base font-bold text-[#059669] mt-0.5 tabular-nums">
                      {highestScorePct}%
                    </p>
                  </div>
                </div>
              </div>

              {/* Card 2: Test Scores Table */}
              <div className="bg-white rounded-2xl border border-gray-100/90 shadow-xs p-6">
                <div className="flex items-center justify-between mb-4 tracking-tight">
                  <div className="flex items-center gap-2 text-sm font-bold text-gray-900">
                    <Award size={17} className="text-[#059669]" />
                    <span>Test Results & Scores</span>
                  </div>
                  <span className="text-xs font-semibold text-gray-400">
                    {testRecords.length} tests
                  </span>
                </div>

                {testRecords.length === 0 ? (
                  <div className="text-center py-10 px-4">
                    <div className="w-12 h-12 rounded-2xl bg-[#E8F8F0] flex items-center justify-center text-[#059669] mx-auto mb-2">
                      <GraduationCap size={22} />
                    </div>
                    <p className="text-xs font-semibold text-gray-800">No test scores published yet</p>
                    <p className="text-[11px] text-gray-400 mt-0.5">Test marks will appear here once released by the faculty.</p>
                  </div>
                ) : (
                  <div className="rounded-xl border border-gray-100/90 overflow-hidden">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-[#E8F8F0] border-b border-gray-100">
                          <th className="px-4 py-3 text-left font-bold text-[#059669] uppercase tracking-wider">Test Name</th>
                          <th className="px-4 py-3 text-left font-bold text-[#059669] uppercase tracking-wider">Date</th>
                          <th className="px-4 py-3 text-right font-bold text-[#059669] uppercase tracking-wider">Score</th>
                          <th className="px-4 py-3 text-right font-bold text-[#059669] uppercase tracking-wider">Result</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100/80">
                        {testRecords.map(t => (
                          <tr key={t.id} className="hover:bg-[#F9FCFA] transition-colors">
                            <td className="px-4 py-3 font-semibold text-gray-900">{t.test_name}</td>
                            <td className="px-4 py-3 text-gray-500 font-medium">{formatDate(t.test_date)}</td>
                            <td className="px-4 py-3 text-right tabular-nums font-bold text-gray-900">
                              {t.score} <span className="text-gray-400 font-normal">/ {t.max_score}</span>
                            </td>
                            <td className="px-4 py-3 text-right">
                              <span className={clsx(
                                "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold tabular-nums",
                                t.percentage >= 75 ? "bg-[#E8F8F0] text-[#059669]" :
                                t.percentage >= 50 ? "bg-amber-50 text-amber-700" :
                                "bg-[#FEE2E2] text-[#DC2626]"
                              )}>
                                {t.percentage}%
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}
        </>
      )}

      {openReceiptId && (
        <ReceiptSheet receiptId={openReceiptId} onClose={() => setOpenReceiptId(null)} />
      )}
    </div>
  )
}

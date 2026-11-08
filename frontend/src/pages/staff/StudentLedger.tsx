import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, AlertTriangle, Plus, Undo2, Calendar, GraduationCap, Check, X } from 'lucide-react'
import { api } from '../../lib/api'
import { formatINR, formatDate } from '../../lib/formatINR'
import { StatusBadge } from '../../components/StatusBadge'
import { MoneyText } from '../../components/MoneyText'
import { ErrorState, CardSkeleton } from '../../components/EmptyState'
import { ReceiptSheet } from '../../components/ReceiptSheet'
import { RecordPaymentDialog } from '../../components/RecordPaymentDialog'
import { useMe } from '../../lib/auth'
import { clsx } from 'clsx'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'

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

interface Payment {
  payment_id: number
  created_at: string
  method: string
  reference: string | null
  amount_paise: number
  receipt_id: number | null
  receipt_no: string | null
}

interface LedgerData {
  student_id: number
  name: string
  student_code: string
  status: string
  batch_name: string
  batch_id: number
  centre_name: string
  guardian_name: string
  guardian_phone: string
  total_fee_paise: number
  registration_fee_paise: number
  discount_paise: number
  total_paid_paise: number
  total_balance_paise: number
  open_risk_flag: { flag_id: number; level: string; score: number; reasons: string[] } | null
  instalments: Instalment[]
  payments: Payment[]
}

export default function StudentLedger() {
  const { id } = useParams<{ id: string }>()
  const { data: me } = useMe()
  const [tab, setTab] = useState<'overview' | 'payments' | 'academics'>('overview')
  const [openReceiptId, setOpenReceiptId] = useState<number | null>(null)
  const [recordOpen, setRecordOpen] = useState(false)

  const { data, isLoading, error, refetch } = useQuery<LedgerData>({
    queryKey: ['ledger', Number(id)],
    queryFn: () => api.get(`/students/${id}/ledger`),
    retry: (count, err: any) => err?.status !== 404 && count < 2,
  })

  const { data: academics } = useQuery<{
    attendance: {
      total_days: number
      present_days: number
      absent_days: number
      percentage: number
      records: { id: number; date: string; present: boolean }[]
    }
    tests: {
      total_tests: number
      average_percentage: number
      records: { id: number; test_name: string; test_date: string; score: number; max_score: number; percentage: number }[]
    }
  }>({
    queryKey: ['student-academics', Number(id)],
    queryFn: () => api.get(`/academics/student/${id}`),
    enabled: !!id,
  })

  const canRecord = me?.role === 'admin' || me?.role === 'accounts'

  if (isLoading) return <div className="p-6"><CardSkeleton /><CardSkeleton /></div>
  if (error) {
    const e = error as any
    if (e?.status === 404) return (
      <div className="flex flex-col items-center justify-center py-16">
        <p className="text-gray-700 font-medium mb-2">Student not found</p>
        <Link to="/staff/students" className="text-primary text-sm hover:underline">Back to students</Link>
      </div>
    )
    return <ErrorState message="Could not load student" onRetry={refetch} />
  }
  if (!data) return null

  const isOverdue = data.instalments.some(i => i.days_overdue > 0)
  const chartData = data.instalments.map(i => ({
    name: `#${i.seq}`,
    paid: i.paid_paise / 100,
    balance: i.balance_paise / 100,
  }))

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <Link to="/staff/students" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-gray-700">
          <ArrowLeft size={15} /> Students
        </Link>
      </div>

      {/* Risk banner */}
      {data.open_risk_flag && (
        <div className="mb-4 p-4 bg-amber-50 border border-amber-200 rounded-lg flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <AlertTriangle size={16} className="text-amber-600" />
              <p className="font-semibold text-amber-900 text-sm">
                Dropout risk: {data.open_risk_flag.level.toUpperCase()} (score {data.open_risk_flag.score})
              </p>
            </div>
            <ul className="text-sm text-amber-800 space-y-0.5">
              {data.open_risk_flag.reasons.map((r, i) => <li key={i}>• {r}</li>)}
            </ul>
          </div>
          <Link to="/staff/risk" className="text-xs text-amber-700 hover:underline shrink-0">View flags</Link>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: profile card */}
        <div className="card flex flex-col gap-4">
          {/* Avatar */}
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-brand-soft rounded-full flex items-center justify-center text-primary font-semibold text-lg">
              {data.name.charAt(0)}
            </div>
            <div>
              <p className="font-semibold text-gray-900">{data.name}</p>
              <StatusBadge status={data.status} />
            </div>
          </div>

          <div className="space-y-2.5 text-sm">
            <Row label="Code" value={<span className="font-mono">{data.student_code}</span>} />
            <Row label="Batch" value={data.batch_name} />
            <Row label="Centre" value={data.centre_name} />
            <Row label="Guardian" value={data.guardian_name} />
            <Row label="Phone" value={<span className="font-mono">{data.guardian_phone}</span>} />
          </div>

          <div className="border-t border-border pt-3 space-y-2 text-sm">
            <Row label="Total fee" value={formatINR(data.total_fee_paise)} />
            {data.discount_paise > 0 && <Row label="Discount" value={<span className="text-success">-{formatINR(data.discount_paise)}</span>} />}
            <Row label="Paid" value={<span className="text-success">{formatINR(data.total_paid_paise)}</span>} />
            <Row label="Balance" value={<MoneyText paise={data.total_balance_paise} danger={isOverdue} />} />
          </div>

          {canRecord && (
            <div className="border-t border-border pt-3 flex flex-col gap-2">
              <button onClick={() => setRecordOpen(true)} className="btn-primary flex items-center gap-1.5 justify-center">
                <Plus size={15} /> Record payment
              </button>
              {data.status === 'active' && (
                <Link to={`/staff/refunds?student_id=${data.student_id}`} className="btn-secondary flex items-center gap-1.5 justify-center text-sm">
                  <Undo2 size={15} /> Calculate refund
                </Link>
              )}
            </div>
          )}
        </div>

        {/* Right: tabs */}
        <div className="lg:col-span-2">
          <div className="flex border-b border-border mb-4">
            {(['overview', 'payments', 'academics'] as const).map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={clsx(
                  'px-5 py-2.5 text-sm transition-colors -mb-px cursor-pointer',
                  tab === t ? 'border-b-2 border-[#059669] text-[#059669] font-bold' : 'text-gray-400 hover:text-gray-700 font-medium'
                )}
              >
                {t === 'overview' ? 'Overview' : t === 'payments' ? 'Payments' : 'Academics'}
              </button>
            ))}
          </div>

          {tab === 'overview' && (
            <div className="space-y-4">
              {/* Insight cards */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-white rounded-2xl border border-gray-100/90 shadow-xs p-5">
                  <p className="text-xs font-semibold text-gray-400 mb-1">Amount paid</p>
                  <p className="text-2xl font-bold tabular-nums text-[#059669]">{formatINR(data.total_paid_paise)}</p>
                </div>
                <div className="bg-white rounded-2xl border border-gray-100/90 shadow-xs p-5">
                  <p className="text-xs font-semibold text-gray-400 mb-1">Total balance</p>
                  <p className={clsx(
                    "text-2xl font-bold tabular-nums",
                    isOverdue ? "text-[#DC2626]" : "text-gray-900"
                  )}>
                    {formatINR(data.total_balance_paise)}
                  </p>
                </div>
              </div>

              {/* Chart */}
              {chartData.length > 0 && (
                <div className="bg-white rounded-2xl border border-gray-100/90 shadow-xs p-5">
                  <p className="text-xs font-bold text-gray-900 mb-3 uppercase tracking-wider">Fee Schedule</p>
                  <ResponsiveContainer width="100%" height={160}>
                    <BarChart data={chartData} barSize={24}>
                      <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                      <YAxis tickFormatter={v => `₹${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11 }} />
                      <Tooltip formatter={(v: number) => `₹${(v).toLocaleString('en-IN')}`} />
                      <Bar dataKey="paid" stackId="a" fill="#059669" name="Paid" />
                      <Bar dataKey="balance" stackId="a" fill="#E8F8F0" name="Balance" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}

              {/* Instalment table */}
              <div className="bg-white rounded-2xl border border-gray-100/90 shadow-xs overflow-hidden overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-[#E8F8F0] border-b border-gray-100">
                      <th className="px-6 py-3.5 text-left text-xs font-bold text-[#059669] uppercase tracking-wider">#</th>
                      <th className="px-6 py-3.5 text-left text-xs font-bold text-[#059669] uppercase tracking-wider">Due date</th>
                      <th className="px-6 py-3.5 text-right text-xs font-bold text-[#059669] uppercase tracking-wider">Amount</th>
                      <th className="px-6 py-3.5 text-right text-xs font-bold text-[#059669] uppercase tracking-wider">Paid</th>
                      <th className="px-6 py-3.5 text-right text-xs font-bold text-[#059669] uppercase tracking-wider">Balance</th>
                      <th className="px-6 py-3.5 text-center text-xs font-bold text-[#059669] uppercase tracking-wider">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100/90">
                    {data.instalments.map(ins => (
                      <tr key={ins.instalment_id} className="h-14 hover:bg-[#F9FCFA] transition-colors">
                        <td className="px-6 py-4 text-gray-500 font-semibold">{ins.seq}</td>
                        <td className="px-6 py-4 text-gray-700 font-medium">{formatDate(ins.due_date)}</td>
                        <td className="px-6 py-4 text-right tabular-nums font-bold text-gray-900">{formatINR(ins.amount_paise)}</td>
                        <td className="px-6 py-4 text-right tabular-nums text-[#059669] font-bold">{formatINR(ins.paid_paise)}</td>
                        <td className="px-6 py-4 text-right tabular-nums font-bold">
                          <MoneyText paise={ins.balance_paise} danger={ins.days_overdue > 0} />
                        </td>
                        <td className="px-6 py-4 text-center">
                          <StatusBadge status={ins.status} daysOverdue={ins.days_overdue} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {tab === 'payments' && (
            <div className="bg-white rounded-2xl border border-gray-100/90 shadow-xs overflow-hidden overflow-x-auto">
              {data.payments.length === 0 ? (
                <p className="text-sm text-gray-400 py-12 text-center font-medium">No payments recorded.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-[#E8F8F0] border-b border-gray-100">
                      <th className="px-6 py-3.5 text-left text-xs font-bold text-[#059669] uppercase tracking-wider">Date</th>
                      <th className="px-6 py-3.5 text-left text-xs font-bold text-[#059669] uppercase tracking-wider">Method</th>
                      <th className="px-6 py-3.5 text-left text-xs font-bold text-[#059669] uppercase tracking-wider">Reference</th>
                      <th className="px-6 py-3.5 text-right text-xs font-bold text-[#059669] uppercase tracking-wider">Amount</th>
                      <th className="px-6 py-3.5 text-center text-xs font-bold text-[#059669] uppercase tracking-wider">Receipt</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100/90">
                    {data.payments.map(p => (
                      <tr key={p.payment_id} className="h-14 hover:bg-[#F9FCFA] transition-colors">
                        <td className="px-6 py-4 text-gray-700 font-medium">{formatDate(p.created_at)}</td>
                        <td className="px-6 py-4">
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-700 capitalize">
                            {p.method.replace('_', ' ')}
                          </span>
                        </td>
                        <td className="px-6 py-4 font-mono text-xs text-gray-400">{p.reference || '—'}</td>
                        <td className="px-6 py-4 text-right tabular-nums font-bold text-gray-900">{formatINR(p.amount_paise)}</td>
                        <td className="px-6 py-4 text-center">
                          {p.receipt_id ? (
                            <button onClick={() => setOpenReceiptId(p.receipt_id!)} className="inline-flex items-center gap-1 px-3 py-1 bg-[#E8F8F0] text-[#059669] hover:bg-[#DCFCE7] font-semibold text-xs rounded-lg transition-colors cursor-pointer">
                              {p.receipt_no}
                            </button>
                          ) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {tab === 'academics' && (
            <div className="space-y-6">
              {/* Summary stat cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="bg-white rounded-2xl border border-gray-100/90 shadow-xs p-4">
                  <span className="text-xs font-semibold text-gray-400">Attendance Rate</span>
                  <p className="text-2xl font-bold text-[#059669] tabular-nums mt-1">
                    {academics?.attendance?.percentage ?? 100}%
                  </p>
                </div>
                <div className="bg-white rounded-2xl border border-gray-100/90 shadow-xs p-4">
                  <span className="text-xs font-semibold text-gray-400">Classes Attended</span>
                  <p className="text-2xl font-bold text-gray-900 tabular-nums mt-1">
                    {academics?.attendance?.present_days ?? 0}
                    <span className="text-xs font-normal text-gray-400 ml-1">
                      / {academics?.attendance?.total_days ?? 0}
                    </span>
                  </p>
                </div>
                <div className="bg-white rounded-2xl border border-gray-100/90 shadow-xs p-4">
                  <span className="text-xs font-semibold text-gray-400">Average Score</span>
                  <p className="text-2xl font-bold text-[#059669] tabular-nums mt-1">
                    {academics?.tests?.average_percentage ?? 0}%
                  </p>
                </div>
                <div className="bg-white rounded-2xl border border-gray-100/90 shadow-xs p-4">
                  <span className="text-xs font-semibold text-gray-400">Tests Evaluated</span>
                  <p className="text-2xl font-bold text-gray-900 tabular-nums mt-1">
                    {academics?.tests?.total_tests ?? 0}
                  </p>
                </div>
              </div>

              {/* Attendance Table */}
              <div className="bg-white rounded-2xl border border-gray-100/90 shadow-xs overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                  <h3 className="font-bold text-sm text-gray-900 flex items-center gap-2">
                    <Calendar size={16} className="text-[#059669]" />
                    <span>Attendance Log</span>
                  </h3>
                  <span className="text-xs font-semibold text-gray-400">
                    {academics?.attendance?.records?.length ?? 0} logs
                  </span>
                </div>
                {!academics?.attendance?.records?.length ? (
                  <p className="text-xs text-gray-400 py-8 text-center font-medium">No attendance records logged for this student.</p>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-[#E8F8F0] border-b border-gray-100">
                        <th className="px-6 py-3.5 text-left text-xs font-bold text-[#059669] uppercase tracking-wider">Date</th>
                        <th className="px-6 py-3.5 text-center text-xs font-bold text-[#059669] uppercase tracking-wider">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100/90">
                      {academics.attendance.records.map(r => (
                        <tr key={r.id} className="h-12 hover:bg-[#F9FCFA] transition-colors">
                          <td className="px-6 py-3 text-gray-700 font-medium">{formatDate(r.date)}</td>
                          <td className="px-6 py-3 text-center">
                            {r.present ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#E8F8F0] text-[#059669]">
                                <Check size={12} /> Present
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#FEE2E2] text-[#DC2626]">
                                <X size={12} /> Absent
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              {/* Test Scores Table */}
              <div className="bg-white rounded-2xl border border-gray-100/90 shadow-xs overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                  <h3 className="font-bold text-sm text-gray-900 flex items-center gap-2">
                    <GraduationCap size={16} className="text-[#059669]" />
                    <span>Test Scores & Evaluations</span>
                  </h3>
                  <span className="text-xs font-semibold text-gray-400">
                    {academics?.tests?.records?.length ?? 0} tests
                  </span>
                </div>
                {!academics?.tests?.records?.length ? (
                  <p className="text-xs text-gray-400 py-8 text-center font-medium">No test scores recorded for this student.</p>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-[#E8F8F0] border-b border-gray-100">
                        <th className="px-6 py-3.5 text-left text-xs font-bold text-[#059669] uppercase tracking-wider">Test Name</th>
                        <th className="px-6 py-3.5 text-left text-xs font-bold text-[#059669] uppercase tracking-wider">Date</th>
                        <th className="px-6 py-3.5 text-right text-xs font-bold text-[#059669] uppercase tracking-wider">Score</th>
                        <th className="px-6 py-3.5 text-center text-xs font-bold text-[#059669] uppercase tracking-wider">Percentage</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100/90">
                      {academics.tests.records.map(t => (
                        <tr key={t.id} className="h-12 hover:bg-[#F9FCFA] transition-colors">
                          <td className="px-6 py-3 text-gray-900 font-semibold">{t.test_name}</td>
                          <td className="px-6 py-3 text-gray-600 font-medium">{formatDate(t.test_date)}</td>
                          <td className="px-6 py-3 text-right tabular-nums font-bold text-gray-900">
                            {t.score} <span className="text-gray-400 font-normal">/ {t.max_score}</span>
                          </td>
                          <td className="px-6 py-3 text-center">
                            <span className={clsx(
                              'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold tabular-nums',
                              t.percentage >= 75 ? 'bg-[#E8F8F0] text-[#059669]' :
                              t.percentage >= 50 ? 'bg-amber-50 text-amber-700' : 'bg-[#FEE2E2] text-[#DC2626]'
                            )}>
                              {t.percentage}%
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {openReceiptId && <ReceiptSheet receiptId={openReceiptId} onClose={() => setOpenReceiptId(null)} />}
      <RecordPaymentDialog
        open={recordOpen}
        onOpenChange={setRecordOpen}
        studentId={data.student_id}
        studentName={data.name}
      />
    </div>
  )
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between items-start gap-2">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className="text-right text-gray-900">{value}</span>
    </div>
  )
}

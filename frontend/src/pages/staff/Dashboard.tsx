import { useState, useRef, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Coins, Layers, AlertTriangle, ArrowLeftRight,
  TrendingUp, Calendar, ChevronDown, Check
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts'
import { api } from '../../lib/api'
import { formatINR } from '../../lib/formatINR'
import { ErrorState } from '../../components/EmptyState'
import { clsx } from 'clsx'

interface Summary {
  collected_paise: number
  outstanding_paise: number
  overdue_paise: number
  unmatched_count: number
  unmatched_paise: number
}

interface DuesRow {
  id?: number
  label: string
  outstanding_paise: number
  overdue_paise: number
}

interface DuesData {
  by_centre: DuesRow[]
  by_batch: DuesRow[]
}

interface AgeingBucket {
  bucket: string
  count: number
  paise: number
}

interface AgeingData {
  buckets: AgeingBucket[]
}

const AGEING_THEME_COLORS = [
  '#059669', // 0-15: Dark Emerald Green
  '#6EE7B7', // 16-30: Light Mint Green
  '#FBBF24', // 31-60: Warm Amber / Yellow
  '#EF4444', // >60: Coral Red
]

type PeriodType = 'this_month' | 'last_month' | 'this_quarter' | 'all_time'

const PERIOD_OPTIONS: { value: PeriodType; label: string }[] = [
  { value: 'this_month', label: 'This Month' },
  { value: 'last_month', label: 'Last Month' },
  { value: 'this_quarter', label: 'This Quarter' },
  { value: 'all_time', label: 'All Time' },
]

export default function Dashboard({ centreId }: { centreId: number | null }) {
  const [period, setPeriod] = useState<PeriodType>('this_month')
  const [periodDropdownOpen, setPeriodDropdownOpen] = useState(false)
  const periodRef = useRef<HTMLDivElement>(null)

  const [duesView, setDuesView] = useState<'centre' | 'batch'>('centre')
  const duesParams = centreId ? `?centre_id=${centreId}` : ''

  const summaryParams = new URLSearchParams()
  if (centreId) summaryParams.set('centre_id', String(centreId))
  summaryParams.set('period', period)
  const summaryParamStr = `?${summaryParams.toString()}`

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (periodRef.current && !periodRef.current.contains(event.target as Node)) {
        setPeriodDropdownOpen(false)
      }
    }
    if (periodDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [periodDropdownOpen])

  const { data: summary, isLoading: sLoading, error: sError, refetch: sRefetch } = useQuery<Summary>({
    queryKey: ['dashboard', 'summary', centreId, period],
    queryFn: () => api.get(`/dashboard/summary${summaryParamStr}`),
  })

  const { data: dues, isLoading: dLoading, error: dError } = useQuery<DuesData>({
    queryKey: ['dashboard', 'dues', centreId],
    queryFn: () => api.get(`/dashboard/dues${duesParams}`),
  })

  const { data: ageing, isLoading: aLoading, error: aError } = useQuery<AgeingData>({
    queryKey: ['dashboard', 'ageing', centreId],
    queryFn: () => api.get(`/dashboard/ageing${duesParams}`),
  })

  // Format ageing buckets (only overdue buckets, excluding not_yet_due)
  const ageingList = (ageing?.buckets ?? [])
    .filter(b => b.bucket !== 'not_yet_due')
    .map((b, idx) => {
      let cleanLabel = b.bucket
      if (b.bucket === '1-7' || b.bucket === '1-15' || b.bucket === '0-15') cleanLabel = '0 – 15 days'
      else if (b.bucket === '8-30' || b.bucket === '16-30' || b.bucket === '1-30') cleanLabel = '1 – 30 days'
      else if (b.bucket === '31-60') cleanLabel = '31 – 60 days'
      else if (b.bucket === '61+' || b.bucket === '>60' || b.bucket === 'over_60') cleanLabel = '> 60 days'
      else cleanLabel = `${b.bucket} days`

      return {
        ...b,
        formattedLabel: cleanLabel,
        color: AGEING_THEME_COLORS[idx % AGEING_THEME_COLORS.length],
      }
    })

  const totalAgeingPaise = ageingList.reduce((acc, curr) => acc + curr.paise, 0)

  // Chart data
  const chartData = ageingList.length > 0 && totalAgeingPaise > 0
    ? ageingList.map(item => ({
        name: item.formattedLabel,
        value: item.paise,
        color: item.color,
      }))
    : [{ name: 'No overdue', value: 1, color: '#E5E7EB' }]

  const activeDuesList = duesView === 'centre' ? (dues?.by_centre ?? []) : (dues?.by_batch ?? [])
  const maxOutstanding = Math.max(...activeDuesList.map(r => r.outstanding_paise), 1)

  return (
    <div className="space-y-6">
      {/* ── Page Header Area ────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
            Welcome back,
          </p>
          <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight mt-0.5">
            Dashboard
          </h1>
          <p className="text-xs sm:text-sm text-gray-500 mt-1">
            Overview of fee collections, dues and overdue payments.
          </p>
        </div>

        {/* Date Filter Dropdown Pill */}
        <div className="relative self-start sm:self-auto" ref={periodRef}>
          <button
            type="button"
            onClick={() => setPeriodDropdownOpen(prev => !prev)}
            aria-expanded={periodDropdownOpen}
            aria-haspopup="listbox"
            className="inline-flex items-center gap-2 bg-white border border-gray-200/90 rounded-xl px-3.5 py-2 text-xs font-semibold text-gray-700 shadow-2xs hover:bg-gray-50 hover:border-gray-300 transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
          >
            <Calendar size={14} className="text-gray-500" />
            <span>{PERIOD_OPTIONS.find(p => p.value === period)?.label ?? 'This Month'}</span>
            <ChevronDown
              size={14}
              className={clsx("text-gray-400 ml-0.5 transition-transform duration-150", periodDropdownOpen && "rotate-180")}
            />
          </button>

          {periodDropdownOpen && (
            <div className="absolute right-0 mt-1.5 w-44 bg-white rounded-xl shadow-lg border border-gray-100 py-1.5 z-50 animate-in fade-in zoom-in-95 duration-100">
              {PERIOD_OPTIONS.map(opt => {
                const isSelected = opt.value === period
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => {
                      setPeriod(opt.value)
                      setPeriodDropdownOpen(false)
                    }}
                    className={clsx(
                      "w-full flex items-center justify-between px-3.5 py-2 text-xs font-medium transition-colors text-left cursor-pointer",
                      isSelected
                        ? "bg-emerald-50 text-emerald-800 font-semibold"
                        : "text-gray-700 hover:bg-gray-50"
                    )}
                  >
                    <span>{opt.label}</span>
                    {isSelected && <Check size={14} className="text-emerald-600 shrink-0" />}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── 4 Key Metric Cards ──────────────────────────────────────────────── */}
      {sLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-white rounded-2xl border border-gray-100 p-5 h-36 animate-pulse" />
          ))}
        </div>
      ) : sError ? (
        <ErrorState message="Could not load summary metrics" onRetry={sRefetch} />
      ) : summary ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* 1. Collected */}
          <div className="relative bg-white rounded-2xl border border-gray-100/90 p-5 shadow-xs overflow-hidden flex flex-col justify-between">
            {/* Soft decorative bottom-right mint wave glow */}
            <div className="absolute -bottom-8 -right-8 w-32 h-32 rounded-full bg-emerald-100/40 pointer-events-none blur-xl" />

            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#E8F8F0] flex items-center justify-center text-[#059669] shrink-0">
                <Coins size={20} />
              </div>
              <span className="text-xs font-semibold text-gray-500">Collected</span>
            </div>

            <div className="mt-4">
              <p className="text-2xl lg:text-[26px] font-bold text-gray-900 tracking-tight tabular-nums">
                {formatINR(summary.collected_paise)}
              </p>
              <div className="mt-2 flex items-center">
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#059669] bg-[#E8F8F0] px-2 py-0.5 rounded-full">
                  <TrendingUp size={11} />
                  +12.4%
                </span>
              </div>
            </div>
          </div>

          {/* 2. Outstanding */}
          <div className="bg-white rounded-2xl border border-gray-100/90 p-5 shadow-xs flex flex-col justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#E8F8F0] flex items-center justify-center text-[#059669] shrink-0">
                <Layers size={20} />
              </div>
              <span className="text-xs font-semibold text-gray-500">Outstanding</span>
            </div>

            <div className="mt-4">
              <p className="text-2xl lg:text-[26px] font-bold text-gray-900 tracking-tight tabular-nums">
                {formatINR(summary.outstanding_paise)}
              </p>
              <p className="text-xs text-transparent mt-2 select-none">-</p>
            </div>
          </div>

          {/* 3. Overdue */}
          <div className="relative bg-white rounded-2xl border border-gray-100/90 p-5 shadow-xs overflow-hidden flex flex-col justify-between">
            {/* Soft decorative bottom-right rose wave glow */}
            <div className="absolute -bottom-8 -right-8 w-32 h-32 rounded-full bg-rose-100/40 pointer-events-none blur-xl" />

            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#FEE2E2] flex items-center justify-center text-[#DC2626] shrink-0">
                <AlertTriangle size={20} />
              </div>
              <span className="text-xs font-semibold text-gray-500">Overdue</span>
            </div>

            <div className="mt-4">
              <p className="text-2xl lg:text-[26px] font-bold text-[#DC2626] tracking-tight tabular-nums">
                {formatINR(summary.overdue_paise)}
              </p>
              <p className="text-xs text-transparent mt-2 select-none">-</p>
            </div>
          </div>

          {/* 4. Unmatched */}
          <Link
            to="/staff/payments"
            className="group bg-white rounded-2xl border border-gray-100/90 p-5 shadow-xs flex flex-col justify-between hover:border-amber-200 transition-all cursor-pointer"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#FEF3C7] flex items-center justify-center text-[#D97706] shrink-0 group-hover:scale-105 transition-transform">
                <ArrowLeftRight size={20} />
              </div>
              <span className="text-xs font-semibold text-gray-500">
                Unmatched ({summary.unmatched_count})
              </span>
            </div>

            <div className="mt-4">
              <p className="text-2xl lg:text-[26px] font-bold text-gray-900 tracking-tight tabular-nums">
                {formatINR(summary.unmatched_paise)}
              </p>
              <p className="text-xs text-amber-600 font-medium mt-2 flex items-center gap-1 group-hover:underline">
                Review payments →
              </p>
            </div>
          </Link>
        </div>
      ) : null}

      {/* ── Bottom Section: Outstanding Dues & Overdue Ageing ───────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Card: Outstanding dues (7 cols on lg) */}
        <div className="lg:col-span-7 bg-white rounded-2xl border border-gray-100/90 p-6 shadow-xs flex flex-col justify-between">
          <div>
            {/* Header with pill toggle */}
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-bold text-gray-900 tracking-tight">
                Outstanding dues
              </h2>

              {/* By Centre / By Batch Toggle */}
              <div className="inline-flex items-center p-1 bg-gray-100 rounded-full text-xs font-semibold select-none">
                <button
                  type="button"
                  onClick={() => setDuesView('centre')}
                  className={clsx(
                    'px-3.5 py-1 rounded-full transition-all',
                    duesView === 'centre'
                      ? 'bg-[#059669] text-white shadow-2xs'
                      : 'text-gray-500 hover:text-gray-900'
                  )}
                >
                  By Centre
                </button>
                <button
                  type="button"
                  onClick={() => setDuesView('batch')}
                  className={clsx(
                    'px-3.5 py-1 rounded-full transition-all',
                    duesView === 'batch'
                      ? 'bg-[#059669] text-white shadow-2xs'
                      : 'text-gray-500 hover:text-gray-900'
                  )}
                >
                  By Batch
                </button>
              </div>
            </div>

            {/* Dues Rows List */}
            {dLoading ? (
              <div className="space-y-4 py-4">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="animate-pulse space-y-2">
                    <div className="h-4 bg-gray-100 rounded-md w-1/3" />
                    <div className="h-2 bg-gray-100 rounded-full w-full" />
                  </div>
                ))}
              </div>
            ) : dError ? (
              <ErrorState message="Could not load dues breakdown" onRetry={() => {}} />
            ) : activeDuesList.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-10 font-medium">
                No outstanding dues for this selection.
              </p>
            ) : (
              <div key={duesView} className="space-y-5">
                {activeDuesList.map((row, idx) => {
                  const total = row.outstanding_paise
                  const overdue = row.overdue_paise
                  const normalDues = Math.max(0, total - overdue)

                  // Percentages relative to total width of row
                  const overdueWidthPct = total > 0 ? (overdue / total) * 100 : 0
                  const normalWidthPct = total > 0 ? (normalDues / total) * 100 : 0

                  // Relative row width against max in list
                  const rowBarScale = Math.min(100, Math.max(25, (total / maxOutstanding) * 100))

                  return (
                    <div key={`${duesView}-${row.id ?? idx}-${row.label}`} className="group">
                      <div className="flex items-center justify-between text-xs mb-1.5">
                        <span className="font-semibold text-gray-800 truncate pr-2">
                          {row.label}
                        </span>
                        <span className="font-semibold text-gray-600 tabular-nums shrink-0">
                          {formatINR(total)}
                        </span>
                      </div>

                      {/* Multi-segmented Progress Bar */}
                      <div className="w-full bg-gray-100 h-2.5 rounded-full overflow-hidden flex">
                        <div
                          className="flex h-full"
                          style={{ width: `${rowBarScale}%` }}
                        >
                          {/* Red segment for overdue */}
                          {overdue > 0 && (
                            <div
                              className="bg-[#DC2626] h-full"
                              style={{ width: `${overdueWidthPct}%` }}
                              title={`Overdue: ${formatINR(overdue)}`}
                            />
                          )}
                          {/* Green segment for normal upcoming dues */}
                          {normalDues > 0 && (
                            <div
                              className="bg-[#059669] h-full"
                              style={{ width: `${normalWidthPct}%` }}
                              title={`Active dues: ${formatINR(normalDues)}`}
                            />
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right Card: Overdue ageing (5 cols on lg) */}
        <div className="lg:col-span-5 bg-white rounded-2xl border border-gray-100/90 p-6 shadow-xs flex flex-col justify-between">
          <div>
            <h2 className="text-lg font-bold text-gray-900 tracking-tight mb-4">
              Overdue ageing
            </h2>

            {aLoading ? (
              <div className="animate-pulse h-56 bg-gray-100 rounded-xl" />
            ) : aError ? (
              <ErrorState message="Could not load overdue ageing" onRetry={() => {}} />
            ) : (
              <div className="flex flex-col sm:flex-row items-center gap-4 py-2">
                {/* Donut Chart with center value */}
                <div className="relative w-44 h-44 shrink-0 flex items-center justify-center">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={chartData}
                        cx="50%"
                        cy="50%"
                        innerRadius={52}
                        outerRadius={74}
                        paddingAngle={chartData.length > 1 ? 3 : 0}
                        dataKey="value"
                        stroke="none"
                      >
                        {chartData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>

                  {/* Center Text in Donut Hole */}
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none select-none">
                    <span className="text-sm font-bold text-gray-900 tabular-nums">
                      {formatINR(summary?.overdue_paise ?? totalAgeingPaise)}
                    </span>
                    <span className="text-[11px] font-medium text-gray-400 mt-0.5">
                      Overdue
                    </span>
                  </div>
                </div>

                {/* Legend Breakdown */}
                <div className="flex-1 w-full space-y-3 pl-0 sm:pl-2">
                  {ageingList.map(b => {
                    const pct = totalAgeingPaise > 0
                      ? ((b.paise / totalAgeingPaise) * 100).toFixed(1)
                      : '0.0'

                    return (
                      <div key={b.bucket} className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                          <span
                            className="w-2.5 h-2.5 rounded-full shrink-0"
                            style={{ backgroundColor: b.color }}
                          />
                          <span className="text-gray-600 font-medium">
                            {b.formattedLabel}
                          </span>
                        </div>
                        <div className="tabular-nums font-semibold text-gray-800 text-right">
                          <span>{formatINR(b.paise)}</span>{' '}
                          <span className="text-gray-400 font-normal">({pct}%)</span>
                        </div>
                      </div>
                    )
                  })}

                  {ageingList.length === 0 && (
                    <p className="text-xs text-gray-400 text-center py-4">
                      No overdue accounts
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

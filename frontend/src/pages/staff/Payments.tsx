import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  CheckCircle, Plus, Search, X, Globe, Banknote,
  Building, FileText, Receipt, ArrowLeftRight, CreditCard,
  ChevronLeft, ChevronRight, CheckCircle2, Clock
} from 'lucide-react'
import { clsx } from 'clsx'
import { api } from '../../lib/api'
import { formatINR, formatDate } from '../../lib/formatINR'
import { useDebounce } from '../../lib/useDebounce'
import { PageHeader } from '../../components/PageHeader'
import { TableSkeleton, ErrorState } from '../../components/EmptyState'
import { AssignPaymentDialog } from '../../components/AssignPaymentDialog'
import { RecordPaymentDialog } from '../../components/RecordPaymentDialog'

interface UnmatchedPayment {
  payment_id: number
  student_id: number | null
  amount_paise: number
  unallocated_paise: number
  method: string
  reference: string | null
  received_at: string
}

interface TransactionItem {
  payment_id: number
  student_id: number | null
  student_code: string | null
  student_name: string | null
  batch_name: string | null
  centre_name: string | null
  centre_id: number | null
  amount_paise: number
  method: string
  reference: string | null
  status: string
  received_at: string | null
  receipt_id: number | null
  receipt_no: string | null
  recorded_by_name: string | null
  allocated_paise: number
  unallocated_paise: number
}

interface TransactionListResponse {
  items: TransactionItem[]
  total: number
  total_amount_paise: number
  online_count: number
  online_amount_paise: number
}

interface UnmatchedListResponse {
  items: UnmatchedPayment[]
  total: number
  total_unallocated_paise: number
}

const METHOD_FILTERS = [
  { id: 'all', label: 'All Transactions' },
  { id: 'online', label: 'Online (UPI/PG)', icon: Globe },
  { id: 'cash', label: 'Cash', icon: Banknote },
  { id: 'bank_transfer', label: 'Bank Transfer', icon: Building },
  { id: 'cheque', label: 'Cheque', icon: FileText },
]

function formatTime(isoString: string | null): string {
  if (!isoString) return ''
  try {
    const d = new Date(isoString)
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true })
  } catch {
    return ''
  }
}

export default function Payments() {
  const [searchParams, setSearchParams] = useSearchParams()
  const activeTab = searchParams.get('tab') === 'unmatched' ? 'unmatched' : 'transactions'

  const [assignPayment, setAssignPayment] = useState<UnmatchedPayment | null>(null)
  const [recordOpen, setRecordOpen] = useState(false)

  // Filters for Transactions tab
  const [methodFilter, setMethodFilter] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const debouncedSearch = useDebounce(searchQuery, 300)
  const [page, setPage] = useState(0)
  const pageSize = 25

  const setTab = (tab: 'transactions' | 'unmatched') => {
    setSearchParams({ tab })
  }

  // 1. Unmatched Payments query
  const {
    data: unmatchedData,
    isLoading: unmatchedLoading,
    error: unmatchedError,
    refetch: refetchUnmatched,
  } = useQuery<UnmatchedListResponse>({
    queryKey: ['unmatched'],
    queryFn: () => api.get('/payments/unmatched'),
  })

  // 2. All Transactions query
  const {
    data: transactionsData,
    isLoading: transactionsLoading,
    error: transactionsError,
    refetch: refetchTransactions,
  } = useQuery<TransactionListResponse>({
    queryKey: ['payments-transactions', methodFilter, debouncedSearch, page],
    queryFn: () => {
      const params = new URLSearchParams()
      if (methodFilter !== 'all') params.set('method', methodFilter)
      if (debouncedSearch.trim()) params.set('search', debouncedSearch.trim())
      params.set('limit', String(pageSize))
      params.set('offset', String(page * pageSize))
      return api.get(`/payments/transactions?${params.toString()}`)
    },
  })

  const unmatchedItems = unmatchedData?.items ?? []
  const unmatchedTotalUnallocated = unmatchedData?.total_unallocated_paise ?? 0
  const transactionItems = transactionsData?.items ?? []
  const totalTransactions = transactionsData?.total ?? 0
  const totalPages = Math.ceil(totalTransactions / pageSize)

  return (
    <div className="space-y-6">
      {/* ── Page Header Area ──────────────────────────────────────────────── */}
      <PageHeader
        title="Payments & Transactions"
        action={
          <button
            onClick={() => setRecordOpen(true)}
            className="btn-primary flex items-center gap-1.5 cursor-pointer shadow-xs"
          >
            <Plus size={16} />
            <span>Record payment</span>
          </button>
        }
      />

      {/* ── Navigation Tabs (Segmented control) ─────────────────────────────── */}
      <div className="flex items-center justify-between border-b border-gray-200/80 pb-3">
        <div className="flex items-center gap-2">
          {/* Transactions Tab */}
          <button
            type="button"
            onClick={() => setTab('transactions')}
            className={clsx(
              'px-4 py-2 rounded-xl text-sm font-bold transition-all flex items-center gap-2 cursor-pointer',
              activeTab === 'transactions'
                ? 'bg-[#E8F8F0] text-[#059669] shadow-2xs'
                : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100/70'
            )}
          >
            <Globe size={16} />
            <span>Transactions</span>
            <span
              className={clsx(
                'px-2 py-0.5 text-xs rounded-full font-bold',
                activeTab === 'transactions'
                  ? 'bg-[#059669] text-white'
                  : 'bg-gray-100 text-gray-600'
              )}
            >
              {transactionsData?.total ?? 0}
            </span>
          </button>

          {/* Unmatched Tab */}
          <button
            type="button"
            onClick={() => setTab('unmatched')}
            className={clsx(
              'px-4 py-2 rounded-xl text-sm font-bold transition-all flex items-center gap-2 cursor-pointer',
              activeTab === 'unmatched'
                ? 'bg-[#E8F8F0] text-[#059669] shadow-2xs'
                : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100/70'
            )}
          >
            <ArrowLeftRight size={16} />
            <span>Unmatched</span>
            {(unmatchedData?.total ?? 0) > 0 ? (
              <span className="px-2 py-0.5 text-xs rounded-full font-bold bg-amber-500 text-white animate-pulse">
                {unmatchedData?.total}
              </span>
            ) : (
              <span
                className={clsx(
                  'px-2 py-0.5 text-xs rounded-full font-bold',
                  activeTab === 'unmatched'
                    ? 'bg-[#059669] text-white'
                    : 'bg-gray-100 text-gray-600'
                )}
              >
                0
              </span>
            )}
          </button>
        </div>

        {/* Quick hint for staff */}
        <p className="hidden md:block text-xs text-gray-400">
          {activeTab === 'transactions'
            ? 'Live log of online and offline payment transactions'
            : 'Unallocated payments awaiting student matching'}
        </p>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════
          TAB 1: TRANSACTIONS (Online & Offline Transactions)
          ═══════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'transactions' && (
        <div className="space-y-5">
          {/* Top KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* Online Collected */}
            <div className="bg-white rounded-2xl border border-gray-100/90 p-4 shadow-xs flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                  Online Collections
                </p>
                <p className="text-xl font-extrabold text-[#059669] tabular-nums mt-0.5">
                  {formatINR(transactionsData?.online_amount_paise ?? 0)}
                </p>
                <p className="text-[11px] text-gray-500 mt-0.5">
                  {transactionsData?.online_count ?? 0} online payments processed
                </p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-[#E8F8F0] text-[#059669] flex items-center justify-center shrink-0">
                <Globe size={20} />
              </div>
            </div>

            {/* Total Filtered Volume */}
            <div className="bg-white rounded-2xl border border-gray-100/90 p-4 shadow-xs flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                  Total Volume
                </p>
                <p className="text-xl font-extrabold text-gray-900 tabular-nums mt-0.5">
                  {formatINR(transactionsData?.total_amount_paise ?? 0)}
                </p>
                <p className="text-[11px] text-gray-500 mt-0.5">
                  {transactionsData?.total ?? 0} total records
                </p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-gray-50 text-gray-600 flex items-center justify-center shrink-0">
                <CreditCard size={20} />
              </div>
            </div>

            {/* Unmatched Status */}
            <div
              onClick={() => setTab('unmatched')}
              className="bg-white rounded-2xl border border-gray-100/90 p-4 shadow-xs flex items-center justify-between hover:border-amber-200 transition-colors cursor-pointer group"
            >
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                  Unmatched Queue
                </p>
                <p
                  className={clsx(
                    'text-xl font-extrabold tabular-nums mt-0.5',
                    (unmatchedData?.total ?? 0) > 0 ? 'text-amber-600' : 'text-gray-900'
                  )}
                >
                  {unmatchedData?.total ?? 0} pending
                </p>
                <p className="text-[11px] text-gray-500 mt-0.5">
                  {formatINR(unmatchedTotalUnallocated)} to allocate
                </p>
              </div>
              <div
                className={clsx(
                  'w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-transform group-hover:scale-105',
                  (unmatchedData?.total ?? 0) > 0
                    ? 'bg-amber-50 text-amber-600'
                    : 'bg-gray-50 text-gray-400'
                )}
              >
                <ArrowLeftRight size={20} />
              </div>
            </div>
          </div>

          {/* Filter and Search Bar */}
          <div className="bg-white rounded-2xl border border-gray-100/90 p-3.5 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-3">
            {/* Search Input */}
            <div className="relative flex-1 max-w-md">
              <Search
                size={16}
                className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400"
              />
              <input
                type="text"
                value={searchQuery}
                onChange={e => {
                  setSearchQuery(e.target.value)
                  setPage(0)
                }}
                placeholder="Search student, roll code, reference, receipt..."
                className="w-full pl-10 pr-9 py-2 bg-gray-50/80 border border-gray-200/80 rounded-xl text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  <X size={15} />
                </button>
              )}
            </div>

            {/* Method Filter Pills */}
            <div className="flex flex-wrap items-center gap-1.5">
              {METHOD_FILTERS.map(f => {
                const Icon = f.icon
                const isSelected = methodFilter === f.id
                return (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => {
                      setMethodFilter(f.id)
                      setPage(0)
                    }}
                    className={clsx(
                      'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer',
                      isSelected
                        ? 'bg-[#E8F8F0] text-[#059669] shadow-2xs font-bold'
                        : 'bg-gray-50 text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                    )}
                  >
                    {Icon && <Icon size={13} className={isSelected ? 'text-[#059669]' : 'text-gray-400'} />}
                    <span>{f.label}</span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Transactions Table / Content */}
          {transactionsLoading ? (
            <TableSkeleton />
          ) : transactionsError ? (
            <ErrorState message="Could not load payment transactions" onRetry={refetchTransactions} />
          ) : transactionItems.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-100/90 shadow-xs flex flex-col items-center py-16 text-center p-6">
              <div className="w-14 h-14 rounded-2xl bg-gray-50 flex items-center justify-center text-gray-400 mb-3">
                <Globe size={28} />
              </div>
              <p className="text-base font-bold text-gray-900 tracking-tight">No transactions found</p>
              <p className="text-xs text-gray-400 mt-1 max-w-sm">
                {searchQuery || methodFilter !== 'all'
                  ? 'No transactions match your current filters. Try clearing the search or choosing another payment method.'
                  : 'Online payments made by parents will automatically appear here with receipts and student allocations.'}
              </p>
              {(searchQuery || methodFilter !== 'all') && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('')
                    setMethodFilter('all')
                    setPage(0)
                  }}
                  className="mt-4 px-3 py-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-lg transition-colors cursor-pointer"
                >
                  Clear all filters
                </button>
              )}
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-gray-100/90 shadow-xs overflow-hidden">
              {/* Desktop table */}
              <div className="hidden lg:block overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="bg-[#E8F8F0] border-b border-gray-100">
                      <th className="px-6 py-3.5 text-left text-xs font-bold text-[#059669] uppercase tracking-wider">
                        Date & Time
                      </th>
                      <th className="px-6 py-3.5 text-left text-xs font-bold text-[#059669] uppercase tracking-wider">
                        Student / Batch
                      </th>
                      <th className="px-6 py-3.5 text-left text-xs font-bold text-[#059669] uppercase tracking-wider">
                        Method
                      </th>
                      <th className="px-6 py-3.5 text-left text-xs font-bold text-[#059669] uppercase tracking-wider">
                        Reference / Order ID
                      </th>
                      <th className="px-6 py-3.5 text-right text-xs font-bold text-[#059669] uppercase tracking-wider">
                        Amount
                      </th>
                      <th className="px-6 py-3.5 text-center text-xs font-bold text-[#059669] uppercase tracking-wider">
                        Status
                      </th>
                      <th className="px-6 py-3.5 text-center text-xs font-bold text-[#059669] uppercase tracking-wider">
                        Receipt
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100/90 text-sm">
                    {transactionItems.map(p => (
                      <tr key={p.payment_id} className="h-16 hover:bg-[#F9FCFA] transition-colors">
                        {/* Date & Time */}
                        <td className="px-6 py-4 whitespace-nowrap">
                          <p className="font-semibold text-gray-900">{p.received_at ? formatDate(p.received_at) : '—'}</p>
                          <p className="text-xs text-gray-400">{formatTime(p.received_at)}</p>
                        </td>

                        {/* Student Info */}
                        <td className="px-6 py-4">
                          {p.student_id ? (
                            <Link
                              to={`/staff/students/${p.student_id}`}
                              className="group block"
                            >
                              <p className="font-bold text-gray-900 group-hover:text-[#059669] transition-colors">
                                {p.student_name}
                              </p>
                              <p className="text-xs text-gray-500">
                                <span className="font-mono text-gray-400 font-semibold">{p.student_code}</span>
                                {p.batch_name && <> · {p.batch_name}</>}
                              </p>
                            </Link>
                          ) : (
                            <div>
                              <p className="font-semibold text-gray-800">Unassigned Payer</p>
                              <span className="inline-block mt-0.5 px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-200/50">
                                Needs assignment
                              </span>
                            </div>
                          )}
                        </td>

                        {/* Method */}
                        <td className="px-6 py-4 whitespace-nowrap">
                          {p.method === 'online' ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200/60">
                              <Globe size={13} className="text-emerald-600" />
                              <span>Online (UPI/PG)</span>
                            </span>
                          ) : p.method === 'cash' ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-800 border border-blue-200/60">
                              <Banknote size={13} className="text-blue-600" />
                              <span>Cash</span>
                            </span>
                          ) : p.method === 'bank_transfer' ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-purple-50 text-purple-800 border border-purple-200/60">
                              <Building size={13} className="text-purple-600" />
                              <span>Bank Transfer</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-200/60">
                              <FileText size={13} className="text-amber-600" />
                              <span className="capitalize">{p.method.replace('_', ' ')}</span>
                            </span>
                          )}
                        </td>

                        {/* Reference */}
                        <td className="px-6 py-4">
                          <span className="font-mono text-xs text-gray-600 bg-gray-50 px-2 py-1 rounded border border-gray-200/60 break-all select-all">
                            {p.reference || '—'}
                          </span>
                        </td>

                        {/* Amount */}
                        <td className="px-6 py-4 text-right whitespace-nowrap">
                          <p className="font-extrabold text-base text-gray-900 tabular-nums">
                            +{formatINR(p.amount_paise)}
                          </p>
                          {p.unallocated_paise > 0 ? (
                            <p className="text-[11px] text-amber-600 font-semibold">
                              Unallocated: {formatINR(p.unallocated_paise)}
                            </p>
                          ) : (
                            <p className="text-[11px] text-emerald-600 font-semibold">
                              Fully allocated
                            </p>
                          )}
                        </td>

                        {/* Status */}
                        <td className="px-6 py-4 text-center whitespace-nowrap">
                          {p.status === 'succeeded' ? (
                            <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200/50">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                              Succeeded
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700 bg-amber-50 px-2.5 py-0.5 rounded-full border border-amber-200/50 capitalize">
                              {p.status}
                            </span>
                          )}
                        </td>

                        {/* Receipt */}
                        <td className="px-6 py-4 text-center whitespace-nowrap">
                          {p.receipt_no ? (
                            <span
                              className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-[#E8F8F0] text-[#059669] font-mono font-semibold text-xs rounded-lg border border-emerald-200/60 select-all shadow-2xs"
                              title="GST Receipt Number"
                            >
                              <Receipt size={13} />
                              <span>{p.receipt_no}</span>
                            </span>
                          ) : (
                            <span className="text-gray-300 text-xs">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile / Tablet Cards */}
              <div className="lg:hidden divide-y divide-gray-100/90">
                {transactionItems.map(p => (
                  <div key={p.payment_id} className="p-4 space-y-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        {p.student_id ? (
                          <Link
                            to={`/staff/students/${p.student_id}`}
                            className="text-sm font-bold text-gray-900 hover:text-[#059669]"
                          >
                            {p.student_name}
                          </Link>
                        ) : (
                          <span className="text-sm font-bold text-gray-800">Unassigned Payer</span>
                        )}
                        <p className="text-xs text-gray-500">
                          {p.student_code && <span className="font-mono text-gray-400">{p.student_code} · </span>}
                          {p.batch_name || 'No batch'}
                        </p>
                      </div>

                      <div className="text-right">
                        <p className="text-base font-extrabold text-gray-900 tabular-nums">
                          +{formatINR(p.amount_paise)}
                        </p>
                        <p className="text-[10px] text-gray-400">
                          {p.received_at ? formatDate(p.received_at) : '—'} · {formatTime(p.received_at)}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-xs">
                      <div className="flex items-center gap-1.5">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-gray-100 text-gray-700 capitalize">
                          {p.method === 'online' ? (
                            <>
                              <Globe size={11} className="text-emerald-600" />
                              Online
                            </>
                          ) : (
                            p.method.replace('_', ' ')
                          )}
                        </span>
                        {p.reference && (
                          <span className="font-mono text-[10px] text-gray-500 bg-gray-50 px-1.5 py-0.5 rounded border border-gray-100">
                            {p.reference}
                          </span>
                        )}
                      </div>

                      {p.receipt_no && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold font-mono text-[#059669] bg-[#E8F8F0] px-2 py-0.5 rounded border border-emerald-200/60 select-all">
                          <Receipt size={12} />
                          <span>{p.receipt_no}</span>
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Pagination controls */}
              {totalPages > 1 && (
                <div className="px-6 py-3.5 bg-gray-50/70 border-t border-gray-100 flex items-center justify-between">
                  <p className="text-xs text-gray-500">
                    Showing <span className="font-semibold text-gray-800">{page * pageSize + 1}</span> to{' '}
                    <span className="font-semibold text-gray-800">
                      {Math.min((page + 1) * pageSize, totalTransactions)}
                    </span>{' '}
                    of <span className="font-semibold text-gray-800">{totalTransactions}</span> transactions
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={page === 0}
                      onClick={() => setPage(p => Math.max(p - 1, 0))}
                      className="p-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                    >
                      <ChevronLeft size={16} />
                    </button>
                    <span className="text-xs font-semibold text-gray-700">
                      Page {page + 1} of {totalPages}
                    </span>
                    <button
                      type="button"
                      disabled={page >= totalPages - 1}
                      onClick={() => setPage(p => Math.min(p + 1, totalPages - 1))}
                      className="p-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                    >
                      <ChevronRight size={16} />
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════
          TAB 2: UNMATCHED QUEUE (Unallocated Cash/Bank Transfers to Match)
          ═══════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'unmatched' && (
        <div className="space-y-4">
          {unmatchedLoading ? (
            <TableSkeleton />
          ) : unmatchedError ? (
            <ErrorState message="Could not load unmatched payments" onRetry={refetchUnmatched} />
          ) : (
            <>
              {unmatchedItems.length > 0 && (
                <div className="bg-amber-50/70 rounded-2xl border border-amber-200/70 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-bold text-amber-900">
                      {unmatchedItems.length} payment{unmatchedItems.length !== 1 ? 's' : ''} awaiting allocation
                    </p>
                    <p className="text-xs text-amber-700 mt-0.5">
                      Total unallocated amount: <span className="font-bold tabular-nums">{formatINR(unmatchedTotalUnallocated)}</span>.
                      Click &ldquo;Assign&rdquo; to match any payment to a student ledger.
                    </p>
                  </div>
                </div>
              )}

              {unmatchedItems.length === 0 ? (
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
                          <th className="px-6 py-3.5 text-left text-xs font-bold text-[#059669] uppercase tracking-wider">
                            Date
                          </th>
                          <th className="px-6 py-3.5 text-left text-xs font-bold text-[#059669] uppercase tracking-wider">
                            Method
                          </th>
                          <th className="px-6 py-3.5 text-left text-xs font-bold text-[#059669] uppercase tracking-wider">
                            Reference
                          </th>
                          <th className="px-6 py-3.5 text-right text-xs font-bold text-[#059669] uppercase tracking-wider">
                            Amount
                          </th>
                          <th className="px-6 py-3.5 text-right text-xs font-bold text-[#059669] uppercase tracking-wider">
                            Unallocated
                          </th>
                          <th className="px-6 py-3.5 text-center text-xs font-bold text-[#059669] uppercase tracking-wider">
                            Action
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100/90">
                        {unmatchedItems.map(p => (
                          <tr key={p.payment_id} className="h-16 hover:bg-[#F9FCFA] transition-colors">
                            <td className="px-6 py-4 text-sm font-medium text-gray-800">
                              {formatDate(p.received_at)}
                            </td>
                            <td className="px-6 py-4">
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-700 capitalize">
                                {p.method.replace('_', ' ')}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-xs font-mono text-gray-500">
                              {p.reference || '—'}
                            </td>
                            <td className="px-6 py-4 text-sm text-right tabular-nums font-bold text-gray-900">
                              {formatINR(p.amount_paise)}
                            </td>
                            <td className="px-6 py-4 text-sm text-right tabular-nums text-amber-600 font-bold">
                              {formatINR(p.unallocated_paise)}
                            </td>
                            <td className="px-6 py-4 text-center">
                              <button
                                onClick={() => setAssignPayment(p)}
                                className="inline-flex items-center gap-1 px-3.5 py-1.5 bg-[#E8F8F0] text-[#059669] hover:bg-[#DCFCE7] font-semibold text-xs rounded-lg transition-colors cursor-pointer shadow-2xs"
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
                    {unmatchedItems.map(p => (
                      <div key={p.payment_id} className="p-4 space-y-2">
                        <div className="flex justify-between items-center">
                          <span className="text-xs text-gray-500 font-medium">
                            {formatDate(p.received_at)}
                          </span>
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-700 capitalize">
                            {p.method.replace('_', ' ')}
                          </span>
                        </div>
                        {p.reference && <p className="text-xs font-mono text-gray-400">{p.reference}</p>}
                        <div className="flex justify-between items-center pt-1">
                          <div>
                            <p className="text-sm font-bold text-gray-900 tabular-nums">{formatINR(p.amount_paise)}</p>
                            <p className="text-xs text-amber-600 font-semibold">
                              Unallocated: {formatINR(p.unallocated_paise)}
                            </p>
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
            </>
          )}
        </div>
      )}

      {/* ── Dialogs ────────────────────────────────────────────────────────── */}
      {assignPayment && (
        <AssignPaymentDialog
          open={!!assignPayment}
          onOpenChange={v => {
            if (!v) {
              setAssignPayment(null)
              refetchUnmatched()
              refetchTransactions()
            }
          }}
          paymentId={assignPayment.payment_id}
          paymentAmount={assignPayment.unallocated_paise}
        />
      )}

      <RecordPaymentDialog
        open={recordOpen}
        onOpenChange={v => {
          setRecordOpen(v)
          if (!v) {
            refetchUnmatched()
            refetchTransactions()
          }
        }}
      />
    </div>
  )
}

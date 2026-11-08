import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Plus, ChevronRight, GraduationCap } from 'lucide-react'
import { api } from '../../lib/api'
import { formatINR } from '../../lib/formatINR'
import { DataTable } from '../../components/DataTable'
import { SearchInput } from '../../components/SearchInput'
import { ChipFilterRow } from '../../components/ChipFilterRow'
import { PageHeader } from '../../components/PageHeader'
import { TableSkeleton, ErrorState } from '../../components/EmptyState'
import { AddStudentSheet } from '../../components/AddStudentSheet'
import { useMe } from '../../lib/auth'
import { useDebounce } from '../../lib/useDebounce'
import { clsx } from 'clsx'

interface Student {
  student_id: number
  name: string
  student_code: string
  guardian_phone: string
  batch_name: string
  status: string
  balance_paise: number
  days_overdue: number | null
}

interface StudentsResponse {
  items: Student[]
  total: number
}

const STATUS_FILTERS = [
  { value: '', label: 'All' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'left', label: 'Left' },
]

export default function Students({ centreId }: { centreId: number | null }) {
  const navigate = useNavigate()
  const { data: me } = useMe()
  const [q, setQ] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [addOpen, setAddOpen] = useState(false)
  const debouncedQ = useDebounce(q, 300)

  const params = new URLSearchParams()
  if (debouncedQ) params.set('q', debouncedQ)
  if (statusFilter === 'overdue') params.set('overdue_only', 'true')
  if (statusFilter === 'left') params.set('status', 'left')
  if (centreId) params.set('centre_id', String(centreId))

  const { data, isLoading, error, refetch } = useQuery<StudentsResponse>({
    queryKey: ['students', debouncedQ, statusFilter, centreId],
    queryFn: () => api.get(`/students?${params.toString()}`),
  })

  const canAdd = me?.role === 'admin' || me?.role === 'accounts'

  const columns = [
    {
      key: 'name',
      header: 'Student',
      render: (s: Student) => (
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-[#E8F8F0] text-[#059669] font-bold text-sm flex items-center justify-center shrink-0">
            {s.name.charAt(0).toUpperCase()}
          </div>
          <div>
            <p className="font-bold text-sm text-gray-900 group-hover:text-[#059669] transition-colors">
              {s.name}
            </p>
            <p className="text-xs text-gray-400 mt-0.5 font-normal">
              {s.student_code} • {s.guardian_phone}
            </p>
          </div>
        </div>
      ),
    },
    {
      key: 'batch',
      header: 'Batch',
      render: (s: Student) => (
        <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-white border border-gray-200/90 rounded-lg text-xs font-semibold text-gray-700 shadow-2xs">
          <GraduationCap size={14} className="text-[#059669]" />
          <span>{s.batch_name}</span>
        </span>
      ),
    },
    {
      key: 'balance',
      header: 'Balance',
      className: 'text-right',
      render: (s: Student) => {
        const isOverdue = s.balance_paise > 0 && s.days_overdue && s.days_overdue > 0
        return (
          <span className={clsx('tabular-nums font-bold text-sm', isOverdue ? 'text-[#DC2626]' : 'text-gray-900')}>
            {formatINR(s.balance_paise)}
          </span>
        )
      },
    },
    {
      key: 'overdue',
      header: 'Overdue',
      className: 'text-center',
      render: (s: Student) => (
        s.days_overdue && s.days_overdue > 0
          ? (
            <span className="inline-flex items-center justify-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#FEE2E2] text-[#DC2626] min-w-[42px]">
              {s.days_overdue}d
            </span>
          )
          : <span className="text-gray-400 font-medium">—</span>
      ),
    },
    {
      key: 'arrow',
      header: '',
      className: 'text-right w-8',
      render: () => <ChevronRight size={16} className="text-gray-400 group-hover:text-gray-600 transition-colors inline-block" />,
    },
  ]

  if (isLoading) return <div><PageHeader title="Students" /><TableSkeleton /></div>
  if (error) return <div><PageHeader title="Students" /><ErrorState message="Could not load students" onRetry={refetch} /></div>

  return (
    <div>
      <PageHeader
        title="Students"
        subtitle={data ? `${data.total} students` : undefined}
        action={canAdd ? (
          <button onClick={() => setAddOpen(true)} className="btn-primary flex items-center gap-1.5">
            <Plus size={16} /> Add Student
          </button>
        ) : undefined}
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <ChipFilterRow options={STATUS_FILTERS} value={statusFilter} onChange={setStatusFilter} />
        <div className="ml-auto">
          <SearchInput value={q} onChange={setQ} placeholder="Search name, code, phone…" className="w-64" />
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100/90 shadow-xs overflow-hidden">
        <DataTable
          columns={columns}
          data={data?.items ?? []}
          keyExtractor={s => s.student_id}
          onRowClick={s => navigate(`/staff/students/${s.student_id}`)}
          pageSize={25}
          emptyMessage={q || statusFilter ? 'No students match your filters.' : 'No students yet. Add the first one.'}
        />
      </div>

      <AddStudentSheet open={addOpen} onClose={() => setAddOpen(false)} />
    </div>
  )
}


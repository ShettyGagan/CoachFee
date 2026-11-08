import { useState, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Upload, Download, FileSpreadsheet, Calendar,
  GraduationCap, Loader2, CheckCircle,
  X, ChevronDown, Check, ChevronLeft, ChevronRight,
  Building2, Filter
} from 'lucide-react'
import * as Dialog from '@radix-ui/react-dialog'
import { api, ApiError } from '../../lib/api'
import { formatDate } from '../../lib/formatINR'
import { PageHeader } from '../../components/PageHeader'
import { TableSkeleton, ErrorState, EmptyState } from '../../components/EmptyState'
import { toast } from 'sonner'
import { clsx } from 'clsx'

interface Centre {
  id: number
  name: string
  city: string
}

interface Batch {
  id: number
  name: string
  centre_id: number
  centre_name: string
  course: string
}

interface AttendanceRecord {
  id: number
  student_id: number
  student_name: string
  student_code: string
  date: string
  present: boolean
}

interface TestMeta {
  test_name: string
  test_date: string
  max_score: number
  student_count: number
}

interface TestScoreRecord {
  id: number
  student_id: number
  student_name: string
  student_code: string
  test_name: string
  test_date: string
  score: number
  max_score: number
  percentage: number
}

interface PreviewResponse {
  total: number
  headers: string[]
  preview_rows: Record<string, string>[]
}

function formatDayWithWeekday(dateStr: string): string {
  try {
    const d = new Date(dateStr)
    return d.toLocaleDateString('en-IN', {
      weekday: 'short',
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    })
  } catch {
    return dateStr
  }
}

export default function Academics({ centreId }: { centreId: number | null }) {
  const qc = useQueryClient()
  const [tab, setTab] = useState<'attendance' | 'tests'>('attendance')
  const [selectedCentreId, setSelectedCentreId] = useState<number | null>(centreId ?? null)
  const [selectedBatchId, setSelectedBatchId] = useState<number | null>(null)

  // Day-wise date selection (defaults to today in YYYY-MM-DD)
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    return new Date().toISOString().split('T')[0]
  })

  // Test-wise selection
  const [selectedTestName, setSelectedTestName] = useState<string>('')

  // Upload modal state
  const [uploadOpen, setUploadOpen] = useState(false)
  const [uploadType, setUploadType] = useState<'attendance' | 'tests'>('attendance')
  const [modalBatchId, setModalBatchId] = useState<number | null>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [fileBase64, setFileBase64] = useState<string>('')
  const [previewData, setPreviewData] = useState<PreviewResponse | null>(null)
  const [isParsing, setIsParsing] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Sync prop centreId
  useEffect(() => {
    if (centreId !== null && centreId !== undefined) {
      setSelectedCentreId(centreId)
    }
  }, [centreId])

  // Fetch centres for filtering
  const { data: centresData } = useQuery<{ items: Centre[] }>({
    queryKey: ['centres'],
    queryFn: () => api.get('/centres'),
  })
  const centres = centresData?.items ?? []

  // Fetch batches
  const { data: batchesData } = useQuery<{ items: Batch[] }>({
    queryKey: ['batches', selectedCentreId],
    queryFn: () => api.get('/batches'),
  })
  const allBatches = batchesData?.items ?? []

  // Filter batches by centre
  const batches = selectedCentreId
    ? allBatches.filter(b => b.centre_id === selectedCentreId)
    : allBatches

  // Active batch ID: if current selection is invalid for filtered batches, select first available
  const activeBatchId = (selectedBatchId && batches.some(b => b.id === selectedBatchId))
    ? selectedBatchId
    : (batches[0]?.id ?? null)

  // Fetch batch day-wise attendance
  const {
    data: attendanceData,
    isLoading: aLoading,
    error: aError,
    refetch: aRefetch
  } = useQuery<{ records: AttendanceRecord[]; available_dates: string[] }>({
    queryKey: ['academics', 'attendance', activeBatchId, selectedDate],
    queryFn: () => api.get(`/academics/batch/${activeBatchId}/attendance?attendance_date=${selectedDate}`),
    enabled: !!activeBatchId && tab === 'attendance',
  })

  const availableDates = attendanceData?.available_dates ?? []

  // If selectedDate is not among recorded dates but recorded dates exist, and user hasn't actively changed,
  // we can allow the user to easily jump to the latest recorded date.
  const handleJumpToLatestRecordedDate = () => {
    if (availableDates.length > 0) {
      setSelectedDate(availableDates[0])
    }
  }

  // Fetch batch test scores (filtered by test_name if chosen)
  const {
    data: testScoresData,
    isLoading: tLoading,
    error: tError,
    refetch: tRefetch
  } = useQuery<{ records: TestScoreRecord[]; available_tests: TestMeta[] }>({
    queryKey: ['academics', 'test-scores', activeBatchId, selectedTestName],
    queryFn: () => {
      const q = selectedTestName ? `?test_name=${encodeURIComponent(selectedTestName)}` : ''
      return api.get(`/academics/batch/${activeBatchId}/test-scores${q}`)
    },
    enabled: !!activeBatchId && tab === 'tests',
  })

  const availableTests = testScoresData?.available_tests ?? []

  // Auto-select first test if none selected
  const activeTestName = selectedTestName && availableTests.some(t => t.test_name === selectedTestName)
    ? selectedTestName
    : (availableTests[0]?.test_name ?? '')

  // File preview parser mutation
  const handleFileSelect = (file: File) => {
    setSelectedFile(file)
    setIsParsing(true)
    const reader = new FileReader()
    reader.onload = async () => {
      const result = reader.result as string
      setFileBase64(result)
      try {
        const preview = await api.post<PreviewResponse>('/academics/parse-preview', {
          filename: file.name,
          file_data: result,
        })
        setPreviewData(preview)
      } catch (err: any) {
        toast.error(err.message || 'Failed to parse file preview')
        setPreviewData(null)
      } finally {
        setIsParsing(false)
      }
    }
    reader.readAsDataURL(file)
  }

  // Submit bulk upload mutation
  const uploadMutation = useMutation({
    mutationFn: (data: { batch_id: number; filename: string; file_data: string }) => {
      const endpoint = uploadType === 'attendance'
        ? '/academics/attendance/bulk'
        : '/academics/test-scores/bulk'
      return api.post<any>(endpoint, data)
    },
    onSuccess: (res) => {
      toast.success(
        `Upload complete: ${res.inserted} inserted, ${res.updated} updated.`
      )
      if (res.errors?.length > 0) {
        toast.warning(`${res.errors.length} warnings during upload. Check console.`)
        console.warn('Upload errors/warnings:', res.errors)
      }
      qc.invalidateQueries({ queryKey: ['academics'] })
      setUploadOpen(false)
      setSelectedFile(null)
      setFileBase64('')
      setPreviewData(null)
    },
    onError: (err: ApiError) => {
      toast.error(err.message || 'Failed to upload records')
    },
  })

  // Download sample template handler
  const handleDownloadTemplate = async (kind: 'attendance' | 'tests', targetBatchId?: number | null) => {
    const bId = targetBatchId !== undefined ? targetBatchId : activeBatchId
    try {
      const endpoint = `/api/v1/academics/template/${kind}${bId ? `?batch_id=${bId}` : ''}`
      const res = await fetch(endpoint, { credentials: 'include' })
      if (!res.ok) throw new Error('Download failed')
      const blob = await res.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${kind}_template_${bId || 'batch'}.csv`
      document.body.appendChild(a)
      a.click()
      a.remove()
      window.URL.revokeObjectURL(url)
      toast.success('Template downloaded!')
    } catch {
      toast.error('Could not download template. Please try again.')
    }
  }

  // Quick day step
  const stepDate = (offsetDays: number) => {
    const parts = selectedDate.split('-').map(Number)
    const d = new Date(parts[0], parts[1] - 1, parts[2])
    d.setDate(d.getDate() + offsetDays)
    const yyyy = d.getFullYear()
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const dd = String(d.getDate()).padStart(2, '0')
    setSelectedDate(`${yyyy}-${mm}-${dd}`)
  }

  const attendanceRecords = attendanceData?.records ?? []
  const testRecords = testScoresData?.records ?? []
  const currentTestMeta = availableTests.find(t => t.test_name === activeTestName)

  return (
    <div className="space-y-5">
      <PageHeader
        title="Academics"
        subtitle="Manage day-wise attendance and test evaluations per batch by centre."
        action={
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => handleDownloadTemplate(tab)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl border border-gray-200/90 bg-white text-gray-700 hover:text-gray-900 hover:bg-gray-50 text-xs font-semibold shadow-2xs transition-colors cursor-pointer"
            >
              <Download size={14} className="text-[#059669]" />
              <span>Download Template</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setUploadType(tab)
                setModalBatchId(activeBatchId)
                setSelectedFile(null)
                setFileBase64('')
                setPreviewData(null)
                setUploadOpen(true)
              }}
              className="btn-primary text-xs flex items-center gap-1.5"
            >
              <Upload size={14} />
              <span>Upload CSV / Excel</span>
            </button>
          </div>
        }
      />

      {/* ── Main Filter Bar: Tabs, Centre Selector, Batch Selector ── */}
      <div className="bg-white rounded-2xl border border-gray-100/90 shadow-xs p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
        {/* Tab pills */}
        <div className="inline-flex items-center p-1 bg-gray-100 rounded-full text-xs font-semibold select-none shrink-0">
          <button
            type="button"
            onClick={() => setTab('attendance')}
            className={clsx(
              'px-4 py-1.5 rounded-full transition-all cursor-pointer flex items-center gap-1.5',
              tab === 'attendance'
                ? 'bg-[#059669] text-white shadow-2xs'
                : 'text-gray-600 hover:text-gray-900'
            )}
          >
            <Calendar size={13} />
            <span>Attendance</span>
          </button>
          <button
            type="button"
            onClick={() => setTab('tests')}
            className={clsx(
              'px-4 py-1.5 rounded-full transition-all cursor-pointer flex items-center gap-1.5',
              tab === 'tests'
                ? 'bg-[#059669] text-white shadow-2xs'
                : 'text-gray-600 hover:text-gray-900'
            )}
          >
            <GraduationCap size={14} />
            <span>Test Scores</span>
          </button>
        </div>

        {/* Centre & Batch dropdowns */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Centre selector */}
          <div className="flex items-center gap-1.5 text-xs">
            <span className="font-semibold text-gray-500 flex items-center gap-1">
              <Building2 size={13} className="text-gray-400" /> Centre:
            </span>
            <div className="relative">
              <select
                value={selectedCentreId ?? ''}
                onChange={e => {
                  const val = e.target.value ? Number(e.target.value) : null
                  setSelectedCentreId(val)
                }}
                className="appearance-none bg-gray-50/80 hover:bg-gray-100 border border-gray-200/90 rounded-xl px-3 py-1.5 pr-8 text-xs font-semibold text-gray-800 shadow-2xs cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#059669]/20"
              >
                <option value="">All Centres</option>
                {centres.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.city})
                  </option>
                ))}
              </select>
              <ChevronDown size={13} className="text-gray-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
          </div>

          {/* Batch selector */}
          <div className="flex items-center gap-1.5 text-xs">
            <span className="font-semibold text-gray-500 flex items-center gap-1">
              <Filter size={13} className="text-gray-400" /> Batch:
            </span>
            <div className="relative">
              <select
                value={activeBatchId ?? ''}
                onChange={e => setSelectedBatchId(Number(e.target.value))}
                className="appearance-none bg-gray-50/80 hover:bg-gray-100 border border-gray-200/90 rounded-xl px-3 py-1.5 pr-8 text-xs font-semibold text-gray-800 shadow-2xs cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#059669]/20"
              >
                {batches.length === 0 ? (
                  <option value="">No batches for centre</option>
                ) : (
                  batches.map(b => (
                    <option key={b.id} value={b.id}>
                      {b.name} · {b.centre_name} ({b.course})
                    </option>
                  ))
                )}
              </select>
              <ChevronDown size={13} className="text-gray-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
          </div>
        </div>
      </div>

      {/* ─────────── VIEW 1: DAY-WISE ATTENDANCE ─────────── */}
      {tab === 'attendance' && (
        <div className="space-y-4">
          {/* Day selection toolbar */}
          <div className="bg-white rounded-2xl border border-gray-100/90 shadow-xs p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-gray-500">Date:</span>

              {/* Prev day */}
              <button
                type="button"
                onClick={() => stepDate(-1)}
                title="Previous Day"
                className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-600 transition-colors cursor-pointer"
              >
                <ChevronLeft size={15} />
              </button>

              {/* Native Calendar Date Input */}
              <div className="relative">
                <input
                  type="date"
                  value={selectedDate}
                  onChange={e => {
                    if (e.target.value) setSelectedDate(e.target.value)
                  }}
                  className="bg-gray-50/80 border border-gray-200/90 rounded-xl px-3 py-1.5 text-xs font-semibold text-gray-800 shadow-2xs focus:outline-none focus:ring-2 focus:ring-[#059669]/20 cursor-pointer"
                />
              </div>

              {/* Next day */}
              <button
                type="button"
                onClick={() => stepDate(1)}
                title="Next Day"
                className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-600 transition-colors cursor-pointer"
              >
                <ChevronRight size={15} />
              </button>

              {/* Today button */}
              <button
                type="button"
                onClick={() => setSelectedDate(new Date().toISOString().split('T')[0])}
                className="px-2.5 py-1.5 rounded-xl border border-gray-200 text-xs font-semibold text-gray-600 hover:bg-gray-50 transition-colors cursor-pointer"
              >
                Today
              </button>
            </div>

            {/* Quick jump to dates that already have attendance */}
            {availableDates.length > 0 && (
              <div className="flex items-center gap-2 text-xs">
                <span className="text-gray-400 font-medium">Recorded dates ({availableDates.length}):</span>
                <div className="relative">
                  <select
                    value={availableDates.includes(selectedDate) ? selectedDate : ''}
                    onChange={e => {
                      if (e.target.value) setSelectedDate(e.target.value)
                    }}
                    className="appearance-none bg-gray-50/80 hover:bg-gray-100 border border-gray-200/90 rounded-xl px-2.5 py-1.5 pr-7 text-xs font-semibold text-gray-700 shadow-2xs cursor-pointer focus:outline-none"
                  >
                    <option value="" disabled>Select recorded date</option>
                    {availableDates.map(d => (
                      <option key={d} value={d}>
                        {formatDayWithWeekday(d)}
                      </option>
                    ))}
                  </select>
                  <ChevronDown size={12} className="text-gray-400 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
              </div>
            )}
          </div>

          {/* Day Table */}
          {aLoading ? (
            <TableSkeleton />
          ) : aError ? (
            <ErrorState message="Could not load attendance for this date" onRetry={aRefetch} />
          ) : attendanceRecords.length === 0 ? (
            <EmptyState
              icon={<Calendar size={36} className="text-gray-400" />}
              title={`No attendance recorded for ${formatDate(selectedDate)}`}
              description="You can pick a date using the calendar above or upload an Excel / CSV spreadsheet for this day."
              action={
                <div className="flex items-center gap-2">
                  {availableDates.length > 0 && !availableDates.includes(selectedDate) && (
                    <button
                      type="button"
                      onClick={handleJumpToLatestRecordedDate}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-gray-200 bg-white text-gray-700 text-xs font-semibold hover:bg-gray-50 transition-colors cursor-pointer"
                    >
                      <Calendar size={13} className="text-[#059669]" />
                      <span>Jump to Latest Recorded ({formatDate(availableDates[0])})</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setUploadType('attendance')
                      setUploadOpen(true)
                    }}
                    className="btn-primary text-xs flex items-center gap-1.5 cursor-pointer"
                  >
                    <Upload size={14} />
                    <span>Upload Attendance</span>
                  </button>
                </div>
              }
            />
          ) : (
            <div className="bg-white rounded-2xl border border-gray-100/90 shadow-xs overflow-hidden">
              {/* Day header banner */}
              <div className="px-6 py-3.5 bg-gray-50/70 border-b border-gray-100 flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-gray-500">Day View:</span>
                  <span className="font-bold text-gray-900">{formatDayWithWeekday(selectedDate)}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-semibold text-gray-600">{attendanceRecords.length} students</span>
                  <span className="inline-flex items-center gap-1 text-[#059669] font-bold">
                    <span className="w-2 h-2 rounded-full bg-[#059669]" />
                    {attendanceRecords.filter(r => r.present).length} Present
                  </span>
                  <span className="inline-flex items-center gap-1 text-[#DC2626] font-bold">
                    <span className="w-2 h-2 rounded-full bg-[#DC2626]" />
                    {attendanceRecords.filter(r => !r.present).length} Absent
                  </span>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="bg-[#E8F8F0] border-b border-gray-100">
                      <th className="px-6 py-3.5 text-left text-xs font-bold text-[#059669] uppercase tracking-wider">Student</th>
                      <th className="px-6 py-3.5 text-left text-xs font-bold text-[#059669] uppercase tracking-wider">Student Code</th>
                      <th className="px-6 py-3.5 text-left text-xs font-bold text-[#059669] uppercase tracking-wider">Date</th>
                      <th className="px-6 py-3.5 text-center text-xs font-bold text-[#059669] uppercase tracking-wider">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100/90">
                    {attendanceRecords.map(r => (
                      <tr key={r.id} className="h-14 hover:bg-[#F9FCFA] transition-colors">
                        <td className="px-6 py-4 text-sm font-bold text-gray-900">{r.student_name}</td>
                        <td className="px-6 py-4 text-xs font-mono text-gray-500">{r.student_code}</td>
                        <td className="px-6 py-4 text-sm text-gray-700 font-medium">{formatDate(r.date)}</td>
                        <td className="px-6 py-4 text-center">
                          {r.present ? (
                            <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold bg-[#E8F8F0] text-[#059669]">
                              <Check size={12} /> Present
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold bg-[#FEE2E2] text-[#DC2626]">
                              <X size={12} /> Absent
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ─────────── VIEW 2: TEST-WISE TEST SCORES ─────────── */}
      {tab === 'tests' && (
        <div className="space-y-4">
          {/* Test selection toolbar */}
          {availableTests.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-100/90 shadow-xs p-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-semibold text-gray-500">Select Test:</span>
                <div className="relative">
                  <select
                    value={activeTestName}
                    onChange={e => setSelectedTestName(e.target.value)}
                    className="appearance-none bg-gray-50/80 hover:bg-gray-100 border border-gray-200/90 rounded-xl px-3.5 py-1.5 pr-8 text-xs font-bold text-gray-800 shadow-2xs cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#059669]/20"
                  >
                    {availableTests.map(t => (
                      <option key={t.test_name} value={t.test_name}>
                        {t.test_name} · {formatDate(t.test_date)} (Max: {t.max_score})
                      </option>
                    ))}
                  </select>
                  <ChevronDown size={13} className="text-gray-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
              </div>

              {/* Quick test pills */}
              <div className="flex flex-wrap items-center gap-1.5">
                {availableTests.slice(0, 4).map(t => (
                  <button
                    key={t.test_name}
                    type="button"
                    onClick={() => setSelectedTestName(t.test_name)}
                    className={clsx(
                      "px-3 py-1 rounded-full text-xs font-semibold transition-all cursor-pointer",
                      activeTestName === t.test_name
                        ? "bg-[#059669] text-white shadow-2xs"
                        : "bg-gray-100 text-gray-600 hover:bg-gray-200/70"
                    )}
                  >
                    {t.test_name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Test Table */}
          {tLoading ? (
            <TableSkeleton />
          ) : tError ? (
            <ErrorState message="Could not load test scores" onRetry={tRefetch} />
          ) : availableTests.length === 0 ? (
            <EmptyState
              icon={<GraduationCap size={36} className="text-gray-400" />}
              title="No tests recorded for this batch"
              description="Upload student test scores using Excel or CSV to review performance."
              action={
                <button
                  type="button"
                  onClick={() => {
                    setUploadType('tests')
                    setUploadOpen(true)
                  }}
                  className="btn-primary text-xs flex items-center gap-1.5 cursor-pointer"
                >
                  <Upload size={14} />
                  <span>Upload Test Scores</span>
                </button>
              }
            />
          ) : (
            <div className="bg-white rounded-2xl border border-gray-100/90 shadow-xs overflow-hidden">
              {/* Test details banner */}
              <div className="px-6 py-3.5 bg-gray-50/70 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-gray-900 text-sm">{activeTestName}</span>
                  {currentTestMeta?.test_date && (
                    <span className="text-gray-400">· Conducted on {formatDate(currentTestMeta.test_date)}</span>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-semibold text-gray-600">{testRecords.length} students</span>
                  <span className="font-semibold text-gray-500">
                    Max Marks: <span className="font-bold text-[#059669]">{currentTestMeta?.max_score ?? 100}</span>
                  </span>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="bg-[#E8F8F0] border-b border-gray-100">
                      <th className="px-6 py-3.5 text-left text-xs font-bold text-[#059669] uppercase tracking-wider">Student</th>
                      <th className="px-6 py-3.5 text-left text-xs font-bold text-[#059669] uppercase tracking-wider">Student Code</th>
                      <th className="px-6 py-3.5 text-left text-xs font-bold text-[#059669] uppercase tracking-wider">Date</th>
                      <th className="px-6 py-3.5 text-right text-xs font-bold text-[#059669] uppercase tracking-wider">Score</th>
                      <th className="px-6 py-3.5 text-center text-xs font-bold text-[#059669] uppercase tracking-wider">Percentage</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100/90">
                    {testRecords.map(r => (
                      <tr key={r.id} className="h-14 hover:bg-[#F9FCFA] transition-colors">
                        <td className="px-6 py-4 text-sm font-bold text-gray-900">{r.student_name}</td>
                        <td className="px-6 py-4 text-xs font-mono text-gray-500">{r.student_code}</td>
                        <td className="px-6 py-4 text-sm text-gray-600 font-medium">{formatDate(r.test_date)}</td>
                        <td className="px-6 py-4 text-right tabular-nums text-sm font-bold text-gray-900">
                          {r.score} <span className="text-gray-400 font-normal">/ {r.max_score}</span>
                        </td>
                        <td className="px-6 py-4 text-center">
                          <span className={clsx(
                            'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold tabular-nums',
                            r.percentage >= 75 ? 'bg-[#E8F8F0] text-[#059669]' :
                            r.percentage >= 50 ? 'bg-amber-50 text-amber-700' : 'bg-[#FEE2E2] text-[#DC2626]'
                          )}>
                            {r.percentage}%
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Bulk Upload Modal Dialog ────────────────────────────────────────── */}
      <Dialog.Root open={uploadOpen} onOpenChange={setUploadOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2 w-full max-w-2xl bg-white rounded-2xl shadow-xl p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-4 border-b border-gray-100">
              <div>
                <Dialog.Title className="text-lg font-bold text-gray-900 tracking-tight">
                  Bulk Upload {uploadType === 'attendance' ? 'Attendance' : 'Test Scores'}
                </Dialog.Title>
                <div className="flex items-center gap-2 mt-1.5">
                  <span className="text-xs font-semibold text-gray-500">Target Batch:</span>
                  <div className="relative">
                    <select
                      value={modalBatchId ?? activeBatchId ?? ''}
                      onChange={e => setModalBatchId(Number(e.target.value))}
                      className="appearance-none bg-gray-50/90 hover:bg-gray-100 border border-gray-200/90 rounded-lg px-2.5 py-1 pr-7 text-xs font-semibold text-gray-800 cursor-pointer focus:outline-none focus:ring-1 focus:ring-[#059669]"
                    >
                      {batches.map(b => (
                        <option key={b.id} value={b.id}>
                          {b.name} · {b.centre_name}
                        </option>
                      ))}
                    </select>
                    <ChevronDown size={12} className="text-gray-400 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
                  </div>
                </div>
              </div>
              <Dialog.Close className="p-1 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors">
                <X size={18} />
              </Dialog.Close>
            </div>

            {/* Upload Type toggle pills in modal */}
            <div className="flex gap-2 mt-4 mb-5">
              <button
                type="button"
                onClick={() => setUploadType('attendance')}
                className={clsx(
                  'px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer',
                  uploadType === 'attendance'
                    ? 'bg-[#059669] text-white shadow-2xs'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200/70'
                )}
              >
                Attendance
              </button>
              <button
                type="button"
                onClick={() => setUploadType('tests')}
                className={clsx(
                  'px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer',
                  uploadType === 'tests'
                    ? 'bg-[#059669] text-white shadow-2xs'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200/70'
                )}
              >
                Test Scores
              </button>
            </div>

            {/* Drop / Browse area */}
            <input
              type="file"
              ref={fileInputRef}
              accept=".csv, .xlsx, .xls"
              className="hidden"
              onChange={e => {
                const file = e.target.files?.[0]
                if (file) handleFileSelect(file)
              }}
            />

            <div
              onClick={() => fileInputRef.current?.click()}
              className={clsx(
                'border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all flex flex-col items-center justify-center',
                selectedFile
                  ? 'border-[#059669] bg-[#E8F8F0]/30'
                  : 'border-gray-200 hover:border-gray-300 bg-gray-50/50 hover:bg-gray-50'
              )}
            >
              <div className="w-12 h-12 rounded-2xl bg-white shadow-2xs flex items-center justify-center text-[#059669] mb-3">
                <FileSpreadsheet size={24} />
              </div>
              <p className="text-sm font-bold text-gray-900">
                {selectedFile ? selectedFile.name : 'Click to choose or drag & drop CSV or Excel file'}
              </p>
              <p className="text-xs text-gray-500 mt-1">
                Supports <span className="font-semibold text-gray-700">.xlsx</span> and <span className="font-semibold text-gray-700">.csv</span> formats
              </p>
            </div>

            {/* Parsing spinner */}
            {isParsing && (
              <div className="flex items-center justify-center gap-2 py-4 text-xs font-semibold text-gray-500">
                <Loader2 size={16} className="animate-spin text-[#059669]" />
                <span>Reading and validating spreadsheet...</span>
              </div>
            )}

            {/* Live Preview Table */}
            {previewData && (
              <div className="mt-5 space-y-2">
                <div className="flex items-center justify-between text-xs font-semibold text-gray-600">
                  <span>Preview ({previewData.total} rows detected)</span>
                  <span className="text-[#059669] flex items-center gap-1 font-bold">
                    <CheckCircle size={14} /> Ready to import
                  </span>
                </div>

                <div className="border border-gray-100 rounded-xl overflow-hidden max-h-48 overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-100 text-gray-600">
                        {previewData.headers.map(h => (
                          <th key={h} className="px-3 py-2 text-left font-bold uppercase">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100/80">
                      {previewData.preview_rows.map((row, idx) => (
                        <tr key={idx} className="hover:bg-gray-50">
                          {previewData.headers.map(h => (
                            <td key={h} className="px-3 py-2 text-gray-800">{row[h] || '—'}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Modal Actions */}
            <div className="flex items-center justify-between gap-3 mt-6 pt-4 border-t border-gray-100">
              <button
                type="button"
                onClick={() => handleDownloadTemplate(uploadType, modalBatchId ?? activeBatchId)}
                className="text-xs font-semibold text-[#059669] hover:underline flex items-center gap-1 cursor-pointer"
              >
                <Download size={13} />
                <span>Download Sample Format ({batches.find(b => b.id === (modalBatchId ?? activeBatchId))?.name || 'Batch'})</span>
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setUploadOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-gray-600 hover:bg-gray-100 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={!selectedFile || !(modalBatchId ?? activeBatchId) || uploadMutation.isPending || isParsing}
                  onClick={() => {
                    const targetBatch = modalBatchId ?? activeBatchId
                    if (targetBatch && selectedFile) {
                      uploadMutation.mutate({
                        batch_id: targetBatch,
                        filename: selectedFile.name,
                        file_data: fileBase64,
                      })
                    }
                  }}
                  className="btn-primary text-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {uploadMutation.isPending && <Loader2 size={14} className="animate-spin" />}
                  <span>Commit Upload</span>
                </button>
              </div>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  )
}

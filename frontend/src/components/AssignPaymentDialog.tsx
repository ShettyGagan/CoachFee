import { useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { X, Loader2, Search } from 'lucide-react'
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query'
import { api, ApiError } from '../lib/api'
import { formatINR } from '../lib/formatINR'
import { toast } from 'sonner'
import { useDebounce } from '../lib/useDebounce'

interface Student {
  student_id: number
  name: string
  student_code: string
  batch_name: string
  balance_paise: number
}

interface AssignPaymentDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  paymentId: number
  paymentAmount: number
}

export function AssignPaymentDialog({ open, onOpenChange, paymentId, paymentAmount }: AssignPaymentDialogProps) {
  const qc = useQueryClient()
  const [q, setQ] = useState('')
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null)
  const [error, setError] = useState('')
  const debouncedQ = useDebounce(q, 300)

  const { data: studentsData } = useQuery<{ items: Student[] }>({
    queryKey: ['students-search', debouncedQ],
    queryFn: () => api.get(`/students?q=${encodeURIComponent(debouncedQ)}&limit=10`),
    enabled: debouncedQ.length >= 2,
  })

  const mutation = useMutation({
    mutationFn: (studentId: number) =>
      api.post(`/payments/${paymentId}/allocate`, { student_id: studentId }),
    onSuccess: () => {
      toast.success(`Allocated to ${selectedStudent?.student_code}. Receipt issued.`)
      qc.invalidateQueries({ queryKey: ['unmatched'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
      qc.invalidateQueries({ queryKey: ['students'] })
      if (selectedStudent) qc.invalidateQueries({ queryKey: ['ledger', selectedStudent.student_id] })
      onOpenChange(false)
    },
    onError: (err: ApiError) => {
      if (err.code === 'NOTHING_TO_ALLOCATE') setError('This student has no open instalments.')
      else setError(err.message)
    },
  })

  const handleClose = () => {
    onOpenChange(false)
    setQ('')
    setSelectedStudent(null)
    setError('')
  }

  return (
    <Dialog.Root open={open} onOpenChange={v => !v && handleClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2 w-full max-w-md bg-white rounded-xl shadow-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <Dialog.Title className="text-base font-semibold text-gray-900">Assign payment</Dialog.Title>
            <Dialog.Close onClick={handleClose} className="text-muted-foreground hover:text-gray-700"><X size={18} /></Dialog.Close>
          </div>

          <p className="text-sm text-muted-foreground mb-4">
            Assigning <span className="font-semibold text-gray-900">{formatINR(paymentAmount)}</span>
          </p>

          <div className="relative mb-2">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={q}
              onChange={e => { setQ(e.target.value); setSelectedStudent(null); setError('') }}
              placeholder="Search student by name or code..."
              className="input w-full pl-9"
            />
          </div>

          {!selectedStudent && debouncedQ.length >= 2 && studentsData?.items && (
            <div className="border border-border rounded-md divide-y divide-border mb-4 max-h-48 overflow-y-auto">
              {studentsData.items.length === 0 ? (
                <p className="text-sm text-muted-foreground p-3">No students found</p>
              ) : studentsData.items.map(s => (
                <button
                  key={s.student_id}
                  onClick={() => { setSelectedStudent(s); setQ(s.name) }}
                  className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-gray-50 transition-colors text-left"
                >
                  <div>
                    <p className="text-sm font-medium text-gray-900">{s.name}</p>
                    <p className="text-xs text-muted-foreground">{s.student_code} · {s.batch_name}</p>
                  </div>
                  <span className="text-sm font-medium tabular-nums text-gray-700">{formatINR(s.balance_paise)}</span>
                </button>
              ))}
            </div>
          )}

          {selectedStudent && (
            <div className="bg-brand-soft rounded-lg p-3 mb-4 text-sm">
              <p className="font-medium text-gray-900">{selectedStudent.name}</p>
              <p className="text-muted-foreground">{selectedStudent.student_code} · {selectedStudent.batch_name}</p>
              <p className="text-muted-foreground">Balance: {formatINR(selectedStudent.balance_paise)}</p>
            </div>
          )}

          {error && <p className="text-sm text-danger mb-3">{error}</p>}

          <button
            onClick={() => selectedStudent && mutation.mutate(selectedStudent.student_id)}
            disabled={!selectedStudent || mutation.isPending}
            className="btn-primary w-full flex items-center justify-center gap-2"
          >
            {mutation.isPending && <Loader2 size={16} className="animate-spin" />}
            Assign payment
          </button>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}


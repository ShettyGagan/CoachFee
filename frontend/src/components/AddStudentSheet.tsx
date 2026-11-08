import { useState } from 'react'
import { X, Loader2 } from 'lucide-react'
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { api, ApiError } from '../lib/api'
import { formatINR } from '../lib/formatINR'
import { toast } from 'sonner'

interface Batch {
  id: number
  name: string
  centre_name: string
  course: string
  total_fee_paise: number
  registration_fee_paise: number
  instalment_count: number
}

interface AddStudentSheetProps {
  open: boolean
  onClose: () => void
}

export function AddStudentSheet({ open, onClose }: AddStudentSheetProps) {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [form, setForm] = useState({
    full_name: '',
    guardian_name: '',
    guardian_phone: '',
    batch_id: '',
    language: 'en' as 'en' | 'hi',
    discount_paise: '',
    discount_reason: '',
  })
  const [error, setError] = useState('')

  const { data: batchesData } = useQuery<{ items: Batch[] }>({
    queryKey: ['batches'],
    queryFn: () => api.get('/batches'),
    enabled: open,
  })

  const selectedBatch = batchesData?.items.find(b => b.id === Number(form.batch_id))

  const mutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => api.post<{ student_id: number; student_code: string }>('/students', data),
    onSuccess: (data) => {
      toast.success(`Student ${data.student_code} enrolled successfully.`)
      qc.invalidateQueries({ queryKey: ['students'] })
      onClose()
      navigate(`/staff/students/${data.student_id}`)
      resetForm()
    },
    onError: (err: ApiError) => {
      if (err.code === 'DUPLICATE_PHONE') setError('A student with this phone number already exists.')
      else setError(err.message)
    },
  })

  const resetForm = () => {
    setForm({ full_name: '', guardian_name: '', guardian_phone: '', batch_id: '', language: 'en', discount_paise: '', discount_reason: '' })
    setError('')
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!form.batch_id) { setError('Please select a batch.'); return }
    const discountPaise = form.discount_paise ? Math.round(parseFloat(form.discount_paise) * 100) : 0
    mutation.mutate({
      full_name: form.full_name.trim(),
      guardian_name: form.guardian_name,
      guardian_phone: `+91${form.guardian_phone}`,
      batch_id: Number(form.batch_id),
      language: form.language,
      discount_paise: discountPaise,
      discount_reason: form.discount_reason || null,
    })
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={() => { onClose(); resetForm() }} />
      <div className="relative w-full max-w-md bg-white h-full overflow-y-auto shadow-xl flex flex-col">
        <div className="flex items-center justify-between p-6 border-b border-border shrink-0">
          <h2 className="font-semibold text-gray-900 text-lg">Add student</h2>
          <button onClick={() => { onClose(); resetForm() }} className="text-muted-foreground hover:text-gray-700">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 p-6 space-y-4 overflow-y-auto">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Full name</label>
            <input value={form.full_name} onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))} className="input w-full" required placeholder="Ravi Kumar Sharma" />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Guardian name</label>
            <input value={form.guardian_name} onChange={e => setForm(f => ({ ...f, guardian_name: e.target.value }))} className="input w-full" required />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Guardian phone</label>
            <div className="flex gap-2">
              <span className="input flex items-center px-3 bg-gray-50 text-sm text-gray-600 font-medium shrink-0">+91</span>
              <input
                type="tel"
                value={form.guardian_phone}
                onChange={e => setForm(f => ({ ...f, guardian_phone: e.target.value.replace(/\D/g, '').slice(0, 10) }))}
                placeholder="9000000001"
                className="input flex-1"
                maxLength={10}
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Batch</label>
            <select
              value={form.batch_id}
              onChange={e => setForm(f => ({ ...f, batch_id: e.target.value }))}
              className="input w-full"
              required
            >
              <option value="">Select batch...</option>
              {batchesData?.items.map(b => (
                <option key={b.id} value={b.id}>
                  {b.name} · {b.centre_name} · {b.course}
                </option>
              ))}
            </select>
          </div>

          {selectedBatch && (
            <div className="bg-brand-soft rounded-lg p-3 text-sm space-y-1">
              <p className="text-muted-foreground">Total fee: <span className="font-medium text-gray-900">{formatINR(selectedBatch.total_fee_paise)}</span></p>
              <p className="text-muted-foreground">Registration fee: <span className="font-medium text-gray-900">{formatINR(selectedBatch.registration_fee_paise)}</span></p>
              <p className="text-muted-foreground">Instalments: <span className="font-medium text-gray-900">{selectedBatch.instalment_count}</span></p>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Communication language</label>
            <select value={form.language} onChange={e => setForm(f => ({ ...f, language: e.target.value as 'en' | 'hi' }))} className="input w-full">
              <option value="en">English</option>
              <option value="hi">Hindi</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Discount (₹) <span className="text-muted-foreground font-normal">optional</span></label>
            <input
              type="number"
              value={form.discount_paise}
              onChange={e => setForm(f => ({ ...f, discount_paise: e.target.value }))}
              placeholder="0"
              min="0"
              step="1"
              className="input w-full"
            />
          </div>

          {form.discount_paise && parseFloat(form.discount_paise) > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Discount reason</label>
              <input
                value={form.discount_reason}
                onChange={e => setForm(f => ({ ...f, discount_reason: e.target.value }))}
                placeholder="Merit, sibling, staff..."
                className="input w-full"
              />
            </div>
          )}

          {error && <p className="text-sm text-danger">{error}</p>}

          <button type="submit" disabled={mutation.isPending} className="btn-primary w-full flex items-center justify-center gap-2 mt-2">
            {mutation.isPending && <Loader2 size={16} className="animate-spin" />}
            Add student
          </button>
        </form>
      </div>
    </div>
  )
}


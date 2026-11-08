import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Loader2, X } from 'lucide-react'
import * as Dialog from '@radix-ui/react-dialog'
import { api, ApiError } from '../../lib/api'
import { formatINR, formatDate } from '../../lib/formatINR'
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
  centre_name: string
  course: string
  course_start: string
  course_end: string
  total_fee_paise: number
  registration_fee_paise: number
  instalment_count: number
  gap_months: number
  first_due_date: string
}

function AddCentreDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const qc = useQueryClient()
  const [name, setName] = useState('')
  const [city, setCity] = useState('')
  const [error, setError] = useState('')

  const mutation = useMutation({
    mutationFn: () => api.post('/centres', { name, city }),
    onSuccess: () => {
      toast.success('Centre added.')
      qc.invalidateQueries({ queryKey: ['centres'] })
      onOpenChange(false)
      setName(''); setCity(''); setError('')
    },
    onError: (err: ApiError) => {
      if (err.code === 'CONFLICT') setError('A centre with this name already exists.')
      else setError(err.message)
    },
  })

  return (
    <Dialog.Root open={open} onOpenChange={v => { onOpenChange(v); if (!v) { setName(''); setCity(''); setError('') } }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2 w-full max-w-sm bg-white rounded-xl shadow-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <Dialog.Title className="text-base font-semibold text-gray-900">Add centre</Dialog.Title>
            <Dialog.Close className="text-muted-foreground hover:text-gray-700"><X size={18} /></Dialog.Close>
          </div>
          <form onSubmit={e => { e.preventDefault(); mutation.mutate() }} className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
              <input value={name} onChange={e => { setName(e.target.value); setError('') }} className="input w-full" required placeholder="Mansarovar Branch" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">City</label>
              <input value={city} onChange={e => setCity(e.target.value)} className="input w-full" required placeholder="Jaipur" />
            </div>
            {error && <p className="text-sm text-danger">{error}</p>}
            <button type="submit" disabled={mutation.isPending} className="btn-primary w-full flex items-center justify-center gap-2">
              {mutation.isPending && <Loader2 size={15} className="animate-spin" />}
              Add centre
            </button>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

function AddBatchDialog({ open, onOpenChange, centres }: { open: boolean; onOpenChange: (v: boolean) => void; centres: Centre[] }) {
  const qc = useQueryClient()
  const [form, setForm] = useState({
    centre_id: '', name: '', course: 'JEE',
    course_start: '', course_end: '',
    total_fee_rs: '', registration_fee_rs: '',
    instalment_count: '4', gap_months: '3',
    first_due_date: '',
  })
  const [error, setError] = useState('')

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  const mutation = useMutation({
    mutationFn: () => {
      const totalFee = Math.round(parseFloat(form.total_fee_rs) * 100)
      const regFee = Math.round(parseFloat(form.registration_fee_rs) * 100)
      if (regFee > totalFee) { setError('Registration fee cannot exceed total fee.'); throw new Error('Invalid fee') }
      if (form.course_end <= form.course_start) { setError('End date must be after start date.'); throw new Error('Invalid dates') }
      return api.post('/batches', {
        centre_id: Number(form.centre_id),
        name: form.name,
        course: form.course,
        course_start: form.course_start,
        course_end: form.course_end,
        total_fee_paise: totalFee,
        registration_fee_paise: regFee,
        instalment_count: Number(form.instalment_count),
        gap_months: Number(form.gap_months),
        first_due_date: form.first_due_date,
      })
    },
    onSuccess: () => {
      toast.success('Batch added.')
      qc.invalidateQueries({ queryKey: ['batches'] })
      onOpenChange(false)
    },
    onError: (err: ApiError) => {
      if (err.message) setError(err.message)
    },
  })

  return (
    <Dialog.Root open={open} onOpenChange={v => { onOpenChange(v); if (!v) { setError('') } }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2 w-full max-w-md bg-white rounded-xl shadow-xl p-6 max-h-[90vh] overflow-y-auto">
          <div className="flex items-center justify-between mb-4">
            <Dialog.Title className="text-base font-semibold text-gray-900">Add batch</Dialog.Title>
            <Dialog.Close className="text-muted-foreground hover:text-gray-700"><X size={18} /></Dialog.Close>
          </div>
          <form onSubmit={e => { e.preventDefault(); mutation.mutate() }} className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Centre</label>
              <select value={form.centre_id} onChange={set('centre_id')} className="input w-full" required>
                <option value="">Select centre…</option>
                {centres.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Batch name</label>
              <input value={form.name} onChange={set('name')} className="input w-full" required placeholder="JEE 2027 Batch A" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Course</label>
              <select value={form.course} onChange={set('course')} className="input w-full">
                <option value="JEE">JEE</option>
                <option value="NEET">NEET</option>
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Start date</label>
                <input type="date" value={form.course_start} onChange={set('course_start')} className="input w-full" required />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">End date</label>
                <input type="date" value={form.course_end} onChange={set('course_end')} className="input w-full" required />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Total fee (₹)</label>
                <input type="number" value={form.total_fee_rs} onChange={set('total_fee_rs')} className="input w-full" required min="1" placeholder="120000" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Registration fee (₹)</label>
                <input type="number" value={form.registration_fee_rs} onChange={set('registration_fee_rs')} className="input w-full" required min="0" placeholder="5000" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Instalments</label>
                <input type="number" value={form.instalment_count} onChange={set('instalment_count')} className="input w-full" required min="1" max="12" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Gap (months)</label>
                <input type="number" value={form.gap_months} onChange={set('gap_months')} className="input w-full" required min="1" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">First instalment date</label>
              <input type="date" value={form.first_due_date} onChange={set('first_due_date')} className="input w-full" required />
            </div>
            {error && <p className="text-sm text-danger">{error}</p>}
            <button type="submit" disabled={mutation.isPending} className="btn-primary w-full flex items-center justify-center gap-2">
              {mutation.isPending && <Loader2 size={15} className="animate-spin" />}
              Add batch
            </button>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

export default function Setup() {
  const [tab, setTab] = useState<'centres' | 'batches'>('centres')
  const [addCentreOpen, setAddCentreOpen] = useState(false)
  const [addBatchOpen, setAddBatchOpen] = useState(false)

  const { data: centresData, isLoading: cLoading, error: cError, refetch: cRefetch } = useQuery<{ items: Centre[] }>({
    queryKey: ['centres'],
    queryFn: () => api.get('/centres'),
  })

  const { data: batchesData, isLoading: bLoading, error: bError, refetch: bRefetch } = useQuery<{ items: Batch[] }>({
    queryKey: ['batches'],
    queryFn: () => api.get('/batches'),
    enabled: tab === 'batches',
  })

  return (
    <div>
      <PageHeader
        title="Setup"
        action={
          tab === 'centres' ? (
            <button onClick={() => setAddCentreOpen(true)} className="btn-primary flex items-center gap-1.5">
              <Plus size={16} /> Add centre
            </button>
          ) : (
            <button onClick={() => setAddBatchOpen(true)} className="btn-primary flex items-center gap-1.5">
              <Plus size={16} /> Add batch
            </button>
          )
        }
      />

      <div className="flex border-b border-gray-200/80 mb-6">
        {(['centres', 'batches'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={clsx('px-5 py-2.5 text-sm transition-colors -mb-px capitalize cursor-pointer',
              tab === t ? 'border-b-2 border-[#059669] text-[#059669] font-bold' : 'text-gray-400 hover:text-gray-700 font-medium'
            )}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 'centres' && (
        <div>
          {cLoading ? <TableSkeleton /> :
           cError ? <ErrorState message="Could not load centres" onRetry={cRefetch} /> :
           !centresData?.items.length ? (
             <EmptyState title="No centres yet" description="Add the first centre." action={<button onClick={() => setAddCentreOpen(true)} className="btn-primary flex items-center gap-1.5"><Plus size={15} />Add centre</button>} />
           ) : (
            <div className="bg-white rounded-2xl border border-gray-100/90 shadow-xs overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="bg-[#E8F8F0] border-b border-gray-100">
                    <th className="px-6 py-3.5 text-left text-xs font-bold text-[#059669] uppercase tracking-wider">Name</th>
                    <th className="px-6 py-3.5 text-left text-xs font-bold text-[#059669] uppercase tracking-wider">City</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100/90">
                  {centresData.items.map(c => (
                    <tr key={c.id} className="h-14 hover:bg-[#F9FCFA] transition-colors">
                      <td className="px-6 py-4 text-sm font-bold text-gray-900">{c.name}</td>
                      <td className="px-6 py-4 text-sm text-gray-600 font-medium">{c.city}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
           )}
        </div>
      )}

      {tab === 'batches' && (
        <div>
          {bLoading ? <TableSkeleton /> :
           bError ? <ErrorState message="Could not load batches" onRetry={bRefetch} /> :
           !batchesData?.items.length ? (
             <EmptyState title="No batches yet" description="Add the first batch." action={<button onClick={() => setAddBatchOpen(true)} className="btn-primary flex items-center gap-1.5"><Plus size={15} />Add batch</button>} />
           ) : (
            <div className="bg-white rounded-2xl border border-gray-100/90 shadow-xs overflow-hidden overflow-x-auto">
              <table className="w-full min-w-[800px]">
                <thead>
                  <tr className="bg-[#E8F8F0] border-b border-gray-100">
                    {['Name', 'Centre', 'Course', 'Dates', 'Total fee', 'Reg fee', 'Instalments', 'First due'].map(h => (
                      <th key={h} className="px-6 py-3.5 text-left text-xs font-bold text-[#059669] uppercase tracking-wider whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100/90">
                  {batchesData.items.map(b => (
                    <tr key={b.id} className="h-16 hover:bg-[#F9FCFA] transition-colors">
                      <td className="px-6 py-4 text-sm font-bold text-gray-900">{b.name}</td>
                      <td className="px-6 py-4 text-sm text-gray-600 font-medium">{b.centre_name}</td>
                      <td className="px-6 py-4">
                        <span className={clsx('inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold', b.course === 'JEE' ? 'bg-blue-50 text-blue-700' : 'bg-purple-50 text-purple-700')}>{b.course}</span>
                      </td>
                      <td className="px-6 py-4 text-xs text-gray-500 whitespace-nowrap font-medium">
                        {formatDate(b.course_start)} – {formatDate(b.course_end)}
                      </td>
                      <td className="px-6 py-4 text-sm tabular-nums font-bold text-gray-900">{formatINR(b.total_fee_paise)}</td>
                      <td className="px-6 py-4 text-sm tabular-nums text-gray-600 font-medium">{formatINR(b.registration_fee_paise)}</td>
                      <td className="px-6 py-4 text-sm text-gray-700 font-medium">{b.instalment_count} × every {b.gap_months}mo</td>
                      <td className="px-6 py-4 text-sm text-gray-600 font-medium">{formatDate(b.first_due_date)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
           )}
        </div>
      )}

      <AddCentreDialog open={addCentreOpen} onOpenChange={setAddCentreOpen} />
      <AddBatchDialog open={addBatchOpen} onOpenChange={setAddBatchOpen} centres={centresData?.items ?? []} />
    </div>
  )
}


import { useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { X, Loader2 } from 'lucide-react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api, ApiError } from '../lib/api'
import { formatINR } from '../lib/formatINR'
import { toast } from 'sonner'
import { clsx } from 'clsx'

interface RecordPaymentDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  studentId?: number
  studentName?: string
}

type Method = 'cash' | 'cheque' | 'bank_transfer'

export function RecordPaymentDialog({ open, onOpenChange, studentId, studentName }: RecordPaymentDialogProps) {
  const qc = useQueryClient()
  const [amountRs, setAmountRs] = useState('')
  const [method, setMethod] = useState<Method>('cash')
  const [reference, setReference] = useState('')
  const [fieldError, setFieldError] = useState('')

  const mutation = useMutation({
    mutationFn: (data: { amount_paise: number; method: Method; reference?: string; student_id?: number }) =>
      api.post<{ payment_id: number; allocated_paise: number; unallocated_paise: number; receipts: { receipt_no: string; total_paise: number }[] }>('/payments', data),
    onSuccess: (data) => {
      const receipt = data.receipts?.[0]
      let msg = receipt
        ? `${formatINR(receipt.total_paise)} recorded and allocated. Receipt ${receipt.receipt_no}.`
        : 'Payment recorded.'
      if (data.unallocated_paise > 0) {
        msg += ` ${formatINR(data.unallocated_paise)} could not be allocated (no open instalments). It is in Unmatched payments.`
      }
      toast.success(msg)
      qc.invalidateQueries({ queryKey: ['students'] })
      if (studentId) {
        qc.invalidateQueries({ queryKey: ['ledger', studentId] })
      }
      qc.invalidateQueries({ queryKey: ['dashboard'] })
      qc.invalidateQueries({ queryKey: ['unmatched'] })
      onOpenChange(false)
      resetForm()
    },
    onError: (err: ApiError) => {
      if (err.code === 'DUPLICATE_PAYMENT') setFieldError('A payment with this reference already exists.')
      else toast.error(err.message)
    },
  })

  const resetForm = () => {
    setAmountRs('')
    setMethod('cash')
    setReference('')
    setFieldError('')
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setFieldError('')
    const amount = Math.round(parseFloat(amountRs) * 100)
    if (!amountRs || isNaN(amount) || amount <= 0) {
      setFieldError('Enter a valid amount.')
      return
    }
    if ((method === 'cheque' || method === 'bank_transfer') && !reference.trim()) {
      setFieldError('Reference is required for this payment method.')
      return
    }
    mutation.mutate({
      amount_paise: amount,
      method,
      reference: reference.trim() || undefined,
      student_id: studentId,
    })
  }

  return (
    <Dialog.Root open={open} onOpenChange={v => { onOpenChange(v); if (!v) resetForm() }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2 w-full max-w-md bg-white rounded-xl shadow-xl p-6">
          <div className="flex items-center justify-between mb-6">
            <Dialog.Title className="text-base font-semibold text-gray-900">Record payment</Dialog.Title>
            <Dialog.Close className="text-muted-foreground hover:text-gray-700"><X size={18} /></Dialog.Close>
          </div>

          {studentName && (
            <p className="text-sm text-muted-foreground mb-4">
              For <span className="text-gray-900 font-medium">{studentName}</span>
            </p>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Amount (₹)</label>
              <input
                type="number"
                value={amountRs}
                onChange={e => { setAmountRs(e.target.value); setFieldError('') }}
                placeholder="15000"
                min="1"
                step="1"
                className="input w-full"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Payment method</label>
              <div className="flex gap-2">
                {(['cash', 'cheque', 'bank_transfer'] as Method[]).map(m => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => { setMethod(m); setFieldError('') }}
                    className={clsx(
                      'flex-1 py-2 text-sm font-medium rounded-md border transition-colors',
                      method === m ? 'bg-primary text-white border-primary' : 'border-border text-gray-700 hover:bg-gray-50'
                    )}
                  >
                    {m === 'cash' ? 'Cash' : m === 'cheque' ? 'Cheque' : 'Bank transfer'}
                  </button>
                ))}
              </div>
            </div>

            {(method === 'cheque' || method === 'bank_transfer') && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Reference <span className="text-danger">*</span>
                </label>
                <input
                  type="text"
                  value={reference}
                  onChange={e => { setReference(e.target.value); setFieldError('') }}
                  placeholder={method === 'cheque' ? 'Cheque number' : 'UTR / transaction ID'}
                  className="input w-full"
                />
              </div>
            )}

            {fieldError && <p className="text-sm text-danger">{fieldError}</p>}

            <button type="submit" disabled={mutation.isPending} className="btn-primary w-full flex items-center justify-center gap-2">
              {mutation.isPending && <Loader2 size={16} className="animate-spin" />}
              Record payment
            </button>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}


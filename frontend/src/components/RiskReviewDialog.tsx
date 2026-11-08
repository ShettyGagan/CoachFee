import { useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { X, Loader2 } from 'lucide-react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api, ApiError } from '../lib/api'
import { toast } from 'sonner'

interface RiskReviewDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  flagId: number
  action: 'called' | 'false_flag'
  studentName: string
}

export function RiskReviewDialog({ open, onOpenChange, flagId, action, studentName }: RiskReviewDialogProps) {
  const qc = useQueryClient()
  const [note, setNote] = useState('')
  const [error, setError] = useState('')

  const mutation = useMutation({
    mutationFn: () =>
      api.patch(`/risk-flags/${flagId}`, { status: action === 'called' ? 'called' : 'false_flag', note: note.trim() || undefined }),
    onSuccess: () => {
      toast.success(action === 'called' ? 'Marked as called.' : 'Marked as false flag.')
      qc.invalidateQueries({ queryKey: ['risk-flags'] })
      onOpenChange(false)
      setNote('')
    },
    onError: (err: ApiError) => setError(err.message),
  })

  const handleClose = () => {
    onOpenChange(false)
    setNote('')
    setError('')
  }

  const isFalseFlag = action === 'false_flag'
  const isDisabled = isFalseFlag && !note.trim()

  return (
    <Dialog.Root open={open} onOpenChange={v => !v && handleClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2 w-full max-w-md bg-white rounded-xl shadow-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <Dialog.Title className="text-base font-semibold text-gray-900">
              {isFalseFlag ? 'Mark as false flag' : 'Mark as called'}
            </Dialog.Title>
            <Dialog.Close onClick={handleClose} className="text-muted-foreground hover:text-gray-700"><X size={18} /></Dialog.Close>
          </div>

          <p className="text-sm text-muted-foreground mb-4">
            {isFalseFlag
              ? `Marking ${studentName}'s flag as a false flag removes it from the open list.`
              : `Recording that you called ${studentName} about their fee/attendance.`}
          </p>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Note {isFalseFlag ? <span className="text-danger">*</span> : <span className="text-muted-foreground font-normal">(optional)</span>}
            </label>
            <textarea
              value={note}
              onChange={e => { setNote(e.target.value); setError('') }}
              placeholder={isFalseFlag ? 'Why is this a false flag?' : 'Call notes...'}
              rows={3}
              className="input w-full resize-none"
            />
          </div>

          {error && <p className="text-sm text-danger mt-2">{error}</p>}

          <div className="flex gap-3 justify-end mt-4">
            <Dialog.Close onClick={handleClose} asChild>
              <button className="btn-secondary">Cancel</button>
            </Dialog.Close>
            <button
              onClick={() => mutation.mutate()}
              disabled={isDisabled || mutation.isPending}
              className="btn-primary flex items-center gap-2"
            >
              {mutation.isPending && <Loader2 size={14} className="animate-spin" />}
              {isFalseFlag ? 'False flag' : 'Mark called'}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}


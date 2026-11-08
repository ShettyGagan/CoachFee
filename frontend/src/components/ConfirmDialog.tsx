import { ReactNode } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { X, Loader2 } from 'lucide-react'
import { clsx } from 'clsx'

interface ConfirmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  confirmLabel?: string
  cancelLabel?: string
  destructive?: boolean
  loading?: boolean
  onConfirm: () => void
  children?: ReactNode
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive = false,
  loading = false,
  onConfirm,
  children,
}: ConfirmDialogProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40 animate-in fade-in-0" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2 w-full max-w-md bg-white rounded-xl shadow-xl p-6 animate-in fade-in-0 zoom-in-95">
          <div className="flex items-start justify-between mb-4">
            <Dialog.Title className="text-base font-semibold text-gray-900">{title}</Dialog.Title>
            <Dialog.Close className="text-muted-foreground hover:text-gray-700 ml-4">
              <X size={18} />
            </Dialog.Close>
          </div>
          <Dialog.Description className="text-sm text-gray-600 mb-4">{description}</Dialog.Description>
          {children && <div className="mb-4">{children}</div>}
          <div className="flex gap-3 justify-end mt-6">
            <Dialog.Close asChild>
              <button className="btn-secondary">{cancelLabel}</button>
            </Dialog.Close>
            <button
              onClick={onConfirm}
              disabled={loading}
              className={clsx(
                'flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors disabled:opacity-60',
                destructive
                  ? 'bg-danger text-white hover:bg-red-700'
                  : 'bg-primary text-white hover:bg-green-700'
              )}
            >
              {loading && <Loader2 size={14} className="animate-spin" />}
              {confirmLabel}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}


import { useQuery } from '@tanstack/react-query'
import { X, Loader2, Printer } from 'lucide-react'
import { api } from '../lib/api'
import { formatINR, formatDate } from '../lib/formatINR'

interface ReceiptDetail {
  receipt_id: number
  receipt_no: string
  created_at: string
  student_name: string
  student_code: string
  payment_method: string
  reference: string | null
  taxable_paise: number
  cgst_paise: number
  sgst_paise: number
  total_paise: number
}

interface ReceiptSheetProps {
  receiptId: number
  onClose: () => void
}

export function ReceiptSheet({ receiptId, onClose }: ReceiptSheetProps) {
  const { data, isLoading } = useQuery<ReceiptDetail>({
    queryKey: ['receipt', receiptId],
    queryFn: () => api.get(`/receipts/${receiptId}`),
  })

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-sm bg-white h-full overflow-y-auto shadow-xl flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-border shrink-0">
          <h2 className="font-semibold text-gray-900">Receipt</h2>
          <div className="flex items-center gap-2">
            {data && (
              <button onClick={() => window.print()} className="flex items-center gap-1.5 text-sm text-primary hover:underline">
                <Printer size={15} /> Print
              </button>
            )}
            <button onClick={onClose} className="p-1 text-muted-foreground hover:text-gray-700">
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="flex-1 p-6 print:block">
          {isLoading ? (
            <div className="flex justify-center py-8"><Loader2 size={24} className="animate-spin text-primary" /></div>
          ) : data ? (
            <div className="space-y-4">
              <div className="text-center border-b border-border pb-4">
                <div className="w-10 h-10 bg-primary rounded-lg flex items-center justify-center text-white font-bold mx-auto mb-2">J</div>
                <p className="font-semibold text-gray-900">Jaipur Coaching Institute</p>
                <p className="text-xs text-muted-foreground">Tax Invoice / GST Receipt</p>
              </div>

              <div className="space-y-2.5 text-sm">
                <Row label="Receipt No." value={<span className="font-mono font-medium">{data.receipt_no}</span>} />
                <Row label="Date" value={formatDate(data.created_at)} />
                <Row label="Student" value={data.student_name} />
                <Row label="Student Code" value={<span className="font-mono">{data.student_code}</span>} />
                <Row label="Payment method" value={data.payment_method.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())} />
                {data.reference && <Row label="Reference" value={<span className="font-mono text-xs">{data.reference}</span>} />}
              </div>

              <div className="border-t border-border pt-3 space-y-2 text-sm">
                <Row label="Taxable value" value={<span className="font-mono">{(data.taxable_paise / 100).toFixed(2)}</span>} />
                <Row label="CGST 9%" value={<span className="font-mono">{(data.cgst_paise / 100).toFixed(2)}</span>} />
                <Row label="SGST 9%" value={<span className="font-mono">{(data.sgst_paise / 100).toFixed(2)}</span>} />
                <div className="flex justify-between font-semibold text-base border-t border-border pt-2 mt-2">
                  <span>Total</span>
                  <span className="tabular-nums">{formatINR(data.total_paise)}</span>
                </div>
              </div>

              <div className="text-center pt-4 border-t border-border">
                <p className="text-xs text-muted-foreground">This is a computer-generated receipt.</p>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between items-start gap-4">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className="text-right text-gray-900">{value}</span>
    </div>
  )
}


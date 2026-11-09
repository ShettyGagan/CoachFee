import { useQuery } from '@tanstack/react-query'
import { X, Loader2, Printer, CheckCircle2 } from 'lucide-react'
import { api } from '../lib/api'
import { formatINR, formatDate, numberToWordsINR } from '../lib/formatINR'

export interface ReceiptDetail {
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

export interface ReceiptSheetProps {
  receiptId: number
  onClose: () => void
  endpoint?: string
}

export function ReceiptSheet({ receiptId, onClose, endpoint }: ReceiptSheetProps) {
  const url = endpoint || `/receipts/${receiptId}`

  const { data, isLoading } = useQuery<ReceiptDetail>({
    queryKey: ['receipt', url, receiptId],
    queryFn: () => api.get(url),
  })

  return (
    <div className="fixed inset-0 z-50 flex justify-end print:static print:inset-auto print:block print:w-full print:bg-transparent">
      {/* Backdrop for screen */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-2xs transition-opacity no-print"
        onClick={onClose}
      />

      {/* Slide-over panel */}
      <div className="relative w-full max-w-xl bg-white h-full overflow-y-auto shadow-2xl flex flex-col z-10 print:w-full print:max-w-none print:shadow-none print:overflow-visible print:h-auto print:p-0 print:static">
        {/* Screen Header Bar (Hidden in Print) */}
        <div className="flex items-center justify-between px-6 py-4 bg-[#0B0E0D] text-white shrink-0 no-print border-b border-gray-800">
          <div className="flex items-center gap-2">
            <span className="font-bold text-sm text-white">GST Tax Invoice</span>
            {data?.receipt_no && (
              <span className="font-mono text-xs text-emerald-400 bg-emerald-950/80 px-2 py-0.5 rounded border border-emerald-800/60 font-semibold">
                {data.receipt_no}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            {data && (
              <button
                type="button"
                onClick={() => window.print()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#059669] hover:bg-[#047857] text-white text-xs font-semibold transition-all cursor-pointer shadow-xs no-print"
              >
                <Printer size={14} />
                <span>Print Receipt</span>
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="p-1 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-colors cursor-pointer no-print"
              title="Close"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Modal Body / Printable Document */}
        <div className="flex-1 p-6 sm:p-8 print:p-0">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-20 text-gray-400 gap-3">
              <Loader2 size={32} className="animate-spin text-[#059669]" />
              <p className="text-xs font-medium">Generating official tax invoice...</p>
            </div>
          ) : data ? (
            /* ── Printable Tax Invoice Document ────────────────────────────── */
            <div className="receipt-printable-document bg-white text-gray-900 font-sans border border-gray-200 rounded-2xl p-6 sm:p-8 shadow-xs print:border-none print:shadow-none print:p-0 print:m-0">
              {/* Invoice Top Header */}
              <div className="border-b-2 border-gray-900 pb-5 mb-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-3.5">
                    <img
                      src="/logo.png"
                      alt="CoachFee"
                      className="h-11 w-auto object-contain shrink-0"
                    />
                    <div>
                      <h1 className="text-xl sm:text-2xl font-black text-gray-900 tracking-tight uppercase">
                        Jaipur Coaching Institute
                      </h1>
                      <p className="text-xs text-gray-600 font-medium">
                        Premier Institute for JEE & NEET Preparation
                      </p>
                      <p className="text-[11px] text-gray-500 mt-0.5">
                        Central Campus, Tonk Road, Jaipur, Rajasthan · PIN 302015
                      </p>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <span className="inline-block px-3 py-1 bg-gray-900 text-white text-[11px] font-bold uppercase tracking-wider rounded">
                      Tax Invoice
                    </span>
                    <p className="text-[11px] font-mono text-gray-600 mt-1.5">
                      GSTIN: <span className="font-bold text-gray-900">08AAACJ1234F1Z5</span>
                    </p>
                    <p className="text-[11px] text-gray-500">
                      State Code: <span className="font-semibold text-gray-800">08 (Rajasthan)</span>
                    </p>
                  </div>
                </div>
              </div>

              {/* Invoice & Student Metadata Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 border border-gray-200 rounded-xl p-4 mb-5 text-xs bg-gray-50/70">
                {/* Left Column: Invoice Details */}
                <div className="space-y-1.5 sm:border-r border-gray-200 sm:pr-4">
                  <div className="flex justify-between">
                    <span className="text-gray-500 font-medium">Invoice No:</span>
                    <span className="font-bold font-mono text-gray-900">{data.receipt_no}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500 font-medium">Issue Date:</span>
                    <span className="font-semibold text-gray-900">{formatDate(data.created_at)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500 font-medium">Payment Mode:</span>
                    <span className="font-semibold text-gray-900 capitalize">
                      {data.payment_method.replace('_', ' ')}
                    </span>
                  </div>
                  {data.reference && (
                    <div className="flex justify-between">
                      <span className="text-gray-500 font-medium">Payment Ref / UTR:</span>
                      <span className="font-mono text-gray-900 font-semibold select-all break-all">
                        {data.reference}
                      </span>
                    </div>
                  )}
                </div>

                {/* Right Column: Student Details */}
                <div className="space-y-1.5 sm:pl-2">
                  <div className="flex justify-between">
                    <span className="text-gray-500 font-medium">Student Name:</span>
                    <span className="font-bold text-gray-900">{data.student_name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500 font-medium">Student Roll Code:</span>
                    <span className="font-bold font-mono text-gray-900">{data.student_code}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500 font-medium">SAC Code:</span>
                    <span className="font-mono font-semibold text-gray-900">999293 (Coaching)</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500 font-medium">Place of Supply:</span>
                    <span className="font-semibold text-gray-900">Jaipur, Rajasthan (08)</span>
                  </div>
                </div>
              </div>

              {/* Particulars & Fee Table */}
              <div className="border border-gray-200 rounded-xl overflow-hidden mb-5">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-gray-100/90 border-b border-gray-200 text-gray-700 font-bold uppercase tracking-wider">
                      <th className="py-2.5 px-3 text-center w-10">#</th>
                      <th className="py-2.5 px-3 text-left">Description / Particulars</th>
                      <th className="py-2.5 px-3 text-center w-24">SAC Code</th>
                      <th className="py-2.5 px-3 text-right w-32">Taxable Value (₹)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 text-gray-800">
                    <tr>
                      <td className="py-3.5 px-3 text-center text-gray-400 font-mono">1</td>
                      <td className="py-3.5 px-3">
                        <p className="font-bold text-gray-900">Course Coaching & Tuition Fee Instalment</p>
                        <p className="text-[11px] text-gray-500 mt-0.5">
                          Classroom lectures, curriculum study material, regular test series and faculty mentorship
                        </p>
                      </td>
                      <td className="py-3.5 px-3 text-center font-mono text-gray-600 font-semibold">999293</td>
                      <td className="py-3.5 px-3 text-right font-mono font-bold text-gray-900">
                        ₹{(data.taxable_paise / 100).toFixed(2)}
                      </td>
                    </tr>
                  </tbody>
                </table>

                {/* Tax Breakdown Calculations */}
                <div className="border-t border-gray-200 bg-gray-50/70 p-4 space-y-2 text-xs">
                  <div className="flex justify-between text-gray-600">
                    <span className="font-medium">Total Taxable Value (Before Taxes):</span>
                    <span className="font-mono font-semibold text-gray-900">₹{(data.taxable_paise / 100).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-gray-600">
                    <span className="font-medium">Central GST (CGST @ 9.0%):</span>
                    <span className="font-mono font-semibold text-gray-900">₹{(data.cgst_paise / 100).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-gray-600">
                    <span className="font-medium">State GST (SGST @ 9.0%):</span>
                    <span className="font-mono font-semibold text-gray-900">₹{(data.sgst_paise / 100).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-sm sm:text-base font-extrabold text-gray-900 border-t-2 border-gray-300 pt-2.5 mt-2">
                    <span>Total Amount Paid (INR):</span>
                    <span className="text-emerald-800 tabular-nums font-black">{formatINR(data.total_paise)}</span>
                  </div>
                </div>
              </div>

              {/* Amount in Words & Status Banner */}
              <div className="border border-gray-200 rounded-xl p-3.5 mb-6 text-xs bg-gray-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <span className="text-gray-500 font-medium">Amount in Words: </span>
                  <span className="font-bold text-gray-900">
                    {numberToWordsINR(Math.round(data.total_paise / 100))}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 text-[11px] font-bold text-[#059669] bg-[#E8F8F0] px-2.5 py-1 rounded-lg border border-emerald-200/60 self-start sm:self-center">
                  <CheckCircle2 size={13} />
                  <span>Payment Succeeded · Cleared</span>
                </div>
              </div>

              {/* Statutory Notes & Signature Block */}
              <div className="pt-3 border-t border-gray-200 text-[11px] text-gray-500 flex flex-col sm:flex-row items-end justify-between gap-6">
                <div className="space-y-1 max-w-sm">
                  <p className="font-bold text-gray-700">Terms & Policy Notes:</p>
                  <p>1. Fees received are subject to the Jaipur Coaching Institute Refund Policy (v2026-11).</p>
                  <p>2. This is a computer-generated GST tax invoice and does not require physical stamp.</p>
                </div>

                <div className="text-right shrink-0 pt-4 sm:pt-0 self-end">
                  <div className="w-40 border-b border-gray-400 mb-1.5 ml-auto" />
                  <p className="font-bold text-gray-900 text-xs">Authorized Signatory</p>
                  <p className="text-[10px] text-gray-500">Jaipur Coaching Institute (Accounts)</p>
                </div>
              </div>
            </div>
          ) : null}

          {/* Screen Print Button at bottom of modal (Hidden in Print) */}
          {data && (
            <div className="mt-6 no-print">
              <button
                type="button"
                onClick={() => window.print()}
                className="btn-primary w-full h-11 flex items-center justify-center gap-2 cursor-pointer shadow-xs"
              >
                <Printer size={16} />
                <span>Print Tax Invoice</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

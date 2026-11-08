import { ReactNode, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { clsx } from 'clsx'

export interface Column<T> {
  key: string
  header: string
  render: (row: T) => ReactNode
  className?: string
  mobileLabel?: string
}

interface DataTableProps<T> {
  columns: Column<T>[]
  data: T[]
  keyExtractor: (row: T) => string | number
  pageSize?: number
  emptyMessage?: string
  onRowClick?: (row: T) => void
}

export function DataTable<T>({
  columns,
  data,
  keyExtractor,
  pageSize = 25,
  emptyMessage = 'No data',
  onRowClick,
}: DataTableProps<T>) {
  const [page, setPage] = useState(1)
  const total = data.length
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const pageData = data.slice((page - 1) * pageSize, page * pageSize)

  if (total === 0) {
    return <p className="text-sm text-muted-foreground py-8 text-center">{emptyMessage}</p>
  }

  return (
    <div>
      {/* Desktop table */}
      <div className="hidden sm:block overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="bg-[#E8F8F0] border-b border-gray-100">
              {columns.map(col => (
                <th
                  key={col.key}
                  className={clsx(
                    'px-6 py-3.5 text-left text-xs font-bold text-[#059669] uppercase tracking-wider',
                    col.className
                  )}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100/90">
            {pageData.map(row => (
              <tr
                key={keyExtractor(row)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={clsx(
                  'h-16 group transition-colors',
                  onRowClick && 'cursor-pointer hover:bg-[#F9FCFA]'
                )}
              >
                {columns.map(col => (
                  <td
                    key={col.key}
                    className={clsx('px-6 py-4 text-sm text-gray-900', col.className)}
                  >
                    {col.render(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="sm:hidden space-y-3 p-4">
        {pageData.map(row => (
          <div
            key={keyExtractor(row)}
            onClick={onRowClick ? () => onRowClick(row) : undefined}
            className={clsx('bg-white rounded-2xl border border-gray-100/90 p-4 shadow-xs', onRowClick && 'cursor-pointer active:bg-gray-50')}
          >
            {columns.map(col => (
              <div key={col.key} className="flex justify-between items-start py-1.5 text-sm">
                <span className="text-gray-500 font-medium shrink-0 mr-4">{col.mobileLabel || col.header}</span>
                <span className="text-right">{col.render(row)}</span>
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-6 py-3.5 border-t border-gray-100 bg-white">
          <p className="text-xs font-semibold text-gray-500 tabular-nums">
            {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} of {total}
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="p-1.5 rounded-lg border border-gray-200/90 disabled:opacity-40 hover:bg-gray-50 text-gray-600 transition-colors shadow-2xs"
            >
              <ChevronLeft size={16} />
            </button>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="p-1.5 rounded-lg border border-gray-200/90 disabled:opacity-40 hover:bg-gray-50 text-gray-600 transition-colors shadow-2xs"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}


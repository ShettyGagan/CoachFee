import { clsx } from 'clsx'

export interface ChipOption {
  value: string
  label: string
  count?: number
}

interface ChipFilterRowProps {
  options: ChipOption[]
  value: string
  onChange: (v: string) => void
}

export function ChipFilterRow({ options, value, onChange }: ChipFilterRowProps) {
  return (
    <div className="flex gap-2 flex-wrap">
      {options.map(opt => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={clsx(
            'px-4 py-1.5 rounded-full text-xs font-semibold transition-all whitespace-nowrap cursor-pointer',
            value === opt.value
              ? 'bg-[#059669] text-white shadow-2xs'
              : 'bg-white border border-gray-200/90 text-gray-600 hover:text-gray-900 hover:bg-gray-50 shadow-2xs'
          )}
        >
          {opt.label}
          {opt.count !== undefined && (
            <span className={clsx('ml-1.5 text-xs', value === opt.value ? 'text-green-100' : 'text-muted-foreground')}>
              {opt.count}
            </span>
          )}
        </button>
      ))}
    </div>
  )
}


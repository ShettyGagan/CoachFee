import { SlidersHorizontal } from 'lucide-react'

interface FilterButtonProps {
  onClick: () => void
  activeCount?: number
  children?: React.ReactNode
}

export function FilterButton({ onClick, activeCount = 0, children }: FilterButtonProps) {
  return (
    <button
      onClick={onClick}
      className="relative flex items-center gap-1.5 h-9 px-3 rounded-md border border-border text-sm text-gray-700 hover:bg-gray-50 transition-colors"
    >
      <SlidersHorizontal size={15} />
      {children || 'Filter'}
      {activeCount > 0 && (
        <span className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-primary text-white text-[10px] rounded-full flex items-center justify-center font-bold">
          {activeCount}
        </span>
      )}
    </button>
  )
}


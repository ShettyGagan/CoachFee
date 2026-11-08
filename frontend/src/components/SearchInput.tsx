import { Search } from 'lucide-react'

interface SearchInputProps {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  className?: string
}

export function SearchInput({ value, onChange, placeholder = 'Search…', className = '' }: SearchInputProps) {
  return (
    <div className={`relative ${className}`}>
      <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full pl-9 pr-3.5 py-2 rounded-xl border border-gray-200/90 text-xs text-gray-700 bg-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#059669]/20 focus:border-[#059669] shadow-2xs transition-all"
      />
    </div>
  )
}


import { ReactNode } from 'react'
import { formatINR } from '../lib/formatINR'
import { clsx } from 'clsx'

interface Props {
  paise: number
  showPaise?: boolean
  danger?: boolean
  className?: string
}

export function MoneyText({ paise, showPaise = false, danger = false, className }: Props) {
  return (
    <span className={clsx('tabular-nums font-medium', danger && 'text-danger', className)}>
      {formatINR(paise, showPaise)}
    </span>
  )
}

interface StatCardProps {
  label: string
  value: ReactNode
  footnote?: string
  icon?: ReactNode
  iconBg?: string
  color?: string
  danger?: boolean
  linkTo?: string
  onClick?: () => void
}

const COLOR_MAP: Record<string, string> = {
  teal: 'bg-emerald-50 text-emerald-700',
  blue: 'bg-blue-50 text-blue-700',
  red: 'bg-red-50 text-red-700',
  amber: 'bg-amber-50 text-amber-700',
}

export function StatCard({ label, value, footnote, icon, iconBg, color, danger, onClick }: StatCardProps) {
  const bg = iconBg || (color ? COLOR_MAP[color] : 'bg-brand-soft text-primary')

  return (
    <div
      className={clsx('card flex flex-col gap-3', onClick && 'cursor-pointer hover:shadow-md transition-shadow')}
      onClick={onClick}
    >
      <div className="flex items-start justify-between">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</span>
        {icon && (
          <span className={clsx('w-9 h-9 rounded-full flex items-center justify-center shrink-0', bg)}>
            {icon}
          </span>
        )}
      </div>
      <div className={clsx('stat-number', danger && 'text-danger')}>{value}</div>
      {footnote && <p className="text-xs text-muted-foreground">{footnote}</p>}
    </div>
  )
}

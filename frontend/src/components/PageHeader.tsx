import { ReactNode } from 'react'

interface Props {
  title: string
  subtitle?: string
  action?: ReactNode
}

export function PageHeader({ title, subtitle, action }: Props) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
      <div>
        <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">{title}</h1>
        {subtitle && <p className="text-xs sm:text-sm text-gray-500 mt-1 font-normal">{subtitle}</p>}
      </div>
      {action && <div className="self-start sm:self-auto">{action}</div>}
    </div>
  )
}


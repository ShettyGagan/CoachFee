import { Navigate, useLocation } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import { ReactNode } from 'react'

interface Me {
  kind: 'staff' | 'guardian'
  id: number
  name: string
  role?: string
  centre_id?: number | null
  language?: string
  needs_consent?: boolean
}

export function useMe() {
  return useQuery<Me>({
    queryKey: ['me'],
    queryFn: () => api.get('/auth/me'),
    retry: false,
    staleTime: 60 * 1000,
  })
}

export function RoleGuard({ children, roles }: { children: ReactNode; roles?: string[] }) {
  const { data: me, isLoading, isError } = useMe()
  const location = useLocation()

  if (isLoading) {
    return (
      <div className="min-h-screen bg-page-bg flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent" />
      </div>
    )
  }
  if (isError || !me) return <Navigate to="/login" state={{ from: location }} replace />

  if (me.kind === 'guardian') {
    if (me.needs_consent && location.pathname !== '/parent/consent') {
      return <Navigate to="/parent/consent" replace />
    }
    if (roles && !roles.includes('parent')) {
      return <div className="p-8 text-center"><p className="text-sm text-muted-foreground">You don't have access to this.</p></div>
    }
    return <>{children}</>
  }

  if (roles && me.role && !roles.includes(me.role)) {
    return (
      <div className="p-8 text-center">
        <p className="text-sm font-medium text-gray-700">You don't have access to this page.</p>
        <a href="/staff" className="text-primary text-sm underline mt-2 inline-block">Go to dashboard</a>
      </div>
    )
  }

  return <>{children}</>
}

export function RedirectIfAuth({ children }: { children: ReactNode }) {
  const { data: me, isLoading } = useMe()
  if (isLoading) {
    return (
      <div className="min-h-screen bg-page-bg flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent" />
      </div>
    )
  }
  if (me?.kind === 'staff') return <Navigate to="/staff" replace />
  if (me?.kind === 'guardian') return <Navigate to="/parent" replace />
  return <>{children}</>
}

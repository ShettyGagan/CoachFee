import { ReactNode, useState, useRef, useEffect } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import {
  LayoutGrid, Users, ArrowLeftRight, Bell, RotateCcw,
  ShieldAlert, Settings, Menu, X, ChevronDown, LogOut,
  GraduationCap, Building2, User, CheckCircle2
} from 'lucide-react'
import { clsx } from 'clsx'
import { toast } from 'sonner'
import { api, setStoredToken } from '../lib/api'
import { useMe } from '../lib/auth'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { formatINR, formatDate } from '../lib/formatINR'

interface OnlinePaymentAlert {
  payment_id: number
  student_id: number
  student_code: string
  student_name: string
  batch_name: string
  amount_paise: number
  reference: string
  received_at: string
  receipt_id: number | null
  receipt_no: string | null
}

function formatTimeAgo(isoString: string): string {
  try {
    const d = new Date(isoString)
    const diffSec = Math.floor((Date.now() - d.getTime()) / 1000)
    if (diffSec < 60) return 'Just now'
    if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`
    if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`
    return formatDate(d)
  } catch {
    return ''
  }
}

interface NavItem {
  label: string
  icon: ReactNode
  to: string
  roles: string[]
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', icon: <LayoutGrid size={18} />, to: '/staff', roles: ['admin', 'accounts'] },
  { label: 'Students', icon: <Users size={18} />, to: '/staff/students', roles: ['admin', 'accounts', 'counsellor'] },
  { label: 'Academics', icon: <GraduationCap size={18} />, to: '/staff/academics', roles: ['admin', 'accounts', 'counsellor'] },
  { label: 'Payments', icon: <ArrowLeftRight size={18} />, to: '/staff/payments', roles: ['admin', 'accounts'] },
  { label: 'Reminders', icon: <Bell size={18} />, to: '/staff/reminders', roles: ['admin', 'accounts'] },
  { label: 'Refunds', icon: <RotateCcw size={18} />, to: '/staff/refunds', roles: ['admin', 'accounts'] },
  { label: 'Risk Flags', icon: <ShieldAlert size={18} />, to: '/staff/risk', roles: ['admin', 'accounts', 'counsellor'] },
  { label: 'Setup', icon: <Settings size={18} />, to: '/staff/setup', roles: ['admin'] },
]

function Sidebar({ role, onClose }: { role: string; onClose?: () => void }) {
  const location = useLocation()

  return (
    <nav className="flex flex-col h-full bg-white select-none">
      {onClose && (
        <div className="flex justify-between items-center p-4 border-b border-gray-100 lg:hidden">
          <img src="/logo.png" alt="CoachFee" className="h-6 object-contain" />
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500">
            <X size={18} />
          </button>
        </div>
      )}

      {/* Nav links */}
      <div className="flex-1 px-3 py-6 space-y-1.5">
        {NAV_ITEMS.filter(i => i.roles.includes(role)).map(item => {
          const active =
            location.pathname === item.to ||
            (item.to !== '/staff' && location.pathname.startsWith(item.to))

          return (
            <Link
              key={item.to}
              to={item.to}
              onClick={onClose}
              className={clsx(
                'flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-semibold transition-all',
                active
                  ? 'bg-[#E8F8F0] text-[#059669] shadow-2xs'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
              )}
            >
              <span className={clsx(active ? 'text-[#059669]' : 'text-gray-500')}>
                {item.icon}
              </span>
              <span>{item.label}</span>
            </Link>
          )
        })}
      </div>

      {/* Sidebar Footer with decorative wave and institute info */}
      <div className="relative p-4 border-t border-gray-100 bg-gradient-to-t from-emerald-50/50 via-emerald-50/20 to-transparent">
        <div className="flex items-center gap-2 text-xs font-semibold text-gray-700">
          <Building2 size={16} className="text-gray-400 shrink-0" />
          <span className="truncate">Jaipur Coaching Institute</span>
        </div>
      </div>
    </nav>
  )
}

interface CentreSelectorProps {
  centreId: number | null
  onChange: (id: number | null) => void
  role: string
}

function CentreSelector({ centreId, onChange, role }: CentreSelectorProps) {
  const { data } = useQuery<{ items: { id: number; name: string; city: string }[] }>({
    queryKey: ['centres'],
    queryFn: () => api.get('/centres'),
  })

  if (!data?.items?.length || role !== 'admin') return null

  const selectedName = centreId
    ? data.items.find(c => c.id === centreId)?.name ?? 'Jaipur Coaching'
    : 'Jaipur Coaching'

  return (
    <div className="relative">
      <div className="flex items-center gap-2 bg-[#101E17] border border-[#1E382B] text-white text-xs font-semibold rounded-xl px-3.5 py-2 cursor-pointer hover:bg-[#15271E] transition-colors shadow-2xs">
        <GraduationCap size={15} className="text-emerald-400" />
        <span>{selectedName}</span>
        <ChevronDown size={14} className="text-gray-400 ml-1" />
        <select
          className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
          value={centreId ?? ''}
          onChange={e => onChange(e.target.value ? Number(e.target.value) : null)}
        >
          <option value="" className="text-gray-900 bg-white">All Centres (Jaipur Coaching)</option>
          {data.items.map(c => (
            <option key={c.id} value={c.id} className="text-gray-900 bg-white">
              {c.name} ({c.city})
            </option>
          ))}
        </select>
      </div>
    </div>
  )
}

interface StaffLayoutProps {
  children: ReactNode
  centreId: number | null
  onCentreChange: (id: number | null) => void
}

export function StaffLayout({ children, centreId, onCentreChange }: StaffLayoutProps) {
  const { data: me } = useMe()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const notifRef = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()
  const qc = useQueryClient()

  const [lastSeenPaymentId, setLastSeenPaymentId] = useState<number>(() => {
    try {
      return parseInt(localStorage.getItem('cf_last_seen_payment') || '0', 10)
    } catch {
      return 0
    }
  })

  // Poll online payment alerts every 15 seconds
  const { data: alertsData } = useQuery<{ items: OnlinePaymentAlert[]; total: number }>({
    queryKey: ['onlinePaymentAlerts', centreId],
    queryFn: () => api.get('/payments/online-alerts'),
    refetchInterval: 15_000,
  })

  const alerts = alertsData?.items ?? []
  const unreadCount = alerts.filter(a => a.payment_id > lastSeenPaymentId).length

  // Real-time toast alert when a new online payment arrives
  const prevFirstId = useRef<number | null>(null)
  useEffect(() => {
    if (alerts.length > 0) {
      const latest = alerts[0]
      if (prevFirstId.current !== null && latest.payment_id > prevFirstId.current) {
        toast.success(`Online payment received: ${formatINR(latest.amount_paise)}`, {
          description: `${latest.student_name} (${latest.student_code}) · ${latest.batch_name}`,
        })
      }
      prevFirstId.current = latest.payment_id
    }
  }, [alerts])

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false)
      }
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setNotificationsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleToggleNotifications = () => {
    const nextState = !notificationsOpen
    setNotificationsOpen(nextState)
    if (nextState && alerts.length > 0) {
      const topId = alerts[0].payment_id
      setLastSeenPaymentId(topId)
      try {
        localStorage.setItem('cf_last_seen_payment', String(topId))
      } catch {}
    }
  }

  const signOut = async () => {
    try {
      await api.post('/auth/logout')
    } catch {}
    setStoredToken(null)
    qc.clear()
    navigate('/login')
  }

  const role = me?.role ?? 'admin'

  return (
    <div className="h-screen flex flex-col bg-[#F9FAFB] font-sans overflow-hidden">
      {/* ── Top Bar Header (Fixed when scrolled) ────────────────────────────── */}
      <header className="sticky top-0 z-40 h-16 bg-[#0B0E0D] border-b border-gray-900 flex items-center px-4 lg:px-6 gap-4 shrink-0 select-none shadow-xs">
        {/* Mobile menu button */}
        <button
          className="lg:hidden text-gray-300 hover:text-white p-1 rounded-md"
          onClick={() => setSidebarOpen(true)}
        >
          <Menu size={20} />
        </button>

        {/* CoachFee Logo */}
        <Link to="/staff" className="flex items-center gap-3 mr-2">
          <img
            src="/logo.png"
            alt="CoachFee"
            className="h-7 w-auto object-contain"
          />
        </Link>

        {/* Subtle divider */}
        <div className="hidden sm:block h-5 w-px bg-gray-800" />

        {/* Centre selector dropdown pill */}
        <CentreSelector centreId={centreId} onChange={onCentreChange} role={role} />

        {/* Right side controls */}
        <div className="ml-auto flex items-center gap-3.5">
          {/* Notification bell with real-time online payment alerts */}
          <div className="relative" ref={notifRef}>
            <button
              type="button"
              onClick={handleToggleNotifications}
              className={clsx(
                'relative p-2 rounded-xl transition-colors cursor-pointer',
                notificationsOpen
                  ? 'bg-gray-800 text-white'
                  : 'text-gray-400 hover:text-white hover:bg-gray-900'
              )}
              title="Online payment alerts"
            >
              <Bell size={18} />
              {unreadCount > 0 ? (
                <span className="absolute top-1.5 right-1.5 flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500 ring-2 ring-[#0B0E0D]" />
                </span>
              ) : (
                <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-emerald-500 rounded-full ring-2 ring-[#0B0E0D] opacity-40" />
              )}
            </button>

            {/* Notification Dropdown */}
            {notificationsOpen && (
              <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-white rounded-2xl shadow-2xl border border-gray-100 z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150">
                {/* Header */}
                <div className="px-4 py-3 bg-[#0B0E0D] text-white flex items-center justify-between border-b border-gray-800">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    <span className="font-bold text-sm text-white">Online Payments</span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-950/80 text-emerald-400 font-semibold border border-emerald-800/60">
                      Live
                    </span>
                  </div>
                  {alerts.length > 0 && (
                    <span className="text-xs text-gray-400">
                      {alerts.length} recent
                    </span>
                  )}
                </div>

                {/* List */}
                <div className="max-h-80 overflow-y-auto divide-y divide-gray-100/90">
                  {alerts.length === 0 ? (
                    <div className="p-6 text-center text-gray-400 text-xs">
                      <div className="w-10 h-10 mx-auto mb-2 rounded-full bg-gray-50 flex items-center justify-center text-gray-300">
                        <CheckCircle2 size={20} />
                      </div>
                      No online payments received yet.
                    </div>
                  ) : (
                    alerts.map((item) => (
                      <Link
                        key={item.payment_id}
                        to={`/staff/students/${item.student_id}`}
                        onClick={() => setNotificationsOpen(false)}
                        className="p-3.5 block hover:bg-[#F9FCFA] transition-colors group"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-gray-900 group-hover:text-[#059669] truncate">
                              {item.student_name}
                            </p>
                            <p className="text-[11px] text-gray-500 truncate">
                              <span className="font-mono text-gray-400">{item.student_code}</span> · {item.batch_name}
                            </p>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-xs font-bold text-[#059669]">
                              +{formatINR(item.amount_paise)}
                            </p>
                            <p className="text-[10px] text-gray-400">
                              {formatTimeAgo(item.received_at)}
                            </p>
                          </div>
                        </div>
                        <div className="mt-1.5 flex items-center justify-between text-[10px]">
                          <span className="inline-flex items-center gap-1.5 text-gray-500 font-medium">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                            Paid via Parent Portal
                          </span>
                          {item.receipt_no && (
                            <span className="font-mono text-gray-400 font-medium text-[9px] bg-gray-50 px-1.5 py-0.5 rounded border border-gray-100">
                              {item.receipt_no}
                            </span>
                          )}
                        </div>
                      </Link>
                    ))
                  )}
                </div>

                {/* Footer */}
                <div className="p-2.5 bg-gray-50/90 border-t border-gray-100 flex items-center justify-between">
                  <Link
                    to="/staff/payments"
                    onClick={() => setNotificationsOpen(false)}
                    className="text-xs font-semibold text-[#059669] hover:text-emerald-700 px-2 py-1 rounded hover:bg-[#E8F8F0] transition-colors w-full text-center"
                  >
                    View All Payments →
                  </Link>
                </div>
              </div>
            )}
          </div>

          {/* User profile pill */}
          <div className="relative" ref={menuRef}>
            <button
              type="button"
              onClick={() => setUserMenuOpen(!userMenuOpen)}
              className="flex items-center gap-2 pl-1 pr-2.5 py-1 rounded-full hover:bg-gray-900 text-white transition-colors text-xs font-semibold cursor-pointer"
            >
              <div className="w-7 h-7 bg-emerald-600 rounded-full flex items-center justify-center text-white">
                <User size={15} />
              </div>
              <span className="hidden sm:inline-block max-w-[120px] truncate">
                {me?.name ?? 'Admin User'}
              </span>
              <ChevronDown size={14} className="text-gray-400" />
            </button>

            {/* Dropdown Menu */}
            {userMenuOpen && (
              <div className="absolute right-0 mt-2 w-48 bg-white rounded-xl shadow-lg border border-gray-100 py-1.5 z-50 text-xs animate-in fade-in duration-150">
                <div className="px-3 py-2 border-b border-gray-100">
                  <p className="font-semibold text-gray-900 truncate">{me?.name ?? 'Admin'}</p>
                  <p className="text-gray-500 capitalize">{me?.role ?? 'Staff'}</p>
                </div>
                <button
                  type="button"
                  onClick={signOut}
                  className="w-full flex items-center gap-2 px-3 py-2 text-red-600 hover:bg-red-50 text-left font-medium transition-colors"
                >
                  <LogOut size={14} />
                  <span>Sign out</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* ── Main Layout Body ─────────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">
        {/* Desktop Sidebar */}
        <aside className="hidden lg:block w-60 bg-white border-r border-gray-200/80 shrink-0 overflow-y-auto">
          <Sidebar role={role} />
        </aside>

        {/* Mobile Sidebar Overlay */}
        {sidebarOpen && (
          <div className="fixed inset-0 z-40 lg:hidden">
            <div
              className="absolute inset-0 bg-black/50 backdrop-blur-xs transition-opacity"
              onClick={() => setSidebarOpen(false)}
            />
            <aside className="relative w-72 h-full bg-white shadow-2xl">
              <Sidebar role={role} onClose={() => setSidebarOpen(false)} />
            </aside>
          </div>
        )}

        {/* Main Content View */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 bg-[#F8FAF9]">
          <div className="max-w-7xl mx-auto">{children}</div>
        </main>
      </div>
    </div>
  )
}

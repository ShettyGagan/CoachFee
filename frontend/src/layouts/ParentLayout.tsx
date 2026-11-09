import { ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { LogOut, GraduationCap, ChevronDown } from 'lucide-react'
import { api, setStoredToken } from '../lib/api'
import { useQueryClient } from '@tanstack/react-query'

export function ParentLayout({ children }: { children: ReactNode }) {
  const navigate = useNavigate()
  const qc = useQueryClient()

  const signOut = async () => {
    try {
      await api.post('/auth/logout')
    } catch {}
    setStoredToken(null)
    qc.clear()
    navigate('/login')
  }

  const toggleLang = () => {
    const lng = localStorage.getItem('i18nextLng') === 'hi' ? 'en' : 'hi'
    localStorage.setItem('i18nextLng', lng)
    window.location.reload()
  }

  return (
    <div className="min-h-screen bg-[#F8FAF9] flex flex-col font-sans relative overflow-x-hidden">
      {/* ── Fixed Top Bar Header ────────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 h-16 bg-[#0B0E0D] border-b border-gray-900 shadow-xs flex items-center px-4 lg:px-8 shrink-0 select-none">
        {/* CoachFee Logo */}
        <Link to="/parent" className="flex items-center gap-3 mr-2">
          <img
            src="/logo.png"
            alt="CoachFee"
            className="h-7 w-auto object-contain"
          />
        </Link>

        {/* Subtle divider */}
        <div className="hidden sm:block h-5 w-px bg-gray-800 mx-2" />

        {/* Centre selector pill */}
        <div className="flex items-center gap-2 bg-[#101E17] border border-[#1E382B] text-white text-xs font-semibold rounded-xl px-3.5 py-2 shadow-2xs">
          <GraduationCap size={15} className="text-emerald-400" />
          <span>Jaipur Coaching</span>
          <ChevronDown size={14} className="text-gray-400 ml-0.5" />
        </div>

        {/* Right side controls */}
        <div className="ml-auto flex items-center gap-3">
          {/* Language Toggle Pill */}
          <button
            type="button"
            onClick={toggleLang}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold text-gray-300 hover:text-white bg-[#16221D] border border-[#23352C] hover:bg-[#1E2E27] transition-all cursor-pointer shadow-2xs"
          >
            <span>EN</span>
            <span className="text-gray-500 font-normal">/</span>
            <span>हिन्दी</span>
          </button>

          {/* Subtle divider */}
          <div className="h-5 w-px bg-gray-800" />

          {/* Sign out */}
          <button
            type="button"
            onClick={signOut}
            className="flex items-center gap-1.5 text-xs font-semibold text-gray-300 hover:text-white px-2.5 py-1.5 rounded-lg hover:bg-gray-900 transition-colors cursor-pointer"
          >
            <LogOut size={15} />
            <span className="hidden sm:inline">Sign out</span>
          </button>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 w-full relative z-10">
        {children}
      </main>

      {/* Footer */}
      <footer className="py-6 text-center text-xs text-gray-400 relative z-10 flex items-center justify-center gap-3">
        <Link to="/terms" className="hover:text-gray-700 transition-colors font-medium">
          Terms & Conditions
        </Link>
        <span>·</span>
        <Link to="/privacy" className="hover:text-gray-700 transition-colors font-medium">
          Privacy Policy
        </Link>
        <span>·</span>
        <Link to="/refund-policy" className="hover:text-gray-700 transition-colors font-medium">
          Refund Policy
        </Link>
      </footer>

      {/* Decorative soft mint wave glow on bottom corners */}
      <div className="fixed -bottom-28 -left-28 w-96 h-96 rounded-full bg-emerald-100/35 blur-3xl pointer-events-none z-0" />
      <div className="fixed -bottom-28 -right-28 w-96 h-96 rounded-full bg-emerald-100/35 blur-3xl pointer-events-none z-0" />
    </div>
  )
}

export function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-[#F8FAF9] flex flex-col items-center justify-center p-4 font-sans">
      {children}
    </div>
  )
}

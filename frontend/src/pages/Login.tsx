import { useState, useRef, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Eye, EyeOff, Loader2, ArrowLeft, ChevronDown, Check } from 'lucide-react'
import {
  RecaptchaVerifier,
  signInWithPhoneNumber,
  type ConfirmationResult,
} from 'firebase/auth'
import { auth } from '../lib/firebase'
import { api, ApiError } from '../lib/api'
import { clsx } from 'clsx'

type Tab = 'parent' | 'staff'

const RECAPTCHA_CONTAINER_ID = 'recaptcha-container'

export default function Login() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [tab, setTab] = useState<Tab>('parent')
  const [lang, setLang] = useState<'en' | 'hi'>('en')
  const [agreedToTerms, setAgreedToTerms] = useState(true)
  const [showDemoLogins, setShowDemoLogins] = useState(false)

  // Staff state
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [staffError, setStaffError] = useState('')

  // Parent state
  const [phone, setPhone] = useState('')
  const [otpSent, setOtpSent] = useState(false)
  const [otp, setOtp] = useState(['', '', '', '', '', ''])
  const [timer, setTimer] = useState(0)
  const [parentError, setParentError] = useState('')
  const [sendingOtp, setSendingOtp] = useState(false)

  const otpRefs = useRef<(HTMLInputElement | null)[]>([])
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const confirmationRef = useRef<ConfirmationResult | null>(null)
  const recaptchaRef = useRef<RecaptchaVerifier | null>(null)

  // Timer countdown
  const startTimer = () => {
    setTimer(60)
    if (timerRef.current) clearInterval(timerRef.current)
    timerRef.current = setInterval(() => {
      setTimer(t => {
        if (t <= 1) { clearInterval(timerRef.current!); return 0 }
        return t - 1
      })
    }, 1000)
  }

  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current) }, [])

  // Firebase reCAPTCHA verifier
  const getRecaptchaVerifier = () => {
    if (!recaptchaRef.current) {
      recaptchaRef.current = new RecaptchaVerifier(auth, RECAPTCHA_CONTAINER_ID, {
        size: 'invisible',
        callback: () => { /* OTP ready */ },
        'expired-callback': () => {
          recaptchaRef.current = null
        },
      })
    }
    return recaptchaRef.current
  }

  // ── Staff Login Mutation ──────────────────────────────────────────────────
  const staffMutation = useMutation({
    mutationFn: (data: { email: string; password: string }) =>
      api.post<{ role: string }>('/auth/staff/login', data),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['me'] })
      if (data.role === 'counsellor') navigate('/staff/risk')
      else navigate('/staff')
    },
    onError: (err: ApiError) => {
      if (err.code === 'INVALID_CREDENTIALS') setStaffError('Invalid email or password.')
      else if (err.status === 429) setStaffError('Too many attempts. Try again in a minute.')
      else setStaffError(err.message)
    },
  })

  // ── Parent Verify Token Mutation ──────────────────────────────────────────
  const verifyMutation = useMutation({
    mutationFn: (id_token: string) =>
      api.post<{ needs_consent: boolean }>('/auth/parent/verify', { id_token }),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['me'] })
      if (data.needs_consent) navigate('/parent/consent')
      else navigate('/parent')
    },
    onError: (err: ApiError) => {
      if (err.code === 'PHONE_NOT_REGISTERED')
        setParentError('This mobile number is not registered with the institute.')
      else if (err.status === 429)
        setParentError('Too many attempts. Try again in a minute.')
      else
        setParentError(err.message)
    },
  })

  // ── Send OTP ──────────────────────────────────────────────────────────────
  const handleSendCode = async () => {
    if (phone.length !== 10) {
      setParentError('Please enter a valid 10-digit mobile number.')
      return
    }
    if (!agreedToTerms) {
      setParentError('Please agree to the Terms and Conditions.')
      return
    }

    setParentError('')
    setSendingOtp(true)
    try {
      const verifier = getRecaptchaVerifier()
      const result = await signInWithPhoneNumber(auth, `+91${phone}`, verifier)
      confirmationRef.current = result
      setOtpSent(true)
      startTimer()
    } catch (err: any) {
      recaptchaRef.current = null
      const code: string = err?.code ?? ''
      if (code === 'auth/invalid-phone-number')
        setParentError('Invalid phone number format.')
      else if (code === 'auth/too-many-requests')
        setParentError('Too many attempts. Please try again after a few minutes.')
      else if (code.includes('app-not-authorized') || code.includes('invalid-api-key'))
        setParentError('Firebase is not yet configured. Please check API keys.')
      else
        setParentError('Could not send OTP. Please check the number and try again.')
    } finally {
      setSendingOtp(false)
    }
  }

  // ── Resend OTP ────────────────────────────────────────────────────────────
  const handleResend = async () => {
    setOtp(['', '', '', '', '', ''])
    setParentError('')
    recaptchaRef.current = null
    await handleSendCode()
  }

  // ── Verify OTP ────────────────────────────────────────────────────────────
  const handleVerify = async () => {
    const code = otp.join('')
    if (code.length !== 6) { setParentError('Please enter all 6 digits of the OTP.'); return }
    if (!confirmationRef.current) { setParentError('Session expired. Please request a new OTP.'); return }
    setParentError('')
    try {
      const credential = await confirmationRef.current.confirm(code)
      const idToken = await credential.user.getIdToken()
      verifyMutation.mutate(idToken)
    } catch (err: any) {
      const code2: string = err?.code ?? ''
      if (code2 === 'auth/invalid-verification-code')
        setParentError('Incorrect OTP entered. Please try again.')
      else if (code2 === 'auth/code-expired')
        setParentError('This OTP has expired. Please request a new one.')
      else
        setParentError('Verification failed. Please try again.')
    }
  }

  const handleOtpChange = (i: number, val: string) => {
    if (!/^\d*$/.test(val)) return
    const next = [...otp]
    next[i] = val.slice(-1)
    setOtp(next)
    if (val && i < 5) otpRefs.current[i + 1]?.focus()
  }

  const handleOtpKeyDown = (i: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !otp[i] && i > 0) otpRefs.current[i - 1]?.focus()
  }

  const isVerifying = verifyMutation.isPending
  const isParentReadyToContinue = phone.length === 10 && agreedToTerms && !sendingOtp

  return (
    <div className="min-h-screen w-full flex bg-white font-sans text-gray-900">
      {/* Invisible reCAPTCHA container for Firebase Phone Auth */}
      <div id={RECAPTCHA_CONTAINER_ID} />

      {/* ── Left Column: Side Poster Banner ─────────────────────────────────── */}
      <div className="hidden lg:flex lg:w-1/2 bg-[#090D0C] relative items-center justify-center overflow-hidden h-screen sticky top-0 select-none">
        <img
          src="/login-side.jpg"
          alt="CoachFee - Simplify Fee Management"
          className="w-full h-full object-cover object-center"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-black/20 pointer-events-none" />
      </div>

      {/* ── Right Column: Login Form ────────────────────────────────────────── */}
      <div className="w-full lg:w-1/2 min-h-screen flex flex-col justify-between px-6 sm:px-12 md:px-16 lg:px-20 py-8 lg:py-12 bg-white">
        {/* Top Controls: Mode Switch & Language */}
        <div className="flex items-center justify-between w-full max-w-md mx-auto mb-8">
          {/* Tabs: Parent / Staff */}
          <div className="inline-flex p-1 bg-gray-100 rounded-xl text-xs font-medium">
            <button
              type="button"
              onClick={() => { setTab('parent'); setStaffError(''); setParentError('') }}
              className={clsx(
                'px-4 py-1.5 rounded-lg transition-all font-semibold',
                tab === 'parent'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-900'
              )}
            >
              {lang === 'en' ? 'Parent (OTP)' : 'अभिभावक (OTP)'}
            </button>
            <button
              type="button"
              onClick={() => { setTab('staff'); setStaffError(''); setParentError('') }}
              className={clsx(
                'px-4 py-1.5 rounded-lg transition-all font-semibold',
                tab === 'staff'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-900'
              )}
            >
              {lang === 'en' ? 'Staff Login' : 'स्टाफ लॉगिन'}
            </button>
          </div>

          {/* Language Toggle */}
          <button
            type="button"
            onClick={() => setLang(l => (l === 'en' ? 'hi' : 'en'))}
            className="text-xs font-semibold text-gray-600 hover:text-gray-900 border border-gray-200 hover:border-gray-300 rounded-lg px-2.5 py-1.5 transition-colors bg-white shadow-2xs"
          >
            {lang === 'en' ? 'हिन्दी' : 'English'}
          </button>
        </div>

        {/* Center Container: Main Card Form */}
        <div className="w-full max-w-md mx-auto my-auto">
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 tracking-tight">
              {tab === 'parent'
                ? otpSent
                  ? (lang === 'en' ? 'Verify OTP' : 'OTP सत्यापित करें')
                  : (lang === 'en' ? 'Login' : 'लॉगिन')
                : (lang === 'en' ? 'Staff Login' : 'स्टाफ लॉगिन')}
            </h1>
            <p className="text-gray-500 text-sm mt-2">
              {tab === 'parent'
                ? otpSent
                  ? (lang === 'en'
                      ? `Enter the 6-digit code sent to +91 ${phone}`
                      : `+91 ${phone} पर भेजा गया 6-अंकीय कोड दर्ज करें`)
                  : (lang === 'en'
                      ? 'Let us know your mobile number.'
                      : 'कृपया अपना मोबाइल नंबर दर्ज करें।')
                : (lang === 'en'
                    ? 'Sign in with your institute email and password.'
                    : 'संस्थान के ईमेल और पासवर्ड से साइन इन करें।')}
            </p>
          </div>

          {/* ── PARENT TAB ─────────────────────────────────────────────────── */}
          {tab === 'parent' && (
            <div>
              {!otpSent ? (
                <div className="space-y-6">
                  {/* Phone Input Box matching screenshot */}
                  <div className="space-y-2">
                    <div className="flex items-center gap-2.5">
                      {/* Flag + Country Code Pill */}
                      <div className="flex items-center gap-2 px-3.5 py-3 border border-gray-200 rounded-xl bg-white shrink-0 text-sm font-semibold text-gray-800 shadow-2xs select-none">
                        <span className="text-lg leading-none" role="img" aria-label="India Flag">
                          🇮🇳
                        </span>
                        <span>91</span>
                      </div>

                      {/* Phone Input */}
                      <input
                        type="tel"
                        value={phone}
                        onChange={e => {
                          setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))
                          setParentError('')
                        }}
                        placeholder={lang === 'en' ? 'Enter your mobile number' : 'मोबाइल नंबर दर्ज करें'}
                        className="flex-1 min-w-0 px-4 py-3 border border-gray-200 rounded-xl text-sm text-gray-900 placeholder:text-gray-400 bg-white focus:outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/15 shadow-2xs transition-all font-medium"
                        maxLength={10}
                        autoFocus
                      />
                    </div>
                  </div>

                  {/* Terms & Conditions Checkbox */}
                  <label className="flex items-start gap-2.5 text-xs text-gray-600 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={agreedToTerms}
                      onChange={e => setAgreedToTerms(e.target.checked)}
                      className="mt-0.5 h-4 w-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                    />
                    <span className="leading-relaxed">
                      {lang === 'en' ? (
                        <>
                          I agree to the{' '}
                          <Link to="/refund-policy" className="text-gray-900 underline hover:text-emerald-700 font-medium">
                            Terms and Conditions
                          </Link>{' '}
                          and{' '}
                          <Link to="/refund-policy" className="text-gray-900 underline hover:text-emerald-700 font-medium">
                            Privacy Policy
                          </Link>
                          .
                        </>
                      ) : (
                        <>
                          मैं{' '}
                          <Link to="/refund-policy" className="text-gray-900 underline hover:text-emerald-700 font-medium">
                            नियम और शर्तों
                          </Link>{' '}
                          तथा{' '}
                          <Link to="/refund-policy" className="text-gray-900 underline hover:text-emerald-700 font-medium">
                            गोपनीयता नीति
                          </Link>{' '}
                          से सहमत हूँ।
                        </>
                      )}
                    </span>
                  </label>

                  {/* Error display */}
                  {parentError && (
                    <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-600">
                      {parentError}
                    </div>
                  )}

                  {/* Continue Button */}
                  <button
                    type="button"
                    onClick={handleSendCode}
                    disabled={!isParentReadyToContinue}
                    className={clsx(
                      'w-full py-3.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-all shadow-2xs',
                      isParentReadyToContinue
                        ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm active:scale-[0.99]'
                        : 'bg-[#E5E9EC] text-[#9CA3AF] cursor-not-allowed'
                    )}
                  >
                    {sendingOtp && <Loader2 size={16} className="animate-spin text-white" />}
                    {lang === 'en' ? 'Continue' : 'आगे बढ़ें'}
                  </button>
                </div>
              ) : (
                /* OTP Verification Screen */
                <div className="space-y-6">
                  {/* 6 Digit Input Boxes */}
                  <div className="flex gap-2.5 justify-between">
                    {otp.map((v, i) => (
                      <input
                        key={i}
                        ref={el => { otpRefs.current[i] = el }}
                        type="text"
                        inputMode="numeric"
                        value={v}
                        onChange={e => handleOtpChange(i, e.target.value)}
                        onKeyDown={e => handleOtpKeyDown(i, e)}
                        className="w-12 h-14 border border-gray-200 rounded-xl text-center text-xl font-bold text-gray-900 bg-white focus:outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/15 shadow-2xs transition-all"
                        maxLength={1}
                        autoFocus={i === 0}
                      />
                    ))}
                  </div>

                  {/* Resend & Change Phone Number Links */}
                  <div className="flex items-center justify-between text-xs pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        setOtpSent(false)
                        setOtp(['', '', '', '', '', ''])
                        setTimer(0)
                        setParentError('')
                      }}
                      className="text-gray-500 hover:text-gray-900 font-medium transition-colors flex items-center gap-1"
                    >
                      <ArrowLeft size={13} />
                      {lang === 'en' ? 'Change number' : 'नंबर बदलें'}
                    </button>

                    {timer > 0 ? (
                      <span className="text-gray-400 font-medium">
                        {lang === 'en' ? `Resend code in ${timer}s` : `${timer}s में पुनः भेजें`}
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={handleResend}
                        disabled={sendingOtp}
                        className="text-emerald-600 hover:text-emerald-700 font-semibold hover:underline"
                      >
                        {sendingOtp ? 'Sending…' : (lang === 'en' ? 'Resend OTP' : 'OTP पुनः भेजें')}
                      </button>
                    )}
                  </div>

                  {/* Error display */}
                  {parentError && (
                    <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-600">
                      {parentError}
                    </div>
                  )}

                  {/* Verify & Login Button */}
                  <button
                    type="button"
                    onClick={handleVerify}
                    disabled={isVerifying || otp.join('').length !== 6}
                    className={clsx(
                      'w-full py-3.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-all shadow-2xs',
                      otp.join('').length === 6 && !isVerifying
                        ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm active:scale-[0.99]'
                        : 'bg-[#E5E9EC] text-[#9CA3AF] cursor-not-allowed'
                    )}
                  >
                    {isVerifying && <Loader2 size={16} className="animate-spin text-white" />}
                    {lang === 'en' ? 'Verify & Continue' : 'सत्यापित करें'}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ── STAFF TAB ──────────────────────────────────────────────────── */}
          {tab === 'staff' && (
            <form
              onSubmit={e => {
                e.preventDefault()
                staffMutation.mutate({ email, password })
              }}
              className="space-y-5"
            >
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                  {lang === 'en' ? 'Email Address' : 'ईमेल पता'}
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={e => { setEmail(e.target.value); setStaffError('') }}
                  placeholder="admin@coaching.in"
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm text-gray-900 placeholder:text-gray-400 bg-white focus:outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/15 shadow-2xs font-medium"
                  required
                  autoComplete="email"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                  {lang === 'en' ? 'Password' : 'पासवर्ड'}
                </label>
                <div className="relative">
                  <input
                    type={showPass ? 'text' : 'password'}
                    value={password}
                    onChange={e => { setPassword(e.target.value); setStaffError('') }}
                    placeholder="••••••••"
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm text-gray-900 placeholder:text-gray-400 bg-white pr-11 focus:outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/15 shadow-2xs font-medium"
                    required
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPass(!showPass)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700 transition-colors p-1"
                  >
                    {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              {staffError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-600">
                  {staffError}
                </div>
              )}

              <button
                type="submit"
                disabled={staffMutation.isPending || !email || !password}
                className={clsx(
                  'w-full py-3.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-all shadow-2xs',
                  email && password && !staffMutation.isPending
                    ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm active:scale-[0.99]'
                    : 'bg-[#E5E9EC] text-[#9CA3AF] cursor-not-allowed'
                )}
              >
                {staffMutation.isPending && <Loader2 size={16} className="animate-spin text-white" />}
                {lang === 'en' ? 'Sign in' : 'साइन इन करें'}
              </button>
            </form>
          )}

          {/* Quick Demo Credentials Accordion */}
          <div className="mt-8 pt-6 border-t border-gray-100">
            <button
              type="button"
              onClick={() => setShowDemoLogins(!showDemoLogins)}
              className="flex items-center justify-between w-full text-xs font-semibold text-gray-500 hover:text-gray-800 transition-colors"
            >
              <span>Demo Login Credentials</span>
              <ChevronDown
                size={14}
                className={clsx('transition-transform', showDemoLogins && 'rotate-180')}
              />
            </button>

            {showDemoLogins && (
              <div className="mt-3 p-3.5 bg-gray-50 border border-gray-200 rounded-xl text-xs text-gray-600 space-y-2 animate-in fade-in duration-200">
                <div className="flex justify-between items-center py-0.5">
                  <span>Admin:</span>
                  <button
                    type="button"
                    onClick={() => { setTab('staff'); setEmail('admin@coaching.in'); setPassword('admin123') }}
                    className="font-mono text-emerald-700 hover:underline"
                  >
                    admin@coaching.in / admin123
                  </button>
                </div>
                <div className="flex justify-between items-center py-0.5">
                  <span>Accounts:</span>
                  <button
                    type="button"
                    onClick={() => { setTab('staff'); setEmail('accounts@coaching.in'); setPassword('accounts123') }}
                    className="font-mono text-emerald-700 hover:underline"
                  >
                    accounts@coaching.in / accounts123
                  </button>
                </div>
                <div className="flex justify-between items-center py-0.5">
                  <span>Counsellor:</span>
                  <button
                    type="button"
                    onClick={() => { setTab('staff'); setEmail('counsellor@coaching.in'); setPassword('counsellor123') }}
                    className="font-mono text-emerald-700 hover:underline"
                  >
                    counsellor@coaching.in / counsellor123
                  </button>
                </div>
                <div className="pt-1.5 border-t border-gray-200 flex justify-between items-center">
                  <span>Parent Phone:</span>
                  <button
                    type="button"
                    onClick={() => { setTab('parent'); setPhone('9000000001') }}
                    className="font-mono text-emerald-700 hover:underline"
                  >
                    9000000001
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="w-full max-w-md mx-auto pt-6 text-center text-xs text-gray-400">
          <p>© 2026 CoachFee · Coaching Fee Management System</p>
        </div>
      </div>
    </div>
  )
}

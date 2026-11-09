import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { Loader2, ShieldCheck, CheckCircle2, FileText, Lock, ExternalLink } from 'lucide-react'
import { api } from '../../lib/api'

const POLICY_VERSION = '2026-11'
const EFFECTIVE_DATE = '1 November 2026'

const EN = {
  badge: `Policy v${POLICY_VERSION} · Effective ${EFFECTIVE_DATE}`,
  title: 'Parent Consent & Data Protection',
  subtitle: 'Please review and accept our academic and fee policies before accessing the parent portal.',
  dataCollected: 'Information We Collect:',
  items: [
    "Student Information: Your child's full name, roll code, batch, and enrollment stream",
    'Billing & Invoices: Fee instalment schedules, payment receipts, UTR numbers, and GST tax records',
    'Academic Progress: Daily biometric attendance timestamps and periodic mock test scores',
  ],
  why: 'Why We Collect It:',
  whyItems: [
    'To administer quarterly fee instalments, send scheduled reminders, and provide instant payment receipts',
    'To identify learning and attendance dips so dedicated centre counsellors can provide personalized academic mentorship',
  ],
  who: "Confidentiality & Access: Strictly restricted to authorized administrative and counselling staff at your child's centre.",
  correction: 'Data Rights: To request correction or withdrawal of your data, contact your centre office at any time.',
  policyLinks: {
    terms: 'Terms of Enrollment',
    privacy: 'Privacy Policy',
    refund: 'Refund Policy',
  },
  checkLabel: 'I confirm that I am the parent or legal guardian. I have read and agree to the Terms & Conditions, Privacy Policy, and Fee Instalment Rules.',
  button: 'Agree & Continue to Portal',
  version: `Policy version: ${POLICY_VERSION} · Jaipur Coaching Institute Fee Management System`,
}

const HI = {
  badge: `नीति संस्करण ${POLICY_VERSION} · प्रभावी ${EFFECTIVE_DATE}`,
  title: 'अभिभावक सहमति एवं डेटा संरक्षण',
  subtitle: 'अभिभावक पोर्टल पर आगे बढ़ने से पहले कृपया हमारी शैक्षणिक और शुल्क नीतियों की समीक्षा करें।',
  dataCollected: 'हम क्या जानकारी एकत्र करते हैं:',
  items: [
    'विद्यार्थी विवरण: आपके बच्चे का पूरा नाम, रोल कोड, बैच और नामांकित स्ट्रीम',
    'बिलिंग और रसीदें: शुल्क किस्त अनुसूची, भुगतान रसीदें, UTR संख्या और जीएसटी कर रिकॉर्ड',
    'शैक्षणिक प्रगति: दैनिक बायोमेट्रिक उपस्थिति और समय-समय पर आयोजित टेस्ट के अंक',
  ],
  why: 'हम इसे क्यों एकत्र करते हैं:',
  whyItems: [
    'त्रैमासिक शुल्क किस्तों के प्रबंधन, समय पर सूचनाएं भेजने और तत्काल रसीदें जारी करने के लिए',
    'उपस्थिति या अंकों में गिरावट को पहचानकर केंद्र परामर्शदाताओं द्वारा समय पर मार्गदर्शन देने के लिए',
  ],
  who: 'गोपनीयता और पहुँच: केवल आपके बच्चे के केंद्र के अधिकृत प्रशासनिक कर्मचारियों और परामर्शदाताओं तक सीमित।',
  correction: 'डेटा अधिकार: अपने डेटा में सुधार या सहमति वापस लेने के लिए, किसी भी समय केंद्र कार्यालय से संपर्क करें।',
  policyLinks: {
    terms: 'नामांकन शर्तें',
    privacy: 'गोपनीयता नीति',
    refund: 'वापसी नीति',
  },
  checkLabel: 'मैं पुष्टि करता/करती हूँ कि मैं अभिभावक हूँ। मैंने नियम एवं शर्तें, गोपनीयता नीति और शुल्क नियमों को पढ़ लिया है और उनसे सहमत हूँ।',
  button: 'सहमति दें और पोर्टल खोलें',
  version: `नीति संस्करण: ${POLICY_VERSION} · जयपुर कोचिंग संस्थान शुल्क प्रबंधन प्रणाली`,
}

export default function ParentConsent() {
  const navigate = useNavigate()
  const [lang, setLang] = useState<'en' | 'hi'>('hi')
  const [agreed, setAgreed] = useState(false)
  const c = lang === 'en' ? EN : HI

  const mutation = useMutation({
    mutationFn: () => api.post('/parent/consent', { policy_version: POLICY_VERSION }),
    onSuccess: () => navigate('/parent'),
  })

  return (
    <div className="py-8 sm:py-12 px-4 flex flex-col items-center justify-center">
      <div className="w-full max-w-2xl">
        <div className="bg-white rounded-3xl border border-gray-100 p-6 sm:p-10 shadow-xs relative overflow-hidden">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 pb-6 border-b border-gray-100">
            <div className="flex items-start gap-3.5">
              <div className="w-12 h-12 rounded-2xl bg-[#E8F8F0] text-[#059669] flex items-center justify-center shrink-0 shadow-xs">
                <ShieldCheck size={26} strokeWidth={2.2} />
              </div>
              <div>
                <span className="inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200/60 mb-1.5">
                  {c.badge}
                </span>
                <h1 className="text-xl sm:text-2xl font-bold text-gray-900 tracking-tight">
                  {c.title}
                </h1>
                <p className="text-sm text-gray-500 mt-0.5">
                  {c.subtitle}
                </p>
              </div>
            </div>

            {/* Language Toggle */}
            <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-xl self-start sm:self-center">
              <button
                type="button"
                onClick={() => setLang('en')}
                className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                  lang === 'en'
                    ? 'bg-white text-gray-900 shadow-xs'
                    : 'text-gray-500 hover:text-gray-900'
                }`}
              >
                English
              </button>
              <button
                type="button"
                onClick={() => setLang('hi')}
                className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                  lang === 'hi'
                    ? 'bg-white text-gray-900 shadow-xs'
                    : 'text-gray-500 hover:text-gray-900'
                }`}
              >
                हिन्दी
              </button>
            </div>
          </div>

          {/* Policy Information Sections */}
          <div className="space-y-6 py-6 text-sm">
            {/* What we collect */}
            <div className="bg-gray-50/70 rounded-2xl p-4 sm:p-5 border border-gray-100">
              <div className="flex items-center gap-2 mb-2.5 font-semibold text-gray-900">
                <FileText size={16} className="text-emerald-700" />
                <span>{c.dataCollected}</span>
              </div>
              <ul className="space-y-2 text-gray-600">
                {c.items.map((item, i) => (
                  <li key={i} className="flex items-start gap-2.5">
                    <CheckCircle2 size={15} className="text-emerald-600 shrink-0 mt-0.5" />
                    <span className="leading-relaxed">{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Why we collect it */}
            <div className="bg-emerald-50/40 rounded-2xl p-4 sm:p-5 border border-emerald-100/70">
              <div className="flex items-center gap-2 mb-2.5 font-semibold text-gray-900">
                <Lock size={16} className="text-emerald-700" />
                <span>{c.why}</span>
              </div>
              <ul className="space-y-2 text-gray-600">
                {c.whyItems.map((item, i) => (
                  <li key={i} className="flex items-start gap-2.5">
                    <CheckCircle2 size={15} className="text-emerald-600 shrink-0 mt-0.5" />
                    <span className="leading-relaxed">{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Confidentiality and Data Rights */}
            <div className="space-y-2 text-xs text-gray-500 bg-white rounded-xl p-3 border border-gray-100">
              <p className="leading-relaxed font-medium text-gray-700">{c.who}</p>
              <p className="leading-relaxed">{c.correction}</p>
            </div>

            {/* Quick Links to Legal Center */}
            <div className="flex flex-wrap items-center gap-2 pt-1 text-xs">
              <span className="text-gray-400 font-medium">Quick links:</span>
              <Link
                to="/terms"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 font-semibold text-emerald-700 hover:text-emerald-800 hover:underline"
              >
                <span>{c.policyLinks.terms}</span>
                <ExternalLink size={11} />
              </Link>
              <span className="text-gray-300">·</span>
              <Link
                to="/privacy"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 font-semibold text-emerald-700 hover:text-emerald-800 hover:underline"
              >
                <span>{c.policyLinks.privacy}</span>
                <ExternalLink size={11} />
              </Link>
              <span className="text-gray-300">·</span>
              <Link
                to="/refund-policy"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 font-semibold text-emerald-700 hover:text-emerald-800 hover:underline"
              >
                <span>{c.policyLinks.refund}</span>
                <ExternalLink size={11} />
              </Link>
            </div>
          </div>

          {/* Consent Checkbox */}
          <div className="pt-4 border-t border-gray-100">
            <label className="flex items-start gap-3 p-3.5 rounded-2xl bg-gray-50/80 hover:bg-gray-50 transition-colors border border-gray-200/80 cursor-pointer">
              <input
                type="checkbox"
                checked={agreed}
                onChange={e => setAgreed(e.target.checked)}
                className="mt-1 h-4 w-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
              />
              <span className="text-xs sm:text-sm text-gray-800 font-medium leading-relaxed select-none">
                {c.checkLabel}
              </span>
            </label>

            {/* Submit Button */}
            <button
              type="button"
              onClick={() => mutation.mutate()}
              disabled={!agreed || mutation.isPending}
              className="mt-5 w-full h-12 rounded-xl bg-[#059669] hover:bg-[#047857] text-white font-semibold transition-all shadow-xs flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            >
              {mutation.isPending ? (
                <>
                  <Loader2 size={18} className="animate-spin" />
                  <span>Processing...</span>
                </>
              ) : (
                <span>{c.button}</span>
              )}
            </button>

            {/* Version Footer */}
            <p className="text-center text-xs text-gray-400 mt-4">
              {c.version}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

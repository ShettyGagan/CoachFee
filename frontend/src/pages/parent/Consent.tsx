import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { Loader2, Shield } from 'lucide-react'
import { api } from '../../lib/api'

const POLICY_VERSION = '2026-11'

const EN = {
  title: 'Your consent',
  subtitle: 'Please read and accept before continuing.',
  dataCollected: 'What we collect:',
  items: [
    "Your child's name, batch and enrolment details",
    'Fee schedule, payment history and receipts',
    'Attendance records and test scores (used for academic support)',
  ],
  why: 'Why we collect it:',
  whyItems: [
    'To manage fee payments and send you reminders',
    'To provide academic support through counsellors',
  ],
  who: "Who can see it: Staff of your child's centre only.",
  correction: 'To request correction or withdrawal of your data, contact your centre office.',
  policyLink: 'View refund policy',
  checkLabel: 'I am the parent or guardian and I agree to the above.',
  button: 'Continue',
  version: `Policy version: ${POLICY_VERSION}`,
}

const HI = {
  title: 'आपकी सहमति',
  subtitle: 'आगे बढ़ने से पहले कृपया पढ़ें और स्वीकार करें।',
  dataCollected: 'हम क्या संग्रहीत करते हैं:',
  items: [
    'आपके बच्चे का नाम, बैच और नामांकन विवरण',
    'शुल्क अनुसूची, भुगतान इतिहास और रसीदें',
    'उपस्थिति रिकॉर्ड और परीक्षा अंक (शैक्षणिक सहायता के लिए)',
  ],
  why: 'हम इसे क्यों संग्रहीत करते हैं:',
  whyItems: [
    'शुल्क भुगतान प्रबंधित करने और आपको अनुस्मारक भेजने के लिए',
    'परामर्शदाताओं के माध्यम से शैक्षणिक सहायता प्रदान करने के लिए',
  ],
  who: 'कौन देख सकता है: केवल आपके बच्चे के केंद्र का स्टाफ।',
  correction: 'अपने डेटा में सुधार या वापसी के लिए, अपने केंद्र कार्यालय से संपर्क करें।',
  policyLink: 'वापसी नीति देखें',
  checkLabel: 'मैं अभिभावक हूं और उपरोक्त से सहमत हूं।',
  button: 'जारी रखें',
  version: `नीति संस्करण: ${POLICY_VERSION}`,
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
    <div className="min-h-screen bg-page-bg flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-lg">
        <div className="card">
          <div className="flex items-start justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-brand-soft rounded-xl flex items-center justify-center">
                <Shield size={20} className="text-primary" />
              </div>
              <div>
                <h1 className="text-xl font-semibold text-gray-900">{c.title}</h1>
                <p className="text-sm text-muted-foreground">{c.subtitle}</p>
              </div>
            </div>
            <div className="flex border border-border rounded-md p-0.5 bg-gray-50">
              {(['hi', 'en'] as const).map(l => (
                <button key={l} onClick={() => setLang(l)}
                  className={`px-2 py-0.5 text-xs font-medium rounded transition-colors ${lang === l ? 'bg-white shadow-sm text-gray-900' : 'text-muted-foreground'}`}>
                  {l === 'en' ? 'EN' : 'हिं'}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-4 mb-6">
            <div>
              <p className="text-sm font-semibold text-gray-800 mb-2">{c.dataCollected}</p>
              <ul className="space-y-1.5">
                {c.items.map((item, i) => (
                  <li key={i} className="flex gap-2 text-sm text-gray-700">
                    <span className="text-primary mt-0.5">•</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <p className="text-sm font-semibold text-gray-800 mb-2">{c.why}</p>
              <ul className="space-y-1.5">
                {c.whyItems.map((item, i) => (
                  <li key={i} className="flex gap-2 text-sm text-gray-700">
                    <span className="text-primary mt-0.5">•</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            <p className="text-sm text-gray-700">{c.who}</p>
            <p className="text-sm text-gray-600">{c.correction}</p>
            <Link to="/refund-policy" className="text-sm text-primary hover:underline">{c.policyLink}</Link>
          </div>

          <label className="flex items-start gap-3 cursor-pointer mb-6">
            <input
              type="checkbox"
              checked={agreed}
              onChange={e => setAgreed(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
            />
            <span className="text-sm text-gray-700">{c.checkLabel}</span>
          </label>

          <button
            onClick={() => mutation.mutate()}
            disabled={!agreed || mutation.isPending}
            className="btn-primary w-full flex items-center justify-center gap-2 h-12"
          >
            {mutation.isPending && <Loader2 size={16} className="animate-spin" />}
            {c.button}
          </button>

          <p className="text-xs text-muted-foreground text-center mt-4">{c.version}</p>
        </div>
      </div>
    </div>
  )
}


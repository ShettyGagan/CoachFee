import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'

const EN_CONTENT = {
  title: 'Refund Policy',
  version: 'Policy version: 2026-11 · Effective date: 1 November 2026',
  intro: 'When a student leaves before the course ends, the institute returns money as follows:',
  rules: [
    'The registration fee is non-refundable.',
    'The fee for the days already attended is deducted.',
    'The remaining amount is refunded within 10 days of the leave date.',
  ],
  formula: 'Refund = Total paid − Registration fee − (Daily rate × Days attended)',
  example: {
    title: 'Worked example',
    rows: [
      { label: 'Course total fee', value: '₹1,20,000' },
      { label: 'Total paid', value: '₹60,000' },
      { label: 'Registration fee (non-refundable)', value: '₹5,000' },
      { label: 'Course duration', value: '365 days' },
      { label: 'Days attended', value: '60 days' },
      { label: 'Daily rate', value: '₹1,20,000 ÷ 365 = ₹328.77/day' },
      { label: 'Fee for days attended', value: '₹328.77 × 60 = ₹19,726.03' },
      { label: 'Refund amount', value: '₹60,000 − ₹5,000 − ₹19,726.03 = ₹35,273.97' },
    ],
  },
  contact: 'To request a refund or correction of your data, contact your centre office.',
}

const HI_CONTENT = {
  title: 'वापसी नीति',
  version: 'नीति संस्करण: 2026-11 · प्रभावी तिथि: 1 नवंबर 2026',
  intro: 'जब कोई छात्र कोर्स पूरा होने से पहले छोड़ता है, तो संस्थान इस प्रकार धन वापस करता है:',
  rules: [
    'पंजीकरण शुल्क वापस नहीं किया जाएगा।',
    'जितने दिन कक्षाएं हुईं उतने दिनों का शुल्क काटा जाएगा।',
    'शेष राशि छोड़ने की तारीख से 10 दिनों के भीतर वापस की जाएगी।',
  ],
  formula: 'वापसी = कुल भुगतान − पंजीकरण शुल्क − (दैनिक दर × उपस्थित दिन)',
  example: {
    title: 'उदाहरण',
    rows: [
      { label: 'कोर्स कुल शुल्क', value: '₹1,20,000' },
      { label: 'कुल भुगतान', value: '₹60,000' },
      { label: 'पंजीकरण शुल्क (वापस नहीं होगा)', value: '₹5,000' },
      { label: 'कोर्स अवधि', value: '365 दिन' },
      { label: 'उपस्थित दिन', value: '60 दिन' },
      { label: 'दैनिक दर', value: '₹1,20,000 ÷ 365 = ₹328.77/दिन' },
      { label: 'उपस्थित दिनों का शुल्क', value: '₹328.77 × 60 = ₹19,726.03' },
      { label: 'वापसी राशि', value: '₹60,000 − ₹5,000 − ₹19,726.03 = ₹35,273.97' },
    ],
  },
  contact: 'वापसी अनुरोध या डेटा सुधार के लिए, अपने केंद्र कार्यालय से संपर्क करें।',
}

export default function RefundPolicy() {
  const [lang, setLang] = useState<'en' | 'hi'>('en')
  const c = lang === 'en' ? EN_CONTENT : HI_CONTENT

  return (
    <div className="min-h-screen bg-page-bg py-8 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <Link to="/login" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-gray-700">
            <ArrowLeft size={16} /> Back
          </Link>
          <div className="flex border border-border rounded-md p-0.5 bg-gray-50">
            {(['en', 'hi'] as const).map(l => (
              <button key={l} onClick={() => setLang(l)}
                className={`px-3 py-1 text-xs font-medium rounded transition-colors ${lang === l ? 'bg-white shadow-sm text-gray-900' : 'text-muted-foreground'}`}>
                {l === 'en' ? 'EN' : 'हिं'}
              </button>
            ))}
          </div>
        </div>

        <div className="card">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-8 h-8 bg-primary rounded flex items-center justify-center text-white font-bold text-sm">J</div>
            <div>
              <h1 className="text-2xl font-semibold text-gray-900">{c.title}</h1>
              <p className="text-xs text-muted-foreground mt-0.5">{c.version}</p>
            </div>
          </div>

          <p className="text-sm text-gray-700 mt-4 mb-3">{c.intro}</p>

          <ul className="space-y-2 mb-6">
            {c.rules.map((r, i) => (
              <li key={i} className="flex gap-2 text-sm text-gray-700">
                <span className="text-primary font-semibold mt-0.5">•</span>
                <span>{r}</span>
              </li>
            ))}
          </ul>

          <div className="bg-brand-soft rounded-lg p-4 mb-6">
            <p className="text-sm font-medium text-gray-800 mb-1">{lang === 'en' ? 'Formula' : 'सूत्र'}</p>
            <p className="text-sm font-mono text-gray-700">{c.formula}</p>
          </div>

          <div className="border border-gray-100 rounded-2xl overflow-hidden mb-6 shadow-xs">
            <div className="bg-[#E8F8F0] px-6 py-3.5 border-b border-gray-100">
              <p className="text-xs font-bold text-[#059669] uppercase tracking-wider">{c.example.title}</p>
            </div>
            <table className="w-full">
              <tbody className="divide-y divide-gray-100/90">
                {c.example.rows.map((row, i) => (
                  <tr key={i} className={`h-12 hover:bg-[#F9FCFA] transition-colors ${i === c.example.rows.length - 1 ? 'bg-[#E8F8F0]/40 font-bold' : ''}`}>
                    <td className="px-6 py-3 text-sm text-gray-700">{row.label}</td>
                    <td className="px-6 py-3 text-sm text-gray-900 text-right font-mono font-semibold">{row.value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="text-sm text-muted-foreground">{c.contact}</p>
        </div>
      </div>
    </div>
  )
}


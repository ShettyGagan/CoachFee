import { useState, useEffect } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import {
  ArrowLeft, ShieldCheck, FileText, RotateCcw,
  GraduationCap, CheckCircle2, ChevronRight, Mail,
  AlertCircle, HelpCircle, Lock, BookOpen, Clock
} from 'lucide-react'
import { clsx } from 'clsx'

export type PolicyTab = 'terms' | 'privacy' | 'refund'

interface TermsAndPoliciesProps {
  initialTab?: PolicyTab
}

const POLICY_VERSION = '2026-11'
const EFFECTIVE_DATE = '1 November 2026'

// ── Content Translations (English & Hindi) ──────────────────────────────────
const CONTENT = {
  en: {
    back: 'Back to Login',
    portal: 'Jaipur Coaching Institute',
    badge: `Policy v${POLICY_VERSION} · Effective ${EFFECTIVE_DATE}`,
    title: 'Legal & Compliance Center',
    subtitle: 'Transparent terms of enrollment, fee policies, student privacy standards, and statutory refund rules.',
    tabs: {
      terms: 'Terms & Conditions',
      privacy: 'Privacy Policy',
      refund: 'Refund Policy',
    },
    // 1. Terms & Conditions
    terms: {
      heading: 'Terms and Conditions of Enrollment',
      summary: 'These terms govern student admissions, fee instalment schedules, parent communication, and institute policies across all Jaipur Coaching centres.',
      sections: [
        {
          title: '1. Admission & Course Enrollment',
          content: [
            'Admission into JEE and NEET batches is granted subject to registration completion, document verification, and seat availability.',
            'Course curriculum, lecture timetables, batch assignments, and faculty allocations are determined by the institute management.',
            'Batch change or branch transfer requests between Jaipur centres are subject to seat availability and administrative approval.',
          ],
        },
        {
          title: '2. Fee Structure & Instalment Schedules',
          content: [
            'Total net fees are split into equal quarterly instalments as agreed upon at the time of admission.',
            'Each instalment has a strict due date. The final instalment absorbs any remainder paise so the sum equals the net fee exactly.',
            'Payments received via cash desk, bank transfer (NEFT/RTGS/IMPS), or online payment links are allocated on an Oldest-First (FIFO) basis across open instalments.',
            'A non-refundable registration fee (₹5,000) is collected at enrollment to cover onboarding materials and administrative registration.',
          ],
        },
        {
          title: '3. Automated Fee Reminders & Communications',
          content: [
            'By enrolling, parents consent to receive automated notifications regarding upcoming dues and overdue fee instalments.',
            'Reminders are dispatched in the parent’s preferred language (Hindi or English) relative to the due date (-7, -1, 0, +3, +7, +15 days).',
            'Stop-Once-Paid Guarantee: Whenever an instalment is fully cleared, all remaining pending reminders for that instalment are automatically cancelled immediately.',
            'Messages will never contain threatening language, unsolicited promotional links, or sensitive bank details.',
          ],
        },
        {
          title: '4. Attendance & Academic Standing',
          content: [
            'Students are expected to maintain at least 75% biometric attendance in classroom lectures and laboratory sessions.',
            'Regular mock tests and evaluations are mandatory. Attendance records and test scores are monitored to provide academic support and identify students requiring counselling.',
            'Academic counselling is strictly supportive; academic performance drops or attendance declines will never trigger automated financial penalties.',
          ],
        },
        {
          title: '5. Student Code of Conduct',
          content: [
            'Students must maintain discipline within centre premises, treat fellow students and faculty with respect, and adhere to classroom guidelines.',
            'The institute reserves the right to suspend or dismiss students engaging in serious misconduct, ragging, or examination malpractice, in accordance with applicable education bylaws.',
          ],
        },
      ],
    },
    // 2. Privacy Policy
    privacy: {
      heading: 'Student & Parent Privacy Policy',
      summary: 'We respect your family’s privacy. This policy explains what information we collect, how it is safeguarded, and your rights under applicable data protection laws.',
      sections: [
        {
          title: '1. Information We Collect',
          content: [
            'Student Information: Full name, student roll code, batch name, enrolled stream (JEE/NEET), date of enrollment, and leave dates.',
            'Parent / Guardian Information: Name, verified mobile phone number, preferred communication language (English or Hindi), and digital consent records.',
            'Academic Records: Daily biometric attendance timestamps (present/absent) and periodic test performance scores.',
            'Billing & Transaction Records: Invoices, payment references (UTR/Cashfree transaction IDs), payment method, and GST tax receipts.',
          ],
        },
        {
          title: '2. How We Use Your Information',
          content: [
            'To administer student academic enrolments, classroom batches, and study material distribution.',
            'To process fee instalments, generate statutory GST tax invoices (CGST + SGST), and maintain ledger histories.',
            'To send scheduled SMS/WhatsApp fee reminders and academic progress reports in the parent’s preferred language.',
            'To identify dropout risk factors (such as attendance drops or performance dips) so designated academic counsellors can provide personalized mentoring.',
          ],
        },
        {
          title: '3. Data Security & Access Controls',
          content: [
            'Centre-Scoped Isolation: Centre staff (accounts and counsellors) can only access students enrolled at their specific branch centre.',
            'No Third-Party Marketing: We do not sell, rent, or trade student or parent personal information to third-party commercial marketing advertisers.',
            'Payment Security: Online payments are processed directly through RBI-authorized payment aggregators (Cashfree). We never store debit/credit card numbers or CVVs on our servers.',
            'Encrypted Authentication: Staff logins are secured with bcrypt hashing and parent sessions use secure, encrypted cryptographic tokens.',
          ],
        },
        {
          title: '4. Parent Data Rights & Rectification',
          content: [
            'Parents have the right to inspect their child’s financial ledger, attendance logs, and test score history anytime via the Parent Portal.',
            'To request correction of any inaccurate personal detail (e.g. phone number or spelling) or withdraw consent, contact your centre’s administration office.',
          ],
        },
      ],
    },
    // 3. Refund Policy
    refund: {
      heading: 'Statutory Fee Refund Policy',
      summary: 'Official transparent refund rules governing course withdrawal prior to completion, calculated strictly per the 2026-11 statutory refund guidelines.',
      coreRules: [
        'The registration fee (₹5,000) covers administrative intake and course curriculum kits and is non-refundable.',
        'Tuition fee for the days already attended up to the student’s formal leave date is deducted on a strict daily-rate pro-rata basis.',
        'Any unconsumed fee balance remaining after deducting attended days and registration fee is refunded within 10 days of leave approval.',
      ],
      formulaTitle: 'Statutory Refund Calculation Formula',
      formulaText: 'Refund Amount = Total Paid − Registration Fee − (Daily Tuition Rate × Days Attended)',
      exampleTitle: 'Illustrative Calculation Example',
      exampleRows: [
        { label: 'Total Course Fee (Annual)', value: '₹1,20,000' },
        { label: 'Amount Paid to Date', value: '₹60,000' },
        { label: 'Non-Refundable Registration Fee', value: '₹5,000' },
        { label: 'Course Duration (Total Calendar Days)', value: '365 days' },
        { label: 'Days Attended by Student', value: '60 days' },
        { label: 'Daily Tuition Rate (₹1,20,000 ÷ 365)', value: '₹328.77 / day' },
        { label: 'Consumed Tuition Fee (₹328.77 × 60 days)', value: '₹19,726.03' },
        { label: 'Net Refund Payable to Parent', value: '₹35,273.97', highlight: true },
      ],
      payoutNote: 'Approved refunds are disbursed via direct bank transfer (NEFT/RTGS) or account-payee cheque to the registered parent within 10 business days.',
    },
    help: {
      title: 'Need assistance or have questions?',
      desc: 'Our administrative staff and accounts desk are available at all Jaipur centre branches Monday through Saturday, 9:00 AM to 6:00 PM IST.',
      email: 'accounts@coaching.in',
    },
  },

  hi: {
    back: 'लॉगिन पर वापस जाएं',
    portal: 'जयपुर कोचिंग संस्थान',
    badge: `नीति संस्करण v${POLICY_VERSION} · प्रभावी तिथि ${EFFECTIVE_DATE}`,
    title: 'कानूनी एवं नीति केंद्र',
    subtitle: 'नामांकन की पारदर्शी शर्तें, शुल्क नीतियां, छात्र डेटा गोपनीयता मानक और वैधानिक शुल्क वापसी दिशानिर्देश।',
    tabs: {
      terms: 'नियम और शर्तें',
      privacy: 'गोपनीयता नीति',
      refund: 'वापसी नीति (रिफंड)',
    },
    // 1. Terms & Conditions (Hindi)
    terms: {
      heading: 'नामांकन के नियम और शर्तें',
      summary: 'ये नियम और शर्तें जयपुर कोचिंग के सभी केंद्रों में छात्र प्रवेश, शुल्क किस्तों के कार्यक्रम, अभिभावक संचार और संस्थान नीतियों को नियंत्रित करती हैं।',
      sections: [
        {
          title: '1. प्रवेश और पाठ्यक्रम नामांकन',
          content: [
            'जेईई (JEE) और नीट (NEET) बैचों में प्रवेश पंजीकरण पूरा होने, दस्तावेज सत्यापन और सीटों की उपलब्धता के अधीन है।',
            'पाठ्यक्रम की रूपरेखा, कक्षाओं की समय सारणी, बैच आवंटन और शिक्षक निर्धारण संस्थान प्रबंधन द्वारा तय किए जाते हैं।',
            'जयपुर के केंद्रों के बीच बैच बदलने या केंद्र स्थानांतरण का अनुरोध सीट की उपलब्धता और प्रशासनिक स्वीकृति पर निर्भर करेगा।',
          ],
        },
        {
          title: '2. शुल्क संरचना एवं किस्त अनुसूची',
          content: [
            'कुल शुल्क को प्रवेश के समय सहमत कार्यक्रम के अनुसार समान त्रैमासिक किस्तों में विभाजित किया जाता है।',
            'प्रत्येक किस्त की एक निश्चित देय तिथि होती है। अंतिम किस्त में शेष राशि को समायोजित किया जाता है ताकि कुल योग शुद्ध देय शुल्क के बिल्कुल बराबर हो।',
            'नकद, बैंक ट्रांसफर (NEFT/RTGS), या ऑनलाइन पेमेंट लिंक के माध्यम से प्राप्त भुगतान को पहले की बकाया किस्तों (FIFO) पर स्वचालित रूप से आवंटित किया जाता है।',
            'नामांकन के समय ₹5,000 का अप्रतिदेय (non-refundable) पंजीकरण शुल्क प्रशासनिक प्रक्रियाओं और अध्ययन सामग्री के लिए लिया जाता है।',
          ],
        },
        {
          title: '3. स्वचालित शुल्क अनुस्मारक एवं संचार',
          content: [
            'नामांकन करके, अभिभावक आगामी और देय शुल्क किस्तों के संबंध में स्वचालित सूचनाएं प्राप्त करने के लिए अपनी सहमति देते हैं।',
            'अनुस्मारक अभिभावक की पसंदीदा भाषा (हिंदी या अंग्रेजी) में देय तिथि के सापेक्ष (-7, -1, 0, +3, +7, +15 दिन) भेजे जाते हैं।',
            'भुगतान होते ही रुकने की गारंटी (Stop-Once-Paid): जैसे ही किसी किस्त का पूर्ण भुगतान दर्ज होता है, उस किस्त के सभी शेष लंबित अनुस्मारक तुरंत स्वतः रद्द हो जाते हैं।',
            'संदेशों में कभी भी अनुचित भाषा, अवांछित प्रचार लिंक या बैंक खाते के संवेदनशील विवरण नहीं होंगे।',
          ],
        },
        {
          title: '4. उपस्थिति एवं शैक्षणिक आचरण',
          content: [
            'छात्रों से कक्षा व्याख्यान और प्रयोगशाला सत्रों में कम से कम 75% बायोमेट्रिक उपस्थिति बनाए रखने की अपेक्षा की जाती है।',
            'नियमित टेस्ट और मूल्यांकन अनिवार्य हैं। शैक्षणिक सहायता प्रदान करने और मार्गदर्शन की आवश्यकता वाले छात्रों की पहचान के लिए उपस्थिति और परीक्षा अंकों की समीक्षा की जाती है।',
            'परामर्श (Counselling) केवल शैक्षणिक सुधार और सहायता के लिए है; अंक कम होने या अनुपस्थिति पर कभी भी कोई वित्तीय जुर्माना नहीं लगाया जाएगा।',
          ],
        },
        {
          title: '5. छात्र आचार संहिता',
          content: [
            'छात्रों को केंद्र परिसर में अनुशासन बनाए रखना होगा, सहपाठियों और शिक्षकों का सम्मान करना होगा और कक्षा के दिशा-निर्देशों का पालन करना होगा।',
            'गंभीर दुराचार, रैगिंग या परीक्षा में अनुचित साधनों के उपयोग की स्थिति में संस्थान को संबंधित शिक्षा नियमों के तहत छात्र को निलंबित या निष्कासित करने का अधिकार है।',
          ],
        },
      ],
    },
    // 2. Privacy Policy (Hindi)
    privacy: {
      heading: 'छात्र एवं अभिभावक गोपनीयता नीति',
      summary: 'हम आपके परिवार की गोपनीयता का पूर्ण सम्मान करते हैं। यह नीति बताती है कि हम क्या जानकारी एकत्र करते हैं, इसे कैसे सुरक्षित रखा जाता है, और आपके क्या अधिकार हैं।',
      sections: [
        {
          title: '1. हम कौन सी जानकारी एकत्र करते हैं',
          content: [
            'छात्र जानकारी: पूरा नाम, छात्र कोड, बैच का नाम, नामांकित पाठ्यक्रम (JEE/NEET), नामांकन तिथि और छोड़ने की तिथि।',
            'अभिभावक जानकारी: नाम, सत्यापित मोबाइल नंबर, पसंदीदा भाषा (हिंदी/अंग्रेजी), और डिजिटल सहमति रिकॉर्ड।',
            'शैक्षणिक रिकॉर्ड: दैनिक बायोमेट्रिक उपस्थिति (उपस्थित/अनुपस्थित) और आवधिक टेस्ट के अंक।',
            'वित्तीय एवं लेनदेन रिकॉर्ड: चालान, भुगतान संदर्भ (UTR/कैशफ्री आईडी), भुगतान विधि और जीएसटी कर रसीदें।',
          ],
        },
        {
          title: '2. हम आपकी जानकारी का उपयोग कैसे करते हैं',
          content: [
            'छात्र के शैक्षणिक नामांकन, कक्षा बैच और अध्ययन सामग्री वितरण का प्रबंधन करने के लिए।',
            'शुल्क किस्तों को संसाधित करने, जीएसटी कर रसीदें (CGST + SGST) जारी करने और बहीखाता इतिहास बनाए रखने के लिए।',
            'अभिभावक की पसंदीदा भाषा में निर्धारित एसएमएस/व्हाट्सएप शुल्क अनुस्मारक और शैक्षणिक प्रगति रिपोर्ट भेजने के लिए।',
            'शैक्षणिक जोखिम कारकों (जैसे उपस्थिति में गिरावट या अंकों में कमी) की पहचान करने के लिए ताकि समर्पित परामर्शदाता व्यक्तिगत मार्गदर्शन दे सकें।',
          ],
        },
        {
          title: '3. डेटा सुरक्षा एवं पहुंच नियंत्रण',
          content: [
            'केंद्र-स्तरीय अलगाव: केंद्र के कर्मचारी केवल अपने विशिष्ट केंद्र में नामांकित छात्रों के विवरण ही देख सकते हैं।',
            'कोई तृतीय-पक्ष मार्केटिंग नहीं: हम छात्र या अभिभावक के व्यक्तिगत डेटा को किसी भी तीसरे पक्ष या विपणन कंपनी को कभी नहीं बेचते या किराए पर नहीं देते।',
            'भुगतान सुरक्षा: ऑनलाइन भुगतान सीधे आरबीआई-अधिकृत पेमेंट गेटवे (Cashfree) द्वारा संसाधित किए जाते हैं। हम कभी भी कार्ड नंबर या सीवीवी अपने सर्वर पर संग्रहीत नहीं करते।',
            'सुरक्षित प्रमाणीकरण: कर्मचारियों के पासवर्ड सुरक्षित हैशिंग द्वारा और अभिभावक लॉगिन एन्क्रिप्टेड सुरक्षा टोकन द्वारा सुरक्षित हैं।',
          ],
        },
        {
          title: '4. अभिभावक डेटा अधिकार एवं सुधार',
          content: [
            'अभिभावकों को पेरेंट पोर्टल के माध्यम से कभी भी अपने बच्चे के वित्तीय खाते, उपस्थिति रिकॉर्ड और टेस्ट स्कोर की समीक्षा करने का अधिकार है।',
            'किसी भी गलत व्यक्तिगत विवरण (जैसे फोन नंबर या नाम) में सुधार का अनुरोध करने के लिए, अपने केंद्र के कार्यालय से संपर्क करें।',
          ],
        },
      ],
    },
    // 3. Refund Policy (Hindi)
    refund: {
      heading: 'वैधानिक शुल्क वापसी नीति (Refund Policy)',
      summary: 'पाठ्यक्रम पूरा होने से पहले छोड़ने पर लागू होने वाले पारदर्शी वापसी नियम, जो 2026-11 की आधिकारिक नीति के अनुसार कड़ाई से संचालित होते हैं।',
      coreRules: [
        'पंजीकरण शुल्क (₹5,000) प्रशासनिक प्रक्रियाओं और अध्ययन सामग्री किट के लिए है और यह गैर-वापसी योग्य (Non-refundable) है।',
        'छात्र द्वारा औपचारिक रूप से छोड़ने की तिथि तक पढ़ी गई कक्षाओं का शुल्क दैनिक दर (Daily Rate) के आधार पर काटा जाएगा।',
        'उपस्थित दिनों और पंजीकरण शुल्क की कटौती के बाद शेष अप्रयुक्त राशि छोड़ने की स्वीकृति से 10 दिनों के भीतर वापस की जाती है।',
      ],
      formulaTitle: 'वैधानिक वापसी गणना सूत्र',
      formulaText: 'वापसी राशि = कुल भुगतान − पंजीकरण शुल्क − (दैनिक शिक्षण दर × उपस्थित दिन)',
      exampleTitle: 'स्पष्ट गणना उदाहरण',
      exampleRows: [
        { label: 'कुल वार्षिक पाठ्यक्रम शुल्क', value: '₹1,20,000' },
        { label: 'अब तक किया गया कुल भुगतान', value: '₹60,000' },
        { label: 'अप्रतिदेय पंजीकरण शुल्क', value: '₹5,000' },
        { label: 'पाठ्यक्रम की कुल अवधि (दिन)', value: '365 दिन' },
        { label: 'छात्र द्वारा उपस्थित कुल दिन', value: '60 दिन' },
        { label: 'दैनिक शिक्षण दर (₹1,20,000 ÷ 365)', value: '₹328.77 / दिन' },
        { label: 'उपस्थित दिनों का उपभोग शुल्क (₹328.77 × 60 दिन)', value: '₹19,726.03' },
        { label: 'अभिभावक को शुद्ध देय वापसी राशि', value: '₹35,273.97', highlight: true },
      ],
      payoutNote: 'स्वीकृत रिफंड पंजीकृत अभिभावक के बैंक खाते में एनईएफटी/आरजीटीएस या चेक के माध्यम से 10 कार्य दिवसों के भीतर अंतरित कर दिया जाता है।',
    },
    help: {
      title: 'क्या आपको किसी सहायता की आवश्यकता है?',
      desc: 'हमारे प्रशासनिक कर्मचारी और लेखा डेस्क सोमवार से शनिवार सुबह 9:00 बजे से शाम 6:00 बजे तक सभी जयपुर केंद्रों पर उपलब्ध हैं।',
      email: 'accounts@coaching.in',
    },
  },
}

export default function TermsAndPolicies({ initialTab = 'terms' }: TermsAndPoliciesProps) {
  const navigate = useNavigate()
  const location = useLocation()

  // Determine active tab from URL path or prop
  const getTabFromPath = (): PolicyTab => {
    if (location.pathname.includes('/privacy')) return 'privacy'
    if (location.pathname.includes('/refund')) return 'refund'
    if (location.pathname.includes('/terms')) return 'terms'
    return initialTab
  }

  const [activeTab, setActiveTab] = useState<PolicyTab>(getTabFromPath)
  const [lang, setLang] = useState<'en' | 'hi'>('en')

  useEffect(() => {
    setActiveTab(getTabFromPath())
  }, [location.pathname])

  const t = CONTENT[lang]

  const handleTabChange = (tab: PolicyTab) => {
    setActiveTab(tab)
    if (tab === 'terms') navigate('/terms', { replace: true })
    else if (tab === 'privacy') navigate('/privacy', { replace: true })
    else if (tab === 'refund') navigate('/refund-policy', { replace: true })
  }

  return (
    <div className="min-h-screen bg-[#F8FAF9] flex flex-col font-sans relative overflow-x-hidden text-gray-900 selection:bg-emerald-100 selection:text-emerald-900">
      {/* ── Fixed Brand Top Bar ──────────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 h-16 bg-[#0B0E0D] border-b border-gray-900 flex items-center px-4 lg:px-8 gap-4 select-none shadow-xs">
        {/* Logo */}
        <Link to="/login" className="flex items-center gap-3 mr-2">
          <img
            src="/logo.png"
            alt="CoachFee"
            className="h-7 w-auto object-contain brightness-105"
          />
        </Link>

        {/* Subtle divider */}
        <div className="hidden sm:block h-5 w-px bg-gray-800 mx-1" />

        {/* Centre Badge */}
        <div className="hidden md:flex items-center gap-2 bg-[#101E17] border border-[#1E382B] text-white text-xs font-semibold rounded-xl px-3.5 py-1.5 shadow-2xs">
          <GraduationCap size={15} className="text-emerald-400 shrink-0" />
          <span>{t.portal}</span>
        </div>

        {/* Right side controls */}
        <div className="ml-auto flex items-center gap-3">
          {/* Language Toggle Pill */}
          <div className="inline-flex p-1 bg-[#16221D] border border-[#23352C] rounded-xl text-xs font-semibold shadow-2xs">
            <button
              type="button"
              onClick={() => setLang('en')}
              className={clsx(
                'px-3 py-1 rounded-lg transition-all',
                lang === 'en'
                  ? 'bg-emerald-600 text-white shadow-xs font-bold'
                  : 'text-gray-400 hover:text-white'
              )}
            >
              English
            </button>
            <button
              type="button"
              onClick={() => setLang('hi')}
              className={clsx(
                'px-3 py-1 rounded-lg transition-all',
                lang === 'hi'
                  ? 'bg-emerald-600 text-white shadow-xs font-bold'
                  : 'text-gray-400 hover:text-white'
              )}
            >
              हिन्दी
            </button>
          </div>

          {/* Back to Login Button */}
          <Link
            to="/login"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-300 hover:text-white bg-[#19241E] hover:bg-[#203128] border border-[#2A3E33] px-3.5 py-1.5 rounded-xl transition-all shadow-2xs"
          >
            <ArrowLeft size={14} />
            <span className="hidden sm:inline">{t.back}</span>
          </Link>
        </div>
      </header>

      {/* ── Main Content Container ───────────────────────────────────────────── */}
      <main className="flex-1 max-w-4xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12 relative z-10">
        {/* Header Breadcrumb / Meta */}
        <div className="mb-6">
          <div className="inline-flex items-center gap-2 bg-[#E8F8F0] border border-emerald-200/60 rounded-full px-3.5 py-1 text-xs font-semibold text-[#059669] mb-3">
            <ShieldCheck size={14} className="shrink-0" />
            <span>{t.badge}</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-gray-900 tracking-tight">
            {t.title}
          </h1>
          <p className="text-sm sm:text-base text-gray-600 mt-2 max-w-2xl leading-relaxed">
            {t.subtitle}
          </p>
        </div>

        {/* ── Policy Selector Tab Bar ────────────────────────────────────────── */}
        <div className="bg-white/80 backdrop-blur-md p-1.5 rounded-2xl border border-gray-200/80 shadow-2xs mb-8 flex flex-wrap sm:flex-nowrap gap-1">
          <button
            type="button"
            onClick={() => handleTabChange('terms')}
            className={clsx(
              'flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-xs sm:text-sm font-semibold transition-all cursor-pointer',
              activeTab === 'terms'
                ? 'bg-emerald-600 text-white shadow-sm shadow-emerald-600/20'
                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
            )}
          >
            <FileText size={16} />
            <span>{t.tabs.terms}</span>
          </button>

          <button
            type="button"
            onClick={() => handleTabChange('privacy')}
            className={clsx(
              'flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-xs sm:text-sm font-semibold transition-all cursor-pointer',
              activeTab === 'privacy'
                ? 'bg-emerald-600 text-white shadow-sm shadow-emerald-600/20'
                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
            )}
          >
            <Lock size={16} />
            <span>{t.tabs.privacy}</span>
          </button>

          <button
            type="button"
            onClick={() => handleTabChange('refund')}
            className={clsx(
              'flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-xs sm:text-sm font-semibold transition-all cursor-pointer',
              activeTab === 'refund'
                ? 'bg-emerald-600 text-white shadow-sm shadow-emerald-600/20'
                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
            )}
          >
            <RotateCcw size={16} />
            <span>{t.tabs.refund}</span>
          </button>
        </div>

        {/* ── Active Policy Content Card ─────────────────────────────────────── */}
        <div className="bg-white rounded-3xl border border-gray-100 p-6 sm:p-10 shadow-xs relative overflow-hidden">
          {/* Soft decorative emerald aura on top right corner */}
          <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-100/30 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20" />

          {/* TAB 1: TERMS & CONDITIONS */}
          {activeTab === 'terms' && (
            <div className="space-y-8 animate-in fade-in duration-200">
              <div className="border-b border-gray-100 pb-5">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-[#E8F8F0] text-[#059669] flex items-center justify-center shrink-0">
                    <FileText size={20} />
                  </div>
                  <div>
                    <h2 className="text-xl sm:text-2xl font-bold text-gray-900 tracking-tight">
                      {t.terms.heading}
                    </h2>
                    <p className="text-xs sm:text-sm text-gray-500 mt-0.5">
                      {t.terms.summary}
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-6">
                {t.terms.sections.map((section, idx) => (
                  <div key={idx} className="bg-gray-50/70 border border-gray-100/90 rounded-2xl p-5 sm:p-6">
                    <h3 className="text-base font-bold text-gray-900 mb-3 flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-emerald-500" />
                      {section.title}
                    </h3>
                    <ul className="space-y-2.5">
                      {section.content.map((item, i) => (
                        <li key={i} className="flex items-start gap-2.5 text-xs sm:text-sm text-gray-600 leading-relaxed">
                          <CheckCircle2 size={15} className="text-emerald-600 shrink-0 mt-0.5" />
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 2: PRIVACY POLICY */}
          {activeTab === 'privacy' && (
            <div className="space-y-8 animate-in fade-in duration-200">
              <div className="border-b border-gray-100 pb-5">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-[#E8F8F0] text-[#059669] flex items-center justify-center shrink-0">
                    <ShieldCheck size={20} />
                  </div>
                  <div>
                    <h2 className="text-xl sm:text-2xl font-bold text-gray-900 tracking-tight">
                      {t.privacy.heading}
                    </h2>
                    <p className="text-xs sm:text-sm text-gray-500 mt-0.5">
                      {t.privacy.summary}
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-6">
                {t.privacy.sections.map((section, idx) => (
                  <div key={idx} className="bg-gray-50/70 border border-gray-100/90 rounded-2xl p-5 sm:p-6">
                    <h3 className="text-base font-bold text-gray-900 mb-3 flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-emerald-500" />
                      {section.title}
                    </h3>
                    <ul className="space-y-2.5">
                      {section.content.map((item, i) => (
                        <li key={i} className="flex items-start gap-2.5 text-xs sm:text-sm text-gray-600 leading-relaxed">
                          <CheckCircle2 size={15} className="text-emerald-600 shrink-0 mt-0.5" />
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 3: REFUND POLICY */}
          {activeTab === 'refund' && (
            <div className="space-y-8 animate-in fade-in duration-200">
              <div className="border-b border-gray-100 pb-5">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-[#E8F8F0] text-[#059669] flex items-center justify-center shrink-0">
                    <RotateCcw size={20} />
                  </div>
                  <div>
                    <h2 className="text-xl sm:text-2xl font-bold text-gray-900 tracking-tight">
                      {t.refund.heading}
                    </h2>
                    <p className="text-xs sm:text-sm text-gray-500 mt-0.5">
                      {t.refund.summary}
                    </p>
                  </div>
                </div>
              </div>

              {/* Core Rules List */}
              <div className="bg-gray-50/70 border border-gray-100/90 rounded-2xl p-5 sm:p-6 space-y-3">
                <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider text-emerald-800">
                  {lang === 'en' ? 'Core Statutory Provisions' : 'मुख्य वैधानिक प्रावधान'}
                </h3>
                <ul className="space-y-3">
                  {t.refund.coreRules.map((rule, idx) => (
                    <li key={idx} className="flex items-start gap-3 text-xs sm:text-sm text-gray-700 leading-relaxed">
                      <span className="w-5 h-5 rounded-full bg-[#E8F8F0] text-emerald-700 flex items-center justify-center shrink-0 text-xs font-bold mt-0.5">
                        {idx + 1}
                      </span>
                      <span>{rule}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Formula Callout Box */}
              <div className="bg-[#E8F8F0] border border-emerald-200/60 rounded-2xl p-5 sm:p-6">
                <p className="text-xs font-bold text-[#059669] uppercase tracking-wider mb-2">
                  {t.refund.formulaTitle}
                </p>
                <div className="bg-white/80 backdrop-blur-xs p-3.5 rounded-xl border border-emerald-200/40">
                  <p className="text-sm sm:text-base font-mono font-bold text-gray-900 tracking-tight">
                    {t.refund.formulaText}
                  </p>
                </div>
              </div>

              {/* Worked Calculation Table */}
              <div className="border border-gray-150 rounded-2xl overflow-hidden shadow-2xs">
                <div className="bg-[#101E17] px-6 py-3.5 border-b border-gray-800 flex items-center justify-between">
                  <p className="text-xs font-bold text-emerald-400 uppercase tracking-wider">
                    {t.refund.exampleTitle}
                  </p>
                  <span className="text-[11px] font-medium text-gray-400">
                    {lang === 'en' ? '₹1,20,000 Annual Course' : '₹1,20,000 वार्षिक पाठ्यक्रम'}
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <tbody className="divide-y divide-gray-100">
                      {t.refund.exampleRows.map((row, i) => (
                        <tr
                          key={i}
                          className={clsx(
                            'transition-colors text-xs sm:text-sm',
                            row.highlight
                              ? 'bg-emerald-50/70 font-bold'
                              : i % 2 === 0
                              ? 'bg-white hover:bg-gray-50/80'
                              : 'bg-gray-50/40 hover:bg-gray-50/80'
                          )}
                        >
                          <td className="px-6 py-3.5 text-gray-700 font-medium">
                            {row.label}
                          </td>
                          <td
                            className={clsx(
                              'px-6 py-3.5 text-right font-mono tabular-nums whitespace-nowrap',
                              row.highlight
                                ? 'text-emerald-700 font-bold text-base sm:text-lg'
                                : 'text-gray-900 font-semibold'
                            )}
                          >
                            {row.value}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Payout note */}
              <div className="flex items-start gap-3 bg-amber-50/70 border border-amber-200/60 p-4 rounded-xl text-xs sm:text-sm text-amber-800 leading-relaxed">
                <Clock size={18} className="text-amber-600 shrink-0 mt-0.5" />
                <span>{t.refund.payoutNote}</span>
              </div>
            </div>
          )}

          {/* ── Help / Contact Footer Callout ─────────────────────────────────── */}
          <div className="mt-10 pt-6 border-t border-gray-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 text-xs text-gray-500">
            <div>
              <p className="font-semibold text-gray-800">{t.help.title}</p>
              <p className="mt-0.5">{t.help.desc}</p>
            </div>
            <a
              href={`mailto:${t.help.email}`}
              className="inline-flex items-center gap-1.5 font-semibold text-emerald-700 hover:text-emerald-800 transition-colors"
            >
              <Mail size={14} />
              <span>{t.help.email}</span>
            </a>
          </div>
        </div>
      </main>

      {/* ── App Footer ──────────────────────────────────────────────────────── */}
      <footer className="py-8 text-center text-xs text-gray-400 relative z-10 border-t border-gray-100/60 bg-white/50 backdrop-blur-xs">
        <div className="max-w-4xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p>© 2026 CoachFee · Jaipur Coaching Institute Fee Management System</p>
          <div className="flex items-center gap-4 text-gray-500 font-medium">
            <button
              type="button"
              onClick={() => handleTabChange('terms')}
              className="hover:text-emerald-700 transition-colors cursor-pointer"
            >
              Terms
            </button>
            <span>·</span>
            <button
              type="button"
              onClick={() => handleTabChange('privacy')}
              className="hover:text-emerald-700 transition-colors cursor-pointer"
            >
              Privacy
            </button>
            <span>·</span>
            <button
              type="button"
              onClick={() => handleTabChange('refund')}
              className="hover:text-emerald-700 transition-colors cursor-pointer"
            >
              Refund Policy
            </button>
          </div>
        </div>
      </footer>

      {/* Decorative soft ambient green glows */}
      <div className="fixed -bottom-28 -left-28 w-96 h-96 rounded-full bg-emerald-100/40 blur-3xl pointer-events-none z-0" />
      <div className="fixed -bottom-28 -right-28 w-96 h-96 rounded-full bg-emerald-100/40 blur-3xl pointer-events-none z-0" />
    </div>
  )
}


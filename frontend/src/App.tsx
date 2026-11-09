import { Suspense, lazy, useState } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { RoleGuard, RedirectIfAuth } from './lib/auth'
import { StaffLayout } from './layouts/StaffLayout'
import { ParentLayout, PublicLayout } from './layouts/ParentLayout'
import Login from './pages/Login'

// Lazy load protected and secondary routes
const TermsAndPolicies = lazy(() => import('./pages/TermsAndPolicies'))
const RefundPolicy = lazy(() => import('./pages/RefundPolicy'))
const MockGateway = lazy(() => import('./pages/MockGateway'))
const PaymentReturn = lazy(() => import('./pages/PaymentReturn'))
const ParentHome = lazy(() => import('./pages/parent/Home'))
const ParentConsent = lazy(() => import('./pages/parent/Consent'))
const Dashboard = lazy(() => import('./pages/staff/Dashboard'))
const Students = lazy(() => import('./pages/staff/Students'))
const StudentLedger = lazy(() => import('./pages/staff/StudentLedger'))
const Payments = lazy(() => import('./pages/staff/Payments'))
const Reminders = lazy(() => import('./pages/staff/Reminders'))
const Refunds = lazy(() => import('./pages/staff/Refunds'))
const Risk = lazy(() => import('./pages/staff/Risk'))
const Setup = lazy(() => import('./pages/staff/Setup'))
const Academics = lazy(() => import('./pages/staff/Academics'))

function LoadingSpinner() {
  return (
    <div className="min-h-screen bg-page-bg flex items-center justify-center">
      <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent" />
    </div>
  )
}

function StaffWrapper({ children, centreId, onCentreChange }: { children: React.ReactNode; centreId: number | null; onCentreChange: (id: number | null) => void }) {
  return (
    <RoleGuard roles={['admin', 'accounts', 'counsellor']}>
      <StaffLayout centreId={centreId} onCentreChange={onCentreChange}>
        {children}
      </StaffLayout>
    </RoleGuard>
  )
}

export default function App() {
  const [centreId, setCentreId] = useState<number | null>(null)

  return (
    <Suspense fallback={<LoadingSpinner />}>
      <Routes>
        {/* Public */}
        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="/login" element={<RedirectIfAuth><Login /></RedirectIfAuth>} />
        <Route path="/terms" element={<TermsAndPolicies initialTab="terms" />} />
        <Route path="/terms-and-conditions" element={<Navigate to="/terms" replace />} />
        <Route path="/privacy" element={<TermsAndPolicies initialTab="privacy" />} />
        <Route path="/privacy-policy" element={<Navigate to="/privacy" replace />} />
        <Route path="/refund-policy" element={<TermsAndPolicies initialTab="refund" />} />
        <Route path="/legal" element={<TermsAndPolicies initialTab="terms" />} />
        <Route path="/pay/:token" element={<PublicLayout><MockGateway /></PublicLayout>} />
        <Route path="/payment/return" element={<PaymentReturn />} />

        {/* Parent */}
        <Route path="/parent/consent" element={
          <RoleGuard roles={['parent']}>
            <ParentLayout>
              <ParentConsent />
            </ParentLayout>
          </RoleGuard>
        } />
        <Route path="/parent" element={
          <RoleGuard roles={['parent']}>
            <ParentLayout>
              <ParentHome />
            </ParentLayout>
          </RoleGuard>
        } />

        {/* Staff */}
        <Route path="/staff" element={
          <RoleGuard roles={['admin', 'accounts']}>
            <StaffLayout centreId={centreId} onCentreChange={setCentreId}>
              <Dashboard centreId={centreId} />
            </StaffLayout>
          </RoleGuard>
        } />
        <Route path="/staff/students" element={
          <StaffWrapper centreId={centreId} onCentreChange={setCentreId}>
            <Students centreId={centreId} />
          </StaffWrapper>
        } />
        <Route path="/staff/academics" element={
          <StaffWrapper centreId={centreId} onCentreChange={setCentreId}>
            <Academics centreId={centreId} />
          </StaffWrapper>
        } />
        <Route path="/staff/students/:id" element={
          <StaffWrapper centreId={centreId} onCentreChange={setCentreId}>
            <StudentLedger />
          </StaffWrapper>
        } />
        <Route path="/staff/payments" element={
          <RoleGuard roles={['admin', 'accounts']}>
            <StaffLayout centreId={centreId} onCentreChange={setCentreId}>
              <Payments />
            </StaffLayout>
          </RoleGuard>
        } />
        <Route path="/staff/reminders" element={
          <RoleGuard roles={['admin', 'accounts']}>
            <StaffLayout centreId={centreId} onCentreChange={setCentreId}>
              <Reminders />
            </StaffLayout>
          </RoleGuard>
        } />
        <Route path="/staff/refunds" element={
          <RoleGuard roles={['admin', 'accounts']}>
            <StaffLayout centreId={centreId} onCentreChange={setCentreId}>
              <Refunds />
            </StaffLayout>
          </RoleGuard>
        } />
        <Route path="/staff/risk" element={
          <RoleGuard roles={['admin', 'accounts', 'counsellor']}>
            <StaffLayout centreId={centreId} onCentreChange={setCentreId}>
              <Risk />
            </StaffLayout>
          </RoleGuard>
        } />
        <Route path="/staff/setup" element={
          <RoleGuard roles={['admin']}>
            <StaffLayout centreId={centreId} onCentreChange={setCentreId}>
              <Setup />
            </StaffLayout>
          </RoleGuard>
        } />

        {/* Catch-all */}
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </Suspense>
  )
}


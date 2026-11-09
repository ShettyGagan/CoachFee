import TermsAndPolicies from './TermsAndPolicies'

/**
 * RefundPolicy Page
 * Delegates to the unified TermsAndPolicies component with the Refund tab preselected.
 */
export default function RefundPolicy() {
  return <TermsAndPolicies initialTab="refund" />
}

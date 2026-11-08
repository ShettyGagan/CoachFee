import { clsx } from 'clsx'

const MAP: Record<string, string> = {
  paid: 'chip-paid',
  upcoming: 'chip-upcoming',
  part_paid: 'chip-part',
  overdue: 'chip-overdue',
  part_paid_overdue: 'chip-overdue',
  active: 'chip-paid',
  left: 'chip-upcoming',
  completed: 'chip-upcoming',
  open: 'chip-overdue',
  called: 'chip-part',
  false_flag: 'chip-upcoming',
  draft: 'chip-draft',
  approved: 'chip-approved',
  sent: 'chip-sent',
  pending: 'chip-pending',
  skipped: 'chip-skipped',
  cancelled: 'chip-cancelled',
  high: 'chip-overdue',
  medium: 'chip-part',
  cash: 'chip-upcoming',
  cheque: 'chip-part',
  bank_transfer: 'chip-pending',
  online: 'chip-paid',
  JEE: 'chip-paid',
  NEET: 'chip-part',
}

const LABELS: Record<string, string> = {
  paid: 'Paid',
  upcoming: 'Upcoming',
  part_paid: 'Part paid',
  overdue: 'Overdue',
  part_paid_overdue: 'Part paid, overdue',
  active: 'Active',
  left: 'Left',
  completed: 'Completed',
  open: 'Open',
  called: 'Called',
  false_flag: 'False flag',
  draft: 'Draft',
  approved: 'Approved',
  sent: 'Sent',
  pending: 'Pending',
  skipped: 'Skipped',
  cancelled: 'Cancelled',
  high: 'High',
  medium: 'Medium',
  cash: 'Cash',
  cheque: 'Cheque',
  bank_transfer: 'Bank transfer',
  online: 'Online',
  JEE: 'JEE',
  NEET: 'NEET',
}

interface Props {
  status: string
  label?: string
  daysOverdue?: number | null
  className?: string
}

export function StatusBadge({ status, label, daysOverdue, className }: Props) {
  const cls = (daysOverdue && daysOverdue > 0) ? 'chip-overdue' : (MAP[status] ?? 'chip-upcoming')
  let lbl = label
  if (!lbl) {
    if (daysOverdue && daysOverdue > 0) {
      lbl = `${daysOverdue} days overdue`
    } else {
      lbl = LABELS[status] ?? status
    }
  }
  return <span className={clsx(cls, className)}>{lbl}</span>
}

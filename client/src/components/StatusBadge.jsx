const STYLES = {
  quote_requested: 'bg-ink-900/5 text-ink-700',
  quote_sent: 'bg-ink-900/5 text-ink-700',
  quote_accepted: 'bg-amber-100 text-amber-700',
  payment_pending: 'bg-amber-100 text-amber-700',
  paid: 'bg-blue-100 text-blue-700',
  provider_accepted: 'bg-blue-100 text-blue-700',
  in_progress: 'bg-blue-100 text-blue-700',
  provider_marked_complete: 'bg-purple-100 text-purple-700',
  customer_confirmed: 'bg-emerald-100 text-emerald-700',
  completed: 'bg-emerald-100 text-emerald-700',
  cancelled: 'bg-ink-900/10 text-ink-700/60',
  disputed: 'bg-red-100 text-red-700',
  refunded: 'bg-ink-900/10 text-ink-700/60',
};

const LABELS = {
  quote_requested: 'Quote requested',
  quote_sent: 'Quote sent',
  quote_accepted: 'Awaiting payment',
  payment_pending: 'Payment processing',
  paid: 'Paid — awaiting provider',
  provider_accepted: 'In progress',
  in_progress: 'In progress',
  provider_marked_complete: 'Awaiting your confirmation',
  customer_confirmed: 'Confirmed',
  completed: 'Completed',
  cancelled: 'Cancelled',
  disputed: 'Disputed',
  refunded: 'Refunded',
};

export default function StatusBadge({ status }) {
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${STYLES[status] || 'bg-ink-900/5 text-ink-700'}`}>
      {LABELS[status] || status}
    </span>
  );
}

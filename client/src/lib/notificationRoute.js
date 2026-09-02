/**
 * Maps a notification to the in-app page it should take the user to when
 * clicked. Centralized here so the notification bell dropdown and the full
 * notifications page always agree on where a given notification leads.
 *
 * `currentMode` is the viewer's current_mode ('customer' | 'provider') — used
 * for notification types that can be received by either side of a job (e.g.
 * a job status change) to decide which app section to open. Returns null
 * when a notification has no sensible destination (nothing to click through
 * to, or missing the id it would need).
 */
export function notificationRoute(notification, currentMode) {
  const { type, data } = notification;
  const d = data || {};

  switch (type) {
    case 'new_message':
      if (d.conversationId == null) return null;
      return currentMode === 'provider' ? `/provider/inbox/${d.conversationId}` : `/messages/${d.conversationId}`;

    // Only providers receive quote_request notifications.
    case 'quote_request':
      return d.conversationId != null ? `/provider/inbox/${d.conversationId}` : '/provider/inbox';

    // Only customers receive quote_received notifications.
    case 'quote_received':
      return d.conversationId != null ? `/messages/${d.conversationId}` : '/messages';

    // Sent to the provider when their quote is accepted, or when a customer
    // pays and a fresh job is created for them to review.
    case 'quote_accepted':
    case 'job_request':
      return d.jobId != null ? `/provider/jobs/${d.jobId}` : '/provider/jobs';

    // Can be sent to either the customer or the provider on the job.
    case 'job_accepted':
    case 'job_declined':
    case 'completion_request':
    case 'job_cancelled':
    case 'dispute_resolved':
      if (d.jobId == null) return null;
      return currentMode === 'provider' ? `/provider/jobs/${d.jobId}` : `/jobs/${d.jobId}`;

    // A provider getting paid should land on their earnings/money dashboard;
    // a customer's payment status lives on the job itself.
    case 'payment_update':
      if (currentMode === 'provider') return '/provider/earnings';
      return d.jobId != null ? `/jobs/${d.jobId}` : '/jobs';

    case 'new_review':
      return '/provider/reviews';

    case 'pro_status':
      return '/provider/pro';

    case 'boost_status':
      return '/provider/boost';

    case 'support_reply':
      return '/support';

    default:
      return null;
  }
}

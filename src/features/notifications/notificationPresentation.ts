// What the notifications feed works out from a row, kept apart from the screen
// so it can be tested. Approved design: "Lifted and settled", 2026-11-02.

const POUND_FIGURE = /£\d[\d,]*(?:\.\d{1,2})?/;

// Notifications store no amount of their own, so it's read from the wording.
// Only these types, whose text states one clear figure. Tips are left out
// on purpose: their row says "View tip" and never shows the figure.
const AMOUNT_TYPES: ReadonlySet<string> = new Set(['payment_success', 'payment_refunded', 'payout_failed']);

/** The £ figure to show for this row, if it has one. Failed payouts carry it in the title. */
export function notificationAmount(type: string, title: string, message: string): string | null {
  if (!AMOUNT_TYPES.has(type)) return null;
  return `${title} ${message}`.match(POUND_FIGURE)?.[0] ?? null;
}

/** Only a whole month earns a certificate. A shorter run has the same type but a different kind. */
export function isCertificateNotification(type: string, metadata: unknown): boolean {
  if (type !== 'schedule_fully_booked') return false;
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return false;
  return (metadata as Record<string, unknown>)['kind'] === 'fully_booked_certificate';
}

const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
const DAY_MS = 24 * 60 * 60 * 1000;

/** The heading a row sits under, by the phone's own calendar day. */
export function notificationDayLabel(timestamp: string, now: Date = new Date()): string {
  // Math.round, so a clock-change day (23 or 25 hours) still counts as one day.
  const days = Math.round((startOfDay(now) - startOfDay(new Date(timestamp))) / DAY_MS);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return 'Earlier this week';
  return 'Earlier';
}

/** For a newest-first list: each row that starts a new day, mapped to its heading. */
export function notificationDayHeadings(
  rows: readonly { id: string; timestamp: string }[],
  now: Date = new Date(),
): Map<string, string> {
  const headings = new Map<string, string>();
  let previous: string | null = null;
  for (const row of rows) {
    const label = notificationDayLabel(row.timestamp, now);
    if (label !== previous) headings.set(row.id, label);
    previous = label;
  }
  return headings;
}

const KIND_LABELS: Readonly<Record<string, string>> = {
  booking_pending: 'Booking request',
  pending_booking_reminder: 'Booking request',
  booking_confirmed: 'Booking',
  booking_declined: 'Booking',
  booking_in_progress: 'Booking',
  rebooking_nudge: 'Booking',
  booking_cancelled: 'Cancellation',
  cancel_window_closing: 'Cancellation',
  cancellation_settled: 'Cancellation',
  booking_reminder: 'Reminder',
  daily_recap: 'Your schedule',
  no_show: 'No-show',
  provider_no_show: 'No-show',
  no_show_disputed: 'No-show',
  fee_charged: 'Fee',
  fee_disputed: 'Fee',
  fee_dispute_resolved: 'Fee',
  fee_payment_requested: 'Fee',
  fee_paid_by_client: 'Fee',
  fee_payment_lapsed: 'Fee',
  tip_received: 'Tip',
  payment_success: 'Payment',
  refund_requested: 'Refund',
  refund_request_updated: 'Refund',
  payment_refunded: 'Refund',
  payout_failed: 'Payout',
  payout_debt_recorded: 'Payout',
  payout_debt_recovered: 'Payout',
  reschedule_request: 'Reschedule',
  reschedule_provider_response: 'Reschedule',
  reschedule_confirmed: 'Reschedule',
  reschedule_declined: 'Reschedule',
  reschedule_expired: 'Reschedule',
  review_request: 'Review',
  review_received: 'Review',
  schedule_fully_booked: 'Milestone',
  points_earned: 'Points',
  new_message: 'Message',
  provider_message: 'Message',
  intake_form_reminder: 'Form',
  intake_form_received: 'Form',
  intake_form_completed: 'Form',
  info_pack_received: 'Info',
  address_released: 'Appointment',
  maintenance_due: 'Beauty upkeep',
  aftercare_available: 'Aftercare',
  waitlist_slot_available: 'Waitlist',
  terms_updated: 'Terms',
  promotion: 'Offer',
  new_provider: 'New provider',
  provider_saved: 'Saves',
};

/** The small label at the top of the pop-up. */
export function notificationKindLabel(type: string): string {
  return KIND_LABELS[type] ?? 'Notification';
}

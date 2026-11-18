// One booking payment, told as a timeline: from the client paying, through the
// appointment and the 24 hours it is processing, to the provider's payday.
// Pure, so the steps can be tested without rendering anything.
import { PAYOUT_RELEASE_HOURS } from '../../constants/payoutSchedule';
import { formatTime12Safe } from '../../utils/dateUtils';
import { bookingDisputeLabel } from './bankDisputeStatus';
import type { ProviderPayout, ProviderTipEarning } from '../../services/providerPaymentService';

export type TimelineStepState = 'done' | 'now' | 'next';
export interface TimelineStep {
  key: string;
  title: string;
  when: string;
  state: TimelineStepState;
  amountPence?: number;
  note?: string | undefined;
  /** Shows the "i" that explains what Processing means. */
  explainsProcessing?: boolean;
}

/** What "Processing" means, shown behind every "i" beside the word. */
export const PROCESSING_EXPLAINED = `Processing means we hold the payment until ${PAYOUT_RELEASE_HOURS} hours after the appointment ends. Then it's sent on to clear for your payday.`;

const PAYOUT_LABELS: Record<ProviderPayout['status'], string> = {
  held: 'Processing', transferred: 'Sent for payday', failed: 'Needs attention',
  cancelled: 'Cancelled', reversed: 'Returned',
};

/** A held payout with a refund request open waits for that request to close. */
export const onRefundHold = (row: ProviderPayout): boolean => row.status === 'held' && row.refundRequestOpen;

/** The one-line status a booking payment shows in lists. */
export function payoutStatusLabel(row: ProviderPayout): string {
  return bookingDisputeLabel(row.bankDispute ?? undefined, row.status)
    ?? (onRefundHold(row) ? 'On hold · refund request' : PAYOUT_LABELS[row.status]);
}

export function payoutNeedsAttention(row: ProviderPayout): boolean {
  const dispute = row.bankDispute?.stage;
  return row.status === 'failed' || onRefundHold(row) || dispute === 'open' || dispute === 'matching';
}

/** What a tip adds to the provider, after any card fee CERVICED covers. */
export const tipPence = (tip: ProviderTipEarning): number => tip.payoutPence ?? tip.amountPence;

export function tipStatusLabel(tip: ProviderTipEarning): string {
  switch (tip.payoutStatus) {
    case 'held': return 'Processing';
    case 'transferred': return 'Sent for payday';
    case 'reversed': return 'Reversed by the client\'s bank';
    case 'failed': return 'Needs attention';
    case 'cancelled': return 'Cancelled';
    default: return 'Processing';
  }
}

const HOUR = 60 * 60 * 1000;

/** "Thu 12 Nov" */
export function shortDay(value: Date): string {
  return value.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}
/** "Thu 12 Nov, 2:00 pm" */
function dayAndTime(value: Date): string {
  const time = value.toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit', hour12: true });
  return `${shortDay(value)}, ${time}`;
}
function parseDay(value: string | null | undefined): Date | null {
  if (!value) return null;
  const day = new Date(`${value.slice(0, 10)}T12:00:00`);
  return Number.isNaN(day.getTime()) ? null : day;
}

function appointmentWhen(row: ProviderPayout, appointmentEnd: Date): string {
  const day = parseDay(row.booking?.booking_date) ?? appointmentEnd;
  const start = formatTime12Safe(row.booking?.booking_time ?? null);
  const end = formatTime12Safe(row.booking?.end_time ?? null);
  if (start && end) return `${shortDay(day)}, ${start} – ${end}`;
  if (start) return `${shortDay(day)}, ${start}`;
  return shortDay(day);
}

/** The steps for one booking payment and any tips on it, oldest first. */
export function bookingPaymentTimeline(
  row: ProviderPayout,
  tips: readonly ProviderTipEarning[],
  options: { now: Date; scheduleSentence: string },
): TimelineStep[] {
  const now = options.now.getTime();
  const releaseAt = new Date(row.release_after);
  const appointmentEnd = new Date(releaseAt.getTime() - PAYOUT_RELEASE_HOURS * HOUR);
  const appointmentOver = appointmentEnd.getTime() <= now;
  const dispute = row.bankDispute ?? null;
  const disputeOpen = dispute?.stage === 'open' || dispute?.stage === 'matching';
  const refundHold = onRefundHold(row);
  const released = row.status !== 'held';
  // Something stopped the usual path, and this step is where it stands now.
  const stopped = disputeOpen || dispute?.stage === 'lost' || refundHold
    || row.status === 'failed' || row.status === 'cancelled' || row.status === 'reversed';

  const steps: TimelineStep[] = [
    { key: 'paid', title: 'Booked and paid', when: dayAndTime(new Date(row.created_at)), state: 'done' },
    {
      key: 'appointment', title: 'Appointment', when: appointmentWhen(row, appointmentEnd),
      state: appointmentOver || released ? 'done' : stopped ? 'next' : 'now',
    },
  ];

  for (const tip of [...tips].sort((a, b) => (a.paidAt ?? '').localeCompare(b.paidAt ?? ''))) {
    steps.push({
      key: `tip-${tip.id}`, title: 'Tip added', state: 'done', amountPence: tipPence(tip),
      when: tip.paidAt ? dayAndTime(new Date(tip.paidAt)) : 'After the appointment',
      note: 'All yours: CERVICED covers the card fee. Tips can\'t be refunded.',
    });
  }

  const processingDone = released || (stopped && releaseAt.getTime() <= now);
  steps.push({
    key: 'processing', title: 'Processing', explainsProcessing: true,
    when: processingDone ? `Finished ${dayAndTime(releaseAt)}` : `Until ${dayAndTime(releaseAt)}`,
    state: processingDone ? 'done' : appointmentOver && !stopped ? 'now' : 'next',
  });

  if (refundHold) {
    steps.push({
      key: 'refund', title: 'Refund requested', when: 'Waiting for your answer', state: 'now',
      note: 'Your client asked for a refund, so this payment is on hold until that\'s settled. Then whatever is still yours carries on as normal.',
    });
  }
  if (dispute) {
    const label = bookingDisputeLabel(dispute, row.status);
    if (label) {
      steps.push({
        key: 'dispute', title: 'Bank dispute', when: label,
        state: dispute.stage === 'won' ? 'done' : 'now',
        note: dispute.stage === 'open' || dispute.stage === 'matching'
          ? 'The client\'s bank questioned this payment. Answer it from the booking.' : undefined,
      });
    }
  }
  if (row.status === 'failed') {
    steps.push({ key: 'failed', title: 'Needs attention', when: 'Your share couldn\'t be sent on', state: 'now', note: 'Contact support if this doesn\'t clear up.' });
  }
  if (row.status === 'cancelled' || row.status === 'reversed') {
    steps.push({
      key: 'ended', title: row.status === 'cancelled' ? 'Cancelled' : 'Returned', state: 'now',
      when: row.status === 'cancelled' ? 'This payment won\'t be paid out' : 'This payment was taken back',
    });
    return steps;
  }
  if (dispute?.stage === 'lost') return steps;

  steps.push({
    key: 'sent', title: 'Sent for payday', state: row.status === 'transferred' ? (disputeOpen ? 'done' : 'now') : 'next',
    when: 'Clears about 3 working days after the client paid',
  });
  steps.push({ key: 'bank', title: 'Paid to your bank', state: 'next', when: options.scheduleSentence });
  return steps;
}

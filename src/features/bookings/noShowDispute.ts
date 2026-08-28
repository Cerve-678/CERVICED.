import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { disputeNoShow, invokeSendSupportRequest } from '../../services/databaseService';
import { formatBookingRef } from './presentation';
import { logger } from '../../utils/logger';
import type { ConfirmedBooking } from '../../types/booking';

/**
 * Filing a no-show dispute, as both hats do it.
 *
 * Two steps that are deliberately not equal in weight:
 *
 *  1. `dispute_no_show()` is THE record. It stamps the booking, stops the
 *     no-show becoming a permanent reliability count, and notifies the other
 *     party. If this fails, nothing happened and the caller must say so.
 *  2. The support ticket is how a HUMAN ever sees it. Cerviced does not
 *     adjudicate no-shows in code, so without this the dispute sits in a
 *     column nobody reads.
 *
 * Step 2 failing does not undo step 1, and must not be reported as the whole
 * thing having failed — same reasoning as send-support-request's own "the row
 * is the record, the email is a notification of it". The caller gets
 * `ticketNumber: null` and should tell them the dispute is logged but hand
 * them the support address as well.
 *
 * This lives here rather than in either screen because the two hats file the
 * identical thing about the same booking from opposite sides, and a dispute
 * that reaches support with different information depending on who sent it is
 * worse than useless to whoever reads it.
 */
export interface NoShowDisputeResult {
  /** Null when the dispute was recorded but the support ticket didn't file. */
  ticketNumber: number | null;
}

export async function fileNoShowDispute(
  booking: ConfirmedBooking,
  reason: string,
  /** Which hat is disputing — decides only how the ticket reads, never who is
   *  allowed to (the RPC checks that against auth.uid()). */
  disputedBy: 'client' | 'provider',
  activeMode: string,
): Promise<NoShowDisputeResult> {
  await disputeNoShow(booking.id, reason.trim());

  const accusation =
    disputedBy === 'client'
      ? 'was marked as a no-show by their provider'
      : 'was reported as a missed appointment by their client';

  try {
    const { ticketNumber } = await invokeSendSupportRequest({
      category: 'Booking Issue',
      description: [
        `NO-SHOW DISPUTE — ${formatBookingRef(booking)}`,
        '',
        `The ${disputedBy} ${accusation} and says it is not true.`,
        '',
        `Booking: ${booking.serviceName} with ${booking.providerName}`,
        `Date: ${booking.bookingDate} ${booking.bookingTime}`,
        `Booking id: ${booking.id}`,
        '',
        'In their words:',
        reason.trim(),
      ].join('\n'),
      platform: `${Platform.OS} ${String(Platform.Version)}`,
      appVersion: Constants.expoConfig?.version ?? 'unknown',
      activeMode,
    });
    return { ticketNumber };
  } catch (e) {
    // Swallowed on purpose, and only here: the dispute above already
    // succeeded, so throwing would tell the user their dispute failed when it
    // didn't. Logged so it is not silent to us.
    logger.error('[noShowDispute] dispute recorded but support ticket failed:', e);
    return { ticketNumber: null };
  }
}

import { RESCHEDULE_REPLY_MS } from '../constants/reschedule';
import { formatTime12Safe } from './dateUtils';

/**
 * The time the waiting side must answer a reschedule by, e.g. "3:45pm".
 *
 * `turnStartedAt` is when it became their turn: the request's created_at while
 * it's waiting on the provider, its updated_at once the provider has offered
 * times. Returns null for a missing/unparseable timestamp or a deadline that
 * has already passed (the expiry cron closes it within a minute), so callers
 * simply show nothing rather than a time in the past.
 */
export function rescheduleReplyBy(
  turnStartedAt: string | null | undefined,
  now: number = Date.now(),
): string | null {
  if (!turnStartedAt) return null;
  const start = new Date(turnStartedAt).getTime();
  if (Number.isNaN(start)) return null;
  const deadline = start + RESCHEDULE_REPLY_MS;
  if (deadline <= now) return null;
  return formatTime12Safe(new Date(deadline));
}

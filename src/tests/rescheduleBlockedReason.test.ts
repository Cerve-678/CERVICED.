import { BookingStatus } from '../types/booking';
import { readFileSync } from 'fs';
import { join } from 'path';
import { getRescheduleBlock, getStaleRequestBlock, hasBookingDatePassed, PROVIDER_STARTED_BLOCK } from '../utils/rescheduleBlockedReason';

// Fixed "now": Fri 25 Sep 2026, 12:00 local.
const NOW = new Date(2026, 8, 25, 12, 0, 0);
const FUTURE = ['2026-09-30', '2:00 PM'] as const;
const PAST = ['2026-09-20', '2:00 PM'] as const;

describe('hasBookingDatePassed', () => {
  it('is false for a later time today and true for an earlier one', () => {
    expect(hasBookingDatePassed('2026-09-25', '3:00 PM', NOW)).toBe(false);
    expect(hasBookingDatePassed('2026-09-25', '9:00 AM', NOW)).toBe(true);
  });

  it('reads 24-hour times too', () => {
    expect(hasBookingDatePassed('2026-09-25', '13:00', NOW)).toBe(false);
    expect(hasBookingDatePassed('2026-09-25', '09:00', NOW)).toBe(true);
  });

  it('never calls today past when the time is unreadable', () => {
    expect(hasBookingDatePassed('2026-09-25', '', NOW)).toBe(false);
    expect(hasBookingDatePassed('2026-09-24', '', NOW)).toBe(true);
  });
});

describe('getRescheduleBlock', () => {
  it('allows an upcoming booking in the future', () => {
    expect(getRescheduleBlock(BookingStatus.UPCOMING, ...FUTURE, NOW)).toBeNull();
  });

  it('stops a provider once the appointment is in progress, and says to message the client', () => {
    const block = getRescheduleBlock(BookingStatus.IN_PROGRESS, ...PAST, NOW);
    expect(block).toBe(PROVIDER_STARTED_BLOCK);
    expect(block?.message).toMatch(/message the client to sort it out/);
  });

  it('stops a provider for an upcoming booking whose start is behind us', () => {
    expect(getRescheduleBlock(BookingStatus.UPCOMING, ...PAST, NOW)).toBe(PROVIDER_STARTED_BLOCK);
  });

  it('uses the same words as the database refusal', () => {
    const sql = readFileSync(join(__dirname, '..', '..', 'supabase/migrations/20261113170000_no_reschedule_offer_after_start.sql'), 'utf8');
    const refusal = PROVIDER_STARTED_BLOCK.message.replace("You can't offer new times once an appointment has started.", '');
    expect(sql).toContain(refusal.trim().replace(/'/g, "''"));
    // Every provider entry point refuses after the start, and so does a client's
    // cancel-if-declined decline.
    expect(sql.match(/AT TIME ZONE 'Europe\/London'\) <= now\(\)/g)).toHaveLength(3);
    expect(sql).toMatch(/IF v_cancel AND v_starts_at <= now\(\) THEN/);
  });

  it('says cancelled, not date-passed, when both are true — the event wins', () => {
    const block = getRescheduleBlock(BookingStatus.CANCELLED, ...PAST, NOW);
    expect(block?.message).toMatch(/cancelled/);
    expect(block?.message).not.toMatch(/passed/);
  });

  it.each([BookingStatus.COMPLETED, BookingStatus.NO_SHOW, BookingStatus.PROVIDER_NO_SHOW])(
    'treats %s as finished, in the future or the past',
    (status) => {
      expect(getRescheduleBlock(status, ...FUTURE, NOW)?.message).toMatch(/appointment has passed/);
      expect(getRescheduleBlock(status, ...PAST, NOW)?.message).toMatch(/appointment has passed/);
    },
  );

  it('asks a pending future booking to be confirmed first', () => {
    expect(getRescheduleBlock(BookingStatus.PENDING, ...FUTURE, NOW)?.title).toBe('Confirm this booking first');
  });

  it('says the date has passed for a pending booking nobody answered in time', () => {
    expect(getRescheduleBlock(BookingStatus.PENDING, ...PAST, NOW)?.message).toMatch(/has passed/);
  });
});

describe('getRescheduleBlock for a client', () => {
  it('still lets a client ask while it is in progress, and says the date passed after', () => {
    expect(getRescheduleBlock(BookingStatus.IN_PROGRESS, ...PAST, NOW, 'client')).toBeNull();
    expect(getRescheduleBlock(BookingStatus.UPCOMING, ...PAST, NOW, 'client')?.message).toMatch(/date for this appointment has passed/);
  });

  it('words a pending booking around the provider confirming, not "you"', () => {
    const block = getRescheduleBlock(BookingStatus.PENDING, ...FUTURE, NOW, 'client');
    expect(block?.message).toMatch(/waiting for the provider/);
  });
});

describe('getStaleRequestBlock', () => {
  it('lets a provider through when the request is still pending', () => {
    expect(getStaleRequestBlock('provider', 'pending', 'Sam')).toBeNull();
  });

  it('tells a provider they already answered when the client has yet to choose', () => {
    expect(getStaleRequestBlock('provider', 'provider_responded', 'Sam')?.title).toBe('Already answered');
  });

  it('tells a provider an old request is closed when nothing is open', () => {
    expect(getStaleRequestBlock('provider', null, 'Sam')?.title).toBe('This request is no longer open');
  });

  it('lets a client through when the provider has offered times', () => {
    expect(getStaleRequestBlock('client', 'provider_responded', 'Glow')).toBeNull();
  });

  it('tells a client an old offer is gone when nothing is open', () => {
    expect(getStaleRequestBlock('client', null, 'Glow')?.message).toMatch(/no longer open/);
  });
});

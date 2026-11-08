import { readFileSync } from 'fs';
import { join } from 'path';
import { applyRescheduleRequestRow } from '../services/bookingService';
import type { DbBookingRescheduleRequest } from '../types/database';
import type { ConfirmedBooking } from '../types/booking';

const booking = {
  id: 'booking-id', bookingDate: '2026-11-20', bookingTime: '10:00',
  isPendingReschedule: false,
} as ConfirmedBooking;

const offer = {
  booking_id: 'booking-id', requested_by: 'provider', status: 'provider_responded',
  original_date: '2026-11-20', original_time: '10:00',
  provider_available_slots: [{ date: '2026-11-21', times: ['11:00'] }],
  reschedule_count: 0, created_at: '2026-11-08T10:00:00Z', updated_at: '2026-11-08T10:00:00Z',
} as DbBookingRescheduleRequest;

it('hydrates the provider offer and its decline outcome from the database', () => {
  const cancellable = applyRescheduleRequestRow(booking, { ...offer, cancel_if_declined: true });
  expect(cancellable.rescheduleRequest?.requestedBy).toBe('provider');
  expect(cancellable.rescheduleRequest?.cancelIfDeclined).toBe(true);
  expect(cancellable.rescheduleRequest?.providerAvailableDates).toHaveLength(1);

  const standard = applyRescheduleRequestRow(booking, { ...offer, cancel_if_declined: false });
  expect(standard.rescheduleRequest?.cancelIfDeclined).toBe(false);
});

it('keeps cancellation opt-in and ties it to the owning client and full refund path', () => {
  const sql = readFileSync(join(__dirname, '../../supabase/migrations/20261108141616_cancel_declined_provider_reschedule_offer.sql'), 'utf8');
  expect(sql).toContain('cancel_if_declined boolean NOT NULL DEFAULT false');
  expect((sql.match(/cancel_if_declined = FALSE/g) ?? []).length).toBe(2);
  expect(sql).toContain('b.user_id = auth.uid()');
  expect(sql).toContain("r.status = 'provider_responded'");
  expect(sql).toContain("UPDATE public.bookings SET status = 'cancelled'");
  expect(sql).toContain("refund_booking_async(p_booking_id, 'provider_offer_declined')");
});

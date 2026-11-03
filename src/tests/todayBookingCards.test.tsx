import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { TodayBookingCards } from '../features/providers/TodayScheduleCards';
import { buildTodaySchedule } from '../features/providers/todaySchedule';
import type { BookingWithAddOns } from '../types/database';

const palette = { card: '#FFFFFF', text: '#26201E', sub: '#6B5F58', border: '#E5DDD6', accent: '#AF9197' };

function booking(id: string, date: string, status: BookingWithAddOns['status'] = 'confirmed'): BookingWithAddOns {
  return {
    id,
    booking_date: date,
    booking_time: '10:00:00',
    end_time: '11:00:00',
    status,
    customer_name: `Client ${id} Smith`,
    service_name_snapshot: `Service ${id}`,
    service_id: null,
    base_price: 40,
    add_ons_total: 0,
  } as unknown as BookingWithAddOns;
}

function schedule(bookings: BookingWithAddOns[]) {
  return buildTodaySchedule({
    now: new Date(2026, 9, 26, 15, 0),
    todayYmd: '2026-10-26',
    tomorrowYmd: '2026-10-27',
    bookings,
    patchTestServiceIds: new Set<string>(),
  });
}

describe('TodayBookingCards', () => {
  it('labels each card with its day when nothing is left today', () => {
    render(
      <TodayBookingCards
        schedule={schedule([booking('a', '2026-10-27'), booking('b', '2026-11-03', 'pending')])}
        palette={palette}
        onOpenBooking={() => {}}
      />,
    );
    expect(screen.getByText('COMING UP')).toBeTruthy();
    expect(screen.getByText('Your next 2 bookings')).toBeTruthy();
    expect(screen.getByText('TOMORROW')).toBeTruthy();
    expect(screen.getByText('TUE 3 NOV')).toBeTruthy();
    expect(screen.getByText('REQUEST')).toBeTruthy();
    expect(screen.getByText('Client a Smith')).toBeTruthy();
  });

  it('shows the whole booking: add-ons, total, payment, note and reference', () => {
    const full = {
      ...booking('c', '2026-10-27'),
      add_ons: [{ id: 'x', booking_id: 'c', add_on_id: null, name_snapshot: 'Nail art', price_snapshot: 5 }],
      add_ons_total: 5,
      payment_status: 'deposit_paid',
      deposit_amount: 10,
      remaining_balance: 35,
      notes: 'Short and square please',
      booking_ref: 'CRV-1234',
    } as unknown as BookingWithAddOns;
    render(<TodayBookingCards schedule={schedule([full])} palette={palette} onOpenBooking={() => {}} />);
    expect(screen.getByText('Client c Smith')).toBeTruthy();
    expect(screen.getByText('Service c')).toBeTruthy();
    expect(screen.getByText('+ Nail art')).toBeTruthy();
    expect(screen.getByText('Until 11am · 1h')).toBeTruthy();
    expect(screen.getByText('£45')).toBeTruthy();
    expect(screen.getByText('£10 deposit paid · £35 balance due')).toBeTruthy();
    expect(screen.getByText('“Short and square please”')).toBeTruthy();
    expect(screen.getByText('REF CRV-1234')).toBeTruthy();
  });

  it('shows nothing when there are no bookings to come', () => {
    render(<TodayBookingCards schedule={schedule([])} palette={palette} onOpenBooking={() => {}} />);
    expect(screen.queryByText('COMING UP')).toBeNull();
  });
});

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
    customer_name: `Client ${id}`,
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
    expect(screen.getByText('Client A.')).toBeTruthy();
  });

  it('shows nothing when there are no bookings to come', () => {
    render(<TodayBookingCards schedule={schedule([])} palette={palette} onOpenBooking={() => {}} />);
    expect(screen.queryByText('COMING UP')).toBeNull();
  });
});

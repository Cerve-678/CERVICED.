import { isTipWindowOpen, tipWindowClosesAt } from '../features/bookings/tipWindow';

describe('tip window', () => {
  it('closes 48 hours after the appointment ends', () => {
    const closes = tipWindowClosesAt('2026-10-20', '15:30');
    expect(closes).toEqual(new Date(2026, 9, 22, 15, 30));
  });

  it('reads 12-hour and seconds formats', () => {
    expect(tipWindowClosesAt('2026-10-20', '3:30 PM')).toEqual(new Date(2026, 9, 22, 15, 30));
    expect(tipWindowClosesAt('2026-10-20', '15:30:00')).toEqual(new Date(2026, 9, 22, 15, 30));
    expect(tipWindowClosesAt('2026-10-20', '12:15 AM')).toEqual(new Date(2026, 9, 22, 0, 15));
  });

  it('is open just before and closed at the deadline', () => {
    expect(isTipWindowOpen('2026-10-20', '15:30', new Date(2026, 9, 22, 15, 29))).toBe(true);
    expect(isTipWindowOpen('2026-10-20', '15:30', new Date(2026, 9, 22, 15, 30))).toBe(false);
  });

  it('leaves an unreadable time open for the server to decide', () => {
    expect(isTipWindowOpen('2026-10-20', 'soon')).toBe(true);
  });
});

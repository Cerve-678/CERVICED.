import {
  bookedOnLabel,
  bookingSiteName,
  externalBookingStart,
  splitExternalBookings,
} from '../features/bookings/externalBookings';

describe('externalBookingStart', () => {
  it('combines the date and the time in local time', () => {
    const start = externalBookingStart({ booking_date: '2026-10-16', start_time: '14:30:00' });
    expect(start.getFullYear()).toBe(2026);
    expect(start.getMonth()).toBe(9);
    expect(start.getDate()).toBe(16);
    expect(start.getHours()).toBe(14);
    expect(start.getMinutes()).toBe(30);
  });
});

describe('splitExternalBookings', () => {
  const now = new Date(2026, 9, 16, 12, 0, 0);
  const entries = [
    { id: 'later', booking_date: '2026-10-20', start_time: '09:00:00' },
    { id: 'today-later', booking_date: '2026-10-16', start_time: '15:00:00' },
    { id: 'today-earlier', booking_date: '2026-10-16', start_time: '10:00:00' },
    { id: 'last-week', booking_date: '2026-10-09', start_time: '11:00:00' },
  ];

  it('keeps an entry upcoming until its start time passes, soonest first', () => {
    expect(splitExternalBookings(entries, now).upcoming.map(e => e.id)).toEqual(['today-later', 'later']);
  });

  it('lists past entries most recent first', () => {
    expect(splitExternalBookings(entries, now).past.map(e => e.id)).toEqual(['today-earlier', 'last-week']);
  });
});

describe('bookingSiteName', () => {
  it('names the common booking sites, including subdomains', () => {
    expect(bookingSiteName('https://www.fresha.com/a/glow-studio')).toBe('Fresha');
    expect(bookingSiteName('treatwell.co.uk/place/glow')).toBe('Treatwell');
    expect(bookingSiteName('https://glow.as.me/')).toBe('Acuity');
  });

  it('never prints a raw hostname for an unknown site', () => {
    expect(bookingSiteName('https://glowstudio.london/book')).toBe('their site');
    expect(bookingSiteName(null)).toBe('their site');
    expect(bookingSiteName('not a url at all')).toBe('their site');
  });

  it('builds the tag text', () => {
    expect(bookedOnLabel('https://fresha.com/x')).toBe('Booked on Fresha');
  });
});

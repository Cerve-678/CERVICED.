import { appointmentLabel, sentFormsMessage, upcomingForForms } from '../features/intake-forms/sendForms';

describe('sending a form to several appointments', () => {
  const now = new Date(2026, 10, 18, 12, 0).getTime();
  const b = (id: string, status: string, date: string, time: string | null) => ({ id, status, booking_date: date, booking_time: time });

  it('keeps open appointments that have not started, soonest first', () => {
    const list = [
      b('later', 'confirmed', '2026-11-20', '10:00'),
      b('done', 'completed', '2026-11-19', '10:00'),
      b('started', 'confirmed', '2026-11-18', '11:00'),
      b('soon', 'pending', '2026-11-18', '15:00'),
      b('cancelled', 'cancelled', '2026-11-21', '10:00'),
    ];
    expect(upcomingForForms(list, now).map(x => x.id)).toEqual(['soon', 'later']);
  });

  it('labels the appointment with its day and time', () => {
    expect(appointmentLabel(b('x', 'confirmed', '2026-10-03', '14:00'))).toMatch(/^Sat 3 Oct, 2:00\s?pm$/i);
    expect(appointmentLabel(b('x', 'confirmed', '2026-10-03', null))).toBe('Sat 3 Oct');
  });

  it('says how many were sent and how many already had it', () => {
    expect(sentFormsMessage(3, 3)).toBe('Form sent to 3 clients.');
    expect(sentFormsMessage(1, 1)).toBe('Form sent to 1 client.');
    expect(sentFormsMessage(2, 3)).toBe('Form sent to 2 clients. 1 already had it.');
    expect(sentFormsMessage(0, 1)).toBe('They already have this form.');
    expect(sentFormsMessage(0, 2)).toBe('They all already have this form.');
  });
});

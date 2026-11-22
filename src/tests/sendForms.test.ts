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

describe('a form is never sent empty', () => {
  const { formProblem } = require('../features/intake-forms/sendForms') as typeof import('../features/intake-forms/sendForms');
  it('needs a question, wording, policy text and real choices', () => {
    expect(formProblem([])).toBe('Add at least one question.');
    expect(formProblem([{ type: 'text', label: ' ' }])).toBe('Question 1 needs wording.');
    expect(formProblem([{ type: 'policy', label: 'Cancellation', body: '  ' }])).toBe('Add the policy text to "Cancellation".');
    expect(formProblem([{ type: 'choice', label: 'Skin type', options: ['Oily', ''] }])).toBe('Give "Skin type" at least two options.');
    expect(formProblem([
      { type: 'text', label: 'Allergies?' },
      { type: 'policy', label: 'Policy', body: 'No refunds.' },
      { type: 'choice', label: 'Skin', options: ['Oily', 'Dry'] },
    ])).toBeNull();
  });
});

describe('a client never gets the same form twice', () => {
  const { bookingsHoldingForm } = require('../features/intake-forms/sendForms') as typeof import('../features/intake-forms/sendForms');
  it('counts the same saved form, or one with the same name', () => {
    const sent = [
      { booking_id: 'a', library_form_id: 'f1', title: 'Lash consultation' },
      { booking_id: 'b', library_form_id: 'f2', title: ' lash Consultation ' },
      { booking_id: 'c', library_form_id: 'f3', title: 'Patch test' },
      { booking_id: 'a', library_form_id: null, title: 'Lash consultation' },
    ];
    expect(bookingsHoldingForm(sent, 'f1', 'Lash consultation').sort()).toEqual(['a', 'b']);
    expect(bookingsHoldingForm(sent, 'f3', 'Patch test')).toEqual(['c']);
    expect(bookingsHoldingForm(sent, 'f9', 'Aftercare')).toEqual([]);
  });
});

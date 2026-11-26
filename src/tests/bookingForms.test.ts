import { formsToDoFirst } from '../features/bookings/bookingForms';

describe('formsToDoFirst', () => {
  it('lists every form, still-to-do ones first, each group in sent order', () => {
    const forms = [
      { id: 'terms', status: 'pending' as const },
      { id: 'consult', status: 'completed' as const },
      { id: 'patch', status: 'pending' as const },
    ];
    expect(formsToDoFirst(forms).map(f => f.id)).toEqual(['terms', 'patch', 'consult']);
  });

  it('keeps a booking with one form as it was', () => {
    expect(formsToDoFirst([{ id: 'only', status: 'completed' as const }]).map(f => f.id)).toEqual(['only']);
  });
});

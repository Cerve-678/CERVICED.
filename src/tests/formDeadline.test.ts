import { DEADLINE_OPTIONS, deadlineLabel, dueByLabel, isOverdue } from '../features/intake-forms/formDeadline';

describe('form deadline', () => {
  it('labels every offered choice, and values set some other way', () => {
    for (const o of DEADLINE_OPTIONS) expect(deadlineLabel(o.hours)).toBe(o.label);
    expect(deadlineLabel(72)).toBe('3 days before');
    expect(deadlineLabel(5)).toBe('5 hours before');
  });

  it('shows the due date and time, or nothing when there is no deadline', () => {
    expect(dueByLabel(null)).toBeNull();
    expect(dueByLabel('not a date')).toBeNull();
    const due = new Date(2026, 9, 3, 14, 0).toISOString();
    expect(dueByLabel(due)).toMatch(/^Sat 3 Oct, 2:00\s?pm$/i);
  });

  it('is overdue only when unanswered and past the time', () => {
    const due = new Date(2026, 9, 3, 14, 0);
    const after = due.getTime() + 1;
    expect(isOverdue(due.toISOString(), 'pending', after)).toBe(true);
    expect(isOverdue(due.toISOString(), 'completed', after)).toBe(false);
    expect(isOverdue(due.toISOString(), 'pending', due.getTime() - 1)).toBe(false);
    expect(isOverdue(null, 'pending', after)).toBe(false);
  });
});

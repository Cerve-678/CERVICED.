// Apothecary's prescription pad: today's date and the lines filled in from
// the provider's own profile, with nothing invented for an empty one.
jest.mock('expo-image', () => ({ Image: () => null }));

import { prescriptionDate, prescriptionLines } from '../features/providers/heroes/ApothecaryHero';

describe('prescriptionDate', () => {
  it('writes the date the way a chemist would', () => {
    expect(prescriptionDate(new Date(2026, 10, 16))).toBe('16 NOV 2026');
  });
});

describe('prescriptionLines', () => {
  it('fills in what they do and where they are', () => {
    expect(prescriptionLines('LASHES · BROWS', 'Hackney, London')).toEqual([
      { label: 'PREPARED FOR', value: 'You' },
      { label: 'TREATMENTS', value: 'Lashes · Brows' },
      { label: 'DISPENSED AT', value: 'Hackney, London' },
    ]);
  });

  it('leaves off a line it has nothing for', () => {
    expect(prescriptionLines('', '').map(line => line.label)).toEqual(['PREPARED FOR']);
  });
});

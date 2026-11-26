import {
  selectedBookingInstructions,
  toggleBookingInstruction,
} from '../features/business-details/bookingInstructions';

const ARRIVE = 'Please arrive 10 minutes early.';
const INFO_PACK = 'Please read the info pack on your booking for important information.';

describe('booking instruction suggestions', () => {
  it('fills an empty box with just the line', () => {
    expect(toggleBookingInstruction('', ARRIVE)).toBe(ARRIVE);
    expect(toggleBookingInstruction('   ', ARRIVE)).toBe(ARRIVE);
  });

  it("adds below what the provider wrote and keeps their words", () => {
    expect(toggleBookingInstruction('Free parking outside.', ARRIVE)).toBe(`Free parking outside.\n${ARRIVE}`);
  });

  it('takes a tapped line back out', () => {
    const both = toggleBookingInstruction(ARRIVE, INFO_PACK);
    expect(toggleBookingInstruction(both, ARRIVE)).toBe(INFO_PACK);
    expect(toggleBookingInstruction(ARRIVE, ARRIVE)).toBe('');
  });

  it('removes a line typed mid-sentence without touching the rest', () => {
    expect(toggleBookingInstruction(`Free parking. ${ARRIVE} Ring the bell.`, ARRIVE)).toBe('Free parking. Ring the bell.');
  });

  it('marks only the lines that are in the text', () => {
    expect(selectedBookingInstructions(`Free parking.\n${INFO_PACK}`)).toEqual([INFO_PACK]);
    expect(selectedBookingInstructions('Free parking.')).toEqual([]);
  });
});

/**
 * Ready-made lines for a provider's booking instructions.
 *
 * Both editors of booking_policies.bookingInstructions (Info Reg's and
 * Policies' "Your instructions") offer the same lines, so they live here once.
 * The client sees the text as "<provider>'S INSTRUCTIONS" on their booking.
 * Directions aren't offered: How to get there and Arrival details own those. Tapping one only edits the text in the box:
 * what's stored stays the provider's own words, free to change afterwards.
 */
export const BOOKING_INSTRUCTION_SUGGESTIONS = [
  'Please arrive 10 minutes early.',
  'Please read the info pack on your booking for important information.',
  'Please read my policies before your appointment.',
  'Please let me know if you are running late.',
  'Please bring any inspiration photos.',
];

/** Which suggestions are already somewhere in the text, typed or tapped. */
export function selectedBookingInstructions(text: string): string[] {
  return BOOKING_INSTRUCTION_SUGGESTIONS.filter(line => text.includes(line));
}

/** Adds the line on its own row, or takes it out if it's already there. */
export function toggleBookingInstruction(text: string, line: string): string {
  if (!text.includes(line)) {
    const current = text.trim();
    return current ? `${current}\n${line}` : line;
  }
  return text
    .replace(line, '')
    .split('\n')
    .map(row => row.replace(/ {2,}/g, ' ').trim())
    .filter(Boolean)
    .join('\n');
}

import { findBufferClash, minutesFromDay } from '../utils/bufferClash';

const DAY = '2026-10-27';
// 10:00–11:00 with a 15-minute after-buffer (effective 10:00–11:15).
const tenAm = { id: 'a', booking_time: '10:00:00', effective_start: `${DAY}T10:00:00`, effective_end: `${DAY}T11:15:00` };

describe('findBufferClash', () => {
  it('flags a start inside the buffer after a booking and suggests the first clear time', () => {
    const clash = findBufferClash([tenAm], DAY, 11 * 60, 60, { before: 0, after: 15 });
    expect(clash?.booking.id).toBe('a');
    expect(clash?.after).toBe(true);
    expect(clash?.suggestedTime).toBe('11:15:00');
  });

  it("adds the new service's own before-buffer to the suggestion", () => {
    const clash = findBufferClash([tenAm], DAY, 11 * 60 + 15, 60, { before: 10, after: 0 });
    expect(clash?.suggestedTime).toBe('11:25:00');
  });

  it("flags an end that runs into the new booking's own after-buffer", () => {
    // 08:30–09:50 + 15 after = 10:05, past 10:00.
    const clash = findBufferClash([tenAm], DAY, 8 * 60 + 30, 80, { before: 0, after: 15 });
    expect(clash?.after).toBe(false);
    expect(clash?.suggestedTime).toBe('08:25:00');
  });

  it('lets a booking that clears both buffers through', () => {
    expect(findBufferClash([tenAm], DAY, 11 * 60 + 15, 60, { before: 0, after: 15 })).toBeNull();
    expect(findBufferClash([tenAm], DAY, 8 * 60, 60, { before: 0, after: 15 })).toBeNull();
  });

  it('ignores a booking with no padded range', () => {
    expect(findBufferClash([{ booking_time: '10:00:00' }], DAY, 11 * 60, 60, { before: 0, after: 15 })).toBeNull();
  });

  it('gives no suggestion when the clear time would leave the day', () => {
    const late = { booking_time: '22:00:00', effective_start: `${DAY}T22:00:00`, effective_end: `${DAY}T23:30:00` };
    expect(findBufferClash([late], DAY, 23 * 60, 60, { before: 0, after: 0 })?.suggestedTime).toBeNull();
  });
});

describe('minutesFromDay', () => {
  it("counts a buffer spilling into the next day past 1440 instead of wrapping", () => {
    expect(minutesFromDay('2026-10-28T00:10:00', DAY)).toBe(1450);
    expect(minutesFromDay('2026-10-26T23:50:00', DAY)).toBe(-10);
  });
});

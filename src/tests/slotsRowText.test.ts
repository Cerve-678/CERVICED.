import { resolveSlotsRow } from '../utils/slotsRowText';

// The bug this guards: the profile hid the whole slots row — pill, bell and
// Instagram button — behind `availabilityLoading`, a separate and much slower
// fetch than the profile itself. scheduleReleaseDay arrives with the profile
// row, and the release-day text never reads availability, so a provider who
// publishes on a fixed day was made to wait on a query whose answer was then
// discarded.
describe('resolveSlotsRow', () => {
  it('shows the release day immediately, without waiting on availability', () => {
    expect(
      resolveSlotsRow({ scheduleReleaseDay: 20, availability: null, availabilityLoading: true }),
    ).toEqual({ kind: 'text', text: 'New slots drop on the 20th' });
  });

  it('waits only when the text it would print actually needs availability', () => {
    expect(
      resolveSlotsRow({ scheduleReleaseDay: null, availability: null, availabilityLoading: true }),
    ).toEqual({ kind: 'waiting' });
  });

  it('lets the release day replace the availability headline, never pair with it', () => {
    // "New slots drop on the 14th · Open today until 6pm" would be two
    // competing claims about when you can book.
    const row = resolveSlotsRow({
      scheduleReleaseDay: 14,
      availability: { state: 'open', headline: 'Open today until 6pm' },
      availabilityLoading: false,
    });
    expect(row).toEqual({ kind: 'text', text: 'New slots drop on the 14th' });
  });

  it('uses the availability headline when there is no release day', () => {
    expect(
      resolveSlotsRow({
        scheduleReleaseDay: null,
        availability: { state: 'open', headline: 'Open today until 6pm' },
        availabilityLoading: false,
      }),
    ).toEqual({ kind: 'text', text: 'Open today until 6pm' });
  });

  it('never asserts an opening for a provider with no schedule published', () => {
    // The booking RPC rejects every booking for an unpublished provider, so
    // the pill must not repeat whatever headline came back for one.
    expect(
      resolveSlotsRow({
        scheduleReleaseDay: null,
        availability: { state: 'unpublished', headline: 'Open today until 6pm' },
        availabilityLoading: false,
      }),
    ).toEqual({ kind: 'text', text: 'Availability on request' });
  });

  it('falls back rather than showing an empty pill when availability is absent', () => {
    expect(
      resolveSlotsRow({ scheduleReleaseDay: null, availability: null, availabilityLoading: false }),
    ).toEqual({ kind: 'text', text: 'Availability on request' });
  });

  it('ordinalises the awkward days correctly', () => {
    const day = (n: number) => resolveSlotsRow({
      scheduleReleaseDay: n, availability: null, availabilityLoading: false,
    });
    expect(day(1)).toEqual({ kind: 'text', text: 'New slots drop on the 1st' });
    expect(day(2)).toEqual({ kind: 'text', text: 'New slots drop on the 2nd' });
    expect(day(3)).toEqual({ kind: 'text', text: 'New slots drop on the 3rd' });
    expect(day(11)).toEqual({ kind: 'text', text: 'New slots drop on the 11th' });
    expect(day(21)).toEqual({ kind: 'text', text: 'New slots drop on the 21st' });
  });
});

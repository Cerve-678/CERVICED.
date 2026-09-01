import {
  resolveTour,
  seenVersionFor,
  TOUR_KEYS,
  TOUR_CURRENT_VERSION,
} from '../utils/coachMarkTours';

// The reported bug: "the walkthrough shows every time someone logs in."
// It replaced a per-device boolean that could only answer "has this install
// ever FINISHED this tour" — which is not first-sign-in, not a hat upgrade,
// and not "there is something new to show you".
const steps = [
  { key: 'tabs' },                    // original tour, implicitly version 1
  { key: 'search' },
  { key: 'points', sinceVersion: 2 }, // shipped later
  { key: 'loyalty', sinceVersion: 3 },
];

describe('resolveTour', () => {
  it('shows a brand-new account the whole tour', () => {
    const decision = resolveTour(TOUR_KEYS.CLIENT_HOME, steps, null);
    expect(decision.show).toBe(true);
    if (!decision.show) return;
    expect(decision.steps.map(s => s.key)).toEqual(['tabs', 'search', 'points', 'loyalty']);
  });

  it('shows an existing account only what it has not seen', () => {
    // This is the "I added a new walkthrough for something new" case: someone
    // walked through version 1 months ago gets the two newer steps, not the
    // whole tour again.
    const decision = resolveTour(TOUR_KEYS.CLIENT_HOME, steps, 1);
    expect(decision.show).toBe(true);
    if (!decision.show) return;
    expect(decision.steps.map(s => s.key)).toEqual(['points', 'loyalty']);
  });

  it('shows nothing to an account that is caught up', () => {
    expect(resolveTour(TOUR_KEYS.CLIENT_HOME, steps, 3)).toEqual({ show: false });
  });

  it('shows nothing to an account ahead of the current version', () => {
    // A newer build wrote a higher version; this older one must not re-show
    // steps it happens not to know about.
    expect(resolveTour(TOUR_KEYS.CLIENT_HOME, steps, 99)).toEqual({ show: false });
  });

  it('stamps the tour version, not the highest step shown', () => {
    // Stamping the highest step shown would leave someone who was caught up
    // on 3 recorded at 1, and every later launch would re-offer nothing while
    // looking like it owed them the whole tour.
    const decision = resolveTour(TOUR_KEYS.CLIENT_HOME, steps, null);
    if (!decision.show) throw new Error('expected a tour');
    expect(decision.stampVersion).toBe(TOUR_CURRENT_VERSION[TOUR_KEYS.CLIENT_HOME]);
  });

  it('treats a step with no sinceVersion as part of the original tour', () => {
    const decision = resolveTour(TOUR_KEYS.CLIENT_HOME, [{ key: 'tabs' }], 1);
    expect(decision).toEqual({ show: false });
  });
});

describe('seenVersionFor', () => {
  it('reads a tour version out of the account record', () => {
    expect(seenVersionFor({ client_home: 2 }, TOUR_KEYS.CLIENT_HOME)).toBe(2);
  });

  it('treats an absent tour as never shown', () => {
    expect(seenVersionFor({ provider_home: 1 }, TOUR_KEYS.CLIENT_HOME)).toBeNull();
    expect(seenVersionFor({}, TOUR_KEYS.CLIENT_HOME)).toBeNull();
    expect(seenVersionFor(null, TOUR_KEYS.CLIENT_HOME)).toBeNull();
  });

  it('tolerates a malformed entry rather than throwing on the first screen', () => {
    // An older build, or a hand-edited row. Showing a tour again is a much
    // smaller failure than crashing the render path of Home.
    expect(seenVersionFor({ client_home: 'yes' } as Record<string, unknown>, TOUR_KEYS.CLIENT_HOME)).toBeNull();
    expect(seenVersionFor({ client_home: 1.5 }, TOUR_KEYS.CLIENT_HOME)).toBeNull();
    expect(seenVersionFor({ client_home: -1 }, TOUR_KEYS.CLIENT_HOME)).toBeNull();
  });
});

describe('the three tours', () => {
  it('keeps a stable key per tour', () => {
    // These are persisted in users.seen_tours and in the device cache —
    // renaming one makes every account look unseen and replays it for
    // everybody.
    expect(TOUR_KEYS).toEqual({
      CLIENT_HOME: 'client_home',
      CLIENT_EXPLORE: 'client_explore',
      PROVIDER_HOME: 'provider_home',
    });
  });

  it('declares a current version for every tour key', () => {
    for (const key of Object.values(TOUR_KEYS)) {
      expect(TOUR_CURRENT_VERSION[key]).toBeGreaterThanOrEqual(1);
    }
  });
});

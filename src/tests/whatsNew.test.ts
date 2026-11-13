import { WHATS_NEW_RELEASES, type WhatsNewRelease } from '../data/whatsNew';
import {
  latestWhatsNewVersion,
  notesFor,
  releasesAfterSignup,
  releasesFor,
} from '../utils/whatsNew';
import { resolveTour, TOUR_CURRENT_VERSION, TOUR_KEYS } from '../utils/coachMarkTours';

const item = (title: string) => ({ icon: 'sparkles' as const, title, body: `${title} body` });

const RELEASES: WhatsNewRelease[] = [
  { version: 3, date: '2026-12-01', coversThrough: 'ccc', client: [], provider: [item('p3')] },
  { version: 2, date: '2026-11-20', coversThrough: 'bbb', client: [item('c2')], provider: [item('p2')] },
  { version: 1, date: '2026-11-13', coversThrough: 'aaa', client: [item('c1')], provider: [] },
];

describe('releasesFor', () => {
  it('keeps only releases with notes for that audience, newest first', () => {
    expect(releasesFor(RELEASES, 'client').map(r => r.version)).toEqual([2, 1]);
    expect(releasesFor(RELEASES, 'provider').map(r => r.version)).toEqual([3, 2]);
  });

  it("doesn't tell link-only providers about features they don't have", () => {
    const releases: WhatsNewRelease[] = [
      { version: 2, date: '2026-12-01', coversThrough: 'bbb', client: [],
        provider: [{ ...item('calendar'), fullMembersOnly: true }] },
      { version: 1, date: '2026-11-13', coversThrough: 'aaa', client: [],
        provider: [{ ...item('calendar'), fullMembersOnly: true }, item('messages')] },
    ];
    expect(releasesFor(releases, 'provider').map(r => r.version)).toEqual([2, 1]);
    expect(releasesFor(releases, 'linkOnlyProvider').map(r => r.version)).toEqual([1]);
    expect(notesFor(releases[1]!, 'linkOnlyProvider').map(n => n.title)).toEqual(['messages']);
  });
});

describe('latestWhatsNewVersion', () => {
  it('is the newest release that says something to that hat', () => {
    // Release 3 is provider-only, so a client is caught up at 2 and isn't
    // left owing a release that has nothing for them.
    expect(latestWhatsNewVersion(RELEASES, 'client')).toBe(2);
    expect(latestWhatsNewVersion(RELEASES, 'provider')).toBe(3);
    expect(latestWhatsNewVersion([], 'client')).toBe(0);
  });
});

describe('releasesAfterSignup', () => {
  it('shows an existing account the releases since it was created', () => {
    expect(releasesAfterSignup(RELEASES, 'client', '2026-10-01T09:00:00Z').map(r => r.version)).toEqual([2, 1]);
  });

  it('never shows a release to an account created on or after its date', () => {
    expect(releasesAfterSignup(RELEASES, 'client', '2026-11-13T08:00:00Z').map(r => r.version)).toEqual([2]);
    expect(releasesAfterSignup(RELEASES, 'client', '2026-11-25T08:00:00Z')).toEqual([]);
  });

  it('shows nothing when the account date is unknown', () => {
    expect(releasesAfterSignup(RELEASES, 'client', null)).toEqual([]);
    expect(releasesAfterSignup(RELEASES, 'client', 'not a date')).toEqual([]);
  });
});

describe('seen-state through the walkthrough versions', () => {
  const asSteps = (releases: WhatsNewRelease[]) =>
    releases.map(r => ({ key: String(r.version), sinceVersion: r.version }));

  it('owes an account only the releases above the one it last saw', () => {
    const decision = resolveTour(
      TOUR_KEYS.WHATS_NEW_PROVIDER,
      asSteps(releasesFor(RELEASES, 'provider')),
      2,
    );
    expect(decision.show && decision.steps.map(s => s.key)).toEqual(['3']);
  });

  it('owes nothing once caught up', () => {
    const decision = resolveTour(TOUR_KEYS.WHATS_NEW_CLIENT, asSteps(releasesFor(RELEASES, 'client')), 2);
    expect(decision.show).toBe(false);
  });

  it('tracks the real data file for the current version', () => {
    expect(TOUR_CURRENT_VERSION.whats_new_client).toBe(latestWhatsNewVersion(WHATS_NEW_RELEASES, 'client'));
    expect(TOUR_CURRENT_VERSION.whats_new_provider).toBe(latestWhatsNewVersion(WHATS_NEW_RELEASES, 'provider'));
  });
});

// Guards on the real notes, since a new entry is added by hand every build.
describe('WHATS_NEW_RELEASES', () => {
  it('has unique versions, newest first, each one above the last', () => {
    const versions = WHATS_NEW_RELEASES.map(r => r.version);
    versions.forEach((v, i) => {
      expect(Number.isInteger(v) && v > 0).toBe(true);
      if (i > 0) expect(v).toBe((versions[i - 1] ?? 0) - 1);
    });
  });

  it('has real dates, a commit, and a short list per side', () => {
    for (const release of WHATS_NEW_RELEASES) {
      expect(release.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(Number.isNaN(Date.parse(release.date))).toBe(false);
      expect(release.coversThrough).toMatch(/^[0-9a-f]{7,40}$/);
      expect(release.client.length + release.provider.length).toBeGreaterThan(0);
      expect(release.client.length).toBeLessThanOrEqual(6);
      expect(release.provider.length).toBeLessThanOrEqual(6);
    }
  });

  it('reads as user-facing copy, not internal notes', () => {
    const internal = /\bPR\b|#\d+|\bmigration\b|\bsupabase\b|\bRLS\b|\bRPC\b|\bedge function\b|\bschema\b|\brefactor/i;
    for (const release of WHATS_NEW_RELEASES) {
      for (const note of [...release.client, ...release.provider]) {
        expect(`${note.title} ${note.body}`).not.toMatch(internal);
        expect(note.title.trim()).not.toBe('');
        expect(note.body.trim()).not.toBe('');
      }
    }
  });
});

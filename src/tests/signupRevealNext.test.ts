import fs from 'fs';
import path from 'path';
import { REVEAL_BOTTOM_GAP, REVEAL_PEEK, revealOffset } from '../components/signup/useRevealNext';

/**
 * Sign-up moves on gently after a single-pick answer (user, 2026-11-08:
 * "auth scroll should still work but not too drastic"): only when the next
 * question is below the visible area, and only by the minimum that brings
 * the top of its card into view at the bottom.
 */
describe('revealOffset', () => {
  const viewportHeight = 800;

  it('stays put when the next card is already in view', () => {
    expect(revealOffset({ scrollY: 0, viewportHeight, next: { y: 300, height: 200 } })).toBeNull();
  });

  it('scrolls only far enough to show the top of a card below the screen', () => {
    const next = { y: 1000, height: 400 };
    const y = revealOffset({ scrollY: 0, viewportHeight, next });
    expect(y).toBe(1000 + REVEAL_PEEK + REVEAL_BOTTOM_GAP - viewportHeight);
    // The card lands near the bottom, not snapped to the top.
    expect(next.y - (y as number)).toBeGreaterThan(viewportHeight / 2);
  });

  it('nudges a little when the card is only partly cut off', () => {
    const y = revealOffset({ scrollY: 0, viewportHeight, next: { y: 750, height: 400 } });
    expect(y).toBe(750 + REVEAL_PEEK + REVEAL_BOTTOM_GAP - viewportHeight);
    expect(y).toBeLessThan(200);
  });

  it('shows a short card whole without overshooting', () => {
    expect(revealOffset({ scrollY: 0, viewportHeight, next: { y: 900, height: 80 } }))
      .toBe(900 + 80 + REVEAL_BOTTOM_GAP - viewportHeight);
  });

  it('never scrolls back up', () => {
    expect(revealOffset({ scrollY: 900, viewportHeight, next: { y: 1000, height: 300 } })).toBeNull();
  });

  it('does nothing before the screen or card has been measured', () => {
    expect(revealOffset({ scrollY: 0, viewportHeight: 0, next: { y: 1000, height: 300 } })).toBeNull();
    expect(revealOffset({ scrollY: 0, viewportHeight, next: { y: 0, height: 0 } })).toBeNull();
  });
});

describe('sign-up only moves on after single-pick answers', () => {
  const read = (f: string) => fs.readFileSync(path.join(__dirname, '..', 'screens', 'auth', f), 'utf8');

  it('never reveals from inside a state updater or a multi-pick toggle', () => {
    for (const f of ['SignUpStep4Screen.tsx', 'SignUpStep5Screen.tsx']) {
      const src = read(f);
      expect(src).not.toContain('setTimeout(() => scrollTo');
      for (const toggle of src.matchAll(/const toggle\w+ = \([^)]*\) => \{[\s\S]*?\n  \};/g)) {
        expect(toggle[0]).not.toContain('reveal(');
      }
    }
  });
});

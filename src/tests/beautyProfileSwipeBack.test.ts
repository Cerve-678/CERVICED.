import fs from 'fs';
import path from 'path';

const read = (...p: string[]): string =>
  fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8');

/**
 * THE BUG: Beauty Profile's views (the landing, All profile, a category,
 * Maintenance, setup) are state inside one screen, so a back-swipe popped the
 * whole screen instead of going back one view.
 */
describe('Beauty Profile back-swipe', () => {
  const screen = read('screens', 'client', 'BeautyProfileScreen.tsx');

  it('holds the swipe while a view inside the screen is open', () => {
    expect(screen).toContain("const innerOpen = view !== 'landing' || selectedCategory !== null;");
    expect(screen).toMatch(/usePreventRemove\(innerOpen && leaving === null,/);
  });

  it('turns a plain back into one step back, and lets anything else leave', () => {
    expect(screen).toMatch(/type === 'GO_BACK' \|\| type === 'POP'\) \{ stepBack\(\); return; \}/);
    expect(screen).toContain('setLeaving(data.action);');
    expect(screen).toContain('navigation.dispatch(leaving);');
  });

  it('turns the native swipe off while a view is open, and steps back with its own edge swipe', () => {
    // The native iOS swipe can't be held: it popped to Settings, then the
    // screen came back (owner, 2026-11-17).
    expect(screen).toContain('navigation.setOptions({ gestureEnabled: !innerOpen });');
    expect(screen).toContain('stepBackRef.current();');
    expect(screen).toContain('{...edgeSwipe.panHandlers}');
  });

  it("steps setup back the way setup's own back button does", () => {
    const setup = read('features', 'maintenance', 'SetupFlow.tsx');
    expect(setup).toContain('if (backRef) backRef.current = goBack;');
    expect(setup).toContain("onPress={() => { hapticLight(); goBack(); }}");
    expect(screen).toContain('backRef={setupBackRef}');
  });
});

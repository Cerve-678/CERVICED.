import fs from 'fs';
import path from 'path';

const read = (...p: string[]): string =>
  fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8');

/**
 * THE BUG: Beauty Profile's views (body map, All profile, a category,
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

  it("steps setup back the way setup's own back button does", () => {
    const setup = read('features', 'maintenance', 'SetupFlow.tsx');
    expect(setup).toContain('if (backRef) backRef.current = goBack;');
    expect(setup).toContain("onPress={() => { hapticLight(); goBack(); }}");
    expect(screen).toContain('backRef={setupBackRef}');
  });
});

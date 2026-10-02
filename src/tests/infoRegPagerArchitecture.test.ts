import fs from 'fs';
import path from 'path';
import {
  INFO_REG_SECTIONS,
  infoRegSectionIndex,
} from '../features/provider-registration/infoRegSections';

const read = (...parts: string[]): string =>
  fs.readFileSync(path.join(__dirname, '..', ...parts), 'utf8');

describe('Info Reg pager architecture', () => {
  it('keeps one canonical, ordered section definition', () => {
    expect(INFO_REG_SECTIONS.map(section => section.key)).toEqual([
      'identity',
      'about',
      'contact',
      'services',
      'policies',
    ]);
    expect(new Set(INFO_REG_SECTIONS.map(section => section.key)).size).toBe(
      INFO_REG_SECTIONS.length,
    );
    expect(infoRegSectionIndex('services')).toBe(3);
  });

  it('keeps horizontal navigation outside the large form screen', () => {
    const screen = read('screens', 'provider', 'InfoRegScreen.tsx');
    const pager = read(
      'features',
      'provider-registration',
      'InfoRegPager.tsx',
    );

    expect(screen).toContain('<InfoRegPager');
    expect(screen).not.toContain('styles.waypointRow');
    expect(pager).toContain('pagingEnabled');
    expect(pager).toContain('accessibilityRole="tab"');
    expect(pager).toContain('onActiveIndexChange(index)');
  });

  it('keeps all page transitions on the canonical section-key path', () => {
    const screen = read('screens', 'provider', 'InfoRegScreen.tsx');
    expect(screen).toContain('infoRegSectionIndex(key)');
    expect(screen).toContain("goToSection('about')");
    expect(screen).toContain("goToSection('contact')");
    expect(screen).toContain("goToSection('services')");
    expect(screen).toContain("goToSection('policies')");
  });
});

import { getPageStyle } from "../constants/pageStyles";
import { isDarkColor, resolveProviderTheme } from "../constants/providerThemes";
import { veilAccent, veilPageTheme } from "../features/providers/heroes/SheerHero";

describe("Sheer's veil page", () => {
  it("is switched on for Sheer only", () => {
    expect(getPageStyle("sheer").veilPage).toBe(true);
    expect(getPageStyle("classic").veilPage).toBeFalsy();
    expect(getPageStyle("embossed").veilPage).toBeFalsy();
  });

  it("puts the content on dark, see-through glass in white ink, keeping the theme's hero and accent", () => {
    const base = resolveProviderTheme("blush");
    const veil = veilPageTheme(base);
    expect(isDarkColor(veil.bg)).toBe(true);
    expect(veil.isDark).toBe(true);
    expect(isDarkColor(veil.text)).toBe(false);
    expect(veil.hero).toBe(base.hero);
    expect(veil.accent).toBe(base.accent);
    expect(veil.gradient).toEqual(base.gradient);
    expect(veil.sheetFill).toMatch(/^rgba\(/);
  });

  it("lifts a dark accent so it reads on the glass, and keeps a light one", () => {
    expect(veilAccent("#4A2C1E")).not.toBe("#4A2C1E");
    expect(isDarkColor(veilAccent("#4A2C1E"))).toBe(false);
    expect(veilAccent("#F2D4DE")).toBe("#F2D4DE");
  });
});

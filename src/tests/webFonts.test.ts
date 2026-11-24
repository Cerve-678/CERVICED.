import { fontFaceCss } from '../web/webFonts';

describe('fontFaceCss', () => {
  it('declares each font under the name the app uses, loaded only when drawn', () => {
    const css = fontFaceCss(
      { 'Prata-Regular': 1, Lobster_400Regular: 2 },
      (source) => `/assets/font-${String(source)}.ttf`,
    );
    expect(css).toBe(
      '@font-face{font-family:"Prata-Regular";src:url("/assets/font-1.ttf");font-display:swap;}\n' +
      '@font-face{font-family:"Lobster_400Regular";src:url("/assets/font-2.ttf");font-display:swap;}',
    );
  });

  it('skips a font whose file has no address rather than writing a broken rule', () => {
    expect(fontFaceCss({ 'Prata-Regular': 1 }, () => null)).toBe('');
  });
});

import { aboutPreview, ABOUT_PREVIEW_CHARS } from '../features/providers/aboutPreview';

describe("a provider's About text preview", () => {
  it('shows short text whole, with nothing to expand or collapse', () => {
    expect(aboutPreview('Lash tech in Hackney.')).toEqual({ isLong: false, collapsed: 'Lash tech in Hackney.' });
  });

  it('treats text exactly at the limit as short', () => {
    const text = 'a'.repeat(ABOUT_PREVIEW_CHARS);
    expect(aboutPreview(text).isLong).toBe(false);
  });

  it('cuts long text to the limit and adds an ellipsis', () => {
    const text = `${'word '.repeat(40)}end`;
    const { isLong, collapsed } = aboutPreview(text);
    expect(isLong).toBe(true);
    expect(collapsed.endsWith('...')).toBe(true);
    expect(collapsed.length).toBeLessThanOrEqual(ABOUT_PREVIEW_CHARS + 3);
    expect(collapsed).not.toMatch(/\s\.\.\.$/);
  });

  it('does not count trailing whitespace towards being long', () => {
    expect(aboutPreview(`Short bio.${' '.repeat(200)}`).isLong).toBe(false);
  });
});

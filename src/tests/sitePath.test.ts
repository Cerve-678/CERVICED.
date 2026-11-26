import { parseSitePath } from '../web/sitePath';

describe('parseSitePath', () => {
  it('opens a provider page from /@handle, ignoring case and a trailing slash', () => {
    expect(parseSitePath('/@halo.lash', '', false)).toEqual({ kind: 'provider', handle: 'halo.lash' });
    expect(parseSitePath('/@Halo.Lash/', '', false)).toEqual({ kind: 'provider', handle: 'halo.lash' });
    expect(parseSitePath('/%40styled_by-mel', '', false)).toEqual({ kind: 'provider', handle: 'styled_by-mel' });
  });

  it('refuses a handle that no provider could have', () => {
    expect(parseSitePath('/@', '', false)).toEqual({ kind: 'notFound' });
    expect(parseSitePath('/@halo/book', '', false)).toEqual({ kind: 'notFound' });
    expect(parseSitePath('/@halo lash', '', false)).toEqual({ kind: 'notFound' });
    expect(parseSitePath(`/@${'a'.repeat(65)}`, '', false)).toEqual({ kind: 'notFound' });
    expect(parseSitePath('/%E0%A4%A', '', false)).toEqual({ kind: 'notFound' });
  });

  it('only opens the page-style preview in a development build', () => {
    expect(parseSitePath('/_dev/page-styles', '?style=ledger', true)).toEqual({ kind: 'pageStylePreview', styleKey: 'ledger' });
    expect(parseSitePath('/_dev/page-styles', '', true)).toEqual({ kind: 'pageStylePreview', styleKey: null });
    expect(parseSitePath('/_dev/page-styles', '?style=ledger', false)).toEqual({ kind: 'notFound' });
  });

  it('leaves every other address to the static site', () => {
    expect(parseSitePath('/', '', true)).toEqual({ kind: 'notFound' });
    expect(parseSitePath('/about', '', true)).toEqual({ kind: 'notFound' });
  });
});

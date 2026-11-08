import { MAX_POLICY_IMAGES, policyImageFields, policyImageUrls } from '../features/providers/policyImages';

describe('policyImageUrls', () => {
  it('reads the pages in order', () => {
    expect(policyImageUrls({ policyImageUrls: ['a', 'b'], policyImageUrl: 'a' })).toEqual(['a', 'b']);
  });

  it("keeps a provider's single image from before there could be several", () => {
    expect(policyImageUrls({ policyImageUrl: 'old' })).toEqual(['old']);
    expect(policyImageUrls({ policyImageUrls: [], policyImageUrl: 'old' })).toEqual(['old']);
  });

  it('ignores blanks, repeats and anything that is not a link', () => {
    expect(policyImageUrls({ policyImageUrls: ['a', '', 'a', 7, null, 'b'] })).toEqual(['a', 'b']);
    expect(policyImageUrls(null)).toEqual([]);
    expect(policyImageUrls({ policyImageUrl: '  ' })).toEqual([]);
  });
});

describe('policyImageFields', () => {
  it('saves the list and the first page on its own, for older app builds', () => {
    expect(policyImageFields(['a', 'b'])).toEqual({ policyImageUrls: ['a', 'b'], policyImageUrl: 'a' });
  });

  it('clears both when every page is removed', () => {
    expect(policyImageFields([])).toEqual({ policyImageUrls: [], policyImageUrl: '' });
  });

  it(`stops at ${MAX_POLICY_IMAGES} pages`, () => {
    const many = Array.from({ length: MAX_POLICY_IMAGES + 2 }, (_, i) => `p${i}`);
    expect(policyImageFields(many).policyImageUrls).toHaveLength(MAX_POLICY_IMAGES);
  });
});

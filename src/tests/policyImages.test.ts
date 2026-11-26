import {
  edgeColoursFromPixels,
  MAX_POLICY_IMAGES,
  policyImageEdges,
  policyImageFields,
  policyImageUrls,
  prunePolicyImageEdges,
} from '../features/providers/policyImages';

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

describe('policy page edge colours', () => {
  /** A width×height RGBA image: `top` colour in the first rows, `bottom` in the last, `middle` between. */
  function image(width: number, height: number, top: number[], middle: number[], bottom: number[]): Uint8Array {
    const data = new Uint8Array(width * height * 4);
    for (let y = 0; y < height; y++) {
      const colour = y < 2 ? top : y >= height - 2 ? bottom : middle;
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        data.set([colour[0]!, colour[1]!, colour[2]!, 255], i);
      }
    }
    return data;
  }

  it('reads the top and bottom edge colour', () => {
    const rgba = image(8, 10, [0x5b, 0x3a, 0x2b], [255, 255, 255], [0xf4, 0xd9, 0xdf]);
    expect(edgeColoursFromPixels(rgba, 8, 10)).toEqual({ top: '#5B3A2B', bottom: '#F4D9DF' });
  });

  it('ignores a line of text touching the edge', () => {
    const rgba = image(9, 10, [0x5b, 0x3a, 0x2b], [0, 0, 0], [0x5b, 0x3a, 0x2b]);
    // Three dark "text" pixels in the top row: the median stays the background.
    for (const x of [3, 4, 5]) rgba.set([0, 0, 0, 255], x * 4);
    expect(edgeColoursFromPixels(rgba, 9, 10).top).toBe('#5B3A2B');
  });

  it('keeps only well-formed saved colours', () => {
    expect(policyImageEdges({
      policyImageEdges: {
        'https://a/1.png': { top: '#5B3A2B', bottom: '#F4D9DF' },
        'https://a/2.png': { top: 'brown', bottom: '#F4D9DF' },
        'https://a/3.png': null,
      },
    })).toEqual({ 'https://a/1.png': { top: '#5B3A2B', bottom: '#F4D9DF' } });
    expect(policyImageEdges(null)).toEqual({});
    expect(policyImageEdges({ policyImageEdges: ['#000000'] })).toEqual({});
  });

  it('drops the colours of a removed page', () => {
    const edges = { a: { top: '#000000', bottom: '#000000' }, b: { top: '#FFFFFF', bottom: '#FFFFFF' } };
    expect(prunePolicyImageEdges(edges, ['b'])).toEqual({ b: { top: '#FFFFFF', bottom: '#FFFFFF' } });
  });
});

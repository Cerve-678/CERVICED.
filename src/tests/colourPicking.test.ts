import { hexToHsv, hsvToHex, paletteFromPixels, parseHexInput } from '../utils/color';

describe('parseHexInput', () => {
  it('takes a colour with or without the #, in any case, and the shorthand', () => {
    expect(parseHexInput('#d98ba6')).toBe('#D98BA6');
    expect(parseHexInput('D98BA6')).toBe('#D98BA6');
    expect(parseHexInput(' #f0a ')).toBe('#FF00AA');
  });

  it('gives nothing back while the colour is still being typed or is not a colour', () => {
    expect(parseHexInput('#D98B')).toBeNull();
    expect(parseHexInput('')).toBeNull();
    expect(parseHexInput('#GGGGGG')).toBeNull();
  });
});

describe('hex ↔ HSV', () => {
  it('round-trips the colours the custom set starts on', () => {
    for (const hex of ['#E3C7CF', '#F9E9EE', '#D98BA6', '#000000', '#FFFFFF', '#1D4A3C']) {
      expect(hsvToHex(hexToHsv(hex))).toBe(hex);
    }
  });

  it('reads pure colours at the hue they are', () => {
    expect(hexToHsv('#FF0000')).toEqual({ h: 0, s: 1, v: 1 });
    expect(hexToHsv('#00FF00').h).toBe(120);
    expect(hexToHsv('#0000FF').h).toBe(240);
    expect(hsvToHex({ h: 360, s: 1, v: 1 })).toBe('#FF0000');
  });
});

describe('paletteFromPixels', () => {
  const pixels = (...runs: [number, number, number, number, number][]): Uint8Array => {
    const out: number[] = [];
    for (const [times, r, g, b, a] of runs) {
      for (let i = 0; i < times; i++) out.push(r, g, b, a);
    }
    return Uint8Array.from(out);
  };

  it('offers the most common colour first', () => {
    const palette = paletteFromPixels(pixels([10, 200, 40, 80, 255], [30, 20, 30, 60, 255]));
    expect(palette).toEqual(['#141E3C', '#C82850']);
  });

  it('skips near-identical shades and transparent pixels', () => {
    const palette = paletteFromPixels(pixels(
      [20, 250, 250, 250, 255],
      [15, 245, 248, 246, 255],
      [50, 0, 0, 0, 0],
      [5, 120, 60, 40, 255],
    ));
    expect(palette).toHaveLength(2);
    expect(palette[1]).toBe('#783C28');
  });

  it('stops at the count asked for', () => {
    const palette = paletteFromPixels(
      pixels([1, 255, 0, 0, 255], [1, 0, 255, 0, 255], [1, 0, 0, 255, 255], [1, 255, 255, 0, 255]),
      2,
    );
    expect(palette).toHaveLength(2);
  });
});

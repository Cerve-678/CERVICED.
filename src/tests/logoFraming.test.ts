import {
  clampLogoFrame,
  DEFAULT_LOGO_FRAME,
  logoFrameLayout,
  MAX_LOGO_ZOOM,
  minLogoZoom,
} from '../utils/logoFraming';

describe('logo framing', () => {
  it('fills and centres a square logo in a wide card by default', () => {
    // 160 × 70 card, square logo: fills the width, overflows top and bottom.
    const box = logoFrameLayout(160, 70, 1, DEFAULT_LOGO_FRAME);
    expect(box).toEqual({ width: 160, height: 160, left: 0, top: -45 });
  });

  it('fits the whole logo at the minimum zoom', () => {
    const zoom = minLogoZoom(160 / 70, 1);
    const box = logoFrameLayout(160, 70, 1, { zoom, x: 0, y: 0 });
    expect(box.height).toBeCloseTo(70);
    expect(box.width).toBeCloseTo(70);
    expect(box.left).toBeCloseTo(45);
  });

  it('places the logo by fractions of the card, so any card of that shape agrees', () => {
    const frame = { zoom: 1.5, x: 0.1, y: -0.2 };
    const small = logoFrameLayout(160, 70, 1, frame);
    const double = logoFrameLayout(320, 140, 1, frame);
    expect(double.left).toBeCloseTo(small.left * 2);
    expect(double.top).toBeCloseTo(small.top * 2);
  });

  it('clamps zoom between the whole logo and the maximum', () => {
    const ratio = 282 / 147;
    expect(clampLogoFrame({ zoom: 0.01, x: 0, y: 0 }, ratio, 1).zoom).toBeCloseTo(minLogoZoom(ratio, 1));
    expect(clampLogoFrame({ zoom: 99, x: 0, y: 0 }, ratio, 1).zoom).toBe(MAX_LOGO_ZOOM);
  });

  it('never lets a logo bigger than the card show a gap past its edge', () => {
    const ratio = 160 / 70;
    const frame = clampLogoFrame({ zoom: 1, x: 5, y: 5 }, ratio, 1);
    const box = logoFrameLayout(160, 70, 1, frame);
    expect(box.left).toBeCloseTo(0); // can't move right: left edge would show
    expect(box.top).toBeCloseTo(0); // top edge sits on the card's top
  });

  it('keeps a logo smaller than the card inside it', () => {
    const ratio = 160 / 70;
    const zoom = minLogoZoom(ratio, 1);
    const frame = clampLogoFrame({ zoom, x: -5, y: 0 }, ratio, 1);
    const box = logoFrameLayout(160, 70, 1, frame);
    expect(box.left).toBeCloseTo(0);
  });
});

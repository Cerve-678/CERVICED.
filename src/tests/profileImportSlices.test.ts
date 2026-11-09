// Long screenshots of a price list are cut into overlapping slices so each one
// stays readable after Claude's own downscale (long side ~1,568 px).
jest.mock('expo-image-picker', () => ({}));
jest.mock('expo-file-system/legacy', () => ({}));
jest.mock('expo-image-manipulator', () => ({ ImageManipulator: {}, SaveFormat: { JPEG: 'jpeg' } }));

import { sliceRows } from '../features/provider-registration/profileImportFiles';

describe('sliceRows', () => {
  it('leaves an ordinary photo whole', () => {
    expect(sliceRows(4032, 3024)).toEqual([{ originY: 0, height: 3024 }]);
    expect(sliceRows(1179, 1700)).toEqual([{ originY: 0, height: 1700 }]);
  });

  it('cuts a full phone screenshot in two', () => {
    expect(sliceRows(1179, 2556)).toEqual([{ originY: 0, height: 1572 }, { originY: 984, height: 1572 }]);
  });

  it('cuts a long screenshot into overlapping slices that cover every row', () => {
    const rows = sliceRows(1179, 6000);
    expect(rows.length).toBe(5);
    expect(rows[0]!.originY).toBe(0);
    const last = rows[rows.length - 1]!;
    expect(last.originY + last.height).toBe(6000);
    for (let i = 1; i < rows.length; i++) {
      const prev = rows[i - 1]!;
      expect(rows[i]!.originY).toBeLessThan(prev.originY + prev.height);
    }
    // Each slice, once shrunk to 1,092 wide, is 1,456 tall: none is a sliver.
    for (const row of rows) expect(Math.round(row.height * (1092 / 1179))).toBe(1456);
  });
});

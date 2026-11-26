import { describe, expect, it } from '@jest/globals';
import { assignOverlapColumns } from '../utils/dayTimelineRange';

const block = (top: number, height: number) => ({ top, height });

describe('assignOverlapColumns', () => {
  it('gives a lone block the full width', () => {
    expect(assignOverlapColumns([block(0, 72)])).toEqual([{ col: 0, cols: 1 }]);
  });

  it('puts two overlapping blocks side by side', () => {
    expect(assignOverlapColumns([block(0, 144), block(36, 36)])).toEqual([
      { col: 0, cols: 2 },
      { col: 1, cols: 2 },
    ]);
  });

  it('keeps a block with nothing beside it full width on a day with a clash elsewhere', () => {
    // 9:30 on its own, then 11:00 and 11:30 clashing
    const result = assignOverlapColumns([block(36, 54), block(144, 144), block(180, 36)]);
    expect(result[0]).toEqual({ col: 0, cols: 1 });
    expect(result[1]).toEqual({ col: 0, cols: 2 });
    expect(result[2]).toEqual({ col: 1, cols: 2 });
  });

  it('treats blocks that only touch as not overlapping', () => {
    expect(assignOverlapColumns([block(0, 72), block(72, 72)])).toEqual([
      { col: 0, cols: 1 },
      { col: 0, cols: 1 },
    ]);
  });

  it('groups blocks chained through a long one', () => {
    // A long block overlapping two short ones that don't overlap each other
    const result = assignOverlapColumns([block(0, 300), block(0, 50), block(100, 50)]);
    expect(result.map(r => r.cols)).toEqual([2, 2, 2]);
    expect(result[1]!.col).toBe(1);
    expect(result[2]!.col).toBe(1);
  });

  it('copes with blocks given out of time order', () => {
    const result = assignOverlapColumns([block(180, 36), block(0, 50), block(144, 144)]);
    expect(result[1]).toEqual({ col: 0, cols: 1 });
    expect(result[0]!.cols).toBe(2);
    expect(result[2]!.cols).toBe(2);
  });
});

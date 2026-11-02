import { earlierSearchesToCredit } from '../features/providers/searchLearning';

const NOW = 1_000_000;
const at = (query: string, secondsAgo = 10) => ({ query, at: NOW - secondsAgo * 1000 });

describe('earlierSearchesToCredit', () => {
  it('credits a fruitless search the client then reworded', () => {
    expect(earlierSearchesToCredit([at('infills')], 'acrylic', NOW)).toEqual(['infills']);
  });
  it('treats letters typed on the way to a word as that one search', () => {
    expect(earlierSearchesToCredit([at('inf'), at('infi'), at('infills')], 'acrylic', NOW)).toEqual(['infills']);
  });
  it('does not credit what the current query grew from or into', () => {
    expect(earlierSearchesToCredit([at('acr'), at('acrylics please')], 'acrylic', NOW)).toEqual([]);
  });
  it('ignores case and spacing', () => {
    expect(earlierSearchesToCredit([at('  INFILLS '), at('infills')], 'Acrylic', NOW)).toEqual(['infills']);
  });
  it('forgets searches from an earlier sitting', () => {
    expect(earlierSearchesToCredit([at('infills', 181)], 'acrylic', NOW)).toEqual([]);
    expect(earlierSearchesToCredit([at('infills', 179)], 'acrylic', NOW)).toEqual(['infills']);
  });
  it('credits at most the two most recent, newest first', () => {
    expect(earlierSearchesToCredit([at('one', 30), at('two', 20), at('three', 10)], 'acrylic', NOW))
      .toEqual(['three', 'two']);
  });
});

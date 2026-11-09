import { CollectionFlight } from '../components/collections/CollectionOpenFlight';
import type { FolderPaperRect } from '../components/collections/CollectionFolder';

const paper = (id: string): FolderPaperRect => ({
  id,
  uri: `https://example.com/${id}.jpg`,
  x: 10,
  y: 20,
  width: 36,
  height: 46,
  rotate: -10,
  radius: 5,
  border: 2,
});

describe('CollectionFlight', () => {
  it('keeps each landing card hidden until its look has landed', () => {
    const flight = new CollectionFlight([paper('a'), paper('b')]);
    expect(flight.isWaiting(0)).toBe(true);
    expect(flight.isWaiting(1)).toBe(true);
    // Cards past the flying looks never wait.
    expect(flight.isWaiting(2)).toBe(false);

    flight.reveal(0);
    expect(flight.isWaiting(0)).toBe(false);
    expect(flight.isWaiting(1)).toBe(true);
  });

  it('keeps the first place a card reports and tells listeners once', () => {
    const flight = new CollectionFlight([paper('a')]);
    const listener = jest.fn();
    const unsubscribe = flight.subscribe(listener);

    flight.report(0, { x: 1, y: 2, width: 100, height: 140 });
    flight.report(0, { x: 9, y: 9, width: 9, height: 9 });
    expect(flight.target(0)).toEqual({ x: 1, y: 2, width: 100, height: 140 });
    expect(listener).toHaveBeenCalledTimes(1);

    // A card with no look flying to it is ignored.
    flight.report(3, { x: 0, y: 0, width: 1, height: 1 });
    expect(flight.target(3)).toBeNull();
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
    flight.reveal(0);
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

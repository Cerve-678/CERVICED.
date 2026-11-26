import { createReshuffleWhenHidden } from '../features/home/useReshuffleWhenHidden';

/**
 * Home's browse rails (Trending, Just Joined, Top Rated) get a new order each
 * time the client comes back, but must never visibly reorder while Home can
 * be seen. The old version reshuffled 600ms after leaving, guessing the next
 * screen had slid over Home by then. When that screen was slow to open (a
 * provider profile is heavy), the guess was wrong and Trending jumped in
 * front of the client. Now it waits for the stack to say Home has gone.
 */
describe('reshuffling Home rails only while Home is hidden', () => {
  function setup() {
    const reshuffle = jest.fn();
    return { reshuffle, rails: createReshuffleWhenHidden(reshuffle) };
  }

  it('waits for a pushed screen to finish covering Home', () => {
    const { reshuffle, rails } = setup();
    rails.left({ tabStillFocused: true });
    expect(reshuffle).not.toHaveBeenCalled();
    rails.transitionEnd({ closing: true });
    expect(reshuffle).toHaveBeenCalledTimes(1);
  });

  it('reshuffles at once on a tab switch, which hides Home instantly', () => {
    const { reshuffle, rails } = setup();
    rails.left({ tabStillFocused: false });
    expect(reshuffle).toHaveBeenCalledTimes(1);
  });

  it('does nothing if they come back before Home was ever covered', () => {
    const { reshuffle, rails } = setup();
    rails.left({ tabStillFocused: true });
    rails.focused();
    rails.transitionEnd({ closing: true });
    expect(reshuffle).not.toHaveBeenCalled();
  });

  it('ignores Home appearing, and anything while Home is in view', () => {
    const { reshuffle, rails } = setup();
    rails.transitionEnd({ closing: false });
    rails.transitionEnd({ closing: true });
    expect(reshuffle).not.toHaveBeenCalled();
  });

  it('reshuffles once per visit away, not once per event', () => {
    const { reshuffle, rails } = setup();
    rails.left({ tabStillFocused: true });
    rails.transitionEnd({ closing: true });
    rails.transitionEnd({ closing: true });
    expect(reshuffle).toHaveBeenCalledTimes(1);
  });
});

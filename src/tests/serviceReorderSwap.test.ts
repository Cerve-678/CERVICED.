jest.mock('expo-haptics', () => ({}));

import { swapOrderForDrag } from '../features/provider-registration/useVerticalDragReorder';

// Four service cards, 80 tall with 12 between them.
const order = ['a', 'b', 'c', 'd'];
const layouts = {
  a: { y: 0, height: 80 },
  b: { y: 92, height: 80 },
  c: { y: 184, height: 80 },
  d: { y: 276, height: 80 },
};

describe('service drag-and-drop swaps', () => {
  it('swaps the carried service with the one it is dropped on, leaving the rest alone', () => {
    // Carry "a" down onto "c".
    expect(swapOrderForDrag(order, layouts, 'a', 184)).toEqual(['c', 'b', 'a', 'd']);
  });

  it('swaps upwards too', () => {
    expect(swapOrderForDrag(order, layouts, 'd', -276)).toEqual(['d', 'b', 'c', 'a']);
  });

  it('changes nothing while the service is still over its own slot', () => {
    expect(swapOrderForDrag(order, layouts, 'b', 30)).toEqual(order);
  });

  it('picks the nearest service, not the next one along', () => {
    // Just past halfway from "a" to "b": nearer "b".
    expect(swapOrderForDrag(order, layouts, 'a', 50)).toEqual(['b', 'a', 'c', 'd']);
    // Not yet halfway: stays.
    expect(swapOrderForDrag(order, layouts, 'a', 40)).toEqual(order);
  });
});

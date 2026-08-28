import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react-native';
import { CoachMarkTour, CoachMarkStep } from '../components/CoachMarkTour';

jest.mock('../contexts/ThemeContext', () => ({
  useTheme: () => ({
    isDarkMode: false,
    palette: new Proxy({}, { get: () => '#3F1E36' }),
    theme: {},
  }),
}));

// A precomputed rect target needs no measureInWindow, so these steps resolve
// synchronously the same way the home tours' tab-bar step does.
const rectStep = (key: string, title: string): CoachMarkStep => ({
  key,
  title,
  body: `${title} body`,
  target: { rect: { x: 20, y: 120, width: 200, height: 44 } },
  icon: 'heart',
});

describe('CoachMarkTour', () => {
  it('renders the caption card with a step counter and a Next action', async () => {
    render(
      <CoachMarkTour
        visible
        steps={[rectStep('one', 'First thing'), rectStep('two', 'Second thing')]}
        onFinish={jest.fn()}
      />
    );

    await waitFor(() => expect(screen.getByText('First thing')).toBeTruthy());
    expect(screen.getByText('STEP 1 OF 2')).toBeTruthy();
    expect(screen.getByText('NEXT')).toBeTruthy();
    expect(screen.getByText('Skip')).toBeTruthy();
    // Back is hidden on the first step — there is nothing behind it.
    expect(screen.queryByText('BACK')).toBeNull();
  });

  it('advances, offers Back, and finishes on the last step', async () => {
    const onFinish = jest.fn();
    render(
      <CoachMarkTour
        visible
        steps={[rectStep('one', 'First thing'), rectStep('two', 'Second thing')]}
        onFinish={onFinish}
      />
    );

    await waitFor(() => expect(screen.getByText('First thing')).toBeTruthy());
    fireEvent.press(screen.getByText('NEXT'));

    await waitFor(() => expect(screen.getByText('Second thing')).toBeTruthy());
    expect(screen.getByText('STEP 2 OF 2')).toBeTruthy();
    expect(screen.getByText('BACK')).toBeTruthy();
    // Skip disappears on the last step — "Got it" is the only way out.
    expect(screen.queryByText('Skip')).toBeNull();

    fireEvent.press(screen.getByText('GOT IT'));
    await waitFor(() => expect(onFinish).toHaveBeenCalledTimes(1));
  });

  it('walks back to the previous step', async () => {
    render(
      <CoachMarkTour
        visible
        steps={[rectStep('one', 'First thing'), rectStep('two', 'Second thing')]}
        onFinish={jest.fn()}
      />
    );

    await waitFor(() => expect(screen.getByText('First thing')).toBeTruthy());
    fireEvent.press(screen.getByText('NEXT'));
    await waitFor(() => expect(screen.getByText('Second thing')).toBeTruthy());
    fireEvent.press(screen.getByText('BACK'));
    await waitFor(() => expect(screen.getByText('First thing')).toBeTruthy());
    expect(screen.getByText('STEP 1 OF 2')).toBeTruthy();
  });

  // The Explore tour relies on this: when the top of the feed has no priced
  // card, nothing is ever attached to priceRef, and that step has to drop
  // itself instead of stalling the tour on an unmeasurable target.
  it('skips a step whose ref target never mounted', async () => {
    const orphan = React.createRef<import('react-native').View>();
    render(
      <CoachMarkTour
        visible
        steps={[
          { ...rectStep('one', 'First thing') },
          { key: 'ghost', title: 'Never shown', body: '', target: { ref: orphan } },
          rectStep('three', 'Third thing'),
        ]}
        onFinish={jest.fn()}
      />
    );

    await waitFor(() => expect(screen.getByText('First thing')).toBeTruthy());
    fireEvent.press(screen.getByText('NEXT'));

    await waitFor(() => expect(screen.getByText('Third thing')).toBeTruthy());
    expect(screen.queryByText('Never shown')).toBeNull();
  });

  it('renders nothing while hidden', () => {
    render(<CoachMarkTour visible={false} steps={[rectStep('one', 'First thing')]} onFinish={jest.fn()} />);
    expect(screen.queryByText('First thing')).toBeNull();
  });
});

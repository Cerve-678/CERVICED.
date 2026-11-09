import fs from 'fs';
import path from 'path';
import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { FullImageViewer } from '../components/FullImageViewer';

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};
const withInsets = (ui: React.ReactElement) =>
  render(<SafeAreaProvider initialMetrics={metrics}>{ui}</SafeAreaProvider>);

const policy = 'https://example.com/policy.png';

describe('FullImageViewer', () => {
  it('shows a long policy at full width and its real height, inside a scroll view', () => {
    const { getByLabelText } = withInsets(
      <FullImageViewer uris={[policy]} visible onClose={() => {}} label="Policy document" />,
    );
    const image = getByLabelText('Policy document');
    // A 1000 x 4000 photo is drawn four times as tall as it is wide, not squeezed into one screen.
    fireEvent(image, 'load', { nativeEvent: { source: { width: 1000, height: 4000 } } });
    const { width, height } = getByLabelText('Policy document').props['style'];
    expect(height).toBeCloseTo(width * 4);
  });

  it('closes from its close button', () => {
    const onClose = jest.fn();
    const { getByLabelText } = withInsets(
      <FullImageViewer uris={[policy]} visible onClose={onClose} label="Policy document" />,
    );
    fireEvent.press(getByLabelText('Close policy document'));
    expect(onClose).toHaveBeenCalled();
  });

  it('shows every page of a policy in order, each labelled, and says how to zoom', () => {
    const { getByLabelText, getByText } = withInsets(
      <FullImageViewer uris={[policy, 'https://example.com/page-2.png']} visible onClose={() => {}} label="Policy document" />,
    );
    expect(getByLabelText('Policy document, page 1 of 2')).toBeTruthy();
    expect(getByLabelText('Policy document, page 2 of 2')).toBeTruthy();
    expect(getByText('Page 2 of 2')).toBeTruthy();
    expect(getByText('Pinch or double-tap to zoom')).toBeTruthy();
  });
});

describe('both places a client opens the policy image', () => {
  const read = (file: string) =>
    fs.readFileSync(path.join(__dirname, '..', 'screens', 'client', file), 'utf8');

  it.each(['ProviderProfileScreen.tsx', 'BookingDetailScreen.tsx'])('%s uses the scrolling viewer', file => {
    expect(read(file)).toContain('<FullImageViewer');
    expect(read(file)).toContain('label="Policy document"');
  });

  it('no longer opens it in the photo carousel, which fits it to one screen', () => {
    expect(read('ProviderProfileScreen.tsx')).not.toMatch(/openImageViewer\(\s*\[\{ uri: provider\.bookingPolicies/);
  });
});

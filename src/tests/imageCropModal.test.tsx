import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { ImageCropModal } from '../components/ImageCropModal';

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(async () => {}),
  ImpactFeedbackStyle: { Light: 'light' },
}));

const mockRender = jest.fn();
jest.mock('expo-image-manipulator', () => ({
  SaveFormat: { JPEG: 'jpeg', PNG: 'png' },
  ImageManipulator: { manipulate: () => ({ renderAsync: () => mockRender() }) },
}));

const layout = { nativeEvent: { layout: { width: 300, height: 600 } } };

describe('ImageCropModal', () => {
  beforeEach(() => mockRender.mockReset());

  it('hands back the original photo when the crop is left alone', async () => {
    mockRender.mockResolvedValue({ width: 1000, height: 3000 });
    const onDone = jest.fn();
    const { getByTestId } = render(
      <ImageCropModal uri="file:///p.jpg" accent="#AF9197" onAccent="#FFFFFF" onCancel={jest.fn()} onDone={onDone} />,
    );
    await waitFor(() => expect(mockRender).toHaveBeenCalled());
    await act(async () => { fireEvent(getByTestId('crop-area'), 'layout', layout); });
    await act(async () => { fireEvent.press(getByTestId('crop-use-photo')); });
    expect(onDone).toHaveBeenCalledWith('file:///p.jpg');
  });

  it("doesn't lose the pick when the photo can't be read", async () => {
    mockRender.mockRejectedValue(new Error('decode failed'));
    const onDone = jest.fn();
    render(<ImageCropModal uri="file:///p.jpg" accent="#AF9197" onAccent="#FFFFFF" onCancel={jest.fn()} onDone={onDone} />);
    await waitFor(() => expect(onDone).toHaveBeenCalledWith('file:///p.jpg'));
  });
});

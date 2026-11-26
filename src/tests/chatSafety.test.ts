import { act, renderHook, waitFor } from '@testing-library/react-native';

const mockGetBlockState = jest.fn();
const mockSetBlock = jest.fn();
const mockReport = jest.fn();

jest.mock('../services/databaseService', () => ({
  getConversationBlockState: (...args: unknown[]) => mockGetBlockState(...args),
  setConversationBlock: (...args: unknown[]) => mockSetBlock(...args),
  reportContent: (...args: unknown[]) => mockReport(...args),
}));
jest.mock('expo-haptics', () => ({
  selectionAsync: jest.fn(() => Promise.resolve()),
  impactAsync: jest.fn(() => Promise.resolve()),
  notificationAsync: jest.fn(() => Promise.resolve()),
  ImpactFeedbackStyle: { Medium: 'medium' },
  NotificationFeedbackType: { Success: 'success' },
}));
jest.mock('expo-constants', () => ({ expoConfig: { version: '1.0.0' } }));

import { useChatSafety } from '../features/safety/useChatSafety';
import type { DialogButton } from '../components/AppDialog';

type Confirm = { title: string; buttons: DialogButton[] };

function setup() {
  const confirms: Confirm[] = [];
  const alerts: string[] = [];
  const dialogs = {
    showConfirm: (title: string, _message: string | undefined, buttons: DialogButton[]) => { confirms.push({ title, buttons }); },
    showAlert: (title: string) => { alerts.push(title); },
  };
  const hook = renderHook(() => useChatSafety({
    conversationId: 'conv-1',
    otherName: 'Ruby',
    activeMode: 'client',
    dialogs,
  }));
  const press = (title: string, label: string) => {
    const dialog = [...confirms].reverse().find((c) => c.title === title);
    const button = dialog?.buttons.find((b) => b.text === label);
    if (!button) throw new Error(`No "${label}" in "${title}"`);
    button.onPress?.();
  };
  return { hook, alerts, press };
}

describe('report and block in a chat', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetBlockState.mockResolvedValue(false);
    mockSetBlock.mockResolvedValue(undefined);
    mockReport.mockResolvedValue({ ticketNumber: 1042, notified: true });
  });

  it('blocks the other person after confirming, and shows them as blocked', async () => {
    const { hook, press } = setup();
    await waitFor(() => expect(mockGetBlockState).toHaveBeenCalledWith('conv-1'));

    act(() => hook.result.current.openChatMenu());
    act(() => press('Ruby', 'Block Ruby'));
    await waitFor(() => press('Block Ruby?', 'Block'));

    await waitFor(() => expect(hook.result.current.blockedByMe).toBe(true));
    expect(mockSetBlock).toHaveBeenCalledWith('conv-1', true);
  });

  it('offers Unblock once blocked, and unblocks without a second question', async () => {
    mockGetBlockState.mockResolvedValue(true);
    const { hook, press } = setup();
    await waitFor(() => expect(hook.result.current.blockedByMe).toBe(true));

    act(() => hook.result.current.openChatMenu());
    await act(async () => { press('Ruby', 'Unblock Ruby'); });

    expect(mockSetBlock).toHaveBeenCalledWith('conv-1', false);
    expect(hook.result.current.blockedByMe).toBe(false);
  });

  it('reports one message by its id and gives the reference', async () => {
    const { hook, press, alerts } = setup();
    act(() => hook.result.current.confirmReportMessage('msg-9'));
    await act(async () => { press('Report this message?', 'Report'); });

    expect(mockReport).toHaveBeenCalledWith(expect.objectContaining({ kind: 'message', id: 'msg-9', activeMode: 'client' }));
    expect(alerts).toContain('Thanks for telling us');
  });

  it('reports the person in the chat from the menu', async () => {
    const { hook, press } = setup();
    act(() => hook.result.current.openChatMenu());
    act(() => press('Ruby', 'Report Ruby'));
    await waitFor(() => press('Report Ruby?', 'Report'));

    await waitFor(() => expect(mockReport).toHaveBeenCalledWith(expect.objectContaining({ kind: 'conversation', id: 'conv-1' })));
  });

  it('says so when a report could not be sent', async () => {
    mockReport.mockRejectedValue(new Error('network'));
    const { hook, press, alerts } = setup();
    act(() => hook.result.current.confirmReportMessage('msg-9'));
    await act(async () => { press('Report this message?', 'Report'); });

    expect(alerts).toContain("Couldn't send your report");
  });
});

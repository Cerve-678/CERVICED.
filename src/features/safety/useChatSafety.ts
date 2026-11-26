import { useCallback, useEffect, useState } from 'react';
import * as Haptics from 'expo-haptics';
import type { DialogButton, DialogPlacement } from '../../components/AppDialog';
import {
  getConversationBlockState,
  reportContent,
  setConversationBlock,
  type ReportKind,
} from '../../services/databaseService';
import { SUPPORT_EMAIL } from '../../constants/support';
import { logger } from '../../utils/logger';
import { toUserMessage } from '../../utils/userFacingError';
import { reportDeviceContext } from './reportContext';

interface ChatDialogs {
  showConfirm: (title: string, message: string | undefined, buttons: DialogButton[], placement?: DialogPlacement) => void;
  showAlert: (title: string, message?: string, placement?: DialogPlacement) => void;
}

// A dialog button closes its dialog straight after running, so a second
// dialog opened from inside one would be closed with it. Open it after the
// first has gone.
const NEXT_DIALOG_DELAY_MS = 350;

/**
 * Report and block for a chat between a client and a provider (App Store
 * guideline 1.2). Blocking uses the same block list as Circle; while it's on,
 * the database refuses messages in both directions. Reports go to support
 * through send-support-request, which looks up what was reported itself.
 */
export function useChatSafety({
  conversationId,
  otherName,
  activeMode,
  dialogs,
}: {
  conversationId: string | null;
  otherName: string;
  activeMode: string;
  dialogs: ChatDialogs;
}) {
  const [blockedByMe, setBlockedByMe] = useState(false);
  const { showConfirm, showAlert } = dialogs;

  useEffect(() => {
    if (!conversationId) return;
    let live = true;
    getConversationBlockState(conversationId)
      .then((blocked) => { if (live) setBlockedByMe(blocked); })
      .catch((err) => logger.error('[useChatSafety] block state failed:', err));
    return () => { live = false; };
  }, [conversationId]);

  const sendReport = useCallback(async (kind: ReportKind, id: string) => {
    try {
      const { ticketNumber } = await reportContent({
        kind,
        id,
        activeMode,
        ...reportDeviceContext(),
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      showAlert('Thanks for telling us', `We'll look into it. Your reference is #${ticketNumber}.`);
    } catch (err) {
      showAlert(
        "Couldn't send your report",
        `${toUserMessage(err, 'Please try again in a moment.', 'useChatSafety.sendReport')}\n\nYou can also email us at ${SUPPORT_EMAIL}.`,
      );
    }
  }, [activeMode, showAlert]);

  const setBlocked = useCallback(async (blocked: boolean) => {
    if (!conversationId) return;
    try {
      await setConversationBlock(conversationId, blocked);
      setBlockedByMe(blocked);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } catch (err) {
      showAlert(
        blocked ? `Couldn't block ${otherName}` : `Couldn't unblock ${otherName}`,
        toUserMessage(err, 'Please try again in a moment.', 'useChatSafety.setBlocked'),
      );
    }
  }, [conversationId, otherName, showAlert]);

  const confirmBlock = useCallback(() => {
    showConfirm(
      `Block ${otherName}?`,
      "Neither of you will be able to send messages in this chat. They won't be told. You can unblock them here at any time.",
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Block', style: 'destructive', onPress: () => { void setBlocked(true); } },
      ],
    );
  }, [otherName, setBlocked, showConfirm]);

  const confirmReportPerson = useCallback(() => {
    if (!conversationId) return;
    showConfirm(
      `Report ${otherName}?`,
      "We'll look at this chat. They won't know you reported them.",
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Report', style: 'destructive', onPress: () => { void sendReport('conversation', conversationId); } },
      ],
    );
  }, [conversationId, otherName, sendReport, showConfirm]);

  /** The header "⋯" menu: report the other person, and block or unblock them. */
  const openChatMenu = useCallback(() => {
    if (!conversationId) return;
    Haptics.selectionAsync().catch(() => {});
    const later = (fn: () => void) => () => { setTimeout(fn, NEXT_DIALOG_DELAY_MS); };
    showConfirm(otherName, undefined, [
      { text: `Report ${otherName}`, style: 'destructive', onPress: later(confirmReportPerson) },
      blockedByMe
        ? { text: `Unblock ${otherName}`, onPress: () => { void setBlocked(false); } }
        : { text: `Block ${otherName}`, style: 'destructive', onPress: later(confirmBlock) },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }, [blockedByMe, confirmBlock, confirmReportPerson, conversationId, otherName, setBlocked, showConfirm]);

  /** Press and hold on a message from the other person. */
  const confirmReportMessage = useCallback((messageId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    showConfirm(
      'Report this message?',
      "We'll look at it. They won't know you reported it.",
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Report', style: 'destructive', onPress: () => { void sendReport('message', messageId); } },
      ],
    );
  }, [sendReport, showConfirm]);

  const unblock = useCallback(() => { void setBlocked(false); }, [setBlocked]);

  return { blockedByMe, openChatMenu, confirmReportMessage, unblock };
}

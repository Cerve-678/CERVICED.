import { useCallback } from 'react';
import { Alert } from 'react-native';
import * as Haptics from 'expo-haptics';
import { reportContent } from '../../services/databaseService';
import { SUPPORT_EMAIL } from '../../constants/support';
import { toUserMessage } from '../../utils/userFacingError';
import { reportDeviceContext } from './reportContext';
import { tr } from '../../i18n/translate';

/**
 * Report one review to support (App Store guideline 1.2). Uses the system
 * alert because reviews are often shown inside a Modal, which the app's own
 * dialogs can't sit above.
 */
export function useReportReview(activeMode: string) {
  const sendReport = useCallback(async (reviewId: string) => {
    try {
      const { ticketNumber } = await reportContent({
        kind: 'review',
        id: reviewId,
        activeMode,
        ...reportDeviceContext(),
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      Alert.alert(tr('shared.newc.thanksForTellingUs'), tr('shared.newc2.refRef', { ref: ticketNumber }));
    } catch (err) {
      Alert.alert(
        tr('shared.reportProblem.failed.title'),
        tr('shared.reportProblem.failed.body', { reason: toUserMessage(err, 'Please try again in a moment.', 'useReportReview'), email: SUPPORT_EMAIL }),
      );
    }
  }, [activeMode]);

  return useCallback((reviewId: string) => {
    Haptics.selectionAsync().catch(() => {});
    Alert.alert(tr('shared.newc.reportThisReview'), tr('shared.newc.weLlLookAtItThe'), [
      { text: tr('common.cancel'), style: 'cancel' },
      { text: tr('shared.newc.report'), style: 'destructive', onPress: () => { void sendReport(reviewId); } },
    ]);
  }, [sendReport]);
}

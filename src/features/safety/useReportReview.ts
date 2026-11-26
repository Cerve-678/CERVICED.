import { useCallback } from 'react';
import { Alert } from 'react-native';
import * as Haptics from 'expo-haptics';
import { reportContent } from '../../services/databaseService';
import { SUPPORT_EMAIL } from '../../constants/support';
import { toUserMessage } from '../../utils/userFacingError';
import { reportDeviceContext } from './reportContext';

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
      Alert.alert('Thanks for telling us', `We'll look into it. Your reference is #${ticketNumber}.`);
    } catch (err) {
      Alert.alert(
        "Couldn't send your report",
        `${toUserMessage(err, 'Please try again in a moment.', 'useReportReview')}\n\nYou can also email us at ${SUPPORT_EMAIL}.`,
      );
    }
  }, [activeMode]);

  return useCallback((reviewId: string) => {
    Haptics.selectionAsync().catch(() => {});
    Alert.alert('Report this review?', "We'll look at it. The person who wrote it won't know you reported it.", [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Report', style: 'destructive', onPress: () => { void sendReport(reviewId); } },
    ]);
  }, [sendReport]);
}

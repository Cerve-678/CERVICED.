// src/features/social/recommend.ts
//
// Recommend / undo for every button that does it (Home card, rating bar,
// past booking, provider profile), so your own face in the ring follows at
// once instead of waiting for the next session. Throws on failure.

import { setProviderRecommendation } from '../../services/databaseService';
import { useCircleStore } from '../../stores/useCircleStore';

export async function recommendProvider(providerId: string, on: boolean): Promise<void> {
  await setProviderRecommendation(providerId, on);
  useCircleStore.getState().setMyRecommend(providerId, on);
}

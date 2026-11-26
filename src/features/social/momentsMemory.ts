// src/features/social/momentsMemory.ts
//
// Reads and changes MomentsMemory (circleMoments.ts) in AsyncStorage, one
// key per account, cleared at sign-out (AuthContext.logout). Changes are
// queued so Home and the rating bar never overwrite each other. It's
// decoration: a storage failure logs and carries on as if nothing was asked.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { logger } from '../../utils/logger';
import { EMPTY_MEMORY, parseMomentsMemory, type MomentsMemory } from './circleMoments';

export const momentsMemoryStorageKey = (userId: string): string => `circle.moments.${userId}`;

let queue: Promise<unknown> = Promise.resolve();

export async function readMomentsMemory(userId: string): Promise<MomentsMemory> {
  try {
    return parseMomentsMemory(await AsyncStorage.getItem(momentsMemoryStorageKey(userId)));
  } catch (err) {
    logger.warn('[circle-moments] could not read what was asked', err);
    return EMPTY_MEMORY;
  }
}

/** Applies `change` to the stored memory, after any change already queued. */
export function updateMomentsMemory(
  userId: string,
  change: (memory: MomentsMemory) => MomentsMemory,
): Promise<void> {
  const run = queue.then(async () => {
    try {
      const next = change(await readMomentsMemory(userId));
      await AsyncStorage.setItem(momentsMemoryStorageKey(userId), JSON.stringify(next));
    } catch (err) {
      logger.warn('[circle-moments] could not save what was asked', err);
    }
  });
  queue = run;
  return run;
}

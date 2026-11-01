import { getProviderBasicById } from '../services/databaseService';
import { logger } from '../utils/logger';
import { isProviderProfileUuid } from '../utils/providerProfileDeepLink';
import { requestMode } from './modeController';
import { navigationRef } from './navigationRef';

export type ProviderProfileLinkOutcome = 'opened' | 'not_found' | 'failed';

/**
 * Opens the client-facing profile a scanned QR code points at, whichever
 * account scanned it, and says what happened so the caller can explain anything
 * other than 'opened'. Someone who has just scanned a code is looking at the
 * screen waiting for something, so no outcome here may end in silence.
 */
export async function openProviderProfileLink(
  providerKey: string,
): Promise<ProviderProfileLinkOutcome> {
  try {
    // New QR codes carry the public slug used by ProviderProfile. Resolve only
    // legacy UUID QR codes so old printed cards continue to work.
    const providerSlug = isProviderProfileUuid(providerKey)
      ? ((await getProviderBasicById(providerKey))?.slug ?? null)
      : providerKey;
    if (!providerSlug) return 'not_found';

    // An account with a client profile opens it on the client side, where it
    // can book. A provider-only account is refused the client hat, so it opens
    // the same screen in its own Profile tab.
    const mode = await requestMode('client');
    if (!navigationRef.isReady()) return 'failed';

    const params = { providerId: providerSlug, source: 'profile_qr' };
    // initial: false keeps the tab's root underneath: right after a hat switch
    // the stack hasn't mounted, and the profile would otherwise be its only
    // route, leaving no back button.
    navigationRef.navigate('MainTabs', {
      screen: mode === 'client' ? 'Home' : 'Profile',
      params: {
        screen: mode === 'client' ? 'ProviderProfile' : 'PublicProviderProfile',
        initial: false,
        params,
      },
    } as never);
    return 'opened';
  } catch (error) {
    logger.error('[ProviderProfileLink] could not open scanned profile', error);
    return 'failed';
  }
}

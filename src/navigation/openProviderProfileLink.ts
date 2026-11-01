import { getProviderBasicById } from '../services/databaseService';
import { logger } from '../utils/logger';
import { isProviderProfileUuid } from '../utils/providerProfileDeepLink';
import { requestMode } from './modeController';
import { navigationRef } from './navigationRef';

export type ProviderProfileLinkOutcome =
  | 'opened'
  | 'not_found'
  | 'no_client_hat'
  | 'failed';

/**
 * Opens the provider profile a scanned QR code points at, and says what
 * happened so the caller can explain anything other than 'opened'. Someone who
 * has just scanned a code is looking at the screen waiting for something, so no
 * outcome here may end in silence.
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

    // ProviderProfile only exists in the client stacks, and a provider-only
    // account is refused the client hat.
    const mode = await requestMode('client');
    if (mode !== 'client') return 'no_client_hat';
    if (!navigationRef.isReady()) return 'failed';

    // initial: false keeps Home underneath: right after a hat switch the Home
    // stack hasn't mounted, and the profile would otherwise be its only route,
    // leaving no back button.
    navigationRef.navigate('MainTabs', {
      screen: 'Home',
      params: {
        screen: 'ProviderProfile',
        initial: false,
        params: { providerId: providerSlug, source: 'profile_qr' },
      },
    } as never);
    return 'opened';
  } catch (error) {
    logger.error('[ProviderProfileLink] could not open scanned profile', error);
    return 'failed';
  }
}

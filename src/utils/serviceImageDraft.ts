/** How one service photo is framed in the client-facing carousel.
 *  'cover' fills the box and may crop; 'contain' fits the whole photo. Stored
 *  per image as service_images.fit — the provider's choice, not the app's. */
export type ServiceImageFit = 'cover' | 'contain';

export interface ServiceImageDraft {
  /** Local file:// URI before the first save, https:// storage URL after. */
  uri: string;
  fit: ServiceImageFit;
}

/** Accepts either the current shape or the legacy bare-string array and always
 *  returns the current one. Needed because a provider's AsyncStorage cache
 *  (`@provider_reg_data_<userId>`) was written by an older build as
 *  `string[]`, and that cache is the fallback whenever Supabase returns
 *  nothing — so without this, an offline load would hand `undefined` uris to
 *  every consumer. */
export function normalizeServiceImages(raw: unknown): ServiceImageDraft[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((entry): ServiceImageDraft[] => {
    if (typeof entry === 'string') return [{ uri: entry, fit: 'cover' }];
    if (
      entry &&
      typeof entry === 'object' &&
      typeof (entry as ServiceImageDraft).uri === 'string'
    ) {
      const candidate = entry as ServiceImageDraft;
      return [
        { uri: candidate.uri, fit: candidate.fit === 'contain' ? 'contain' : 'cover' },
      ];
    }
    return [];
  });
}

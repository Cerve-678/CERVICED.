import { env } from '../utils/env';
import { logger } from '../utils/logger';

// Live translation of provider-WRITTEN content (service names, bios, notes).
//
// This is the ONLY dynamic-translation path, and it is a PAID, metered,
// external HTTP call — not Supabase — so it correctly lives here as its own
// service rather than inside databaseService.ts (that file owns the Supabase
// boundary; this owns an outbound translation-provider call).
//
// Structured for the Google Cloud Translation API v2 (REST):
//   POST https://translation.googleapis.com/language/translate/v2?key=KEY
//   body { q, source, target, format:'text' }
//   -> { data: { translations: [ { translatedText } ] } }
// (endpoint + shape verified against cloud.google.com/translate v2 docs.)
//
// The provider is pluggable (swap `googleV2Provider` for a DeepL provider, or —
// the production-correct choice — one that calls an Edge Function so the key
// stays a server secret). The rest of the app only ever calls translateDynamic.
//
// GATING / GRACEFUL DEGRADE: with no flag or no key (the default, and every
// current build) translateDynamic returns the ORIGINAL text with NO network
// call, so this costs nothing until deliberately enabled. See the report /
// env.ts for how to turn it on.

/** A translation backend. `apiKey`/`endpoint` are passed in so the provider
 *  stays a pure, swappable function of its inputs. */
export interface TranslationProvider {
  translate(text: string, targetLang: string, apiKey: string, endpoint: string): Promise<string>;
}

interface GoogleV2Response {
  data?: { translations?: Array<{ translatedText?: string }> };
}

/** Google Cloud Translation API v2 provider. Source is pinned to English
 *  because every string routed here is app/provider content authored in
 *  English. */
export const googleV2Provider: TranslationProvider = {
  async translate(text, targetLang, apiKey, endpoint) {
    const response = await fetch(`${endpoint}?key=${encodeURIComponent(apiKey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ q: text, source: 'en', target: targetLang, format: 'text' }),
    });
    if (!response.ok) {
      throw new Error(`Translation API responded ${response.status}`);
    }
    const json = (await response.json()) as GoogleV2Response;
    const translated = json.data?.translations?.[0]?.translatedText;
    if (!translated) {
      throw new Error('Translation API returned no translated text');
    }
    return translated;
  },
};

// Per-(target,text) in-memory cache, so a bio re-translates once per session
// rather than on every render, and an in-flight request is shared rather than
// duplicated. Not persisted — a cold start re-fetches, which is acceptable for
// a best-effort enhancement that always has the original to fall back on.
const memoryCache = new Map<string, string>();
const inFlight = new Map<string, Promise<string>>();

function cacheKey(text: string, targetLang: string): string {
  return `${targetLang}::${text}`;
}

/** Synchronous read of an already-translated string, or undefined. Lets the
 *  UI paint a cached translation immediately without awaiting. */
export function getCachedTranslation(text: string, targetLang: string): string | undefined {
  return memoryCache.get(cacheKey(text, targetLang));
}

export interface TranslateDynamicOptions {
  /** Override the backend (tests / a future DeepL or Edge-Function provider). */
  provider?: TranslationProvider;
}

/**
 * Translate provider-written `text` into `targetLang`, returning the ORIGINAL
 * text unchanged (and making no network call) when there is nothing to do:
 * empty text, an English target, or the feature not being configured. On a
 * provider failure it logs and degrades to the original rather than throwing,
 * so a caller can always render something.
 */
export async function translateDynamic(
  text: string,
  targetLang: string,
  options: TranslateDynamicOptions = {},
): Promise<string> {
  if (!text || !text.trim()) return text;
  if (targetLang === 'en') return text;
  if (!env.dynamicTranslationEnabled) return text;

  const key = cacheKey(text, targetLang);
  const cached = memoryCache.get(key);
  if (cached !== undefined) return cached;
  const pending = inFlight.get(key);
  if (pending) return pending;

  const provider = options.provider ?? googleV2Provider;
  const request = provider
    .translate(text, targetLang, env.translationApiKey, env.translationApiUrl)
    .then((translated) => {
      memoryCache.set(key, translated);
      inFlight.delete(key);
      return translated;
    })
    .catch((error) => {
      inFlight.delete(key);
      logger.error('Dynamic translation failed; showing original text', error);
      return text;
    });
  inFlight.set(key, request);
  return request;
}

/** Test-only: reset the module cache so cases don't leak into each other. */
export function __clearDynamicTranslationCache(): void {
  memoryCache.clear();
  inFlight.clear();
}

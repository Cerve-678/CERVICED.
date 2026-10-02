import {
  translateDynamic,
  __clearDynamicTranslationCache,
  type TranslationProvider,
} from '../services/dynamicTranslationService';

// These cases exercise the graceful-degrade guarantees that hold regardless of
// configuration: the feature is off in the test environment (no flag / key),
// so translateDynamic must return the ORIGINAL text and never call a provider.
afterEach(() => {
  __clearDynamicTranslationCache();
});

function spyProvider(): { provider: TranslationProvider; calls: () => number } {
  let count = 0;
  const provider: TranslationProvider = {
    async translate() {
      count += 1;
      return 'SHOULD-NOT-BE-USED';
    },
  };
  return { provider, calls: () => count };
}

describe('translateDynamic graceful degrade', () => {
  it('returns the original text and makes no provider call when the feature is disabled', async () => {
    const { provider, calls } = spyProvider();
    await expect(translateDynamic('Award-winning balayage specialist', 'es', { provider })).resolves.toBe(
      'Award-winning balayage specialist',
    );
    expect(calls()).toBe(0);
  });

  it('passes English targets through untouched, with no provider call', async () => {
    const { provider, calls } = spyProvider();
    await expect(translateDynamic('Any text', 'en', { provider })).resolves.toBe('Any text');
    expect(calls()).toBe(0);
  });

  it('passes empty / whitespace text through untouched', async () => {
    const { provider, calls } = spyProvider();
    await expect(translateDynamic('   ', 'es', { provider })).resolves.toBe('   ');
    await expect(translateDynamic('', 'fr', { provider })).resolves.toBe('');
    expect(calls()).toBe(0);
  });
});

import fs from 'fs';
import path from 'path';
import { act, renderHook } from '@testing-library/react-native';
import type { LogoFraming } from '../types/database';

const framing: LogoFraming = { imageRatio: 1, circle: { zoom: 1.5, x: 0.1, y: 0 } };
const A = '11111111-1111-1111-1111-111111111111';
const B = '22222222-2222-2222-2222-222222222222';

const mockGet = jest.fn(async (ids: string[]) =>
  Object.fromEntries(ids.map(id => [id, { logoUrl: `https://x/${id}.png`, framing }])),
);
jest.mock('../services/databaseService', () => ({
  getProviderLogoFramings: (ids: string[]) => mockGet(ids),
}));
jest.mock('../utils/logger', () => ({ logger: { error: jest.fn() } }));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { useProviderLogoFraming } = require('../features/providers/useProviderLogoFraming') as typeof import('../features/providers/useProviderLogoFraming');

const flush = async () => {
  await act(async () => {
    jest.runOnlyPendingTimers();
    await Promise.resolve();
    await Promise.resolve();
  });
};

beforeEach(() => {
  jest.useFakeTimers();
  mockGet.mockClear();
});
afterEach(() => jest.useRealTimers());

/**
 * Rows whose logo arrives without its framing (booking snapshots, search
 * rows, the cart) look it up. A whole list must be one query, not one per row.
 */
describe('useProviderLogoFraming', () => {
  it('asks for every row on screen in one query', async () => {
    const a = renderHook(() => useProviderLogoFraming(A, `https://x/${A}.png`));
    const b = renderHook(() => useProviderLogoFraming(B, `https://x/${B}.png`));
    await flush();
    expect(mockGet).toHaveBeenCalledTimes(1);
    expect(mockGet.mock.calls[0]![0].sort()).toEqual([A, B]);
    expect(a.result.current).toEqual(framing);
    expect(b.result.current).toEqual(framing);
  });

  it('draws a logo snapshot unframed once the provider has a different logo', async () => {
    const old = renderHook(() => useProviderLogoFraming(A, 'https://x/older-logo.png'));
    await flush();
    expect(old.result.current).toBeNull();
  });

  it('does not query for a slug', async () => {
    renderHook(() => useProviderLogoFraming('lola-studio', 'https://x/l.png'));
    await flush();
    expect(mockGet).not.toHaveBeenCalled();
  });
});

describe('the profile circle opens the whole logo', () => {
  it('Provider Profile wraps the circle in a tap that shows it in full', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'screens', 'client', 'ProviderProfileScreen.tsx'), 'utf8');
    expect(src).toContain('setShowFullLogo(true)');
    expect(src).toMatch(/<FullImageViewer\s+uri=\{provider\.providerLogo\?\.uri \?\? null\}/);
  });
});

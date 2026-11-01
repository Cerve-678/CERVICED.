const mockRpc = jest.fn();

jest.mock('../lib/supabase', () => ({
  supabase: { rpc: (...args: unknown[]) => mockRpc(...args) },
  clearCachedReads: jest.fn(),
}));

import { mergeProviderAutomationSettings } from '../services/databaseService';

// automation_settings is edited from three screens. Each must change only its
// own keys server-side — writing the whole bundle back from a copy loaded when
// the screen opened is how one screen's save used to undo another's.
describe('mergeProviderAutomationSettings', () => {
  beforeEach(() => mockRpc.mockReset().mockResolvedValue({ error: null }));

  it('sends only the keys it was given', async () => {
    await mergeProviderAutomationSettings('p1', { scheduleReleaseDay: 20 });
    expect(mockRpc).toHaveBeenCalledWith('merge_provider_automation_settings', {
      p_provider_id: 'p1',
      p_set: { scheduleReleaseDay: 20 },
      p_remove: [],
    });
  });

  it('removes a key without touching the rest', async () => {
    await mergeProviderAutomationSettings('p1', {}, ['scheduleReleaseDay']);
    expect(mockRpc).toHaveBeenCalledWith('merge_provider_automation_settings', {
      p_provider_id: 'p1',
      p_set: {},
      p_remove: ['scheduleReleaseDay'],
    });
  });

  it('throws when the server refuses', async () => {
    mockRpc.mockResolvedValue({ error: new Error('not yours') });
    await expect(mergeProviderAutomationSettings('p1', { depositRequiredNew: true })).rejects.toThrow('not yours');
  });
});

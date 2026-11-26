import { converse } from '../services/becca/engine';
import type { ConversationContext } from '../services/becca/types';

describe('Becca cross-hat conversation isolation', () => {
  it('drops a client context rather than carrying it into provider Becca', async () => {
    const clientContext: ConversationContext = {
      hat: 'client',
      entities: {},
      lastCapabilityId: 'discover.search',
      lastProviders: [
        { slug: 'another-provider', displayName: 'Another Provider' },
      ],
      offeredSuggestions: ['Show me all services'],
    };

    // A social turn is intentionally local: it proves the role boundary
    // without fetching bookings or provider data.
    const { context } = await converse({
      message: 'hello',
      hat: 'provider',
      bookings: [],
      conversation: clientContext,
    });

    expect(context.hat).toBe('provider');
    expect(context.lastProviders).toBeUndefined();
    expect(context.lastCapabilityId).toBeUndefined();
    expect(context.offeredSuggestions).toBeUndefined();
  });
});

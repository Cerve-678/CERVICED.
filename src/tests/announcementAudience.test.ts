import { interestedRecipientIds } from '../features/providers/announcementAudience';

describe('the Interested announcement audience', () => {
  it('reaches past clients and people who saved or belled', () => {
    expect(interestedRecipientIds(['c1', 'c2'], ['f1'])).toEqual(['c1', 'c2', 'f1']);
  });

  it('sends once to someone who has booked and also saved or belled', () => {
    expect(interestedRecipientIds(['c1', 'both'], ['both', 'f1'])).toEqual(['c1', 'both', 'f1']);
  });

  it('works with either side empty', () => {
    expect(interestedRecipientIds([], ['f1'])).toEqual(['f1']);
    expect(interestedRecipientIds(['c1'], [])).toEqual(['c1']);
    expect(interestedRecipientIds([], [])).toEqual([]);
  });
});

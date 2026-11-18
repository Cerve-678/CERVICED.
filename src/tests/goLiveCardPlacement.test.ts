import { GO_LIVE_CARD_DROPS_AT_PERCENT, goLiveCardLeads } from '../features/providers/goLiveStatus';

describe('where the Profile dashboard puts the go-live card', () => {
  it('drops to the bottom once a live provider is 80% set up', () => {
    expect(GO_LIVE_CARD_DROPS_AT_PERCENT).toBe(80);
    expect(goLiveCardLeads(79, true)).toBe(true);
    expect(goLiveCardLeads(80, true)).toBe(false);
    expect(goLiveCardLeads(100, true)).toBe(false);
  });

  it("stays on top while clients can't book them, however far along", () => {
    expect(goLiveCardLeads(90, false)).toBe(true);
    expect(goLiveCardLeads(100, false)).toBe(true);
  });
});

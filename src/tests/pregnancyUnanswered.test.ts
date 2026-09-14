import { createServiceDraft } from '../features/provider-registration/serviceDraft';

/** The read the client-facing surfaces share: three states, never two. */
const toPregnancy = (raw: boolean | null): 'safe' | 'unsafe' | 'unanswered' =>
  raw === true ? 'safe' : raw === false ? 'unsafe' : 'unanswered';

// A provider who switches nothing on has not said a treatment is unsafe. The
// old read was `!(raw === true)`, which made "never answered" and "answered
// no" identical -- so a brand-new service with nothing toggled still showed
// "not recommended during pregnancy" to clients and forced a safety
// acknowledgement at checkout, attributing a clinical claim to a provider who
// never made one.
describe('pregnancy safety is three states, not two', () => {
  it('starts a brand-new service unanswered', () => {
    expect(createServiceDraft().isPregnancySafe).toBeNull();
    expect(createServiceDraft({ name: 'Balayage' } as never).isPregnancySafe).toBeNull();
  });

  it('keeps unanswered apart from an explicit no', () => {
    expect(toPregnancy(null)).toBe('unanswered');
    expect(toPregnancy(false)).toBe('unsafe');
    expect(toPregnancy(true)).toBe('safe');
  });

  // The two rules the client-facing screens turn on.
  it('warns only on an explicit no, and reassures only on an explicit yes', () => {
    const warns = (raw: boolean | null) => toPregnancy(raw) === 'unsafe';
    const reassures = (raw: boolean | null) => toPregnancy(raw) === 'safe';

    expect(warns(null)).toBe(false);      // silence is not a warning
    expect(reassures(null)).toBe(false);  // nor is it a clearance
    expect(warns(false)).toBe(true);
    expect(reassures(true)).toBe(true);
  });
});

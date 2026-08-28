import {
  BUFFER_OPTS,
  SERVICE_BUFFER_AFTER_OPTS,
  SERVICE_BUFFER_BEFORE_OPTS,
} from '../features/business-details/options';

// The per-service buffer override and the account-level buffer are two controls
// over the same scheduling concept, and the service editor used to take freely
// typed minutes — which is how they could disagree. These lock in that the
// service-level choices stay derived from the account-level ones, and that the
// nullable column's two directions keep their different meanings.
describe('per-service buffer options', () => {
  const minutes = (opts: { value: string }[]) => opts.map(o => o.value).filter(v => v !== '');

  it('offers no padding the account-level setting does not', () => {
    const accountValues = BUFFER_OPTS.map(o => o.value);
    for (const value of minutes(SERVICE_BUFFER_BEFORE_OPTS)) expect(accountValues).toContain(value);
    for (const value of minutes(SERVICE_BUFFER_AFTER_OPTS)) expect(accountValues).toContain(value);
  });

  it('gives "before" one chip for the no-padding state, since NULL and 0 both resolve to 0', () => {
    expect(SERVICE_BUFFER_BEFORE_OPTS[0]).toEqual({ value: '', label: 'None' });
    expect(minutes(SERVICE_BUFFER_BEFORE_OPTS)).not.toContain('0');
  });

  it('gives "after" both an inherit chip and an explicit none, since NULL inherits the account buffer', () => {
    expect(SERVICE_BUFFER_AFTER_OPTS[0]).toEqual({ value: '', label: 'My default' });
    expect(minutes(SERVICE_BUFFER_AFTER_OPTS)).toContain('0');
  });

  it('keeps every option parseable as minutes, so saving writes a number or NULL', () => {
    for (const opt of [...SERVICE_BUFFER_BEFORE_OPTS, ...SERVICE_BUFFER_AFTER_OPTS]) {
      if (opt.value === '') continue;
      expect(Number.isInteger(Number(opt.value))).toBe(true);
      expect(Number(opt.value)).toBeGreaterThanOrEqual(0);
    }
  });
});

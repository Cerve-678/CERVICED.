import { resolveDepositMode, resolveEditorDepositMode } from '../utils/depositPolicy';

describe('resolveDepositMode', () => {
  it('prefers the explicit depositMode a provider set', () => {
    expect(resolveDepositMode({ depositMode: 'client_choice' })).toBe('client_choice');
    expect(resolveDepositMode({ depositMode: 'full_only' })).toBe('full_only');
    expect(resolveDepositMode({ depositMode: 'deposit_required' })).toBe('deposit_required');
  });

  it('lets depositMode win over a stale legacy pair', () => {
    // Both are written together now, but a partially-migrated row must not
    // have its new "optional" choice dragged back to the old lockstep answer.
    expect(
      resolveDepositMode({ depositMode: 'client_choice', depositRequired: true, depositOnly: true }),
    ).toBe('client_choice');
  });

  it('ignores a depositMode value that is not one of the three states', () => {
    expect(resolveDepositMode({ depositMode: 'yes' })).toBeNull();
    expect(resolveDepositMode({ depositMode: true, depositRequired: true })).toBe('deposit_required');
  });

  it('reads legacy rows that only have the boolean pair', () => {
    expect(resolveDepositMode({ depositRequired: false })).toBe('full_only');
    expect(resolveDepositMode({ depositRequired: true, depositOnly: true })).toBe('deposit_required');
    // Blobs from before depositOnly was mirrored onto depositRequired.
    expect(resolveDepositMode({ depositOnly: true })).toBe('deposit_required');
    expect(resolveDepositMode({ depositRequired: true })).toBe('deposit_required');
  });

  it('returns null when the provider never answered, distinct from full_only', () => {
    // The client mapper keys its historical 20%-both-options fallback off
    // this null — collapsing it to 'full_only' would silently remove the
    // deposit option from every provider who has not opened Payments.
    expect(resolveDepositMode(null)).toBeNull();
    expect(resolveDepositMode(undefined)).toBeNull();
    expect(resolveDepositMode({})).toBeNull();
    expect(resolveDepositMode({ cancelNotice: '24h' } as never)).toBeNull();
  });
});

describe('resolveEditorDepositMode', () => {
  it('starts an unconfigured provider on the mode matching what clients already see', () => {
    // Opening Payments and pressing Save must not change the booking sheet
    // for a provider who never set a deposit policy.
    expect(resolveEditorDepositMode(null)).toBe('client_choice');
    expect(resolveEditorDepositMode({})).toBe('client_choice');
  });

  it('otherwise agrees with resolveDepositMode', () => {
    expect(resolveEditorDepositMode({ depositRequired: false })).toBe('full_only');
    expect(resolveEditorDepositMode({ depositMode: 'deposit_required' })).toBe('deposit_required');
  });
});

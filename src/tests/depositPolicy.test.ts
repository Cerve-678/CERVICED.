import { depositNoteForClients, resolveDepositMode, resolveEditorDepositMode } from '../utils/depositPolicy';

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
    // for a provider who never set a deposit policy: clients get no deposit.
    expect(resolveEditorDepositMode(null)).toBe('full_only');
    expect(resolveEditorDepositMode({})).toBe('full_only');
  });

  it('otherwise agrees with resolveDepositMode', () => {
    expect(resolveEditorDepositMode({ depositRequired: false })).toBe('full_only');
    expect(resolveEditorDepositMode({ depositMode: 'deposit_required' })).toBe('deposit_required');
  });
});

// The "Note to clients" a provider writes under their deposit on Payments.
// It was saved but never shown anywhere a client could read it.
describe('depositNoteForClients', () => {
  it("shows the provider's note when they take deposits", () => {
    expect(depositNoteForClients({ depositMode: 'client_choice', depositAmount: '20', depositNote: 'The deposit will be deducted from your final bill' }))
      .toBe('The deposit will be deducted from your final bill');
    expect(depositNoteForClients({ depositMode: 'deposit_required', depositAmount: '10', depositNote: '  Comes off your bill  ' }))
      .toBe('Comes off your bill');
  });

  it('shows nothing when the provider takes no deposit, even if an old note is still saved', () => {
    expect(depositNoteForClients({ depositMode: 'full_only', depositAmount: '20', depositNote: 'Old note' })).toBeNull();
    expect(depositNoteForClients({ depositNote: 'Never chose a mode' })).toBeNull();
    expect(depositNoteForClients({ depositMode: 'client_choice', depositNote: 'No amount set' })).toBeNull();
  });

  it('shows nothing for a blank or missing note', () => {
    expect(depositNoteForClients({ depositMode: 'client_choice', depositAmount: '20', depositNote: '   ' })).toBeNull();
    expect(depositNoteForClients({ depositMode: 'client_choice', depositAmount: '20' })).toBeNull();
    expect(depositNoteForClients({ depositMode: 'client_choice', depositAmount: '20', depositNote: 42 })).toBeNull();
    expect(depositNoteForClients(null)).toBeNull();
  });
});

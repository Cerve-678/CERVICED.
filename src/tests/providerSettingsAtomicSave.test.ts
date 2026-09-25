import fs from 'fs';
import path from 'path';

/**
 * A provider's settings must save all-or-nothing, and the screen must show what
 * was actually stored. Before this, weekly hours were three statements from the
 * app and Payments was three concurrent writes, so a dropped connection could
 * leave a half-changed week or deposit setup with no way to tell which half.
 */

const mockRpc = jest.fn();
const mockUpdate = jest.fn();
const mockEq = jest.fn();
const mockSelect = jest.fn();

jest.mock('../lib/supabase', () => ({
  supabase: {
    rpc: (...args: unknown[]) => mockRpc(...args),
    from: (table: string) => ({
      update: (...args: unknown[]) => {
        mockUpdate(table, ...args);
        return {
          eq: (...eqArgs: unknown[]) => {
            mockEq(...eqArgs);
            return { select: (...selArgs: unknown[]) => mockSelect(...selArgs) };
          },
        };
      },
    }),
  },
}));

import { saveProviderWeeklySchedule, saveProviderPaymentSettings } from '../services/databaseService';

const read = (...parts: string[]): string =>
  fs.readFileSync(path.join(__dirname, '..', ...parts), 'utf8');

const days = Array.from({ length: 7 }, (_, dow) => ({
  day_of_week: dow, open_time: '09:00:00', close_time: '17:00:00', is_closed: dow === 0,
}));
const windows = [{ day_of_week: 1, start_time: '09:00:00', end_time: '12:00:00' }];

describe('saveProviderWeeklySchedule', () => {
  beforeEach(() => { mockRpc.mockReset(); mockUpdate.mockReset(); });

  it('writes the whole week with ONE call to the transactional RPC', async () => {
    mockRpc.mockResolvedValue({ data: null, error: null });

    await saveProviderWeeklySchedule('prov-1', days, windows);

    expect(mockRpc).toHaveBeenCalledTimes(1);
    expect(mockRpc).toHaveBeenCalledWith('replace_provider_weekly_schedule', {
      p_provider_id: 'prov-1',
      p_days: days,
      p_windows: windows,
    });
    // Never the separate table writes that could land unevenly.
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('throws when the RPC fails, so the screen can keep the edits and say so', async () => {
    mockRpc.mockResolvedValue({ data: null, error: new Error('invalid weekly schedule') });

    await expect(saveProviderWeeklySchedule('prov-1', days, windows)).rejects.toThrow('invalid weekly schedule');
  });
});

describe('saveProviderPaymentSettings', () => {
  const settings = {
    preferredPaymentMethods: ['card', 'cash'],
    automationSettings: { depositRequiredNew: true } as never,
    bookingPolicies: { depositMode: 'client_choice', cancelNotice: '24h' },
  };
  beforeEach(() => { mockUpdate.mockReset(); mockEq.mockReset(); mockSelect.mockReset(); });

  it('writes payment methods, automation settings and policies in ONE update of the providers row', async () => {
    mockSelect.mockResolvedValue({ data: [{ id: 'prov-1' }], error: null });

    await saveProviderPaymentSettings('prov-1', settings);

    expect(mockUpdate).toHaveBeenCalledTimes(1);
    expect(mockUpdate).toHaveBeenCalledWith('providers', {
      preferred_payment_methods: ['card', 'cash'],
      automation_settings: { depositRequiredNew: true },
      booking_policies: { depositMode: 'client_choice', cancelNotice: '24h' },
    });
    expect(mockEq).toHaveBeenCalledWith('id', 'prov-1');
  });

  it('throws on a database error', async () => {
    mockSelect.mockResolvedValue({ data: null, error: new Error('connection lost') });

    await expect(saveProviderPaymentSettings('prov-1', settings)).rejects.toThrow('connection lost');
  });

  it('throws when no row was updated, instead of reporting a save that stored nothing', async () => {
    // RLS turns "not your row" into zero affected rows, not an error.
    mockSelect.mockResolvedValue({ data: [], error: null });

    await expect(saveProviderPaymentSettings('prov-1', settings)).rejects.toThrow(/provider profile/);
  });
});

describe('the settings screens', () => {
  it('Payments saves through the single-update function, not three separate writes', () => {
    const source = read('screens', 'provider', 'PaymentsScreen.tsx');

    expect(source).toContain('saveProviderPaymentSettings(providerId');
    expect(source).not.toContain('updateProviderContactDetails');
    expect(source).not.toContain('updateProviderAutomationSettings');
    expect(source).not.toContain('saveProviderPolicies');
    expect(source).not.toContain('Promise.all(');
  });

  it('Weekly hours are read-only until Edit, and Save re-reads what was stored', () => {
    const source = read('screens', 'provider', 'ProviderScheduleScreen.tsx');

    expect(source).toContain('const [editingHours, setEditingHours] = useState(false)');
    expect(source).toContain('Edit hours');
    expect(source).toContain('Cancel');

    const save = source.slice(
      source.indexOf('async function handleSaveHours'),
      source.indexOf('// ── Blocked dates handlers'),
    );
    // After the write lands the screen re-reads the database, and only then
    // leaves edit mode — it must not just trust the typed values.
    expect(save).toContain('await loadData()');
    expect(save.indexOf('await saveProviderWeeklySchedule(')).toBeLessThan(save.indexOf('await loadData()'));
    // No more silently leaving the screen as though everything is verified.
    expect(save).not.toContain('navigation.goBack()');
    // A failed write keeps the edits on screen for another try.
    expect(save).toContain('Your changes are still here');
  });

  it('never shows default hours as if they were the saved ones after a failed load', () => {
    const source = read('screens', 'provider', 'ProviderScheduleScreen.tsx');

    expect(source).toContain("useState<'loading' | 'ready' | 'error'>('loading')");
    expect(source).toContain('Couldn’t load your hours');
    // The windows read used to be swallowed into [], hiding every break.
    expect(source).not.toContain('getProviderAvailabilityWindows(profile.id).catch(() => [])');
  });
});

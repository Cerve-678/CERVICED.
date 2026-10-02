// prepare_checkout's own gate is `is_pregnancy_safe = false` — an explicit
// false, never a null. The profile mapper and the registration service both
// read the column as `?? true` for the same reason. getServiceSafetyFlags
// (which drives the cart's safety-acknowledgement line) once read it as
// `=== true`, so it flagged every never-set (null) service as unsafe — a
// warning no other surface showed and the server never required an ack for.
// These pin the mapping so the cart can't drift back out of step.

let mockRows: Array<{ id: string; patch_test_required: boolean | null; is_pregnancy_safe: boolean | null }> = [];
let mockError: unknown = null;

jest.mock('../lib/supabase', () => ({
  __esModule: true,
  supabase: {
    from: () => ({
      select: () => ({
        in: () => Promise.resolve({ data: mockRows, error: mockError }),
      }),
    }),
  },
}));

describe('getServiceSafetyFlags pregnancy mapping', () => {
  beforeEach(() => {
    mockRows = [];
    mockError = null;
  });

  async function flagsFor(rows: typeof mockRows) {
    mockRows = rows;
    const { getServiceSafetyFlags } = require('../services/databaseService');
    return getServiceSafetyFlags(rows.map(r => r.id));
  }

  it('treats a null (never-set) service as pregnancy-safe, matching the server gate', async () => {
    const map = await flagsFor([{ id: 'a', patch_test_required: false, is_pregnancy_safe: null }]);
    expect(map.get('a')).toEqual({ patchTestRequired: false, isPregnancySafe: true });
  });

  it('treats only an explicit false as unsafe in pregnancy', async () => {
    const map = await flagsFor([{ id: 'b', patch_test_required: false, is_pregnancy_safe: false }]);
    expect(map.get('b')).toEqual({ patchTestRequired: false, isPregnancySafe: false });
  });

  it('keeps an explicit true safe', async () => {
    const map = await flagsFor([{ id: 'c', patch_test_required: false, is_pregnancy_safe: true }]);
    expect(map.get('c').isPregnancySafe).toBe(true);
  });

  it('still surfaces a patch-test requirement independently', async () => {
    const map = await flagsFor([{ id: 'd', patch_test_required: true, is_pregnancy_safe: null }]);
    expect(map.get('d')).toEqual({ patchTestRequired: true, isPregnancySafe: true });
  });
});

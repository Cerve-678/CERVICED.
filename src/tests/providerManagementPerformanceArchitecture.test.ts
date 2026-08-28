import fs from 'fs';
import path from 'path';

const read = (relative: string): string =>
  fs.readFileSync(path.join(__dirname, '..', relative), 'utf8');

describe('provider management performance contracts', () => {
  it('keeps account and branding provider reads behind databaseService', () => {
    for (const screen of [
      'BrandingScreen',
      'BusinessInfoScreen',
      'ProviderAccountInfoScreen',
      'ProviderAccountScreen',
      'ProviderAutomationsScreen',
      'SchedulingScreen',
    ]) {
      expect(read(`screens/provider/${screen}.tsx`)).not.toContain(
        "from '../../lib/supabase'",
      );
    }
    expect(read('screens/provider/BrandingScreen.tsx')).toContain(
      'getMyProviderBranding()',
    );
    expect(read('screens/provider/ProviderAccountInfoScreen.tsx')).toContain(
      'getMyProviderAccountEditorInfo()',
    );
  });

  it('shares one auth/profile context across settings bootstrap screens', () => {
    expect(read('screens/provider/BusinessInfoScreen.tsx')).toContain(
      'getMyProviderProfileContext()',
    );
    // The "Your Terms & Conditions" card (and its hasMyProviderTermsForm
    // check) moved out of Business Info to the end of the InfoReg profile
    // document on 2026-08-28 — see FUTURE_LOGIC.md "Emergency / out-of-hours
    // booking requests — deferred".
    expect(read('screens/provider/ProviderAutomationsScreen.tsx')).toContain(
      'getMyProviderProfileContext()',
    );
    expect(read('screens/provider/SchedulingScreen.tsx')).toContain(
      'getMyProviderProfileContext()',
    );
  });

  it('uses the shared local-file storage uploader for promotion images', () => {
    const source = read('screens/provider/ProviderPromotionsScreen.tsx');

    expect(source).not.toContain('await fetch(uri)');
    expect(source).not.toContain("supabase.storage.from('promotion-images')");
    expect(source).toContain(
      "uploadToStorage('promotion-images', path, uri)",
    );
  });

  it('keeps clientele aggregation off the promotions critical path', () => {
    const source = read('screens/provider/ProviderPromotionsScreen.tsx');
    const coreLoad = source.slice(
      source.indexOf('const [data, svcData] = await Promise.all(['),
      source.indexOf('// Client aggregation can scan'),
    );

    expect(coreLoad).not.toContain('getProviderClientele()');
    expect(source).toContain('await getMyPromotionManagerCore()');
    expect(source).toContain('void getProviderClientele()');
    expect(source).toContain("clientsLoading ? '…' : clients.length");
  });

  it('bounds owner promotion and nested service collections', () => {
    const source = read('services/databaseService.ts');
    const promotions = source.slice(
      source.indexOf('export async function getMyPromotions'),
      source.indexOf('export interface UpsertPromotionInput'),
    );
    const services = source.slice(
      source.indexOf('export async function getMyProviderServices'),
      source.indexOf('export type CheckoutIntentItem'),
    );

    expect(promotions).not.toContain('.select("*")');
    expect(promotions).toContain('.limit(200)');
    expect(services).not.toContain('service_add_ons ( * )');
    expect(services).toContain(
      '.limit(50, { referencedTable: "service_add_ons" })',
    );
  });

  it('keeps booking-detail realtime behind the database boundary', () => {
    const source = read('screens/provider/ProviderBookingDetailScreen.tsx');

    expect(source).not.toContain("from '../../lib/supabase'");
    expect(source).toContain('subscribeToProviderBookingDetailChanges');
  });

  it('saves the full weekly schedule through one atomic RPC', () => {
    const screen = read('screens/provider/ProviderScheduleScreen.tsx');
    // Found by suffix, not by version. A migration's timestamp is deliberately
    // mutable — supabase/MIGRATION_OWNER.md requires renumbering above the
    // applied frontier, and this file has already moved once — so pinning the
    // full name here fails the suite for a rename that changed nothing this
    // test cares about. The content is the contract; the number is not.
    const migrationsDir = path.join(__dirname, '..', '..', 'supabase', 'migrations');
    const migrationFile = fs
      .readdirSync(migrationsDir)
      .find(name => name.endsWith('_atomic_provider_weekly_schedule.sql'));
    expect(migrationFile).toBeDefined();
    const migration = fs.readFileSync(path.join(migrationsDir, migrationFile!), 'utf8');

    expect(screen).toContain('saveProviderWeeklySchedule(');
    expect(screen).not.toContain('Promise.all(days.map');
    expect(migration).toContain('SECURITY INVOKER');
    expect(migration).toContain('weekly schedule must contain each day exactly once');
    expect(migration).toContain('ON CONFLICT (provider_id, day_of_week) DO UPDATE');
  });
});

import fs from 'fs';
import path from 'path';

const screensRoot = path.join(__dirname, '..', 'screens');
const sourceRoot = path.join(__dirname, '..');

function allTsxFiles(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return allTsxFiles(fullPath);
    return entry.name.endsWith('.tsx') ? [fullPath] : [];
  });
}

function allSourceFiles(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      return entry.name === 'tests' ? [] : allSourceFiles(fullPath);
    }
    return /\.tsx?$/.test(entry.name) ? [fullPath] : [];
  });
}

describe('screen Supabase boundary', () => {
  it('keeps the shared Supabase client inside the database boundary', () => {
    const allowed = new Set([
      path.join(sourceRoot, 'lib', 'supabase.ts'),
      path.join(sourceRoot, 'services', 'databaseService.ts'),
    ]);
    for (const file of allSourceFiles(sourceRoot)) {
      if (allowed.has(file)) continue;
      const source = fs.readFileSync(file, 'utf8');
      expect(source).not.toMatch(/from ['"][^'"]*\/lib\/supabase['"]/);
    }
  });

  it('keeps every screen free of direct Supabase client imports', () => {
    for (const file of allTsxFiles(screensRoot)) {
      const source = fs.readFileSync(file, 'utf8');
      expect(source).not.toMatch(/from ['"][^'"]*\/lib\/supabase['"]/);
    }
  });

  it('routes auth screens through typed service helpers', () => {
    const database = fs.readFileSync(
      path.join(__dirname, '..', 'services', 'databaseService.ts'),
      'utf8',
    );

    for (const helper of [
      'signInWithEmailPassword',
      'signInWithAppleIdToken',
      'sendPasswordReset',
      'verifyRecoveryOtp',
      'verifySignupOtp',
      'resendSignupOtp',
      'updateCurrentPassword',
      'signUpWithEmail',
    ]) {
      expect(database).toContain(`function ${helper}`);
    }
  });

  it('keeps the app-wide booking context behind the same boundary', () => {
    const booking = fs.readFileSync(
      path.join(__dirname, '..', 'contexts', 'BookingContext.tsx'), 'utf8',
    );
    const auth = fs.readFileSync(
      path.join(__dirname, '..', 'contexts', 'AuthContext.tsx'), 'utf8',
    );

    expect(booking).not.toMatch(/from ['"][^'"]*\/lib\/supabase['"]/);
    expect(auth).not.toMatch(/from ['"][^'"]*\/lib\/supabase['"]/);
    expect(booking).toContain('subscribeToUserBookingChanges');
    expect(booking).toContain('subscribeToRescheduleRequestChanges');
    expect(auth).toContain('subscribeToAuthStateChanges');
  });

  it('keeps availability orchestration behind typed database projections', () => {
    const availability = fs.readFileSync(
      path.join(__dirname, '..', 'services', 'AvailabilityService.ts'), 'utf8',
    );

    expect(availability).not.toMatch(/from ['"][^'"]*\/lib\/supabase['"]/);
    expect(availability).not.toMatch(/\.from\(['"]/);
    expect(availability).toContain('getAvailabilityDateBundle');
    expect(availability).toContain('getAvailabilityDateExceptions');
  });
});

import fs from 'fs';
import path from 'path';

/**
 * The Info Pack / Form tip from My Profile's service editor (#613) also sits
 * in Info Reg's service sheet when editing a profile (user, 2026-11-18).
 */
const root = path.join(__dirname, '..', '..');
const screen = fs.readFileSync(path.join(root, 'src', 'screens', 'provider', 'InfoRegScreen.tsx'), 'utf8');

describe('Info Reg service sheet: Info Pack / Form tip', () => {
  it('uses the same tip and remembered key as My Profile, so it never shows twice', () => {
    expect(screen).toContain('tour={TOUR_KEYS.PROVIDER_SERVICE_PACK_TIP}');
    expect(screen).toContain("title={tr('providerProfile.ui.aftercareOrQuestionsBeforeTheyCome')}");
  });

  it('only shows when editing a full CERVICED profile', () => {
    expect(screen).toMatch(/\{\.\.\.\(isEditMode && !isLinkOnly\s+\? \{\s+onOpenPackOrForm:/);
  });

  it('saves the service before opening, and keeps the tip when it cannot', () => {
    expect(screen).toContain('if (savingDraft || saveProblem()) return false;');
    expect(screen).toMatch(/onClose\(\);\s+if \(then\) onOpenPackOrForm\?\.\(then\);/);
  });

  it('tells them a new service shows in packs and forms only once published', () => {
    expect(screen).toContain("It shows in Info Packs and Forms once you've published your profile.");
  });
});

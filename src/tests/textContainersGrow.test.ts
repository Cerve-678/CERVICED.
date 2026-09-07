import fs from 'fs';
import path from 'path';

/**
 * Containers whose only job is to hold a text label must not be pinned to a
 * fixed height.
 *
 * Android's "Display size" setting cannot be overridden by an app (unlike font
 * size, which src/utils/fontScaleClamp.ts caps) — it changes system density,
 * so the app is handed a smaller window with proportionally larger text. A
 * container with `height: 52` then clips its own label. `minHeight` renders
 * identically while the content fits and grows instead of cutting off when it
 * doesn't.
 *
 * Guarding the source rather than a render because the failure is a styling
 * habit that reappears whenever a new button is written by copying an old one.
 */
const GUARDED: ReadonlyArray<[string, readonly string[]]> = [
  ['screens/auth/EmailVerificationScreen.tsx', ['primaryBtn', 'secondaryBtn']],
  ['screens/auth/ForgotPasswordScreen.tsx', ['primaryBtn']],
  ['screens/auth/WelcomeScreen.tsx', ['primaryBtn', 'secondaryBtn']],
  ['screens/auth/NewPasswordScreen.tsx', ['primaryBtn']],
  ['screens/auth/ResetPasswordOTPScreen.tsx', ['primaryBtn', 'secondaryBtn']],
  ['screens/auth/ClaimProviderScreen.tsx', ['primaryBtn', 'input']],
  ['screens/provider/BrandingScreen.tsx', ['saveBtn']],
  ['screens/provider/ProviderMyProfileScreen.tsx', ['primaryAction']],
  ['screens/provider/ProviderConversationScreen.tsx', ['header']],
  ['screens/client/SearchScreen.tsx', ['filterModalDone']],
  ['components/LocationModal.tsx', ['applyButton']],
];

const read = (rel: string) =>
  fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');

/** The body of a `name: { ... }` style object, or null if there isn't one. */
function styleBody(source: string, name: string): string | null {
  const match = new RegExp(`\\b${name}:\\s*\\{([^{}]*?)\\}`, 's').exec(source);
  return match ? match[1]! : null;
}

describe('text containers grow rather than clip', () => {
  for (const [file, styles] of GUARDED) {
    const source = read(file);

    for (const style of styles) {
      it(`${file} → ${style} is not pinned to a fixed height`, () => {
        const body = styleBody(source, style);
        expect(body).not.toBeNull();
        // `height:` on its own clips. `minHeight:`/`maxHeight:` are fine, and
        // a nested `shadowOffset: { height: n }` is not a size at all.
        const withoutShadow = body!.replace(/shadowOffset:\s*\{[^}]*\}/g, '');
        expect(withoutShadow).not.toMatch(/(?<![a-zA-Z])height:\s*\d/);
      });

      it(`${file} → ${style} still reserves its designed height`, () => {
        // Converting to minHeight must not have dropped the value: the button
        // should still be its original tap-target size when text is small.
        expect(styleBody(source, style)).toMatch(/minHeight:\s*\d+/);
      });
    }
  }
});

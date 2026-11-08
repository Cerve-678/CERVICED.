import fs from 'fs';
import path from 'path';
import { formatPickList, toPickList } from '../features/beauty-profile/pickList';

/**
 * Skin type and style vibe are multi-pick (user, 2026-11-08). Rows written
 * before the text -> text[] migration still hold one string, so every reader
 * goes through toPickList and the app only ever sees a list.
 */
describe('toPickList', () => {
  it('keeps a list as a list, trimmed, without blanks or repeats', () => {
    expect(toPickList(['Oily', ' Sensitive ', '', 'Oily'])).toEqual(['Oily', 'Sensitive']);
  });

  it('turns an old single answer into a one-answer list', () => {
    expect(toPickList('Dry')).toEqual(['Dry']);
    expect(toPickList('  Minimal ')).toEqual(['Minimal']);
  });

  it('reads nothing as an empty list', () => {
    expect(toPickList(null)).toEqual([]);
    expect(toPickList(undefined)).toEqual([]);
    expect(toPickList('')).toEqual([]);
    expect(toPickList('   ')).toEqual([]);
    expect(toPickList(42)).toEqual([]);
  });

  it('reads a JSON array written into a text column as that list', () => {
    expect(toPickList('["Oily","Dry"]')).toEqual(['Oily', 'Dry']);
  });

  it('keeps a value that only looks like JSON as one answer', () => {
    expect(toPickList('[not json')).toEqual(['[not json']);
  });

  it('formats a list on one line', () => {
    expect(formatPickList(['Combination', 'Sensitive'])).toBe('Combination, Sensitive');
    expect(formatPickList([])).toBe('');
  });
});

describe('one shape everywhere', () => {
  const root = path.join(__dirname, '..');
  const read = (p: string) => fs.readFileSync(path.join(root, p), 'utf8');

  it('sign-up and the Beauty Profile editor offer the same chip lists', () => {
    const signup = read('screens/auth/SignUpStep4Screen.tsx');
    expect(signup).toContain("import { SKIN_TYPES, STYLE_VIBES } from '../../features/beauty-profile/options';");
    expect(signup).not.toMatch(/const (SKIN_TYPES|STYLE_VIBES)\s*=/);
  });

  it('the editor toggles both and still shows a saved answer that is off the list', () => {
    const editor = read('features/beauty-profile/CategoryEditor.tsx');
    expect(editor).toContain("renderChips(withSaved(SKIN_TYPES, draft.skinType), o => draft.skinType.includes(o), o => toggleMulti('skinType', o))");
    expect(editor).toContain("renderChips(withSaved(STYLE_VIBES, draft.styleVibe), o => draft.styleVibe.includes(o), o => toggleMulti('styleVibe', o))");
  });

  it('the migration rebuilds whichever provider read is live with text[] columns', () => {
    const sql = fs.readFileSync(
      path.join(root, '..', 'supabase', 'migrations', '20261108150000_beauty_profile_skin_type_and_style_vibe_multi_pick.sql'),
      'utf8',
    );
    expect(sql).toContain('ALTER COLUMN skin_type  TYPE text[] USING pg_temp.to_pick_list(skin_type)');
    expect(sql).toContain('ALTER COLUMN style_vibe TYPE text[] USING pg_temp.to_pick_list(style_vibe)');
    expect(sql).toContain("'public.get_client_beauty_profile_for_booking(uuid)'");
    expect(sql).toContain("'public.get_client_beauty_profile_for_provider(uuid)'");
    expect(sql).toContain('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated, service_role');
  });
});

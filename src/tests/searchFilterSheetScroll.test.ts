import fs from 'fs';
import path from 'path';

/**
 * The filter sheet's ScrollView must not sit inside a Pressable. A Pressable
 * that owns the touch responder competes with the scroll gesture, so drags
 * start and get cancelled — the sheet feels sticky. The backdrop tap-to-dismiss
 * is a sibling of the sheet instead, as in the app's other modals.
 */
describe('Search filter sheet scrolls', () => {
  const source = fs.readFileSync(
    path.join(__dirname, '..', 'screens', 'client', 'SearchScreen.tsx'),
    'utf8',
  );
  const start = source.indexOf('visible={filterModalVisible}');
  const end = source.indexOf('</Modal>', start);
  const sheet = source.slice(start, end);

  it('locates the filter modal', () => {
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
  });

  it('does not wrap the sheet, or its ScrollView, in a Pressable', () => {
    // The only Pressable left is the standalone dismiss overlay.
    expect(sheet.match(/<Pressable/g)?.length).toBe(1);
    expect(sheet).toContain('<Pressable\n            style={StyleSheet.absoluteFill}');
    expect(sheet).not.toContain('onPress={() => {}}');
  });

  it('makes the sheet a plain View and lets the list claim the drag', () => {
    expect(sheet).toContain('<View style={[styles.filterModalSheet');
    expect(sheet).toContain('nestedScrollEnabled');
    expect(sheet).toContain('keyboardShouldPersistTaps="handled"');
  });
});

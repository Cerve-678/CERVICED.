import fs from 'fs';
import path from 'path';

const source = fs.readFileSync(
  path.join(__dirname, '..', 'screens', 'provider', 'PoliciesScreen.tsx'),
  'utf8',
);

describe('detailed policy image', () => {
  it('uploads the whole photo instead of forcing the square crop', () => {
    const picker = source.slice(
      source.indexOf('launchImageLibraryAsync({'),
      source.indexOf('const asset = result.assets'),
    );
    expect(picker).toContain("mediaTypes: ['images']");
    expect(picker).not.toContain('allowsEditing');
  });

  it('previews the whole photo instead of cutting it to the tile', () => {
    expect(source).toMatch(/uri: policies\.policyImageUrl \}\}[^\n]*resizeMode="contain"/);
  });
});

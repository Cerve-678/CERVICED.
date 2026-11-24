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
      source.indexOf('const picked = '),
    );
    expect(picker).toContain("mediaTypes: ['images']");
    expect(picker).toContain('allowsMultipleSelection');
    expect(picker).not.toContain('allowsEditing');
  });

  it('offers a crop after picking, and uploads what comes back from it', () => {
    expect(source).toContain('setPolicyImageCropQueue(picked)');
    expect(source).toContain('onDone={handlePolicyImageCropped}');
    // 'document' keeps a long sheet at full width, so it isn't blurry when read.
    expect(source).toContain("uploadToStorage('portfolio', path, uri, 'document')");
  });

  it('previews the whole photo instead of cutting it to the tile', () => {
    expect(source).toMatch(/source=\{\{ uri: url \}\}[^\n]*resizeMode="contain"/);
  });
});

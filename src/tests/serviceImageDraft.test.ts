import { normalizeServiceImages } from '../utils/serviceImageDraft';

// A provider's AsyncStorage cache (`@provider_reg_data_<userId>`) is written by
// whatever build they last saved from, and it's the fallback whenever Supabase
// returns nothing. A build predating service_images.fit wrote `images` as a
// bare string[], so the loader has to accept both shapes — otherwise an
// offline load hands `undefined` uris to every consumer of a service's photos.
describe('normalizeServiceImages', () => {
  it('upgrades the legacy string[] shape, defaulting to the no-crop-change fit', () => {
    expect(normalizeServiceImages(['a.jpg', 'b.jpg'])).toEqual([
      { uri: 'a.jpg', fit: 'cover' },
      { uri: 'b.jpg', fit: 'cover' },
    ]);
  });

  it('passes the current shape through and preserves an explicit contain', () => {
    expect(
      normalizeServiceImages([
        { uri: 'a.jpg', fit: 'contain' },
        { uri: 'b.jpg', fit: 'cover' },
      ]),
    ).toEqual([
      { uri: 'a.jpg', fit: 'contain' },
      { uri: 'b.jpg', fit: 'cover' },
    ]);
  });

  it('coerces an unrecognised fit to cover rather than writing it through', () => {
    // 'cover' is the column default and the CHECK constraint only allows the
    // two values, so anything else must not reach the save payload.
    expect(normalizeServiceImages([{ uri: 'a.jpg', fit: 'squish' }])).toEqual([
      { uri: 'a.jpg', fit: 'cover' },
    ]);
  });

  it('drops entries with no usable uri instead of emitting undefined', () => {
    expect(
      normalizeServiceImages(['ok.jpg', null, 42, {}, { fit: 'cover' }]),
    ).toEqual([{ uri: 'ok.jpg', fit: 'cover' }]);
  });

  it('returns an empty list for a missing or non-array value', () => {
    expect(normalizeServiceImages(undefined)).toEqual([]);
    expect(normalizeServiceImages(null)).toEqual([]);
    expect(normalizeServiceImages('a.jpg')).toEqual([]);
  });
});

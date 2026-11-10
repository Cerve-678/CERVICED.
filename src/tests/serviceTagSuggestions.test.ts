import {
  descriptionProblem,
  hasNoTags,
  MAX_TAG_LENGTH,
  mergeTagGroups,
  normalizeTag,
  parseTypedTags,
  suggestServiceDetails,
  tagLabel,
} from '../features/providers/serviceTags';

// Every case is a real live service name + menu heading from 2026-10-25 that
// had no tags, so these are the suggestions those providers would have seen.
const suggest = (name: string, categoryName: string, fallbackKind?: string) =>
  suggestServiceDetails({ name, categoryName, fallbackKind });

describe('suggestServiceDetails', () => {
  it('reads tags out of names providers typed themselves', () => {
    expect(suggest('Volume spikes', 'Volume Lashes')).toMatchObject({
      kind: 'LASHES',
      techniqueTags: expect.arrayContaining(['volume']),
      styleTags: expect.arrayContaining(['wispy']),
    });
    // The heading's "gel" is offered, not ticked: the name already said French.
    expect(suggest('Slick French', 'Gel', 'NAILS')).toMatchObject({
      techniqueTags: ['french'],
      alsoConsider: expect.objectContaining({ techniqueTags: ['gel'] }),
    });
    expect(suggest('Boho Braids', 'Braids', 'HAIR')).toMatchObject({
      techniqueTags: expect.arrayContaining(['braids']),
      styleTags: expect.arrayContaining(['boho']),
    });
    expect(suggest('Butterfly cut', 'Cuts & Styling')).toMatchObject({
      techniqueTags: expect.arrayContaining(['haircut']),
      trendNames: expect.arrayContaining(['butterfly-cut']),
    });
    expect(suggest('Almond stilettos', 'Acrylic', 'NAILS')).toMatchObject({
      techniqueTags: ['almond', 'stiletto'],
      alsoConsider: expect.objectContaining({ techniqueTags: ['acrylic'] }),
    });
  });

  it('knows a word that means a tag without containing it', () => {
    expect(suggest('Pixi Cut', 'Cuts & Styling').techniqueTags).toContain('haircut');
    expect(suggest('My ex Blowout', 'Blow Dry Bar').techniqueTags).toContain('blow-dry');
    expect(suggest('Tap ins', 'Extensions', 'HAIR').techniqueTags).toContain('tape-ins');
    // "Lace" / "frontal" mean a wig install on their own, so the name ticks it.
    expect(suggest('Lace Frontal 13x6', 'Wig Installation').techniqueTags).toEqual(['frontal', 'wig-install']);
    expect(suggest('Feet ONLY - Full set Acrylic', 'Acrylic', 'NAILS').techniqueTags)
      .toEqual(expect.arrayContaining(['acrylic', 'pedicure']));
    expect(suggest('Smokey Makeup', 'Smoky makeup').techniqueTags).toContain('smokey-eye');
  });

  it("offers the nearest template's description when the name is a version of one", () => {
    expect(suggest('Full set acrylic', 'Acrylic', 'NAILS')).toMatchObject({
      templateName: 'Acrylic Full Set',
      description: expect.stringContaining('acrylic extensions'),
    });
    expect(suggest('Lip Fillers (2ml)', 'Lip Fillers', 'AESTHETICS')).toMatchObject({
      templateName: expect.stringMatching(/^Lip Filler/),
      techniqueTags: expect.arrayContaining(['filler']),
    });
    // A name that shares one word with a template isn't that template.
    expect(suggest('Pink princess', 'Soft Glam').templateName).toBeNull();
  });

  it('says who a service is for when the name or heading does', () => {
    expect(suggest('Barrel twist', "Men's Hair").audience).toBe('men');
    expect(suggest('HydraFacial', 'Male facial').audience).toBe('men');
    expect(suggest('Kids braids', 'Braids', 'HAIR').audience).toBe('kids');
    expect(suggest('Knotless Braids', 'Braids', 'HAIR').audience).toBe('');
  });

  it('ticks heading tags only when the name gives none', () => {
    expect(suggest('Pink princess', 'Soft Glam').techniqueTags).toContain('soft-glam');
    const misfiled = suggest('Dermaplaning', 'Dermal Fillers', 'AESTHETICS');
    expect(misfiled.techniqueTags).not.toContain('filler');
    expect(misfiled.alsoConsider.techniqueTags).toContain('filler');
  });

  it('does not read "hair" as "haircut" or "twist" as "retwist"', () => {
    expect(suggest('Wash & Go', 'Hair Treatments').techniqueTags).not.toContain('haircut');
    expect(suggest('Barrel twist', "Men's Hair").techniqueTags).toEqual(['twists', 'barrel-twists']);
  });

  it('never ticks a whole row of chips', () => {
    const s = suggest('Classic hybrid volume mega volume russian wispy mink lash extensions', 'Lashes');
    expect(s.techniqueTags.length).toBeLessThanOrEqual(4);
  });

  it('suggests nothing from nothing', () => {
    expect(hasNoTags(suggest('', 'Other'))).toBe(true);
  });
});

describe('mergeTagGroups', () => {
  it('keeps what the provider chose and adds only new tags', () => {
    const empty = { styleTags: [], techniqueTags: [], outcomeTags: [], occasionTags: [], trendNames: [] };
    expect(mergeTagGroups({ ...empty, techniqueTags: ['gel'] }, { ...empty, techniqueTags: ['gel', 'french'] }).techniqueTags)
      .toEqual(['gel', 'french']);
  });
});

describe('descriptionProblem', () => {
  it('catches the live descriptions that tell a client nothing', () => {
    expect(descriptionProblem('', 'HydraFacial')).toBe('missing');
    expect(descriptionProblem('Any colour', 'Freestyle French')).toBe('too-short');
    expect(descriptionProblem('Lip Fillers — 2ml.', 'Lip Fillers (2ml)')).toBe('repeats-name');
    expect(descriptionProblem('AtzgzgkstkkzgkxgkxgkzgzfkzgkzgkztdyodoydykdyodxydzfnNffjfngxhxb b bvxg', 'Male ethicists'))
      .toBe('looks-like-typing');
    expect(descriptionProblem('gkggghghjvhjhjvkvkgjmhungiuguioggogogoggugggutghgbigiugi g f ufubgivkg', 'Almond Queen'))
      .toBe('looks-like-typing');
    expect(descriptionProblem('Uyfujmklvjmlkjv maybe. Uh oh poor kink inkjet pikpupjpjopuk.', 'Hands & Feet Combo'))
      .toBe('looks-like-typing');
  });

  it('accepts real descriptions, long words included', () => {
    expect(descriptionProblem('Short white French tips over a natural base', 'Classic French')).toBeNull();
    expect(descriptionProblem('Strengthening builder gel overlay for stronger, healthier natural nails.', 'BIAB Overlay')).toBeNull();
    expect(descriptionProblem('Gentle exfoliation that removes peach fuzz for smoother, brighter skin', 'Dermaplaning')).toBeNull();
  });
});

describe('tags for what clients actually search', () => {
  // Live names that had no tags on 2026-11-09, and Search's own misses then.
  it('reads the names that used to come back with nothing', () => {
    expect(suggest('Wash & Go', 'Hair Treatments').techniqueTags).toContain('wash-and-go');
    expect(suggest('Layered', 'Cuts', 'HAIR').techniqueTags).toEqual(expect.arrayContaining(['haircut', 'layers']));
    expect(suggest('Deep conditioning treatment', 'Treatments', 'HAIR').techniqueTags).toContain('deep-conditioning');
    expect(suggest('Short French tip', 'Gel', 'NAILS').techniqueTags).toEqual(expect.arrayContaining(['french', 'french-tip', 'short-nails']));
    expect(suggest('Luxury pedicure (gel polish)', 'Pedicures', 'NAILS').techniqueTags).toEqual(expect.arrayContaining(['pedicure', 'gel-polish']));
    expect(suggest('Lash lift & tint', 'Lashes').techniqueTags).toEqual(expect.arrayContaining(['lash-lift', 'lash-tint']));
    expect(suggest('Nikah makeup', 'Bridal', 'MUA').techniqueTags).toContain('asian-bridal');
  });

  it('offers trend names clients type', () => {
    expect(suggest('Italian bob', 'Cuts', 'HAIR').trendNames).toContain('italian-bob');
    expect(suggest('Micro French', 'Gel', 'NAILS').trendNames).toContain('micro-french');
    expect(suggest('Cloud skin glam', 'Makeup').trendNames).toContain('cloud-skin');
  });

  it('gives waxing, tanning and massage their own tags', () => {
    expect(suggest('Hollywood wax', 'Waxing', 'OTHER').techniqueTags).toEqual(expect.arrayContaining(['waxing', 'hollywood-wax']));
    expect(suggest('Spray tan', 'Tanning', 'OTHER').techniqueTags).toContain('spray-tan');
  });
});

describe('typed tags', () => {
  it('stores what a provider types in the same form as the presets', () => {
    expect(normalizeTag('Box Braids')).toBe('box-braids');
    expect(normalizeTag('  Glazed   Donut! ')).toBe('glazed-donut');
    expect(normalizeTag('contour & highlight')).toBe('contour-and-highlight');
    expect(normalizeTag('3D art')).toBe('3d-art');
    expect(normalizeTag('wig_install / frontal')).toBe('wig-install-frontal');
    expect(normalizeTag('ombré')).toBe('ombré');
    expect(normalizeTag('!!!')).toBe('');
  });

  it('cuts a sentence down without leaving a dangling hyphen', () => {
    const tag = normalizeTag('a really long description of the whole service and more');
    expect(tag.length).toBeLessThanOrEqual(MAX_TAG_LENGTH);
    expect(tag.endsWith('-')).toBe(false);
  });

  it('reads commas and new lines as separate tags and drops repeats', () => {
    expect(parseTypedTags('knotless, Box Braids,box braids,\n, boho')).toEqual(['knotless', 'box-braids', 'boho']);
    expect(parseTypedTags(' , ')).toEqual([]);
  });

  it('shows hyphenated tags as words', () => {
    expect(tagLabel('date-night')).toBe('date night');
  });
});

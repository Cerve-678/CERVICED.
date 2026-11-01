import {
  descriptionProblem,
  hasNoTags,
  mergeTagGroups,
  suggestServiceDetails,
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
    expect(suggest('Lace Frontal 13x6', 'Wig Installation')).toMatchObject({
      techniqueTags: ['frontal'],
      alsoConsider: expect.objectContaining({ techniqueTags: ['wig-install'] }),
    });
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
    expect(suggest('Barrel twist', "Men's Hair").techniqueTags).toEqual(['twists']);
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

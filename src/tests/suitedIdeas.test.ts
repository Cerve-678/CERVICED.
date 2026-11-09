import { EMPTY_BEAUTY_DATA, type BeautyData } from '../types/beautyProfile';
import { allSuitedIdeas, suitedIdeas } from '../features/beauty-profile/suitedIdeas';
import { hairGoalsFor, HAIR_GOALS } from '../features/beauty-profile/options';

const profile = (patch: Partial<BeautyData>): BeautyData => ({ ...EMPTY_BEAUTY_DATA, ...patch });
const labels = (category: Parameters<typeof suitedIdeas>[0], d: BeautyData) => suitedIdeas(category, d).map(i => i.label);

describe('suitedIdeas — hair', () => {
  it('offers 4C hair silk presses and protective styles, never balayage', () => {
    const ideas = labels('hair', profile({ hairType: ['4C'] }));
    expect(ideas).toEqual(expect.arrayContaining(['Silk press', 'Knotless braids', 'Twists']));
    expect(ideas).not.toContain('Balayage');
    expect(ideas).not.toContain('Highlights');
  });

  it('leads with protective styles and trims when the goal is length retention', () => {
    const ideas = suitedIdeas('hair', profile({ hairType: ['4C'], hairGoals: ['Length retention'] }));
    expect(ideas.slice(0, 3).map(i => i.label)).toEqual(['Knotless braids', 'Twists', 'Trim']);
    expect(ideas[0]!.because).toBe('Hair goal: Length retention');
  });

  it('gives coloured 4C hair colour care, still not balayage', () => {
    const ideas = labels('hair', profile({ hairType: ['4C'], treatmentHistory: ['Coloured'] }));
    expect(ideas).toContain('Hair colour');
    expect(ideas).not.toContain('Balayage');
  });

  it('only offers balayage to straight or wavy hair that colours', () => {
    expect(labels('hair', profile({ hairType: ['Straight'] }))).not.toContain('Balayage');
    expect(labels('hair', profile({ hairType: ['Straight'], hairGoals: ['Colour / highlights'] }))).toContain('Balayage');
  });

  it('says which answer each idea came from', () => {
    const [first] = suitedIdeas('hair', profile({ hairType: ['Curly'] }));
    expect(first).toMatchObject({ label: 'Curly cut', because: 'Hair type: Curly', category: 'hair' });
  });

  it('lists each idea once and caps the list', () => {
    const ideas = labels('hair', profile({
      hairType: ['4B'],
      hairGoals: ['Length retention', 'Protective styling', 'Moisture', 'Healthy ends'],
      treatmentHistory: ['Relaxed / permed'],
    }));
    expect(new Set(ideas).size).toBe(ideas.length);
    expect(ideas.length).toBeLessThanOrEqual(6);
  });
});

describe('suitedIdeas — other categories', () => {
  it('points long coffin nails at extensions and short nails at BIAB', () => {
    expect(labels('nails', profile({ nailLength: ['Long'], nailShape: ['Coffin'] }))).toEqual(
      expect.arrayContaining(['Gel extensions', 'Acrylic full set']),
    );
    expect(labels('nails', profile({ nailLength: ['Short'] }))[0]).toBe('BIAB');
  });

  it('turns lash and brow answers into the services that give them', () => {
    const ideas = labels('lashesBrows', profile({ lashStatus: 'Currently have extensions', browStyle: ['Fluffy'] }));
    expect(ideas).toEqual(['Lash infill', 'Brow lamination']);
  });

  it('turns makeup answers into looks', () => {
    expect(labels('makeup', profile({ makeupCoverage: ['Full glam'], makeupEyes: ['Smoky'] }))).toEqual(
      expect.arrayContaining(['Full glam makeup', 'Smoky eye']),
    );
  });

  it('has nothing for skin, and never reads health or skin answers', () => {
    const d = profile({
      skinConcerns: ['Acne prone', 'Rosacea'], skinTone: 'Deep', sensitiveAreas: ['Face'],
      allergies: ['Latex'], medicalNotes: 'pregnant',
    });
    expect(suitedIdeas('skin', d)).toEqual([]);
    expect(allSuitedIdeas(d)).toEqual([]);
  });

  it('gives exactly the same ideas whatever the health, skin and aesthetics answers say', () => {
    const base = profile({
      hairType: ['4C'], hairGoals: ['Length retention'], treatmentHistory: ['Coloured'],
      nailLength: ['Long'], lashStatus: 'Currently have extensions', makeupCoverage: ['Full glam'],
    });
    const withHealth = {
      ...base,
      treatmentHistory: [...base.treatmentHistory, 'Fillers / Botox', 'Chemical peels', 'Microblading'],
      skinConcerns: ['Eczema'], skinTone: 'Deep', sensitiveAreas: ['Face'], skinType: ['Sensitive'],
      allergies: ['Dyes / PPD', 'Latex'], medicalNotes: 'pregnant',
    };
    expect(allSuitedIdeas(withHealth, 6)).toEqual(allSuitedIdeas(base, 6));
  });

  it('never proposes keratin from a goal alone', () => {
    expect(labels('hair', profile({ hairType: ['Straight'], hairGoals: ['Frizz control'] }))).not.toContain('Keratin smoothing');
    expect(labels('hair', profile({ hairType: ['Straight'], treatmentHistory: ['Keratin / smoothing'] }))).toContain('Keratin smoothing');
  });

  it('is empty for an empty profile', () => {
    expect(allSuitedIdeas(EMPTY_BEAUTY_DATA)).toEqual([]);
  });
});

describe('hairGoalsFor', () => {
  it('keeps every goal and puts textured-hair goals first for 4C', () => {
    const goals = hairGoalsFor(['4C']);
    expect([...goals].sort()).toEqual([...HAIR_GOALS].sort());
    expect(goals[0]).toBe('Length retention');
  });

  it('puts volume and colour first for straight hair', () => {
    expect(hairGoalsFor(['Straight']).slice(0, 2)).toEqual(['Volume', 'Colour / highlights']);
  });
});

describe('suitedIdeas — several picks per question', () => {
  it('treats 4B + 4C as coily and says both', () => {
    const [first] = suitedIdeas('hair', profile({ hairType: ['4B', '4C'] }));
    expect(first).toMatchObject({ label: 'Silk press', because: 'Hair type: 4B, 4C' });
  });

  it('never offers balayage when any pick is curly or coily, even with colour', () => {
    const ideas = labels('hair', profile({ hairType: ['Wavy', '4C'], treatmentHistory: ['Coloured'] }));
    expect(ideas).not.toContain('Balayage');
    expect(ideas).toContain('Hair colour');
  });

  it('gives ideas for every nail shape picked', () => {
    const ideas = labels('nails', profile({ nailShape: ['Almond', 'Stiletto'] }));
    expect(ideas).toEqual(expect.arrayContaining(['BIAB', 'Acrylic full set']));
  });

  it('gives ideas for every lash and makeup look picked', () => {
    expect(labels('lashesBrows', profile({ lashStyle: ['Wispy', 'Mega volume'] }))).toEqual(
      ['Wispy hybrid lashes', 'Mega volume lashes'],
    );
    expect(labels('makeup', profile({ makeupEyes: ['Smoky', 'Cut crease'] }))).toEqual(
      expect.arrayContaining(['Smoky eye', 'Cut crease']),
    );
  });
});

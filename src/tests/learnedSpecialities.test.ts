import { learnSpecialities, type SpecialityUse } from '../utils/learnedSpecialities';

const use = (specialty: string, providerId: string, categories = ['HAIR']): SpecialityUse =>
  ({ specialty, providerId, categories });

it('needs more than one provider before offering a term', () => {
  expect(learnSpecialities([use('Bonnet sets', 'a')], [])).toEqual([]);
  expect(learnSpecialities([use('Bonnet sets', 'a'), use('Bonnet sets', 'a')], [])).toEqual([]);
  expect(learnSpecialities([use('Bonnet sets', 'a'), use('bonnet-sets', 'b')], [])).toHaveLength(1);
});

it('uses the spelling most providers typed', () => {
  expect(learnSpecialities([use('bonnet sets', 'a'), use('Bonnet sets', 'b'), use('Bonnet sets', 'c')], []))
    .toEqual(['Bonnet sets']);
});

it('leaves out what the known list already covers, including misspellings', () => {
  expect(learnSpecialities([use('balyage', 'a'), use('balyage', 'b')], ['Balayage'])).toEqual([]);
});

it('only offers terms from the categories asked for', () => {
  const uses = [use('Bonnet sets', 'a', ['HAIR']), use('Bonnet sets', 'b', ['HAIR'])];
  expect(learnSpecialities(uses, [], ['NAILS'])).toEqual([]);
  expect(learnSpecialities(uses, [], ['HAIR'])).toEqual(['Bonnet sets']);
});

it('ignores links, handles and junk', () => {
  for (const term of ['www.mysite.com', '@myhandle', '12', 'x']) {
    expect(learnSpecialities([use(term, 'a'), use(term, 'b')], [])).toEqual([]);
  }
});

it('puts the most used first', () => {
  const uses = [use('Zig zag parts', 'a'), use('Zig zag parts', 'b'), use('Bonnet sets', 'a'), use('Bonnet sets', 'b'), use('Bonnet sets', 'c')];
  expect(learnSpecialities(uses, [])).toEqual(['Bonnet sets', 'Zig zag parts']);
});

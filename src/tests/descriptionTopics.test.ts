import { learnDescriptionTopics, type LiveServiceDescription } from '../features/providers/descriptionTopics';
import { suggestServiceDetails } from '../features/providers/serviceTags';

const row = (name: string, description: string, providerId: string): LiveServiceDescription => ({ name, description, providerId });

it('needs two other providers before suggesting a topic', () => {
  const one = [row('Knotless braids', 'Hair is included. Aftercare advice given.', 'a')];
  expect(learnDescriptionTopics(one, 'Knotless braids', '')).toEqual([]);
  const two = [...one, row('Knotless Braids (mid back)', 'Includes hair and a wash.', 'b')];
  expect(learnDescriptionTopics(two, 'Knotless braids', '')).toEqual(['whether hair is included']);
});

it('only learns from similar services', () => {
  const rows = [row('Gel nails', 'Includes aftercare.', 'a'), row('Acrylic nails', 'Aftercare included.', 'b')];
  expect(learnDescriptionTopics(rows, 'Knotless braids', '')).toEqual([]);
});

it('leaves out what the description already covers, and the provider themselves', () => {
  const rows = [row('Lash lift', 'Aftercare given.', 'a'), row('Lash lift & tint', 'Full aftercare.', 'b')];
  expect(learnDescriptionTopics(rows, 'Lash lift', 'With aftercare advice')).toEqual([]);
  expect(learnDescriptionTopics(rows, 'Lash lift', '', 'a')).toEqual([]);
});

it("never hands back anyone else's wording", () => {
  const rows = [row('Lash lift', 'My secret Paris method with aftercare.', 'a'), row('Lash lift', 'aftercare', 'b')];
  expect(learnDescriptionTopics(rows, 'Lash lift', '').join(' ')).not.toMatch(/paris/i);
});

it('offers up to three description ideas, ending with a general line', () => {
  const s = suggestServiceDetails({ name: 'Blow dry', categoryName: 'Hair' });
  expect(s.descriptionIdeas.length).toBeGreaterThan(0);
  expect(s.descriptionIdeas.length).toBeLessThanOrEqual(3);
  expect(new Set(s.descriptionIdeas).size).toBe(s.descriptionIdeas.length);
  expect(s.descriptionIdeas[0]).toBe(s.description);
});

it('still has an idea when no template matches, and none before a name', () => {
  expect(suggestServiceDetails({ name: 'Pink princess special', categoryName: 'Nails' }).descriptionIdeas).toHaveLength(1);
  expect(suggestServiceDetails({ name: '', categoryName: 'Nails' }).descriptionIdeas).toEqual([]);
});

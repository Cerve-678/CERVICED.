import { serviceLocationsFromArea, townOfArea } from '../utils/clientArea';

describe('townOfArea', () => {
  it('takes the town from a picked area', () => {
    expect(townOfArea('Camden, London')).toBe('London');
    expect(townOfArea('Chorlton, Manchester')).toBe('Manchester');
  });

  it('treats a typed place with no town as its own town', () => {
    expect(townOfArea('Dartford')).toBe('Dartford');
    expect(townOfArea('  Dartford  ')).toBe('Dartford');
  });

  it('ignores stray commas and spaces', () => {
    expect(townOfArea('Haggerston, London, ')).toBe('London');
  });

  it('has no town for a blank answer', () => {
    expect(townOfArea('')).toBeNull();
    expect(townOfArea(' , ')).toBeNull();
  });
});

describe('serviceLocationsFromArea', () => {
  it('keeps service_locations filled with the town of the picked area', () => {
    expect(serviceLocationsFromArea('Camden, London')).toEqual(['London']);
  });

  it('is empty when no area was picked', () => {
    expect(serviceLocationsFromArea('')).toEqual([]);
  });
});

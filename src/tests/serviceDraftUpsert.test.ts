import { collapseDuplicateSavedServices, upsertServiceInList } from '../features/provider-registration/serviceDraft';

type S = { id: number; dbId: string | null; name: string };

describe('upsertServiceInList', () => {
  it('replaces a saved service whose local id changed after a refresh', () => {
    const refreshed: S[] = [{ id: 7, dbId: 'row-a', name: 'Strip look' }];
    const editedFromCache: S = { id: 2, dbId: 'row-a', name: 'Strip look (edited)' };
    expect(upsertServiceInList(refreshed, editedFromCache)).toEqual([editedFromCache]);
  });

  it('still matches an unsaved service by its local id', () => {
    const list: S[] = [{ id: 1, dbId: null, name: 'Draft' }, { id: 2, dbId: 'row-b', name: 'Other' }];
    const edited: S = { id: 1, dbId: null, name: 'Draft 2' };
    expect(upsertServiceInList(list, edited)).toEqual([edited, list[1]]);
  });

  it('appends a new service and removes an existing extra copy on edit', () => {
    expect(upsertServiceInList([], { id: 1, dbId: null, name: 'New' })).toHaveLength(1);
    const doubled: S[] = [
      { id: 1, dbId: 'row-a', name: 'A' },
      { id: 9, dbId: 'row-a', name: 'A copy' },
      { id: 3, dbId: 'row-c', name: 'C' },
    ];
    const edited: S = { id: 1, dbId: 'row-a', name: 'A edited' };
    expect(upsertServiceInList(doubled, edited)).toEqual([edited, doubled[2]]);
  });
});

describe('collapseDuplicateSavedServices', () => {
  it('keeps the latest copy of a saved service in the first copy’s place', () => {
    const list: S[] = [
      { id: 1, dbId: 'row-a', name: 'old' },
      { id: 2, dbId: 'row-b', name: 'B' },
      { id: 3, dbId: 'row-a', name: 'new' },
      { id: 4, dbId: null, name: 'unsaved' },
    ];
    expect(collapseDuplicateSavedServices(list).map(s => s.name)).toEqual(['new', 'B', 'unsaved']);
  });

  it('leaves a list with no copies alone', () => {
    const list: S[] = [{ id: 1, dbId: 'x', name: 'X' }, { id: 2, dbId: null, name: 'Y' }];
    expect(collapseDuplicateSavedServices(list)).toEqual(list);
  });
});

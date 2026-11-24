// Explore collections: the store updates the screen first and puts it back
// when the database refuses, keeps folders in step with un-hearting, and only
// shows an "Add to a collection" offer to the host it was made for.

const mockGetMine = jest.fn();
const mockCreate = jest.fn();
const mockUpdate = jest.fn();
const mockDelete = jest.fn();
const mockAdd = jest.fn();
const mockRemoveItem = jest.fn();
jest.mock('../services/databaseService', () => ({
  getMyCollections: (...a: unknown[]) => mockGetMine(...a),
  createCollection: (...a: unknown[]) => mockCreate(...a),
  updateCollection: (...a: unknown[]) => mockUpdate(...a),
  deleteCollection: (...a: unknown[]) => mockDelete(...a),
  addItemToCollection: (...a: unknown[]) => mockAdd(...a),
  removeItemFromCollection: (...a: unknown[]) => mockRemoveItem(...a),
}));
jest.mock('../utils/logger', () => ({ logger: { error: jest.fn(), log: jest.fn(), warn: jest.fn() } }));

import { useCollectionsStore } from '../stores/useCollectionsStore';
import type { ExploreCollection } from '../types/collections';

const nails = (): ExploreCollection => ({
  id: 'c1',
  name: 'Nails',
  color: 'pink',
  createdAt: '2026-11-09T10:00:00Z',
  itemIds: ['p1'],
});

describe('collections store', () => {
  beforeEach(async () => {
    jest.resetAllMocks();
    mockGetMine.mockResolvedValue([nails()]);
    await useCollectionsStore.getState().load(null);
    await useCollectionsStore.getState().load('user-1');
  });

  it('loads the signed-in account and clears everything on sign-out', async () => {
    expect(useCollectionsStore.getState().collections).toEqual([nails()]);
    useCollectionsStore.getState().rememberPhotos([{ id: 'p1', uri: 'https://x/p1.jpg' }]);
    await useCollectionsStore.getState().load(null);
    const after = useCollectionsStore.getState();
    expect(after.collections).toEqual([]);
    expect(after.photos).toEqual({});
  });

  it('adds a look straight away and keeps it when the save works', async () => {
    mockAdd.mockResolvedValue(undefined);
    await useCollectionsStore.getState().toggleItem('c1', 'p2');
    expect(mockAdd).toHaveBeenCalledWith('c1', 'p2');
    expect(useCollectionsStore.getState().collections[0]?.itemIds).toEqual(['p1', 'p2']);
  });

  it('takes a look out on a second tap', async () => {
    mockRemoveItem.mockResolvedValue(undefined);
    await useCollectionsStore.getState().toggleItem('c1', 'p1');
    expect(mockRemoveItem).toHaveBeenCalledWith('c1', 'p1');
    expect(useCollectionsStore.getState().collections[0]?.itemIds).toEqual([]);
  });

  it('puts the folder back and throws when the database refuses', async () => {
    mockAdd.mockRejectedValue({ code: '42501', message: 'new row violates row-level security policy' });
    await expect(useCollectionsStore.getState().toggleItem('c1', 'p2')).rejects.toBeTruthy();
    expect(useCollectionsStore.getState().collections[0]?.itemIds).toEqual(['p1']);
  });

  it('puts a deleted folder back when the delete fails', async () => {
    mockDelete.mockRejectedValue(new Error('offline'));
    await expect(useCollectionsStore.getState().remove('c1')).rejects.toThrow('offline');
    expect(useCollectionsStore.getState().collections.map(c => c.id)).toEqual(['c1']);
  });

  it('adds a new collection to the end of the row', async () => {
    mockCreate.mockResolvedValue({ id: 'c2', name: 'Hair', color: 'blue', createdAt: 'x', itemIds: [] });
    const made = await useCollectionsStore.getState().create('Hair', 'blue');
    expect(made.id).toBe('c2');
    expect(useCollectionsStore.getState().collections.map(c => c.name)).toEqual(['Nails', 'Hair']);
  });

  it('forgets an un-hearted look in every folder and drops its offer', () => {
    useCollectionsStore.getState().offerFor('p1', 'explore');
    useCollectionsStore.getState().forgetItem('p1');
    const after = useCollectionsStore.getState();
    expect(after.collections[0]?.itemIds).toEqual([]);
    expect(after.offer).toBeNull();
  });

  it('keeps each host to its own offer and sheet', () => {
    const store = useCollectionsStore.getState();
    store.offerFor('p1', 'imageDetail');
    useCollectionsStore.getState().dismissHost('explore');
    expect(useCollectionsStore.getState().offer?.host).toBe('imageDetail');
    useCollectionsStore.getState().openSheet('p1', 'imageDetail');
    expect(useCollectionsStore.getState().offer).toBeNull();
    useCollectionsStore.getState().dismissHost('imageDetail');
    expect(useCollectionsStore.getState().sheet).toBeNull();
  });

  it('only re-renders for photos it has not seen', () => {
    useCollectionsStore.getState().rememberPhotos([{ id: 'p1', uri: 'a.jpg' }]);
    const first = useCollectionsStore.getState().photos;
    useCollectionsStore.getState().rememberPhotos([{ id: 'p1', uri: 'a.jpg' }, { id: 'p2', uri: null }]);
    expect(useCollectionsStore.getState().photos).toBe(first);
  });
});

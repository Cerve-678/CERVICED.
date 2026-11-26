// Explore collections: named, coloured folders a client sorts their hearted
// Explore photos into. Stored in explore_collections / explore_collection_items
// (migration 20261110100000). An item id is the same id the heart saves into
// users.saved_portfolio, and the database only accepts ids that are saved.

export type CollectionColor = 'pink' | 'blue' | 'green';

export const COLLECTION_COLORS: readonly CollectionColor[] = ['pink', 'blue', 'green'];

export const COLLECTION_NAME_MAX = 40;

export interface ExploreCollection {
  id: string;
  name: string;
  color: CollectionColor;
  createdAt: string;
  /** Saved-item ids in the order they were added, oldest first. */
  itemIds: string[];
}

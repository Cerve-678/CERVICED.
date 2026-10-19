// src/services/directoryListingService.ts
// Directory listings (businesses not on CERVICED yet) as the client-facing
// listing page reads them — see src/features/providers/directoryListings.ts.
import { getDirectoryListingDetail as dbGetDirectoryListingDetail } from './databaseService';

export interface DirectoryListingDetail {
  id: string;
  displayName: string;
  serviceCategory: string;
  locationText: string | null;
  logoUrl: string | null;
  aboutText: string | null;
  instagram: string | null;
  website: string | null;
}

/** The listing page's data for one listing, or null if there's no active
 *  listing with that id (it was claimed, taken down, or isn't one). */
export async function getDirectoryListingDetail(id: string): Promise<DirectoryListingDetail | null> {
  const row = await dbGetDirectoryListingDetail(id);
  if (!row) return null;
  return {
    id: row.id,
    displayName: row.display_name,
    serviceCategory: row.service_category,
    locationText: row.location_text,
    logoUrl: row.logo_url,
    aboutText: row.about_text,
    instagram: row.instagram,
    website: row.website,
  };
}

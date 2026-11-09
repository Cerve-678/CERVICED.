// Picks photos/screenshots or a PDF of a price list and turns them into the
// base64 uploads extract-provider-profile reads (see profileImport.ts for what
// happens to the result).
//
// Claude shrinks any image whose long side is over ~1,568 px, so a long
// phone screenshot of a menu (1,179 x 6,000) sent whole would arrive about
// 300 px wide and unreadable. Tall images are therefore cut into overlapping
// slices that each stay readable; ordinary photos are just shrunk.
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { ImageManipulator, SaveFormat, type ImageRef } from 'expo-image-manipulator';
import type { ProfileImportFile } from '../../types/profileImport';

/** Most photos picked at once. Slicing can turn these into more uploads. */
export const MAX_IMPORT_PHOTOS = 10;
/** Most uploads sent in one read; matches extract-provider-profile's MAX_FILES. */
export const MAX_IMPORT_UPLOADS = 20;
/** Largest PDF picked, comfortably under the function's upload cap. */
export const MAX_IMPORT_PDF_BYTES = 15 * 1024 * 1024;

const SLICE_WIDTH_PX = 1092;
const SLICE_HEIGHT_PX = 1456;
const SLICE_OVERLAP = 0.08;
const MAX_EDGE_PX = 1568;

/** A failure written to be shown as-is in the Import box. */
export class ImportPickError extends Error {}

/** Where each slice starts and ends, in the original's pixels. Exported for tests. */
export function sliceRows(width: number, height: number): Array<{ originY: number; height: number }> {
  const scale = Math.min(1, SLICE_WIDTH_PX / width);
  const sliceHeight = Math.round(SLICE_HEIGHT_PX / scale);
  // A little taller than one slice isn't worth cutting: shrink it instead.
  if (height <= sliceHeight * 1.15) return [{ originY: 0, height }];
  // Evenly spaced full-height slices, overlapping by at least a few percent,
  // so no line of the menu falls between two and the last isn't a sliver.
  const step = sliceHeight * (1 - SLICE_OVERLAP);
  const count = Math.ceil((height - sliceHeight) / step - 0.05) + 1;
  const stride = (height - sliceHeight) / (count - 1);
  const rows: Array<{ originY: number; height: number }> = [];
  for (let i = 0; i < count; i++) {
    const originY = i === count - 1 ? height - sliceHeight : Math.round(i * stride);
    rows.push({ originY, height: sliceHeight });
  }
  return rows;
}

async function toUpload(image: ImageRef): Promise<ProfileImportFile> {
  const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.85, base64: true });
  if (!saved.base64) throw new Error('Image manipulator returned no base64.');
  return { mediaType: 'image/jpeg', data: saved.base64 };
}

async function photoToUploads(uri: string): Promise<ProfileImportFile[]> {
  // Rendered once so width/height are the upright (EXIF-applied) size.
  const original = await ImageManipulator.manipulate(uri).renderAsync();
  const { width, height } = original;
  const rows = sliceRows(width, height);
  if (rows.length === 1) {
    const longest = Math.max(width, height);
    if (longest <= MAX_EDGE_PX) return [await toUpload(original)];
    const resized = await ImageManipulator.manipulate(original)
      .resize(width >= height ? { width: MAX_EDGE_PX } : { height: MAX_EDGE_PX })
      .renderAsync();
    return [await toUpload(resized)];
  }
  const sliceWidth = Math.min(width, SLICE_WIDTH_PX);
  const uploads: ProfileImportFile[] = [];
  for (const row of rows) {
    const slice = await ImageManipulator.manipulate(original)
      .crop({ originX: 0, originY: row.originY, width, height: row.height })
      .resize({ width: sliceWidth })
      .renderAsync();
    uploads.push(await toUpload(slice));
  }
  return uploads;
}

/** Opens the photo library. null = cancelled. */
export async function pickPhotosForImport(): Promise<ProfileImportFile[] | null> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    throw new ImportPickError('Allow access to your photos in Settings to import from screenshots.');
  }
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    quality: 1,
    allowsMultipleSelection: true,
    selectionLimit: MAX_IMPORT_PHOTOS,
    orderedSelection: true,
  });
  if (result.canceled) return null;
  const uploads: ProfileImportFile[] = [];
  for (const asset of (result.assets ?? []).slice(0, MAX_IMPORT_PHOTOS)) {
    uploads.push(...await photoToUploads(asset.uri));
  }
  if (uploads.length > MAX_IMPORT_UPLOADS) {
    throw new ImportPickError('Those screenshots are too long to read in one go. Try the ones with prices first, a few at a time.');
  }
  return uploads;
}

/** Opens the file picker for one PDF. null = cancelled. */
export async function pickPdfForImport(): Promise<ProfileImportFile[] | null> {
  // Loaded on demand: builds made before this native module was added don't
  // have it, and importing it at the top would crash the whole screen there.
  let DocumentPicker: typeof import('expo-document-picker');
  try {
    DocumentPicker = await import('expo-document-picker');
  } catch {
    throw new ImportPickError('Choosing a PDF needs the latest version of the app. For now, paste a link to the PDF, or use screenshots.');
  }
  const result = await DocumentPicker.getDocumentAsync({
    type: 'application/pdf',
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (result.canceled) return null;
  const asset = result.assets?.[0];
  if (!asset) return null;
  if (asset.size && asset.size > MAX_IMPORT_PDF_BYTES) {
    throw new ImportPickError('That PDF is over 15 MB. Try screenshots of the pages with prices instead.');
  }
  const data = await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.Base64 });
  return [{ mediaType: 'application/pdf', data }];
}

/**
 * Colours pulled out of a provider's own photo, for Branding → Custom.
 *
 * The photo is shrunk to a thumbnail on the device, decoded to raw pixels
 * with jpeg-js (pure JS, so no native rebuild) and handed to
 * paletteFromPixels. A thumbnail is plenty for "what colours is this", and
 * keeps the decode to a few thousand pixels however big the original is.
 *
 * JPEG has no transparency, so a logo's see-through corners come back as a
 * flat colour and can show up as one of the offered swatches.
 */
import { File, Paths } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { decode } from 'jpeg-js';
import { paletteFromPixels } from '../../utils/color';

const THUMBNAIL_WIDTH_PX = 64;

/** The manipulator only reads local files; a saved logo or background is a
 *  storage URL, so it's fetched into the cache first. The returned cleanup
 *  removes that download (a no-op for a photo that was already local). */
async function toLocalUri(uri: string): Promise<{ local: string; cleanup: () => void }> {
  if (!/^https?:\/\//i.test(uri)) return { local: uri, cleanup: () => {} };
  const file = await File.downloadFileAsync(uri, new File(Paths.cache, `branding-colours-${Date.now()}.img`));
  return {
    local: file.uri,
    cleanup: () => {
      try { file.delete(); } catch { /* the cache is cleared by the system anyway */ }
    },
  };
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Up to `count` main colours in the photo at `uri`, most common first.
 *  Throws if the photo can't be read. */
export async function coloursFromPhoto(uri: string, count = 6): Promise<string[]> {
  const { local, cleanup } = await toLocalUri(uri);
  try {
    const rendered = await ImageManipulator.manipulate(local).resize({ width: THUMBNAIL_WIDTH_PX }).renderAsync();
    const saved = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: 0.9, base64: true });
    if (!saved.base64) throw new Error('Photo thumbnail came back without pixel data');
    const { data } = decode(base64ToBytes(saved.base64), { useTArray: true, formatAsRGBA: true });
    return paletteFromPixels(data, count);
  } finally {
    cleanup();
  }
}

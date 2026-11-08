// uploadToStorage shrinks oversized photos before they reach Storage, so every
// screen that later shows them downloads a few hundred KB rather than 3-7 MB.

const mockJPEG = [0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0];
const mockPNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0];
const mockToBase64 = (bytes: number[]) => Buffer.from(bytes).toString('base64');

const mockFiles: Record<string, number[]> = {};
const mockSizes: Record<string, { width: number; height: number }> = {};
const mockResizeCalls: Array<{ width?: number | null; height?: number | null }> = [];
const mockSaveCalls: Array<{ format?: string; compress?: number }> = [];
const mockState = { renderFails: false };

jest.mock('expo-file-system/legacy', () => ({
  EncodingType: { Base64: 'base64' },
  readAsStringAsync: jest.fn(async (uri: string) => mockToBase64(mockFiles[uri] ?? [])),
}));

jest.mock('expo-image-manipulator', () => {
  const makeRef = (source: string, size: { width: number; height: number }) => ({
    source,
    ...size,
    saveAsync: jest.fn(async (options: { format?: string; compress?: number }) => {
      mockSaveCalls.push(options);
      const uri = `${source}.shrunk.${options.format}`;
      mockFiles[uri] = options.format === 'png' ? mockPNG : mockJPEG;
      return { uri, width: size.width, height: size.height };
    }),
  });
  const manipulate = (source: string | { source: string; width: number; height: number }) => {
    let pending: { width?: number | null; height?: number | null } | null = null;
    const context = {
      resize: (size: { width?: number | null; height?: number | null }) => {
        mockResizeCalls.push(size);
        pending = size;
        return context;
      },
      renderAsync: async () => {
        if (mockState.renderFails) throw new Error('decode failed');
        if (typeof source === 'string') return makeRef(source, mockSizes[source]!);
        const ratio = source.height / source.width;
        const width = pending?.width ?? Math.round((pending?.height ?? source.height) / ratio);
        const height = pending?.height ?? Math.round(width * ratio);
        return makeRef(source.source, { width, height });
      },
    };
    return context;
  };
  return {
    ImageManipulator: { manipulate },
    SaveFormat: { JPEG: 'jpeg', PNG: 'png' },
  };
});

const mockUploaded: Array<{ bucket: string; path: string; bytes: Uint8Array; contentType: string }> = [];
jest.mock('../services/databaseService', () => ({
  uploadPublicStorageObject: jest.fn(async (bucket: string, path: string, bytes: Uint8Array, contentType: string) => {
    mockUploaded.push({ bucket, path, bytes, contentType });
    return `https://cdn.test/${bucket}/${path}`;
  }),
}));

jest.mock('expo-location', () => ({}));

import {
  MAX_DOCUMENT_IMAGE_HEIGHT_PX,
  MAX_UPLOAD_IMAGE_EDGE_PX,
  uploadToStorage,
} from '../services/providerRegistrationService';

beforeEach(() => {
  mockUploaded.length = 0;
  mockResizeCalls.length = 0;
  mockSaveCalls.length = 0;
  mockState.renderFails = false;
});

describe('uploadToStorage image shrinking', () => {
  it('shrinks a large landscape photo by its width and uploads the smaller JPEG', async () => {
    mockFiles['file:///big.jpg'] = mockJPEG;
    mockSizes['file:///big.jpg'] = { width: 8064, height: 6048 };

    await uploadToStorage('portfolio', 'u1/photo.jpg', 'file:///big.jpg');

    expect(mockResizeCalls).toEqual([{ width: MAX_UPLOAD_IMAGE_EDGE_PX }]);
    expect(mockSaveCalls).toEqual([{ format: 'jpeg', compress: 0.8 }]);
    expect(mockUploaded[0]?.contentType).toBe('image/jpeg');
  });

  it('shrinks a portrait photo by its height', async () => {
    mockFiles['file:///tall.jpg'] = mockJPEG;
    mockSizes['file:///tall.jpg'] = { width: 3024, height: 4032 };

    await uploadToStorage('portfolio', 'u1/tall.jpg', 'file:///tall.jpg');

    expect(mockResizeCalls).toEqual([{ height: MAX_UPLOAD_IMAGE_EDGE_PX }]);
  });

  it('keeps a PNG as PNG so a logo keeps its transparency', async () => {
    mockFiles['file:///logo.png'] = mockPNG;
    mockSizes['file:///logo.png'] = { width: 3000, height: 3000 };

    await uploadToStorage('provider-logos', 'u1/logo.png', 'file:///logo.png');

    expect(mockSaveCalls).toEqual([{ format: 'png' }]);
    expect(mockUploaded[0]?.contentType).toBe('image/png');
    expect(mockUploaded[0]?.path).toBe('u1/logo.png');
  });

  it('leaves an image that is already small enough untouched', async () => {
    mockFiles['file:///small.jpg'] = mockJPEG;
    mockSizes['file:///small.jpg'] = { width: 1200, height: 1600 };

    await uploadToStorage('portfolio', 'u1/small.jpg', 'file:///small.jpg');

    expect(mockResizeCalls).toEqual([]);
    expect(mockSaveCalls).toEqual([]);
    expect(mockUploaded).toHaveLength(1);
  });

  it('keeps a long policy document at full width instead of shrinking it by its height', async () => {
    // A long phone screenshot: as a photo it would end up about 400 px wide.
    mockFiles['file:///policy.png'] = mockPNG;
    mockSizes['file:///policy.png'] = { width: 1179, height: 6000 };

    await uploadToStorage('portfolio', 'u1/policy.png', 'file:///policy.png', 'document');

    expect(mockResizeCalls).toEqual([]);
    expect(mockUploaded).toHaveLength(1);
  });

  it('caps a very wide document by its width', async () => {
    mockFiles['file:///scan.jpg'] = mockJPEG;
    mockSizes['file:///scan.jpg'] = { width: 4000, height: 12000 };

    await uploadToStorage('portfolio', 'u1/scan.jpg', 'file:///scan.jpg', 'document');

    expect(mockResizeCalls).toEqual([{ width: MAX_UPLOAD_IMAGE_EDGE_PX }]);
  });

  it('caps an extremely long document by its height so the phone can hold it', async () => {
    mockFiles['file:///endless.png'] = mockPNG;
    mockSizes['file:///endless.png'] = { width: 1179, height: 20000 };

    await uploadToStorage('portfolio', 'u1/endless.png', 'file:///endless.png', 'document');

    expect(mockResizeCalls).toEqual([{ width: Math.round(1179 * (MAX_DOCUMENT_IMAGE_HEIGHT_PX / 20000)) }]);
  });

  it('uploads the original when the image cannot be decoded for shrinking', async () => {
    mockFiles['file:///odd.jpg'] = mockJPEG;
    mockSizes['file:///odd.jpg'] = { width: 9000, height: 9000 };
    mockState.renderFails = true;

    await uploadToStorage('portfolio', 'u1/odd.jpg', 'file:///odd.jpg');

    expect(mockUploaded).toHaveLength(1);
    expect(Array.from(mockUploaded[0]!.bytes)).toEqual(mockJPEG);
  });
});

describe('uploadToStorage document images (the detailed policy image)', () => {
  it('keeps a long policy screenshot at its full width instead of shrinking it by its height', async () => {
    // As a photo this would go to 2048 tall and about 400 wide: blurry at full screen width.
    mockFiles['file:///policy.png'] = mockPNG;
    mockSizes['file:///policy.png'] = { width: 1179, height: 6000 };

    await uploadToStorage('portfolio', 'u1/policy.png', 'file:///policy.png', 'document');

    expect(mockResizeCalls).toEqual([]);
    expect(mockUploaded).toHaveLength(1);
  });

  it('narrows a very wide document to the usual width cap', async () => {
    mockFiles['file:///scan.jpg'] = mockJPEG;
    mockSizes['file:///scan.jpg'] = { width: 4000, height: 6000 };

    await uploadToStorage('portfolio', 'u1/scan.jpg', 'file:///scan.jpg', 'document');

    expect(mockResizeCalls).toEqual([{ width: MAX_UPLOAD_IMAGE_EDGE_PX }]);
  });

  it('shrinks an extremely long one only as far as the height cap needs', async () => {
    mockFiles['file:///long.png'] = mockPNG;
    mockSizes['file:///long.png'] = { width: 1179, height: 16384 };

    await uploadToStorage('portfolio', 'u1/long.png', 'file:///long.png', 'document');

    expect(mockResizeCalls).toEqual([
      { width: Math.round(1179 * (MAX_DOCUMENT_IMAGE_HEIGHT_PX / 16384)) },
    ]);
  });
});

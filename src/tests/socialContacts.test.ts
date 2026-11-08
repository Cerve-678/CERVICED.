import { createHash } from 'crypto';

jest.mock('expo-crypto', () => ({
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  CryptoEncoding: { HEX: 'hex' },
  digestStringAsync: jest.fn(async (_alg: string, data: string) =>
    jest.requireActual<typeof import('crypto')>('crypto').createHash('sha256').update(data, 'utf8').digest('hex')),
}));

const mockGetContactsAsync = jest.fn();
jest.mock('expo-contacts', () => ({
  Fields: { PhoneNumbers: 'phoneNumbers', Name: 'name' },
  PermissionStatus: { UNDETERMINED: 'undetermined', GRANTED: 'granted', DENIED: 'denied' },
  getContactsAsync: (...args: unknown[]) => mockGetContactsAsync(...args),
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
}));

const mockMatchContactHashes = jest.fn();
jest.mock('../services/databaseService', () => ({
  matchContactHashes: (...args: unknown[]) => mockMatchContactHashes(...args),
}));

import {
  CONTACT_NUMBERS_PER_CHECK,
  cachedContactMatches,
  collectContactNumbers,
  isContactsLimitError,
  rememberContactMatches,
  findContactsOnCerviced,
  hashNormalisedNumber,
} from '../features/social/contacts';

/** The live server's social_phone_hash('07700 900123'), checked 2026-11-08. */
const SERVER_HASH_07700900123 = '033134b911b137918338415ee3d20a064b24773d36a3b02e8b99fdd3fcd6b4cd';

describe('contact numbers', () => {
  it('normalises, de-duplicates and keeps the first name for each number', () => {
    const out = collectContactNumbers([
      { name: 'Amara', phoneNumbers: [{ number: '07700 900123' }, { number: '+44 7700 900123' }] },
      { name: 'Jo', phoneNumbers: [{ number: '+44 (0)7700 900456' }, { number: '123' }, { number: null }] },
      { name: '  ', phoneNumbers: [{ number: '0044 7700 900789' }] },
      { name: 'No phone' },
    ]);
    expect(Array.from(out.entries())).toEqual([
      ['447700900123', 'Amara'],
      ['447700900456', 'Jo'],
      ['447700900789', null],
    ]);
  });

  it('never collects more than the server allows in a day', () => {
    const many = Array.from({ length: CONTACT_NUMBERS_PER_CHECK + 50 }, (_, i) => ({
      name: `P${i}`,
      phoneNumbers: [{ number: `07700${String(i).padStart(6, '0')}` }],
    }));
    expect(collectContactNumbers(many).size).toBe(CONTACT_NUMBERS_PER_CHECK);
  });

  it('hashes exactly as the server does', async () => {
    const normalised = Array.from(collectContactNumbers([{ phoneNumbers: [{ number: '07700 900123' }] }]).keys())[0]!;
    await expect(hashNormalisedNumber(normalised)).resolves.toBe(SERVER_HASH_07700900123);
    expect(createHash('sha256').update('447700900123').digest('hex')).toBe(SERVER_HASH_07700900123);
  });
});

describe('findContactsOnCerviced', () => {
  beforeEach(() => { mockGetContactsAsync.mockReset(); mockMatchContactHashes.mockReset(); });

  it('sends only hashes and labels each match with the contact name it came from', async () => {
    mockGetContactsAsync.mockResolvedValue({ data: [{ name: 'Mum', phoneNumbers: [{ number: '07700 900123' }] }] });
    mockMatchContactHashes.mockResolvedValue([
      { userId: 'u1', name: 'Amara Okafor', avatarUrl: null, myStatus: null, followsMe: null, phoneHash: SERVER_HASH_07700900123 },
    ]);
    const out = await findContactsOnCerviced();
    expect(mockMatchContactHashes).toHaveBeenCalledWith([SERVER_HASH_07700900123]);
    expect(JSON.stringify(mockMatchContactHashes.mock.calls)).not.toContain('7700');
    expect(out).toEqual([
      { userId: 'u1', name: 'Amara Okafor', avatarUrl: null, myStatus: null, followsMe: null, contactName: 'Mum' },
    ]);
  });

  it('asks the server nothing when there are no usable numbers', async () => {
    mockGetContactsAsync.mockResolvedValue({ data: [{ name: 'Landline only', phoneNumbers: [{ number: '12' }] }] });
    await expect(findContactsOnCerviced()).resolves.toEqual([]);
    expect(mockMatchContactHashes).not.toHaveBeenCalled();
  });
});

describe('session cache and the daily limit', () => {
  it('remembers the last result for the same account only', () => {
    expect(cachedContactMatches('me')).toBeNull();
    rememberContactMatches('me', []);
    expect(cachedContactMatches('me')).toEqual([]);
    expect(cachedContactMatches('someone-else')).toBeNull();
  });

  it("recognises the server's rate-limit message", () => {
    expect(isContactsLimitError({ code: 'P0001', message: "You've done that a lot just now. Please try again later." })).toBe(true);
    expect(isContactsLimitError(new Error('network down'))).toBe(false);
    expect(isContactsLimitError(null)).toBe(false);
  });
});

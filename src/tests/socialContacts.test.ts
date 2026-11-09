import { createHash } from 'crypto';

jest.mock('expo-crypto', () => ({
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  CryptoEncoding: { HEX: 'hex' },
  digestStringAsync: jest.fn(async (_alg: string, data: string) =>
    jest.requireActual<typeof import('crypto')>('crypto').createHash('sha256').update(data, 'utf8').digest('hex')),
}));

const mockGetContactsAsync = jest.fn();
// The legacy entry: in SDK 58 the top-level getContactsAsync throws.
jest.mock('expo-contacts/legacy', () => ({
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
  buildInviteList,
  cachedContacts,
  collectContactNumbers,
  isContactsLimitError,
  rememberContacts,
  findContactsOnCerviced,
  hashNormalisedNumber,
} from '../features/social/contacts';

/** The live server's social_phone_hash('07700 900123'), checked 2026-11-08. */
const SERVER_HASH_07700900123 = '033134b911b137918338415ee3d20a064b24773d36a3b02e8b99fdd3fcd6b4cd';

describe('contact numbers', () => {
  it('normalises and de-duplicates numbers, reading nothing else', () => {
    const out = collectContactNumbers([
      { phoneNumbers: [{ number: '07700 900123' }, { number: '+44 7700 900123' }] },
      { phoneNumbers: [{ number: '+44 (0)7700 900456' }, { number: '123' }, { number: null }] },
      { phoneNumbers: [{ number: '0044 7700 900789' }] },
      {},
    ]);
    expect(out).toEqual(['447700900123', '447700900456', '447700900789']);
  });

  it('never collects more than the server allows in a day', () => {
    const many = Array.from({ length: CONTACT_NUMBERS_PER_CHECK + 50 }, (_, i) => ({
      phoneNumbers: [{ number: `07700${String(i).padStart(6, '0')}` }],
    }));
    expect(collectContactNumbers(many)).toHaveLength(CONTACT_NUMBERS_PER_CHECK);
  });

  it('hashes exactly as the server does', async () => {
    const normalised = collectContactNumbers([{ phoneNumbers: [{ number: '07700 900123' }] }])[0]!;
    await expect(hashNormalisedNumber(normalised)).resolves.toBe(SERVER_HASH_07700900123);
    expect(createHash('sha256').update('447700900123').digest('hex')).toBe(SERVER_HASH_07700900123);
  });
});

describe('findContactsOnCerviced', () => {
  beforeEach(() => { mockGetContactsAsync.mockReset(); mockMatchContactHashes.mockReset(); });

  it('sends only hashes; a match shows the account, everyone else is to invite', async () => {
    mockGetContactsAsync.mockResolvedValue({
      data: [
        { id: 'c1', name: 'Mum', phoneNumbers: [{ number: '07700 900123' }] },
        { id: 'c2', name: 'Bea', phoneNumbers: [{ number: '07700 900456' }] },
      ],
    });
    mockMatchContactHashes.mockResolvedValue([
      { userId: 'u1', name: 'Amara Okafor', avatarUrl: null, myStatus: null, followsMe: null, phoneHash: SERVER_HASH_07700900123 },
    ]);
    const out = await findContactsOnCerviced();
    const sent = JSON.stringify(mockMatchContactHashes.mock.calls);
    expect(sent).not.toContain('7700');
    expect(sent).not.toContain('Mum');
    expect(sent).not.toContain('Bea');
    expect(mockGetContactsAsync).toHaveBeenCalledWith({ fields: ['phoneNumbers', 'name'] });
    // The match is the account's own name, never the saved one.
    expect(out.matches).toEqual([
      { userId: 'u1', name: 'Amara Okafor', avatarUrl: null, myStatus: null, followsMe: null },
    ]);
    expect(out.invites).toEqual([{ key: 'id:c2', name: 'Bea', number: '07700 900456' }]);
  });

  it('asks the server nothing when there are no usable numbers', async () => {
    mockGetContactsAsync.mockResolvedValue({ data: [{ name: 'Landline only', phoneNumbers: [{ number: '12' }] }] });
    await expect(findContactsOnCerviced()).resolves.toEqual({ matches: [], invites: [] });
    expect(mockMatchContactHashes).not.toHaveBeenCalled();
  });
});

describe('session cache and the daily limit', () => {
  it('remembers the last result for the same account only', () => {
    expect(cachedContacts('me')).toBeNull();
    rememberContacts('me', { matches: [], invites: [] });
    expect(cachedContacts('me')).toEqual({ matches: [], invites: [] });
    expect(cachedContacts('someone-else')).toBeNull();
  });

  it("recognises the server's rate-limit message", () => {
    expect(isContactsLimitError({ code: 'P0001', message: "You've done that a lot just now. Please try again later." })).toBe(true);
    expect(isContactsLimitError(new Error('network down'))).toBe(false);
    expect(isContactsLimitError(null)).toBe(false);
  });
});

describe('buildInviteList', () => {
  it('lists named contacts not on CERVICED, A to Z, once each', () => {
    const out = buildInviteList(
      [
        { id: '1', name: 'zara', phoneNumbers: [{ number: '07700 900111' }] },
        { id: '2', name: 'Amy', phoneNumbers: [{ number: '07700 900222' }] },
        { id: '2', name: 'Amy', phoneNumbers: [{ number: '07700 900222' }] },
        { id: '3', name: '', phoneNumbers: [{ number: '07700 900333' }] },
        { id: '4', name: 'Landline', phoneNumbers: [{ number: '12' }] },
        { id: '5', name: 'On the app', phoneNumbers: [{ number: '07700 900999' }, { number: '07700 900555' }] },
      ],
      new Set(['447700900555']),
    );
    expect(out.map((c) => c.name)).toEqual(['Amy', 'zara']);
  });

  it('texts the first usable number as saved', () => {
    const out = buildInviteList([{ name: 'Bea', phoneNumbers: [{ number: '1' }, { number: '+44 7700 900456' }] }], new Set());
    expect(out).toEqual([{ key: 'n:Bea|447700900456', name: 'Bea', number: '+44 7700 900456' }]);
  });
});

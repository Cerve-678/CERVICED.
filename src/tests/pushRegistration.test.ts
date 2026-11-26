import { registerForPushNotifications } from '../services/pushNotificationService';

const mockGetExpoPushTokenAsync = jest.fn();
const mockSetPushTokenIfChanged = jest.fn();

jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  getPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
  getExpoPushTokenAsync: (...args: unknown[]) => mockGetExpoPushTokenAsync(...args),
}));
jest.mock('expo-device', () => ({ isDevice: true }));
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { extra: { eas: { projectId: 'test-project' } } } },
  ExecutionEnvironment: { StoreClient: 'storeClient' },
}));
jest.mock('../services/databaseService', () => ({
  getCurrentAuthUserId: jest.fn(async () => 'user-1'),
  setPushTokenIfChanged: (...args: unknown[]) => mockSetPushTokenIfChanged(...args),
  subscribeToNotificationInserts: jest.fn(),
}));

it('shares concurrent token registration and database save', async () => {
  let finishSave: ((value: boolean) => void) | undefined;
  mockGetExpoPushTokenAsync.mockResolvedValue({ data: 'token-1' });
  mockSetPushTokenIfChanged.mockImplementation(() => new Promise<boolean>(resolve => { finishSave = resolve; }));

  const first = registerForPushNotifications();
  const second = registerForPushNotifications();
  expect(first).toBe(second);
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  expect(mockGetExpoPushTokenAsync).toHaveBeenCalledTimes(1);
  finishSave?.(true);
  await expect(first).resolves.toBe('token-1');
  expect(mockSetPushTokenIfChanged).toHaveBeenCalledTimes(1);
});

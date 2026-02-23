import NetInfo, { NetInfoState } from '@react-native-community/netinfo';
import { create } from 'zustand';

interface NetworkState {
  isConnected: boolean;
  isInternetReachable: boolean;
  connectionType: string;
  setConnectionStatus: (isConnected: boolean, isInternetReachable: boolean, type: string) => void;
}

export const useNetworkStore = create<NetworkState>((set) => ({
  isConnected: true,
  isInternetReachable: true,
  connectionType: 'unknown',
  setConnectionStatus: (isConnected, isInternetReachable, connectionType) =>
    set({ isConnected, isInternetReachable, connectionType }),
}));

class NetworkService {
  private unsubscribe?: () => void;

  initialize(): void {
    this.unsubscribe = NetInfo.addEventListener((state: NetInfoState) => {
      useNetworkStore.getState().setConnectionStatus(
        state.isConnected ?? false,
        state.isInternetReachable ?? false,
        state.type
      );
    });
  }

  cleanup(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
    }
  }

  async getCurrentNetworkState() {
    return await NetInfo.fetch();
  }

  async isConnected(): Promise<boolean> {
    const state = await NetInfo.fetch();
    return state.isConnected ?? false;
  }

  async isInternetReachable(): Promise<boolean> {
    const state = await NetInfo.fetch();
    return state.isInternetReachable ?? false;
  }
}

export const networkService = new NetworkService();

// Offline queue for API requests
interface QueuedRequest {
  id: string;
  url: string;
  method: string;
  body?: any;
  headers?: Record<string, string>;
  timestamp: number;
}

class OfflineQueue {
  private queue: QueuedRequest[] = [];
  private readonly MAX_QUEUE_SIZE = 50;
  private readonly MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

  addRequest(request: Omit<QueuedRequest, 'id' | 'timestamp'>): void {
    const queuedRequest: QueuedRequest = {
      ...request,
      id: Date.now().toString(),
      timestamp: Date.now(),
    };

    this.queue.push(queuedRequest);
    this.cleanupOldRequests();
    this.limitQueueSize();
  }

  async processQueue(): Promise<void> {
    if (!await networkService.isConnected()) {
      return;
    }

    const requestsToProcess = [...this.queue];
    this.queue = [];

    for (const request of requestsToProcess) {
      try {
      const fetchOptions: RequestInit = {
  method: request.method,
  ...(request.headers ? { headers: request.headers as HeadersInit } : {}),
};
        await fetch(request.url, fetchOptions);
      } catch (error) {
        console.error('Failed to process queued request:', error);
        // Re-add failed request to queue
        this.queue.push(request);
      }
    }
  }

  private cleanupOldRequests(): void {
    const now = Date.now();
    this.queue = this.queue.filter(
      request => now - request.timestamp <= this.MAX_AGE_MS
    );
  }

  private limitQueueSize(): void {
    if (this.queue.length > this.MAX_QUEUE_SIZE) {
      this.queue = this.queue.slice(-this.MAX_QUEUE_SIZE);
    }
  }

  getQueueSize(): number {
    return this.queue.length;
  }

  clearQueue(): void {
    this.queue = [];
  }
}

export const offlineQueue = new OfflineQueue();
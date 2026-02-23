import { storage, STORAGE_KEYS } from '../utils/storage';

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

const DEFAULT_TIMEOUT_MS = 15000;
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 1000;

class ApiService {
  private baseURL: string;
  private defaultHeaders: Record<string, string>;

  constructor(baseURL: string) {
    this.baseURL = baseURL.endsWith('/') ? baseURL.slice(0, -1) : baseURL;
    this.defaultHeaders = {
      'Content-Type': 'application/json',
    };
  }

  private async getAuthToken(): Promise<string | null> {
    return await storage.getItem<string>(STORAGE_KEYS.AUTH_TOKEN);
  }

  private async buildHeaders(customHeaders?: Record<string, string>): Promise<Record<string, string>> {
    const headers = { ...this.defaultHeaders, ...customHeaders };

    const token = await this.getAuthToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    return headers;
  }

  private async fetchWithTimeout(
    url: string,
    options: RequestInit,
    timeoutMs: number = DEFAULT_TIMEOUT_MS
  ): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });
      return response;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private async fetchWithRetry(
    url: string,
    options: RequestInit,
    retries: number = MAX_RETRIES
  ): Promise<Response> {
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        return await this.fetchWithTimeout(url, options);
      } catch (error: any) {
        const isLastAttempt = attempt === retries;
        // Don't retry on abort (timeout) or non-network errors
        if (isLastAttempt || error.name === 'AbortError') {
          throw error;
        }
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS * (attempt + 1)));
      }
    }
    // Unreachable, but satisfies TypeScript
    throw new Error('Request failed after retries');
  }

  private getErrorMessage(error: any): string {
    if (error.name === 'AbortError') {
      return 'Request timed out. Please check your connection and try again.';
    }
    if (error.message?.includes('Network request failed')) {
      return 'No internet connection. Please check your network.';
    }
    return 'Network error. Please try again.';
  }

  private async handleResponse<T>(response: Response): Promise<ApiResponse<T>> {
    try {
      const data = await response.json();

      if (response.ok) {
        return {
          success: true,
          data,
        };
      } else {
        return {
          success: false,
          error: data.message || data.error || `Request failed (${response.status})`,
          message: data.message,
        };
      }
    } catch (error) {
      return {
        success: false,
        error: 'Failed to parse response',
      };
    }
  }

  async get<T>(endpoint: string, customHeaders?: Record<string, string>): Promise<ApiResponse<T>> {
    try {
      const headers = await this.buildHeaders(customHeaders);
      const response = await this.fetchWithRetry(`${this.baseURL}${endpoint}`, {
        method: 'GET',
        headers,
      });

      return this.handleResponse<T>(response);
    } catch (error) {
      return {
        success: false,
        error: this.getErrorMessage(error),
      };
    }
  }

  async post<T>(endpoint: string, body?: any, customHeaders?: Record<string, string>): Promise<ApiResponse<T>> {
    try {
      const headers = await this.buildHeaders(customHeaders);
      const response = await this.fetchWithRetry(`${this.baseURL}${endpoint}`, {
        method: 'POST',
        headers,
        body: body ? JSON.stringify(body) : null,
      });

      return this.handleResponse<T>(response);
    } catch (error) {
      return {
        success: false,
        error: this.getErrorMessage(error),
      };
    }
  }

  async put<T>(endpoint: string, body?: any, customHeaders?: Record<string, string>): Promise<ApiResponse<T>> {
    try {
      const headers = await this.buildHeaders(customHeaders);
      const response = await this.fetchWithRetry(`${this.baseURL}${endpoint}`, {
        method: 'PUT',
        headers,
        body: body ? JSON.stringify(body) : null,
      });

      return this.handleResponse<T>(response);
    } catch (error) {
      return {
        success: false,
        error: this.getErrorMessage(error),
      };
    }
  }

  async delete<T>(endpoint: string, customHeaders?: Record<string, string>): Promise<ApiResponse<T>> {
    try {
      const headers = await this.buildHeaders(customHeaders);
      const response = await this.fetchWithRetry(`${this.baseURL}${endpoint}`, {
        method: 'DELETE',
        headers,
      });

      return this.handleResponse<T>(response);
    } catch (error) {
      return {
        success: false,
        error: this.getErrorMessage(error),
      };
    }
  }
}

// Export configured API instance
export const api = new ApiService(process.env['EXPO_PUBLIC_API_URL'] || 'https://api.yourapp.com');
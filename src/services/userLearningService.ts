// src/services/userLearningService.ts
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = '@user_learning_data';

export interface UserInteraction {
  type: 'view' | 'book' | 'search' | 'favorite' | 'offer_view';
  providerId?: string;
  providerName?: string;
  serviceCategory: string;
  timestamp: string;
  duration?: number; // Time spent viewing in seconds
}

export interface UserPreferences {
  favoriteServices: Map<string, number>; // service -> weight
  favoriteProviders: Map<string, number>; // providerId -> weight
  timeOfDayPreferences: Map<number, number>; // hour -> frequency
  serviceTypePreferences: Map<string, number>; // 'home-service' | 'store' | 'mobile' -> weight
  lastInteractionDate: string;
  totalInteractions: number;
}

export interface ScoredProvider {
  id: string;
  name: string;
  service: string;
  logo: any;
  score: number;
}

class UserLearningService {
  private interactions: UserInteraction[] = [];
  private preferences: UserPreferences = {
    favoriteServices: new Map(),
    favoriteProviders: new Map(),
    timeOfDayPreferences: new Map(),
    serviceTypePreferences: new Map(),
    lastInteractionDate: new Date().toISOString(),
    totalInteractions: 0,
  };
  private isInitialized = false;

  /**
   * Initialize the service by loading stored data
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      const stored = await AsyncStorage.getItem(STORAGE_KEY);
      if (stored) {
        const data = JSON.parse(stored);
        this.interactions = data.interactions || [];

        // Reconstruct Maps from stored objects
        this.preferences = {
          favoriteServices: new Map(Object.entries(data.preferences?.favoriteServices || {})),
          favoriteProviders: new Map(Object.entries(data.preferences?.favoriteProviders || {})),
          timeOfDayPreferences: new Map(Object.entries(data.preferences?.timeOfDayPreferences || {}).map(([k, v]) => [Number(k), v as number])),
          serviceTypePreferences: new Map(Object.entries(data.preferences?.serviceTypePreferences || {})),
          lastInteractionDate: data.preferences?.lastInteractionDate || new Date().toISOString(),
          totalInteractions: data.preferences?.totalInteractions || 0,
        };
      }
      this.isInitialized = true;
    } catch (error) {
      console.error('Failed to initialize user learning service:', error);
    }
  }

  /**
   * Track a user interaction
   */
  async trackInteraction(interaction: UserInteraction): Promise<void> {
    await this.initialize();

    this.interactions.push(interaction);
    this.preferences.totalInteractions++;
    this.preferences.lastInteractionDate = new Date().toISOString();

    // Update service preferences
    const currentWeight = this.preferences.favoriteServices.get(interaction.serviceCategory) || 0;
    const increment = this.getInteractionWeight(interaction.type);
    this.preferences.favoriteServices.set(interaction.serviceCategory, currentWeight + increment);

    // Update provider preferences if applicable
    if (interaction.providerId) {
      const providerWeight = this.preferences.favoriteProviders.get(interaction.providerId) || 0;
      this.preferences.favoriteProviders.set(interaction.providerId, providerWeight + increment);
    }

    // Update time of day preferences
    const hour = new Date(interaction.timestamp).getHours();
    const timeWeight = this.preferences.timeOfDayPreferences.get(hour) || 0;
    this.preferences.timeOfDayPreferences.set(hour, timeWeight + 1);

    // Keep only last 100 interactions to prevent bloat
    if (this.interactions.length > 100) {
      this.interactions = this.interactions.slice(-100);
    }

    await this.save();
  }

  /**
   * Get interaction weight based on type
   */
  private getInteractionWeight(type: UserInteraction['type']): number {
    const weights = {
      view: 1,
      search: 2,
      favorite: 5,
      offer_view: 3,
      book: 10,
    };
    return weights[type] || 1;
  }

  /**
   * Get personalized provider recommendations
   */
  async getPersonalizedProviders<T extends { id: string; service: string }>(
    providers: T[],
    limit?: number
  ): Promise<T[]> {
    await this.initialize();

    if (this.preferences.totalInteractions < 3) {
      // Not enough data, return providers as-is
      return providers;
    }

    // Score each provider based on user preferences
    const scored = providers.map(provider => ({
      provider,
      score: this.calculateProviderScore(provider),
    }));

    // Sort by score descending
    scored.sort((a, b) => b.score - a.score);

    const result = scored.map(s => s.provider);
    return limit ? result.slice(0, limit) : result;
  }

  /**
   * Calculate a provider's relevance score
   */
  private calculateProviderScore(provider: { id: string; service: string }): number {
    let score = 0;

    // Service category preference (40% weight)
    const serviceWeight = this.preferences.favoriteServices.get(provider.service) || 0;
    score += serviceWeight * 0.4;

    // Provider-specific preference (30% weight)
    const providerWeight = this.preferences.favoriteProviders.get(provider.id) || 0;
    score += providerWeight * 0.3;

    // Time-based relevance (10% weight)
    const currentHour = new Date().getHours();
    const timeWeight = this.preferences.timeOfDayPreferences.get(currentHour) || 0;
    score += timeWeight * 0.1;

    // Recency boost (20% weight) - favor recently interacted services
    const recentInteractions = this.interactions
      .filter(i => i.serviceCategory === provider.service)
      .slice(-10);
    score += recentInteractions.length * 2 * 0.2;

    return score;
  }

  /**
   * Get most popular services for the user
   */
  async getFavoriteServices(limit: number = 3): Promise<string[]> {
    await this.initialize();

    const sorted = Array.from(this.preferences.favoriteServices.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([service]) => service);

    return sorted.slice(0, limit);
  }

  /**
   * Get personalized offers based on user preferences
   */
  async getPersonalizedOffers<T extends { service?: string }>(
    offers: T[],
    limit?: number
  ): Promise<T[]> {
    await this.initialize();

    if (this.preferences.totalInteractions < 2) {
      return offers;
    }

    const scored = offers.map(offer => ({
      offer,
      score: offer.service ? (this.preferences.favoriteServices.get(offer.service) || 0) : 0,
    }));

    scored.sort((a, b) => b.score - a.score);

    const result = scored.map(s => s.offer);
    return limit ? result.slice(0, limit) : result;
  }

  /**
   * Get insights about user behavior
   */
  async getUserInsights(): Promise<{
    topServices: string[];
    topProviders: string[];
    mostActiveHour: number;
    totalBookings: number;
  }> {
    await this.initialize();

    const topServices = Array.from(this.preferences.favoriteServices.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([service]) => service);

    const topProviders = Array.from(this.preferences.favoriteProviders.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([id]) => id);

    const mostActiveHour = Array.from(this.preferences.timeOfDayPreferences.entries())
      .sort((a, b) => b[1] - a[1])[0]?.[0] || 12;

    const totalBookings = this.interactions.filter(i => i.type === 'book').length;

    return {
      topServices,
      topProviders,
      mostActiveHour,
      totalBookings,
    };
  }

  /**
   * Save data to storage
   */
  private async save(): Promise<void> {
    try {
      const data = {
        interactions: this.interactions,
        preferences: {
          favoriteServices: Object.fromEntries(this.preferences.favoriteServices),
          favoriteProviders: Object.fromEntries(this.preferences.favoriteProviders),
          timeOfDayPreferences: Object.fromEntries(this.preferences.timeOfDayPreferences),
          serviceTypePreferences: Object.fromEntries(this.preferences.serviceTypePreferences),
          lastInteractionDate: this.preferences.lastInteractionDate,
          totalInteractions: this.preferences.totalInteractions,
        },
      };
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (error) {
      console.error('Failed to save user learning data:', error);
    }
  }

  /**
   * Clear all learning data (for testing or user privacy)
   */
  async clearData(): Promise<void> {
    this.interactions = [];
    this.preferences = {
      favoriteServices: new Map(),
      favoriteProviders: new Map(),
      timeOfDayPreferences: new Map(),
      serviceTypePreferences: new Map(),
      lastInteractionDate: new Date().toISOString(),
      totalInteractions: 0,
    };
    await AsyncStorage.removeItem(STORAGE_KEY);
  }
}

export default new UserLearningService();

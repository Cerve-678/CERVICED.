// src/services/userLearningService.ts
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = '@user_learning_data';

export interface UserInteraction {
  type: 'view' | 'book' | 'search' | 'favorite' | 'offer_view' | 'filter' | 'query';
  providerId?: string;
  providerName?: string;
  serviceCategory: string;
  searchQuery?: string;
  timestamp: string;
  duration?: number;
  // Tag context — populated whenever the interaction has tag data
  styleTags?: string[];
  techniqueTags?: string[];
  outcomeTags?: string[];
  occasionTags?: string[];
  trendNames?: string[];
  occasionType?: string;
}

export interface TagWeights {
  [tag: string]: number;
}

export interface UserPreferences {
  favoriteServices: Map<string, number>;
  favoriteProviders: Map<string, number>;
  timeOfDayPreferences: Map<number, number>;
  serviceTypePreferences: Map<string, number>;
  searchQueries: string[];
  lastInteractionDate: string;
  totalInteractions: number;
  // Tag-level preference weights — the core of personalisation
  styleTagWeights: Map<string, number>;
  techniqueTagWeights: Map<string, number>;
  outcomeTagWeights: Map<string, number>;
  occasionTagWeights: Map<string, number>;
  trendNameWeights: Map<string, number>;
}

export interface UserBeautyProfile {
  serviceInterests: string[];
  hairType: string;
  styleVibe: string;
  treatmentHistory: string[];
  maintenanceFrequency: string;
}

export interface ScoredProvider {
  id: string;
  name: string;
  service: string;
  logo: any;
  score: number;
}

// Maps treatment history entries to service categories they signal interest in
const TREATMENT_TO_CATEGORY: Record<string, string> = {
  'Hair colour':     'HAIR',
  'Colored':         'HAIR',
  'Bleached':        'HAIR',
  'Extensions':      'HAIR',
  'Locs':            'HAIR',
  'Braids':          'HAIR',
  'Relaxers':        'HAIR',
  'Facials':         'AESTHETICS',
  'Microneedling':   'AESTHETICS',
  'Chemical peels':  'AESTHETICS',
  'Dermaplaning':    'AESTHETICS',
  'Injectables':     'AESTHETICS',
  'Waxing':          'AESTHETICS',
  'Lash extensions': 'LASHES',
  'Lash lifts':      'LASHES',
  'Lash tints':      'LASHES',
  'Brow tinting':    'BROWS',
  'Brow lamination': 'BROWS',
  'Microblading':    'BROWS',
  'Nails':           'NAILS',
  'Nail art':        'NAILS',
  'Gel manicure':    'NAILS',
  'Pedicures':       'NAILS',
  'Bridal makeup':   'MUA',
  'Occasion makeup': 'MUA',
};

// Maps style vibe profile values to style tag weights to seed learning from scratch
const STYLE_VIBE_TO_TAGS: Record<string, string[]> = {
  natural:     ['natural', 'no-makeup', 'soft-girl', 'minimalist'],
  glam:        ['glam', 'bold', 'full-glam', 'dramatic'],
  editorial:   ['editorial', 'bold', 'edgy', 'artistic'],
  bohemian:    ['boho', 'natural', 'effortless'],
  minimalist:  ['minimalist', 'natural', 'clean-girl'],
  classic:     ['classic', 'elegant', 'timeless'],
  edgy:        ['edgy', 'bold', 'editorial'],
  'soft-girl': ['soft-girl', 'natural', 'glam'],
  baddie:      ['baddie', 'glam', 'bold'],
};

// Maps trend search terms to canonical tags for scoring
const TREND_TO_TAGS: Record<string, string[]> = {
  'glazed donut':    ['glazed-donut', 'natural', 'glow'],
  'clean girl':      ['clean-girl', 'minimalist', 'natural'],
  'mob wife':        ['mob-wife', 'glam', 'bold', 'dramatic'],
  'coquette':        ['coquette', 'soft-girl', 'natural'],
  'soap brows':      ['soap-brows', 'natural', 'defined'],
  'butterfly lash':  ['butterfly-lashes', 'wispy', 'dramatic'],
  'old money':       ['old-money', 'classic', 'elegant'],
  'cherry cola':     ['cherry-cola', 'bold', 'colour'],
  'strawberry girl': ['strawberry-girl', 'soft-girl', 'natural'],
  'no makeup':       ['no-makeup', 'natural', 'minimalist'],
  'soft glam':       ['soft-girl', 'glam', 'natural'],
  'full glam':       ['full-glam', 'glam', 'dramatic'],
};

class UserLearningService {
  private interactions: UserInteraction[] = [];
  private preferences: UserPreferences = {
    favoriteServices: new Map(),
    favoriteProviders: new Map(),
    timeOfDayPreferences: new Map(),
    serviceTypePreferences: new Map(),
    searchQueries: [],
    lastInteractionDate: new Date().toISOString(),
    totalInteractions: 0,
    styleTagWeights: new Map(),
    techniqueTagWeights: new Map(),
    outcomeTagWeights: new Map(),
    occasionTagWeights: new Map(),
    trendNameWeights: new Map(),
  };
  private userProfile: UserBeautyProfile | null = null;
  private isInitialized = false;

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      const stored = await AsyncStorage.getItem(STORAGE_KEY);
      if (stored) {
        const data = JSON.parse(stored);
        this.interactions = data.interactions || [];

        this.preferences = {
          favoriteServices: new Map(Object.entries(data.preferences?.favoriteServices || {})),
          favoriteProviders: new Map(Object.entries(data.preferences?.favoriteProviders || {})),
          timeOfDayPreferences: new Map(Object.entries(data.preferences?.timeOfDayPreferences || {}).map(([k, v]) => [Number(k), v as number])),
          serviceTypePreferences: new Map(Object.entries(data.preferences?.serviceTypePreferences || {})),
          searchQueries: data.preferences?.searchQueries || [],
          lastInteractionDate: data.preferences?.lastInteractionDate || new Date().toISOString(),
          totalInteractions: data.preferences?.totalInteractions || 0,
          styleTagWeights: new Map(Object.entries(data.preferences?.styleTagWeights || {})),
          techniqueTagWeights: new Map(Object.entries(data.preferences?.techniqueTagWeights || {})),
          outcomeTagWeights: new Map(Object.entries(data.preferences?.outcomeTagWeights || {})),
          occasionTagWeights: new Map(Object.entries(data.preferences?.occasionTagWeights || {})),
          trendNameWeights: new Map(Object.entries(data.preferences?.trendNameWeights || {})),
        };
      }
      this.isInitialized = true;
    } catch {
      this.isInitialized = true;
    }
  }

  /**
   * Inject the user's beauty profile. Call once on app load after auth.
   * Seeds initial tag weights from profile fields so the system is smart from day 1.
   */
  setUserProfile(profile: UserBeautyProfile): void {
    this.userProfile = profile;

    // Seed style tag weights from style_vibe profile field
    if (profile.styleVibe) {
      const seedTags = STYLE_VIBE_TO_TAGS[profile.styleVibe.toLowerCase()] || [];
      seedTags.forEach(tag => {
        const current = this.preferences.styleTagWeights.get(tag) || 0;
        // Only seed if user hasn't overridden it with behaviour yet (weight 2 = soft prior)
        if (current < 2) this.preferences.styleTagWeights.set(tag, 2);
      });
    }
  }

  /**
   * Track any user interaction. Accumulates tag weights when tag context is provided.
   */
  async trackInteraction(interaction: UserInteraction): Promise<void> {
    await this.initialize();

    this.interactions.push(interaction);
    this.preferences.totalInteractions++;
    this.preferences.lastInteractionDate = new Date().toISOString();

    const weight = this.getInteractionWeight(interaction.type);

    // Category weight
    const catWeight = this.preferences.favoriteServices.get(interaction.serviceCategory) || 0;
    this.preferences.favoriteServices.set(interaction.serviceCategory, catWeight + weight);

    // Provider weight
    if (interaction.providerId) {
      const pW = this.preferences.favoriteProviders.get(interaction.providerId) || 0;
      this.preferences.favoriteProviders.set(interaction.providerId, pW + weight);
    }

    // Time of day weight
    const hour = new Date(interaction.timestamp).getHours();
    const tW = this.preferences.timeOfDayPreferences.get(hour) || 0;
    this.preferences.timeOfDayPreferences.set(hour, tW + 1);

    // Tag weights — each tag type is accumulated separately
    this.accumulateTags(this.preferences.styleTagWeights, interaction.styleTags, weight);
    this.accumulateTags(this.preferences.techniqueTagWeights, interaction.techniqueTags, weight);
    this.accumulateTags(this.preferences.outcomeTagWeights, interaction.outcomeTags, weight);
    this.accumulateTags(this.preferences.occasionTagWeights, interaction.occasionTags, weight);
    this.accumulateTags(this.preferences.trendNameWeights, interaction.trendNames, weight);

    // Occasion type (from booking context)
    if (interaction.occasionType) {
      this.accumulateTags(this.preferences.occasionTagWeights, [interaction.occasionType], weight);
    }

    if (this.interactions.length > 200) {
      this.interactions = this.interactions.slice(-200);
    }

    await this.save();
  }

  private accumulateTags(map: Map<string, number>, tags: string[] | undefined, weight: number): void {
    if (!tags?.length) return;
    tags.forEach(tag => {
      const current = map.get(tag) || 0;
      map.set(tag, current + weight);
    });
  }

  /**
   * Track a text search query and extract tag signals from the query text.
   */
  async trackSearch(query: string, category?: string): Promise<void> {
    if (!query || query.trim().length < 3) return;
    await this.initialize();

    const q = query.trim().toLowerCase();

    this.preferences.searchQueries = [
      q,
      ...this.preferences.searchQueries.filter(s => s !== q),
    ].slice(0, 30);

    // Extract style/trend signals from the query text
    const inferredStyleTags = this.inferStyleTagsFromQuery(q);
    const inferredTrendNames = this.inferTrendNamesFromQuery(q);
    const inferredOccasionTags = this.inferOccasionTagsFromQuery(q);

    await this.trackInteraction({
      type: 'query',
      serviceCategory: category || this.inferCategoryFromQuery(q),
      searchQuery: q,
      timestamp: new Date().toISOString(),
      styleTags: inferredStyleTags,
      trendNames: inferredTrendNames,
      occasionTags: inferredOccasionTags,
    });
  }

  /**
   * Track a category filter chip tap
   */
  async trackFilter(category: string): Promise<void> {
    await this.trackInteraction({
      type: 'filter',
      serviceCategory: category,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Track viewing a provider — pass the provider's tag context so preferences build up.
   * Call this when a user taps into a provider profile.
   */
  async trackProviderView(params: {
    providerId: string;
    providerName: string;
    serviceCategory: string;
    styleTags?: string[];
    techniqueTags?: string[];
    occasionTags?: string[];
    duration?: number;
  }): Promise<void> {
    await this.trackInteraction({
      type: 'view',
      providerId: params.providerId,
      providerName: params.providerName,
      serviceCategory: params.serviceCategory,
      timestamp: new Date().toISOString(),
      ...(params.styleTags?.length     && { styleTags: params.styleTags }),
      ...(params.techniqueTags?.length && { techniqueTags: params.techniqueTags }),
      ...(params.occasionTags?.length  && { occasionTags: params.occasionTags }),
      ...(params.duration              && { duration: params.duration }),
    });
  }

  /**
   * Track a completed booking — strongest signal for all tag preferences.
   * Call this after a booking is confirmed.
   */
  async trackBooking(params: {
    providerId: string;
    serviceCategory: string;
    styleTags?: string[];
    techniqueTags?: string[];
    outcomeTags?: string[];
    occasionTags?: string[];
    trendNames?: string[];
    occasionType?: string;
  }): Promise<void> {
    await this.trackInteraction({
      type: 'book',
      providerId: params.providerId,
      serviceCategory: params.serviceCategory,
      timestamp: new Date().toISOString(),
      ...(params.styleTags?.length     && { styleTags: params.styleTags }),
      ...(params.techniqueTags?.length && { techniqueTags: params.techniqueTags }),
      ...(params.outcomeTags?.length   && { outcomeTags: params.outcomeTags }),
      ...(params.occasionTags?.length  && { occasionTags: params.occasionTags }),
      ...(params.trendNames?.length    && { trendNames: params.trendNames }),
      ...(params.occasionType          && { occasionType: params.occasionType }),
    });
  }

  /**
   * Returns the user's top style tags, ordered by accumulated weight.
   * Used by: Explore feed ranking, Becca context, provider recommendation scoring.
   */
  async getTopStyleTags(limit: number = 5): Promise<string[]> {
    await this.initialize();
    return this.getTopFromMap(this.preferences.styleTagWeights, limit);
  }

  /**
   * Returns the user's top occasion tags.
   * Used by: Becca to understand context, occasion-based filtering.
   */
  async getTopOccasionTags(limit: number = 3): Promise<string[]> {
    await this.initialize();
    return this.getTopFromMap(this.preferences.occasionTagWeights, limit);
  }

  /**
   * Returns the user's top technique tags.
   * Used by: Becca to refine service recommendations.
   */
  async getTopTechniqueTags(limit: number = 5): Promise<string[]> {
    await this.initialize();
    return this.getTopFromMap(this.preferences.techniqueTagWeights, limit);
  }

  /**
   * Returns the user's top trend names they've engaged with.
   * Used by: trend-based search suggestions, Explore trending section.
   */
  async getTopTrendNames(limit: number = 5): Promise<string[]> {
    await this.initialize();
    return this.getTopFromMap(this.preferences.trendNameWeights, limit);
  }

  /**
   * Returns a tag filter object for personalising the Explore/portfolio feed.
   * The caller can use these to weight or pre-filter portfolio items.
   */
  async getPersonalisedTagContext(): Promise<{
    topStyleTags: string[];
    topOccasionTags: string[];
    topTechniqueTags: string[];
    topTrendNames: string[];
    profileStyleVibe: string | null;
    profileHairType: string | null;
  }> {
    await this.initialize();
    return {
      topStyleTags: await this.getTopStyleTags(5),
      topOccasionTags: await this.getTopOccasionTags(3),
      topTechniqueTags: await this.getTopTechniqueTags(5),
      topTrendNames: await this.getTopTrendNames(3),
      profileStyleVibe: this.userProfile?.styleVibe || null,
      profileHairType: this.userProfile?.hairType || null,
    };
  }

  /**
   * Scores a portfolio item by how well its tags match the user's preferences.
   * Returns a 0-100 relevance score. Used to re-rank the Explore feed.
   */
  scorePortfolioItem(item: {
    tags?: string[] | null;
    vibe_tags?: string[] | null;
    occasion_tags?: string[] | null;
    trend_names?: string[] | null;
    category?: string | null;
  }): number {
    let score = 0;

    const allTags = [...(item.tags || []), ...(item.vibe_tags || [])];
    allTags.forEach(tag => {
      score += (this.preferences.styleTagWeights.get(tag) || 0) * 2;
    });

    (item.occasion_tags || []).forEach(tag => {
      score += (this.preferences.occasionTagWeights.get(tag) || 0) * 1.5;
    });

    (item.trend_names || []).forEach(trend => {
      score += (this.preferences.trendNameWeights.get(trend) || 0) * 3;
    });

    if (item.category) {
      score += (this.preferences.favoriteServices.get(item.category.toUpperCase()) || 0) * 1;
    }

    // Profile signal: style_vibe direct match
    if (this.userProfile?.styleVibe) {
      const vibeSeeds = STYLE_VIBE_TO_TAGS[this.userProfile.styleVibe.toLowerCase()] || [];
      const matchCount = allTags.filter(t => vibeSeeds.includes(t)).length;
      score += matchCount * 3;
    }

    return score;
  }

  /**
   * Returns providers reordered by combined profile + behaviour + tag signals.
   */
  async getPersonalizedProviders<T extends {
    id: string;
    service: string;
    styleTags?: string[];
    occasionTags?: string[];
    techniqueTags?: string[];
    expertiseTags?: string[];
  }>(providers: T[], limit?: number): Promise<T[]> {
    await this.initialize();

    if (this.preferences.totalInteractions < 3 && !this.userProfile) {
      return limit ? providers.slice(0, limit) : providers;
    }

    const scored = providers.map(provider => ({
      provider,
      score: this.calculateProviderScore(provider),
    }));

    scored.sort((a, b) => b.score - a.score);
    const result = scored.map(s => s.provider);
    return limit ? result.slice(0, limit) : result;
  }

  /**
   * Returns the service categories reordered by profile + behaviour signal.
   */
  async getOrderedServiceCategories(categories: string[]): Promise<string[]> {
    await this.initialize();

    const scores = new Map<string, number>();

    this.userProfile?.serviceInterests?.forEach(interest => {
      const key = interest.toUpperCase();
      scores.set(key, (scores.get(key) || 0) + 5);
    });

    this.userProfile?.treatmentHistory?.forEach(treatment => {
      const cat = TREATMENT_TO_CATEGORY[treatment];
      if (cat) scores.set(cat, (scores.get(cat) || 0) + 2);
    });

    this.preferences.favoriteServices.forEach((weight, service) => {
      const key = service.toUpperCase();
      scores.set(key, (scores.get(key) || 0) + weight);
    });

    return [...categories].sort((a, b) => {
      const diff = (scores.get(b) || 0) - (scores.get(a) || 0);
      return diff !== 0 ? diff : categories.indexOf(a) - categories.indexOf(b);
    });
  }

  async getTopServiceCategory(): Promise<string | null> {
    await this.initialize();

    const scores = new Map<string, number>();

    this.userProfile?.serviceInterests?.forEach(interest => {
      const key = interest.toUpperCase();
      scores.set(key, (scores.get(key) || 0) + 5);
    });

    this.preferences.favoriteServices.forEach((weight, service) => {
      const key = service.toUpperCase();
      scores.set(key, (scores.get(key) || 0) + weight);
    });

    if (scores.size === 0) return null;

    return Array.from(scores.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  }

  async getFavoriteServices(limit: number = 3): Promise<string[]> {
    await this.initialize();
    return this.getTopFromMap(this.preferences.favoriteServices, limit);
  }

  async getPersonalizedOffers<T extends { service?: string }>(offers: T[], limit?: number): Promise<T[]> {
    await this.initialize();

    if (this.preferences.totalInteractions < 2) return offers;

    const scored = offers.map(offer => ({
      offer,
      score: offer.service ? (this.preferences.favoriteServices.get(offer.service) || 0) : 0,
    }));

    scored.sort((a, b) => b.score - a.score);
    const result = scored.map(s => s.offer);
    return limit ? result.slice(0, limit) : result;
  }

  async getUserInsights(): Promise<{
    topServices: string[];
    topProviders: string[];
    mostActiveHour: number;
    totalBookings: number;
    recentQueries: string[];
    topStyleTags: string[];
    topOccasionTags: string[];
    topTrendNames: string[];
  }> {
    await this.initialize();

    return {
      topServices: this.getTopFromMap(this.preferences.favoriteServices, 3),
      topProviders: this.getTopFromMap(this.preferences.favoriteProviders, 3),
      mostActiveHour: Array.from(this.preferences.timeOfDayPreferences.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] || 12,
      totalBookings: this.interactions.filter(i => i.type === 'book').length,
      recentQueries: this.preferences.searchQueries.slice(0, 5),
      topStyleTags: this.getTopFromMap(this.preferences.styleTagWeights, 5),
      topOccasionTags: this.getTopFromMap(this.preferences.occasionTagWeights, 3),
      topTrendNames: this.getTopFromMap(this.preferences.trendNameWeights, 3),
    };
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private calculateProviderScore(provider: {
    id: string;
    service: string;
    styleTags?: string[];
    occasionTags?: string[];
    techniqueTags?: string[];
    expertiseTags?: string[];
  }): number {
    let score = 0;
    const svc = (provider.service || '').toUpperCase();

    score += (this.preferences.favoriteServices.get(svc) || 0) * 0.4;
    score += (this.preferences.favoriteProviders.get(provider.id) || 0) * 0.3;

    const currentHour = new Date().getHours();
    score += (this.preferences.timeOfDayPreferences.get(currentHour) || 0) * 0.1;

    const recentInteractions = this.interactions.filter(i => i.serviceCategory.toUpperCase() === svc).slice(-10);
    score += recentInteractions.length * 2 * 0.2;

    if (this.userProfile?.serviceInterests?.some(i => i.toUpperCase() === svc)) score += 3;

    this.userProfile?.treatmentHistory?.forEach(treatment => {
      if (TREATMENT_TO_CATEGORY[treatment]?.toUpperCase() === svc) score += 1;
    });

    // Tag overlap bonuses
    (provider.styleTags || []).forEach(tag => {
      score += (this.preferences.styleTagWeights.get(tag) || 0) * 0.5;
    });
    (provider.occasionTags || []).forEach(tag => {
      score += (this.preferences.occasionTagWeights.get(tag) || 0) * 0.4;
    });
    (provider.techniqueTags || []).forEach(tag => {
      score += (this.preferences.techniqueTagWeights.get(tag) || 0) * 0.3;
    });

    // Profile: hair type expertise match
    if (this.userProfile?.hairType) {
      const hairKey = this.userProfile.hairType.toLowerCase().replace(/\s+/g, '-');
      if ((provider.expertiseTags || []).some(t => t.includes(hairKey))) score += 4;
    }

    // Profile: style vibe match
    if (this.userProfile?.styleVibe) {
      const vibeSeeds = STYLE_VIBE_TO_TAGS[this.userProfile.styleVibe.toLowerCase()] || [];
      const matchCount = (provider.styleTags || []).filter(t => vibeSeeds.includes(t)).length;
      score += matchCount * 2;
    }

    return score;
  }

  private getInteractionWeight(type: UserInteraction['type']): number {
    const weights: Record<UserInteraction['type'], number> = {
      view: 1,
      search: 2,
      filter: 1.5,
      query: 2,
      favorite: 5,
      offer_view: 3,
      book: 10,
    };
    return weights[type] ?? 1;
  }

  private getTopFromMap(map: Map<string, number>, limit: number): string[] {
    return Array.from(map.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([key]) => key);
  }

  private inferCategoryFromQuery(query: string): string {
    const q = query.toLowerCase();
    if (/hair|braid|weave|loc|twist|wig|colour|color|cut|balayage|extensions/.test(q)) return 'HAIR';
    if (/nail|acrylic|gel|manicure|pedicure|biab/.test(q))                              return 'NAILS';
    if (/lash|lashes|russian|volume|wispy/.test(q))                                     return 'LASHES';
    if (/brow|eyebrow|thread|wax|microblad|lamination|soap brow|hd brow/.test(q))       return 'BROWS';
    if (/makeup|mua|glam|bridal|contour|foundation|smokey/.test(q))                     return 'MUA';
    if (/facial|skin|peel|aesthetic|needle|filler|botox|hifu|hydra/.test(q))            return 'AESTHETICS';
    return 'ALL';
  }

  private inferStyleTagsFromQuery(query: string): string[] {
    const tags: string[] = [];
    const q = query.toLowerCase();
    if (/natural|no.?makeup|bare/.test(q))              tags.push('natural');
    if (/glam|glamour|full glam/.test(q))               tags.push('glam');
    if (/editorial|fashion|high.?fashion/.test(q))      tags.push('editorial');
    if (/bold|dramatic|statement/.test(q))              tags.push('bold');
    if (/soft|cute|coquette|feminine/.test(q))          tags.push('soft-girl');
    if (/minimal|clean girl|clean look/.test(q))        tags.push('minimalist');
    if (/classic|timeless|elegant/.test(q))             tags.push('classic');
    if (/edgy|dark|gothic|punk/.test(q))                tags.push('edgy');
    if (/boho|bohemian|effortless/.test(q))             tags.push('boho');

    // Extract trend → style tags
    Object.entries(TREND_TO_TAGS).forEach(([trend, trendTags]) => {
      if (q.includes(trend)) tags.push(...trendTags);
    });

    return [...new Set(tags)];
  }

  private inferTrendNamesFromQuery(query: string): string[] {
    const q = query.toLowerCase();
    return Object.keys(TREND_TO_TAGS).filter(trend => q.includes(trend));
  }

  private inferOccasionTagsFromQuery(query: string): string[] {
    const tags: string[] = [];
    const q = query.toLowerCase();
    if (/wedding|bride|bridal|married/.test(q))         tags.push('bridal');
    if (/prom|formal|homecoming/.test(q))               tags.push('prom');
    if (/photoshoot|photo|shoot|editorial/.test(q))     tags.push('photoshoot');
    if (/date night|date|night out/.test(q))            tags.push('date-night');
    if (/birthday|bday/.test(q))                        tags.push('birthday');
    if (/festival|carnival|notting hill/.test(q))       tags.push('festival');
    if (/party|event|occasion/.test(q))                 tags.push('event');
    if (/everyday|daily|work/.test(q))                  tags.push('everyday');
    return [...new Set(tags)];
  }

  private async save(): Promise<void> {
    try {
      const data = {
        interactions: this.interactions,
        preferences: {
          favoriteServices: Object.fromEntries(this.preferences.favoriteServices),
          favoriteProviders: Object.fromEntries(this.preferences.favoriteProviders),
          timeOfDayPreferences: Object.fromEntries(this.preferences.timeOfDayPreferences),
          serviceTypePreferences: Object.fromEntries(this.preferences.serviceTypePreferences),
          searchQueries: this.preferences.searchQueries,
          lastInteractionDate: this.preferences.lastInteractionDate,
          totalInteractions: this.preferences.totalInteractions,
          styleTagWeights: Object.fromEntries(this.preferences.styleTagWeights),
          techniqueTagWeights: Object.fromEntries(this.preferences.techniqueTagWeights),
          outcomeTagWeights: Object.fromEntries(this.preferences.outcomeTagWeights),
          occasionTagWeights: Object.fromEntries(this.preferences.occasionTagWeights),
          trendNameWeights: Object.fromEntries(this.preferences.trendNameWeights),
        },
      };
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {
      // Silent failure — learning data is non-critical
    }
  }

  async clearData(): Promise<void> {
    this.interactions = [];
    this.userProfile = null;
    this.preferences = {
      favoriteServices: new Map(),
      favoriteProviders: new Map(),
      timeOfDayPreferences: new Map(),
      serviceTypePreferences: new Map(),
      searchQueries: [],
      lastInteractionDate: new Date().toISOString(),
      totalInteractions: 0,
      styleTagWeights: new Map(),
      techniqueTagWeights: new Map(),
      outcomeTagWeights: new Map(),
      occasionTagWeights: new Map(),
      trendNameWeights: new Map(),
    };
    await AsyncStorage.removeItem(STORAGE_KEY);
  }
}

export default new UserLearningService();

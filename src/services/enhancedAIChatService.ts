// Enhanced AI Chat Service for Becca - Stage 1: Tier 1 Features
import { sampleProviders, Provider } from './ProviderDataService';
import { ConfirmedBooking, BookingStatus } from '../contexts/BookingContext';

export type MessageRole = 'user' | 'assistant';

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  timestamp: Date;
  suggestions?: ChatSuggestion[];
  providerRecommendations?: Provider[];
  imageUri?: string;
  imageAnalysis?: string;
}

export interface ChatSuggestion {
  id: string;
  text: string;
  action: 'navigate' | 'search' | 'message';
  data?: any;
  icon?: any;
  serviceType?: string;
}

// ==================== FEATURE 1: CONVERSATION MEMORY ====================
export interface ConversationMemory {
  // Service preferences
  servicePreference?: string;
  specificService?: string; // e.g., "gel nails", "balayage", "microblading"

  // Location & logistics
  locationPreference?: string;
  priceRange?: { min: number; max: number };

  // Time preferences
  datePreference?: string;
  timePreference?: string;

  // User history
  previousProviders: string[];
  favoriteProviders: string[];
  viewedProviders: string[];

  // Current session context
  currentIntent?: 'browse' | 'book' | 'search' | 'info' | 'manage_bookings';
  conversationTopic?: string;

  // Booking context
  activeBookings?: string[];
  upcomingBookingsCount?: number;

  // User preferences learned over time
  preferredPriceRange?: string; // "budget", "mid-range", "premium"
  preferredTimeOfDay?: string; // "morning", "afternoon", "evening"
}

// ==================== FEATURE 4: BETTER SERVICE MATCHING ====================
interface ServiceMatch {
  category: string; // NAILS, HAIR, etc.
  specificService?: string; // "gel nails", "balayage"
  keywords: string[];
}

class EnhancedAIChatService {
  private conversationMemory: ConversationMemory = {
    previousProviders: [],
    favoriteProviders: [],
    viewedProviders: [],
  };

  // Bookings reference (injected from context)
  private bookings: ConfirmedBooking[] = [];

  // ==================== SERVICE MATCHING DATABASE ====================
  private readonly serviceDatabase: Record<string, ServiceMatch[]> = {
    'NAILS': [
      { category: 'NAILS', specificService: 'gel manicure', keywords: ['gel', 'gel mani', 'gel manicure', 'shellac'] },
      { category: 'NAILS', specificService: 'acrylic nails', keywords: ['acrylic', 'acrylics', 'full set', 'tips'] },
      { category: 'NAILS', specificService: 'dip powder', keywords: ['dip', 'dip powder', 'sns'] },
      { category: 'NAILS', specificService: 'pedicure', keywords: ['pedicure', 'pedi', 'foot spa'] },
      { category: 'NAILS', specificService: 'manicure', keywords: ['manicure', 'mani', 'polish'] },
      { category: 'NAILS', specificService: 'nail art', keywords: ['nail art', 'designs', 'nail design', 'custom nails'] },
      { category: 'NAILS', specificService: 'nail repair', keywords: ['fix', 'repair', 'broken nail'] },
    ],
    'HAIR': [
      { category: 'HAIR', specificService: 'balayage', keywords: ['balayage', 'painted highlights'] },
      { category: 'HAIR', specificService: 'highlights', keywords: ['highlights', 'lowlights', 'foils'] },
      { category: 'HAIR', specificService: 'hair color', keywords: ['color', 'dye', 'tint', 'root touch up'] },
      { category: 'HAIR', specificService: 'haircut', keywords: ['cut', 'haircut', 'trim', 'bang trim'] },
      { category: 'HAIR', specificService: 'blowout', keywords: ['blowout', 'blow dry', 'styling'] },
      { category: 'HAIR', specificService: 'keratin treatment', keywords: ['keratin', 'smoothing', 'brazilian blowout'] },
      { category: 'HAIR', specificService: 'extensions', keywords: ['extensions', 'hair extensions', 'length'] },
      { category: 'HAIR', specificService: 'updo', keywords: ['updo', 'bun', 'formal style', 'wedding hair'] },
    ],
    'LASHES': [
      { category: 'LASHES', specificService: 'classic lashes', keywords: ['classic lashes', 'individual lashes'] },
      { category: 'LASHES', specificService: 'volume lashes', keywords: ['volume', 'russian volume', 'mega volume'] },
      { category: 'LASHES', specificService: 'lash lift', keywords: ['lash lift', 'lift', 'perm'] },
      { category: 'LASHES', specificService: 'lash tint', keywords: ['tint', 'lash tint', 'tinting'] },
      { category: 'LASHES', specificService: 'lash fill', keywords: ['fill', 'refill', 'touch up'] },
    ],
    'BROWS': [
      { category: 'BROWS', specificService: 'brow shaping', keywords: ['brow shaping', 'shape', 'arch'] },
      { category: 'BROWS', specificService: 'brow tint', keywords: ['brow tint', 'tinting'] },
      { category: 'BROWS', specificService: 'microblading', keywords: ['microblading', 'blade', 'semi permanent'] },
      { category: 'BROWS', specificService: 'brow lamination', keywords: ['lamination', 'brow lam', 'laminated'] },
      { category: 'BROWS', specificService: 'threading', keywords: ['threading', 'thread'] },
      { category: 'BROWS', specificService: 'waxing', keywords: ['wax', 'waxing', 'brow wax'] },
    ],
    'MUA': [
      { category: 'MUA', specificService: 'bridal makeup', keywords: ['bridal', 'wedding', 'bride'] },
      { category: 'MUA', specificService: 'special event', keywords: ['event', 'party', 'prom', 'formal'] },
      { category: 'MUA', specificService: 'glam makeup', keywords: ['glam', 'full glam', 'beat face'] },
      { category: 'MUA', specificService: 'natural makeup', keywords: ['natural', 'no makeup makeup', 'soft glam'] },
      { category: 'MUA', specificService: 'makeup lesson', keywords: ['lesson', 'tutorial', 'learn'] },
    ],
    'AESTHETICS': [
      { category: 'AESTHETICS', specificService: 'facial', keywords: ['facial', 'face treatment'] },
      { category: 'AESTHETICS', specificService: 'microneedling', keywords: ['microneedling', 'needling'] },
      { category: 'AESTHETICS', specificService: 'chemical peel', keywords: ['peel', 'chemical peel'] },
      { category: 'AESTHETICS', specificService: 'dermaplaning', keywords: ['dermaplaning', 'shaving'] },
      { category: 'AESTHETICS', specificService: 'hydrafacial', keywords: ['hydrafacial', 'hydra'] },
    ],
  };

  // ==================== INJECT BOOKINGS ====================
  public setBookings(bookings: ConfirmedBooking[]): void {
    this.bookings = bookings;
    this.conversationMemory.activeBookings = bookings
      .filter(b => b.status === BookingStatus.UPCOMING)
      .map(b => b.id);
    this.conversationMemory.upcomingBookingsCount = bookings.filter(
      b => b.status === BookingStatus.UPCOMING
    ).length;
  }

  // ==================== FEATURE 4: ENHANCED SERVICE MATCHING ====================
  private extractServiceType(message: string): { category: string | null; specificService?: string } {
    const lowerMessage = message.toLowerCase();

    // Check all service types
    for (const [category, services] of Object.entries(this.serviceDatabase)) {
      for (const service of services) {
        // Check if any keyword matches
        if (service.keywords.some(keyword => lowerMessage.includes(keyword))) {
          return {
            category: service.category,
            specificService: service.specificService,
          };
        }
      }
    }

    // Fallback to basic category matching
    const basicKeywords: Record<string, string[]> = {
      'NAILS': ['nail', 'nails'],
      'HAIR': ['hair'],
      'LASHES': ['lash', 'lashes', 'eyelash'],
      'BROWS': ['brow', 'brows', 'eyebrow'],
      'MUA': ['makeup', 'mua'],
      'AESTHETICS': ['aesthetic', 'aesthetics', 'skin'],
    };

    for (const [service, keywords] of Object.entries(basicKeywords)) {
      if (keywords.some(keyword => lowerMessage.includes(keyword))) {
        return { category: service };
      }
    }

    return { category: null };
  }

  // ==================== FEATURE 3: PRICE FILTERING ====================
  private extractPriceFilter(message: string): { min?: number; max?: number } | null {
    const lowerMessage = message.toLowerCase();

    // Pattern: "under $50", "below $100"
    const underMatch = lowerMessage.match(/(?:under|below|less than)\s*\$?(\d+)/);
    if (underMatch) {
      return { max: parseInt(underMatch[1]) };
    }

    // Pattern: "over $50", "above $100", "more than $75"
    const overMatch = lowerMessage.match(/(?:over|above|more than)\s*\$?(\d+)/);
    if (overMatch) {
      return { min: parseInt(overMatch[1]) };
    }

    // Pattern: "between $50 and $100"
    const betweenMatch = lowerMessage.match(/between\s*\$?(\d+)\s*(?:and|-)\s*\$?(\d+)/);
    if (betweenMatch) {
      return { min: parseInt(betweenMatch[1]), max: parseInt(betweenMatch[2]) };
    }

    // Pattern: "$50-$100", "$50 - $100"
    const rangeMatch = lowerMessage.match(/\$?(\d+)\s*-\s*\$?(\d+)/);
    if (rangeMatch) {
      return { min: parseInt(rangeMatch[1]), max: parseInt(rangeMatch[2]) };
    }

    return null;
  }

  private filterProvidersByPrice(
    providers: Provider[],
    priceRange: { min?: number; max?: number }
  ): Provider[] {
    // NOTE: In a real app, providers would have price data
    // For now, we'll simulate by filtering a subset
    // You'll need to add price fields to your Provider type
    return providers; // Placeholder - implement when Provider has price data
  }

  // ==================== FEATURE 2: BOOKING MANAGEMENT ====================
  private handleBookingManagement(message: string): { intent: string; bookingData?: any } | null {
    const lowerMessage = message.toLowerCase();

    // Show bookings
    if (
      lowerMessage.match(/\b(show|view|see|my|check)\b.*\b(booking|appointment|schedule)/i) ||
      lowerMessage.match(/\b(upcoming|next|future)\b.*\b(appointment|booking)/i)
    ) {
      return { intent: 'show_bookings' };
    }

    // Cancel booking
    if (lowerMessage.match(/\b(cancel|delete|remove)\b.*\b(booking|appointment)/i)) {
      return { intent: 'cancel_booking' };
    }

    // Reschedule booking
    if (lowerMessage.match(/\b(reschedule|change|move)\b.*\b(booking|appointment)/i)) {
      return { intent: 'reschedule_booking' };
    }

    return null;
  }

  // ==================== EXTRACT INTENT ====================
  private extractIntent(message: string): string {
    const lowerMessage = message.toLowerCase();

    // Check for booking management first
    const bookingIntent = this.handleBookingManagement(message);
    if (bookingIntent) {
      return 'manage_bookings';
    }

    if (lowerMessage.match(/\b(book|appointment|schedule|reserve)\b/i)) {
      return 'book';
    }
    if (lowerMessage.match(/\b(find|looking for|search|need|want)\b/i)) {
      return 'search';
    }
    if (lowerMessage.match(/\b(browse|explore|show me|recommend)\b/i)) {
      return 'browse';
    }
    if (lowerMessage.match(/\b(what|how|when|where|why|info|tell me)\b/i)) {
      return 'info';
    }

    return 'general';
  }

  // ==================== MAIN RESPONSE GENERATOR ====================
  public async generateResponse(userMessage: string, imageUri?: string): Promise<ChatMessage> {
    const intent = this.extractIntent(userMessage);
    const serviceMatch = this.extractServiceType(userMessage);
    const priceFilter = this.extractPriceFilter(userMessage);

    // ==================== FEATURE 1: UPDATE CONVERSATION MEMORY ====================
    if (serviceMatch.category) {
      this.conversationMemory.servicePreference = serviceMatch.category;
      this.conversationMemory.specificService = serviceMatch.specificService;
    }
    if (priceFilter) {
      this.conversationMemory.priceRange = priceFilter;
    }
    this.conversationMemory.currentIntent = intent as any;

    let responseText = '';
    let suggestions: ChatSuggestion[] = [];
    let providerRecommendations: Provider[] = [];

    // ==================== FEATURE 2: BOOKING MANAGEMENT ====================
    if (intent === 'manage_bookings') {
      const bookingIntent = this.handleBookingManagement(userMessage);

      if (bookingIntent?.intent === 'show_bookings') {
        const upcomingBookings = this.bookings.filter(b => b.status === BookingStatus.UPCOMING);

        if (upcomingBookings.length === 0) {
          responseText = "You don't have any upcoming bookings right now. Would you like to book a service?";

          suggestions = [
            {
              id: 'browse-services',
              text: 'Browse Services',
              action: 'message',
              data: { message: 'Show me all services' }
            },
            {
              id: 'find-provider',
              text: 'Find Provider',
              action: 'message',
              data: { message: 'Find services near me' }
            }
          ];
        } else {
          responseText = `You have ${upcomingBookings.length} upcoming booking${upcomingBookings.length > 1 ? 's' : ''}:\n\n`;

          upcomingBookings.slice(0, 5).forEach((booking, index) => {
            const date = new Date(booking.bookingDate).toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
            });
            responseText += `${index + 1}. **${booking.serviceName}** with ${booking.providerName}\n`;
            responseText += `   📅 ${date} at ${booking.bookingTime}\n\n`;
          });

          suggestions = [
            {
              id: 'view-all-bookings',
              text: 'View All Bookings',
              action: 'navigate',
              data: { screen: 'Bookings' }
            },
            {
              id: 'book-another',
              text: 'Book Another',
              action: 'message',
              data: { message: 'I want to book another service' }
            }
          ];
        }
      } else if (bookingIntent?.intent === 'cancel_booking') {
        responseText = "I can help you cancel a booking. Please visit your Bookings page to select which appointment you'd like to cancel.";

        suggestions = [
          {
            id: 'go-to-bookings',
            text: 'Go to Bookings',
            action: 'navigate',
            data: { screen: 'Bookings' }
          }
        ];
      } else if (bookingIntent?.intent === 'reschedule_booking') {
        responseText = "I can help you reschedule. Please visit your Bookings page to select the appointment you'd like to change.";

        suggestions = [
          {
            id: 'go-to-bookings',
            text: 'Go to Bookings',
            action: 'navigate',
            data: { screen: 'Bookings' }
          }
        ];
      }
    }
    // ==================== FEATURE 3 & 4: PRICE FILTERING + SERVICE MATCHING ====================
    else if ((intent === 'search' || intent === 'book') && serviceMatch.category) {
      let providers = sampleProviders.filter(p => p.service === serviceMatch.category);

      // Apply price filter if specified
      if (priceFilter) {
        providers = this.filterProvidersByPrice(providers, priceFilter);
        this.conversationMemory.priceRange = priceFilter;
      }

      providerRecommendations = providers;

      // Build response with specific service mention
      const serviceDesc = serviceMatch.specificService || serviceMatch.category.toLowerCase();

      responseText = priceFilter
        ? `I found ${providers.length} ${serviceDesc} provider${providers.length !== 1 ? 's' : ''} `
        : `Perfect! I found ${providers.length} amazing ${serviceDesc} provider${providers.length !== 1 ? 's' : ''} `;

      if (priceFilter.max) {
        responseText += `under $${priceFilter.max}`;
      } else if (priceFilter.min) {
        responseText += `over $${priceFilter.min}`;
      } else if (priceFilter.min && priceFilter.max) {
        responseText += `between $${priceFilter.min}-$${priceFilter.max}`;
      }

      responseText += `:\n\n`;

      providers.slice(0, 3).forEach((provider, index) => {
        responseText += `${index + 1}. ${provider.name}\n`;
      });

      responseText += `\nTap any provider to view their profile and book!`;

      suggestions = [
        {
          id: 'compare-prices',
          text: 'Compare Prices',
          action: 'message',
          data: { message: `Compare ${serviceDesc} prices` }
        },
        {
          id: 'see-reviews',
          text: 'See Reviews',
          action: 'message',
          data: { message: `Show reviews for ${serviceDesc}` }
        },
        {
          id: 'view-all',
          text: 'View All',
          action: 'message',
          data: { message: `Show all ${serviceDesc} providers` }
        }
      ];
    }
    // Handle browse intent
    else if (intent === 'browse') {
      responseText = `I'd love to help you discover amazing beauty services! We offer:\n\n`;
      responseText += `💅 Nails - Gel, Acrylic, Nail Art\n`;
      responseText += `💇 Hair - Cuts, Color, Styling\n`;
      responseText += `👁️ Lashes - Extensions & Lifts\n`;
      responseText += `🎨 Brows - Shaping & Microblading\n`;
      responseText += `💄 Makeup - Glam & Events\n`;
      responseText += `✨ Aesthetics - Facials & Skincare\n\n`;
      responseText += `What service interests you?`;

      suggestions = [
        { id: 'nails', text: 'Nails', action: 'message', data: { message: 'Show me nail services' } },
        { id: 'hair', text: 'Hair', action: 'message', data: { message: 'I need hair services' } },
        { id: 'lashes', text: 'Lashes', action: 'message', data: { message: 'I want lash extensions' } },
        { id: 'brows', text: 'Brows', action: 'message', data: { message: 'Looking for brow services' } },
      ];
    }
    // Default response
    else {
      responseText = `Hi! I'm Becca, your beauty assistant! 💜\n\n`;

      // Personalize based on memory
      if (this.conversationMemory.upcomingBookingsCount && this.conversationMemory.upcomingBookingsCount > 0) {
        responseText += `You have ${this.conversationMemory.upcomingBookingsCount} upcoming appointment${this.conversationMemory.upcomingBookingsCount > 1 ? 's' : ''}. `;
      }

      responseText += `What can I help you with today?`;

      suggestions = [
        { id: 'browse', text: 'Browse Services', action: 'message', data: { message: 'Show me all services' } },
        { id: 'bookings', text: 'My Bookings', action: 'navigate', data: { screen: 'Bookings' } },
        { id: 'near-me', text: 'Find Nearby', action: 'message', data: { message: 'Find services near me' } },
      ];
    }

    const message: ChatMessage = {
      id: Date.now().toString(),
      role: 'assistant',
      content: responseText,
      timestamp: new Date(),
      suggestions,
    };

    if (providerRecommendations.length > 0) {
      message.providerRecommendations = providerRecommendations;
    }

    return message;
  }

  // ==================== MEMORY MANAGEMENT ====================
  public getMemory(): ConversationMemory {
    return this.conversationMemory;
  }

  public resetConversation(): void {
    const previousProviders = this.conversationMemory.previousProviders;
    const favoriteProviders = this.conversationMemory.favoriteProviders;

    this.conversationMemory = {
      previousProviders,
      favoriteProviders,
      viewedProviders: [],
    };
  }

  public trackProviderView(providerId: string): void {
    if (!this.conversationMemory.viewedProviders.includes(providerId)) {
      this.conversationMemory.viewedProviders.push(providerId);
    }
  }
}

export default new EnhancedAIChatService();

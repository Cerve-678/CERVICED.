// AI Chat Service for Becca AI Assistant
import { sampleProviders, Provider } from './ProviderDataService';

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
  icon?: any; // Image source for provider logos or service icons
  serviceType?: string; // NAILS, HAIR, LASHES, etc.
}

export interface ConversationContext {
  servicePreference?: string;
  locationPreference?: string;
  datePreference?: string;
  budgetRange?: string;
  previousProviders?: string[];
  currentIntent?: 'browse' | 'book' | 'search' | 'info';
}

class AIChatService {
  private conversationContext: ConversationContext = {};

  // Extract intent from user message
  private extractIntent(message: string): string {
    const lowerMessage = message.toLowerCase();

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

  // Extract service type from message
  private extractServiceType(message: string): string | null {
    const lowerMessage = message.toLowerCase();

    const serviceKeywords: Record<string, string[]> = {
      'NAILS': ['nail', 'nails', 'manicure', 'pedicure', 'mani', 'pedi'],
      'HAIR': ['hair', 'haircut', 'hairstyle', 'blowout', 'color', 'highlights', 'balayage', 'hairdo'],
      'LASHES': ['lash', 'lashes', 'eyelash', 'extensions'],
      'BROWS': ['brow', 'brows', 'eyebrow', 'eyebrows', 'microblading'],
      'MUA': ['makeup', 'mua', 'glam', 'cosmetic', 'beauty'],
      'AESTHETICS': ['aesthetic', 'aesthetics', 'facial', 'skin', 'botox', 'filler', 'skincare'],
    };

    for (const [service, keywords] of Object.entries(serviceKeywords)) {
      if (keywords.some(keyword => lowerMessage.includes(keyword))) {
        return service;
      }
    }

    return null;
  }

  // Get providers by service type
  private getProvidersByService(serviceType: string): Provider[] {
    return sampleProviders.filter(provider => provider.service === serviceType);
  }

  // Analyze uploaded image for beauty service matching
  private analyzeBeautyImage(imageUri?: string): { service: string | null; description: string } {
    if (!imageUri) return { service: null, description: '' };

    // In a real app, this would use image recognition AI
    // For now, we'll return a placeholder that shows the feature works
    return {
      service: null,
      description: 'I can see your inspiration photo! Based on the image, I can help you find the perfect provider.'
    };
  }

  // Generate context-aware response
  public async generateResponse(userMessage: string, imageUri?: string): Promise<ChatMessage> {
    const intent = this.extractIntent(userMessage);
    let serviceType = this.extractServiceType(userMessage);
    let imageAnalysis = '';

    // Analyze image if provided
    if (imageUri) {
      const analysis = this.analyzeBeautyImage(imageUri);
      imageAnalysis = analysis.description;
      if (analysis.service && !serviceType) {
        serviceType = analysis.service;
      }
    }

    // Update conversation context
    if (serviceType) {
      this.conversationContext.servicePreference = serviceType;
    }
    this.conversationContext.currentIntent = intent as any;

    let responseText = '';
    let suggestions: ChatSuggestion[] = [];
    let providerRecommendations: Provider[] = [];

    // Handle image upload
    if (imageUri && imageAnalysis) {
      responseText = imageAnalysis + '\n\n';

      // If we detected a service from the image, show providers
      if (serviceType) {
        const providers = this.getProvidersByService(serviceType);
        providerRecommendations = providers;
        responseText += `I can see you're interested in ${serviceType.toLowerCase()} services. Here are our best providers who can achieve this look:\n\n`;
        providers.slice(0, 3).forEach((provider, index) => {
          responseText += `${index + 1}. ${provider.name}\n`;
        });
      } else {
        responseText += `What kind of service are you looking for? Hair, nails, makeup, or something else?`;
        suggestions = [
          {
            id: 'hair',
            text: 'Hair',
            action: 'message',
            data: { message: 'This is for hair' }
          },
          {
            id: 'nails',
            text: 'Nails',
            action: 'message',
            data: { message: 'This is for nails' }
          },
          {
            id: 'makeup',
            text: 'Makeup',
            action: 'message',
            data: { message: 'This is for makeup' }
          }
        ];
      }
    }
    // Generate response based on intent and service type
    else if (intent === 'book' && serviceType) {
      const providers = this.getProvidersByService(serviceType);
      providerRecommendations = providers;

      responseText = `I found ${providers.length} amazing ${serviceType.toLowerCase()} ${providers.length === 1 ? 'provider' : 'providers'} for you! `;

      if (providers.length > 0) {
        responseText += `Here are some top recommendations:\n\n`;
        providers.slice(0, 3).forEach((provider, index) => {
          responseText += `${index + 1}. ${provider.name}\n`;
        });
        responseText += `\nTap on any provider to view their profile and book an appointment.`;

        suggestions = [
          {
            id: 'see-reviews',
            text: 'See Reviews',
            action: 'message',
            data: { message: `Show me reviews for ${serviceType.toLowerCase()} providers` }
          },
          {
            id: 'compare-prices',
            text: 'Compare Prices',
            action: 'message',
            data: { message: `What are the prices for ${serviceType.toLowerCase()} services?` }
          },
          {
            id: 'view-all',
            text: 'View All',
            action: 'message',
            data: { message: `Show me all ${serviceType.toLowerCase()} providers` }
          },
          {
            id: 'bookings',
            text: 'My Bookings',
            action: 'navigate',
            data: { screen: 'Bookings' }
          }
        ];
      } else {
        responseText += `Unfortunately, we don't have any ${serviceType.toLowerCase()} providers available right now. Would you like to explore other services?`;
      }

    } else if (intent === 'search' && serviceType) {
      const providers = this.getProvidersByService(serviceType);
      providerRecommendations = providers;

      responseText = `Perfect! I can help you find the best ${serviceType.toLowerCase()} services. `;
      responseText += `We have ${providers.length} talented ${providers.length === 1 ? 'provider' : 'providers'} specializing in ${serviceType.toLowerCase()}.\n\n`;

      if (providers.length > 0) {
        responseText += `Here are your options:\n\n`;
        providers.forEach((provider, index) => {
          responseText += `${index + 1}. ${provider.name}\n`;
        });
        responseText += `\nTap on any provider to view their profile and book.`;

        suggestions = [
          {
            id: 'filter-nearby',
            text: 'Show Nearby Only',
            action: 'message',
            data: { message: `Show me ${serviceType.toLowerCase()} providers near me` }
          },
          {
            id: 'check-availability',
            text: 'Check Availability',
            action: 'message',
            data: { message: 'When are these providers available?' }
          },
          {
            id: 'browse-other',
            text: 'Browse Other Services',
            action: 'message',
            data: { message: 'Show me all services' }
          }
        ];
      }

    } else if (intent === 'browse') {
      responseText = `I'd love to help you discover amazing beauty services! We offer:\n\n`;
      responseText += `💅 Nails - Manicures, pedicures & nail art\n`;
      responseText += `💇 Hair - Cuts, color & styling\n`;
      responseText += `👁️ Lashes - Extensions & lifts\n`;
      responseText += `🎨 Brows - Shaping & microblading\n`;
      responseText += `💄 Makeup - Glam & special occasions\n`;
      responseText += `✨ Aesthetics - Facials & skincare\n\n`;
      responseText += `What service are you interested in?`;

      // Get sample providers for each service to show their logos
      const nailsProvider = sampleProviders.find(p => p.service === 'NAILS');
      const hairProvider = sampleProviders.find(p => p.service === 'HAIR');
      const muaProvider = sampleProviders.find(p => p.service === 'MUA');
      const lashesProvider = sampleProviders.find(p => p.service === 'LASHES');
      const browsProvider = sampleProviders.find(p => p.service === 'BROWS');
      const aestheticsProvider = sampleProviders.find(p => p.service === 'AESTHETICS');

      suggestions = [
        {
          id: 'explore-nails',
          text: 'Nails',
          action: 'message',
          data: { message: 'Show me nail services' },
          icon: nailsProvider?.logo,
          serviceType: 'NAILS'
        },
        {
          id: 'explore-hair',
          text: 'Hair',
          action: 'message',
          data: { message: 'I need a hairstylist' },
          icon: hairProvider?.logo,
          serviceType: 'HAIR'
        },
        {
          id: 'explore-lashes',
          text: 'Lashes',
          action: 'message',
          data: { message: 'I want lash extensions' },
          icon: lashesProvider?.logo,
          serviceType: 'LASHES'
        },
        {
          id: 'explore-brows',
          text: 'Brows',
          action: 'message',
          data: { message: 'Looking for brow services' },
          icon: browsProvider?.logo,
          serviceType: 'BROWS'
        },
        {
          id: 'explore-makeup',
          text: 'Makeup',
          action: 'message',
          data: { message: 'Looking for makeup artist' },
          icon: muaProvider?.logo,
          serviceType: 'MUA'
        },
        {
          id: 'explore-aesthetics',
          text: 'Aesthetics',
          action: 'message',
          data: { message: 'Show me aesthetic services' },
          icon: aestheticsProvider?.logo,
          serviceType: 'AESTHETICS'
        }
      ];

    } else if (intent === 'info') {
      responseText = `I'm Becca, your personal beauty assistant! 💜\n\n`;
      responseText += `I can help you:\n`;
      responseText += `• Find the perfect beauty provider\n`;
      responseText += `• Book appointments\n`;
      responseText += `• Discover new services\n`;
      responseText += `• Manage your bookings\n\n`;
      responseText += `Just tell me what you're looking for, like "I need a manicure" or "Find me a hair stylist"`;

      suggestions = [
        {
          id: 'browse-all',
          text: 'Browse Services',
          action: 'message',
          data: { message: 'Show me all services' }
        },
        {
          id: 'find-nearby',
          text: 'Find Nearby',
          action: 'message',
          data: { message: 'Find beauty services near me' }
        },
        {
          id: 'my-bookings',
          text: 'My Bookings',
          action: 'navigate',
          data: { screen: 'Bookings' }
        }
      ];

    }
    // Handle "find services near me" queries
    else if (userMessage.toLowerCase().match(/\b(near me|nearby|close|location|around here)\b/i)) {
      responseText = `I can help you find beauty services near your location! 📍\n\n`;
      responseText += `Here are all available providers in your area:\n\n`;

      // Show all providers as if they're "nearby"
      providerRecommendations = sampleProviders;
      sampleProviders.forEach((provider, index) => {
        responseText += `${index + 1}. ${provider.name} - ${provider.service}\n`;
      });
      responseText += `\nTap on any provider to view their profile, location, and book.`;

      suggestions = [
        {
          id: 'filter-service',
          text: 'Filter by Service',
          action: 'message',
          data: { message: 'Show me all services' }
        },
        {
          id: 'sort-rating',
          text: 'Sort by Rating',
          action: 'message',
          data: { message: 'Show me top-rated providers' }
        },
        {
          id: 'available-today',
          text: 'Available Today',
          action: 'message',
          data: { message: 'Who is available today?' }
        }
      ];

    } else {
      // Default greeting or general response
      responseText = `Hi! I'm Becca, your beauty booking assistant! 💜\n\n`;
      responseText += `I can help you find and book amazing beauty services. What are you looking for today?`;

      const hairProvider = sampleProviders.find(p => p.service === 'HAIR');
      const nailsProvider = sampleProviders.find(p => p.service === 'NAILS');
      const muaProvider = sampleProviders.find(p => p.service === 'MUA');

      suggestions = [
        {
          id: 'hair',
          text: 'Hair',
          action: 'message',
          data: { message: 'I need hair services' },
          icon: hairProvider?.logo,
          serviceType: 'HAIR'
        },
        {
          id: 'nails',
          text: 'Nails',
          action: 'message',
          data: { message: 'I want a manicure' },
          icon: nailsProvider?.logo,
          serviceType: 'NAILS'
        },
        {
          id: 'browse',
          text: 'Browse All',
          action: 'message',
          data: { message: 'Show me all services' }
        }
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
    if (imageAnalysis) {
      message.imageAnalysis = imageAnalysis;
    }

    return message;
  }

  // Get conversation context
  public getContext(): ConversationContext {
    return this.conversationContext;
  }

  // Reset conversation
  public resetConversation(): void {
    this.conversationContext = {};
  }

  // Get quick action suggestions
  public getQuickActions(): ChatSuggestion[] {
    return [
      {
        id: 'book-appointment',
        text: 'Book Appointment',
        action: 'message',
        data: { message: 'I want to book an appointment' }
      },
      {
        id: 'find-services',
        text: 'Find Services',
        action: 'message',
        data: { message: 'Show me all services' }
      },
      {
        id: 'my-bookings',
        text: 'My Bookings',
        action: 'navigate',
        data: { screen: 'Bookings' }
      }
    ];
  }
}

export default new AIChatService();

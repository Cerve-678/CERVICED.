# CERVICED - App Overview

## 📱 What is CERVICED?

CERVICED is a mobile application built with **React Native** and **Expo** that connects beauty and wellness service providers with clients. The platform allows users to browse services, book appointments, manage their bookings, and communicate with service providers through an AI-powered chat assistant.

---

## 🎯 Core Features

### For Clients
- **Browse Providers** - View available beauty and wellness professionals
- **Search & Filters** - Find providers by service type, location, rating, and price
- **Provider Profiles** - View detailed provider information, services, portfolio, reviews, and availability
- **Booking System** - Schedule appointments with service providers
- **Appointment Management** - View, modify, or cancel bookings
- **Shopping Cart** - Add multiple services before checkout
- **Bookmarks** - Save favorite providers for quick access
- **Reviews & Ratings** - Leave feedback on completed services
- **Notifications** - Receive updates on bookings, reminders, and promotions
- **AI Chat (Becca)** - Get personalized recommendations and app guidance

### For Providers
- **Business Profile** - Create and manage a professional service provider profile
- **Service Management** - Add, edit, and update service offerings with pricing
- **Portfolio** - Showcase work through photos and portfolio items
- **Availability Management** - Set working hours and book-able time slots
- **Booking Dashboard** - View and manage client appointments
- **Earnings Tracking** - Monitor revenue and payment history
- **Client Management** - View client details and communication history

---

## 🏗️ Technical Architecture

### Tech Stack
- **Framework**: Expo (React Native wrapper for iOS/Android)
- **Routing**: Expo Router (file-based routing)
- **State Management**: Zustand (bookmark store), Context API (auth, cart, booking, theme)
- **Backend**: Supabase (PostgreSQL database + authentication)
- **Storage**: AsyncStorage (local user preferences), File storage (avatars, logos, portfolios)
- **UI Styling**: NativeWind (Tailwind CSS for React Native)
- **Navigation**: React Navigation (stacks inside tabs)
- **Type Safety**: TypeScript

### Project Structure
```
src/
├── components/        # Reusable UI components
├── constants/         # App constants and configuration
├── contexts/          # React Context providers (Auth, Cart, Booking, Theme, Font, Registration)
├── data/              # Static data and mock data
├── navigation/        # Navigation configuration
├── screens/           # Screen components for different pages
├── services/          # API and external service integration
├── stores/            # Zustand state stores
├── tests/             # Unit and integration tests
├── theme/             # Theme configuration and colors
├── types/             # TypeScript interfaces and types
└── utils/             # Utility functions and helpers
```

---

## 🗄️ Database Structure

The app uses **14 main database tables**:

### User & Authentication
- **users** - All user accounts (clients and providers)
- **user_preferences** - User settings (notifications, theme)

### Provider Management
- **providers** - Business profiles for service providers
- **services** - Services offered by each provider
- **portfolios** - Photos/portfolio items of provider's work
- **availability** - Provider's available time slots

### Booking & Payments
- **bookings** - Appointments/reservations
- **payments** - Payment records
- **cart_items** - Temporary shopping cart items
- **earnings** - Provider revenue tracking

### Social & Content
- **reviews** - Customer ratings and comments
- **bookmarks** - User's saved/favorited providers
- **notifications** - System messages and alerts
- **chat_messages** - AI chat conversation history

### File Storage
- **avatars/** - User profile photos
- **logos/** - Provider business logos
- **portfolios/** - Provider work images

---

## 🧭 Navigation Structure

The app uses **Expo Router** with a **hybrid navigation approach**:

```
(Tabs)
├── Home - Browse featured providers
├── Explore - Browse all portfolio items
├── Becca (AI Chat) - AI assistant for recommendations
├── Cart - Shopping cart and checkout
└── Profile - User account management

Home Tab Stack:
├── HomeScreen
├── ProviderProfileScreen
├── EventDetailScreen
├── BookingsScreen

Explore Tab Stack:
├── ExploreScreen
├── EventDetailScreen

Profile Tab Stack:
├── UserProfileScreen
├── BookmarkedProvidersScreen
├── BookingDetailScreen
└── (Provider-only) ProviderMyProfileScreen
```

---

## 🔐 Authentication & User Roles

The app supports **two user roles**:

### Client
- Browse and book services
- Manage personal bookings and preferences
- Save favorite providers
- Leave reviews and ratings

### Provider
- Create and manage business profile
- Add services and set pricing
- Manage availability and bookings
- Track earnings and revenue

---

## 🎨 UI/UX Features

- **Modern Design** - Clean, contemporary interface with smooth animations
- **Responsive Layout** - Adapts to different screen sizes and orientations
- **Dark/Light Theme** - Theme toggle support for user preference
- **Custom Fonts** - Jura and Bakbak One fonts for distinctive branding
- **Icon Library** - Comprehensive set of SVG icons for navigation and features
- **Liquid Glass Cards** - Modern glassmorphism card design for iOS
- **Safe Area Handling** - Proper handling of notches and safe areas on all devices

---

## 🔄 State Management Flow

```
App Level:
├── AuthProvider (user authentication & login state)
├── ThemeProvi
|er (dark/light mode)
├── FontProvider (font loading)
└── SafeAreaProvider (safe area context)

Feature Level:
├── CartProvider (shopping cart management)
├── BookingProvider (booking state)
├── RegistrationProvider (signup form state)
└── BookmarkStore (Zustand - saved providers)
```

---

## 📦 Key Dependencies

### Navigation & UI
- `@react-navigation/native-stack` - Stack navigation
- `@react-navigation/bottom-tabs` - Tab navigation
- `expo-router` - File-based routing
- `react-native-safe-area-context` - Safe area handling

### Data & Storage
- `@supabase/supabase-js` - Backend database
- `@react-native-async-storage/async-storage` - Local storage
- `zustand` - State management store

### Utilities & Effects
- `expo-font` - Custom font loading
- `expo-image-picker` - Image selection
- `expo-location` - Location services
- `react-error-boundary` - Error handling
- `axios` - HTTP requests

### Development
- `typescript` - Type safety
- `tailwindcss` - Styling framework
- `jest` - Testing framework
- `prettier` - Code formatting
- `eslint` - Code linting

---

## 🚀 Build & Deployment

### Available Scripts
```bash
npm start         # Start development server
npm run ios       # Run on iOS simulator
npm run android   # Run on Android simulator/device
npm run build:ios # Build for iOS
npm run android   # Build for Android
npm run web       # Run web version (if available)
npm test          # Run tests
npm run lint      # Check code quality
npm run format    # Format code with Prettier
```

### Platform Support
- ✅ iOS (iOS 13+)
- ✅ Android (Android 6+)
- 🌐 Web (via Expo web)

---

## 🔗 Related Documentation

- [Database Requirements](./DATABASE_REQUIREMENTS_SIMPLE.md) - Detailed database schema
- [Supabase Integration Guide](./SUPABASE_INTEGRATION_GUIDE.md) - Backend setup
- [Navigation Migration Plan](./NAVIGATION_MIGRATION_PLAN.md) - Navigation implementation details
- [Final Status](./FINAL_STATUS.md) - Current project status and iOS liquid glass effects
- [Building Guide](./BUILD_BOTH_PLATFORMS.md) - Build instructions
- [Debugging Guide](./DEBUGGING_GUIDE.md) - Troubleshooting tips

---

## 📝 Notes

- The app uses **Expo**, not bare React Native, for easier development and faster updates
- All sensitive credentials should be stored in environment variables
- The database requires proper Supabase setup with RLS (Row Level Security) policies
- Error boundary is implemented for graceful error handling
- Type checking with TypeScript is recommended before builds

---

**Last Updated**: February 24, 2026

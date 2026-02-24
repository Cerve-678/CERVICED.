# Supabase Integration Guide

## Overview
This document outlines all screens in MyApp that require Supabase backend integration and what database tables/features each screen needs.

---

## 🔐 Authentication Screens (6 screens)

### 1. WelcomeScreen.tsx
**Backend needed:** ❌ None (navigation only)

### 2. LoginScreen.tsx ✅
**Supabase needs:**
- `supabase.auth.signInWithPassword()` - Email/password login
- `supabase.auth.signInWithOAuth()` - Google/Apple login
- Session management

### 3. SignUpStep1Screen.tsx ✅
### 4. SignUpStep2Screen.tsx ✅
### 5. SignUpStep3Screen.tsx ✅
### 6. SignUpStep4Screen.tsx ✅
**Supabase needs:**
- `supabase.auth.signUp()` - Create user account
- `users` table - Store profile info (name, phone, preferences)
- `providers` table - If signing up as provider
- Role-based access control

---

## 🏠 Client Screens (9 screens)

### 7. HomeScreen.tsx ✅
**Supabase needs:**
- `portfolios` table - Get featured portfolio items
- `providers` table - Get featured providers
- `categories` table - Service categories
- **Real-time subscriptions:** New provider updates
- Personalized recommendations based on user preferences

**API Calls:**
```typescript
// Get featured providers
const { data: providers } = await supabase
  .from('providers')
  .select('*')
  .eq('featured', true)
  .order('rating', { ascending: false });

// Get recent portfolio items
const { data: portfolio } = await supabase
  .from('portfolios')
  .select('*, providers(*)')
  .order('created_at', { ascending: false })
  .limit(20);
```

### 8. ExploreScreen.tsx ✅
**Supabase needs:**
- `portfolios` table - Browse all portfolio items
- `providers` table - Filter by provider
- `categories` table - Filter by category (Hair, Nails, MUA, Lashes, Brows, Aesthetics)
- Pagination for infinite scroll
- Search functionality across portfolios

**API Calls:**
```typescript
// Get portfolio by category
const { data } = await supabase
  .from('portfolios')
  .select('*, providers(*)')
  .eq('category', selectedCategory)
  .range(offset, offset + limit);

// Search portfolios
const { data } = await supabase
  .from('portfolios')
  .select('*, providers(*)')
  .textSearch('tags', searchQuery);
```

### 9. SearchScreen.tsx ✅
**Supabase needs:**
- Full-text search on `providers` table
- Filter by:
  - Location (geolocation)
  - Service type
  - Rating (minimum rating filter)
  - Price range
  - Availability
- Search history storage in `user_searches` table
- Recent searches

**API Calls:**
```typescript
// Search providers
const { data } = await supabase
  .from('providers')
  .select('*, services(*)')
  .textSearch('fts', searchQuery)
  .gte('rating', minRating)
  .order('rating', { ascending: false });
```

### 10. ProviderProfileScreen.tsx ✅
**Supabase needs:**
- `providers` table - Provider details (name, bio, location, rating, etc.)
- `services` table - Available services with pricing and duration
- `reviews` table - Customer reviews with ratings
- `portfolios` table - Provider's work gallery
- `availability` table - Booking slots (available times)
- `bookmarks` table - User favorites/bookmarks
- Add to cart functionality
- Share provider profile

**API Calls:**
```typescript
// Get provider profile
const { data: provider } = await supabase
  .from('providers')
  .select(`
    *,
    services(*),
    portfolios(*),
    reviews(*, users(name, avatar)),
    availability(*)
  `)
  .eq('id', providerId)
  .single();

// Toggle bookmark
const { data } = await supabase
  .from('bookmarks')
  .upsert({ user_id: userId, provider_id: providerId });
```

### 11. BookingsScreen.tsx ✅
**Supabase needs:**
- `bookings` table - User's appointments (past & upcoming)
- Filter by status: `pending`, `confirmed`, `completed`, `cancelled`
- Sort by date
- **Real-time subscriptions:** Booking status updates
- Cancel/reschedule bookings
- View booking details
- Re-book past services

**API Calls:**
```typescript
// Get user bookings
const { data: bookings } = await supabase
  .from('bookings')
  .select(`
    *,
    providers(name, logo),
    services(name, duration, price)
  `)
  .eq('user_id', userId)
  .order('date_time', { ascending: false });

// Real-time subscription
const subscription = supabase
  .channel('bookings')
  .on('postgres_changes', 
    { event: '*', schema: 'public', table: 'bookings' },
    handleBookingUpdate
  )
  .subscribe();
```

### 12. CartScreen.tsx ✅
**Supabase needs:**
- `cart_items` table - Temporary cart storage (persist across sessions)
- `bookings` table - Create booking on checkout
- `payments` table - Process deposits and payments
- Availability validation before checkout
- Calculate totals, deposits, and remaining balance
- Remove items from cart
- Apply promo codes (optional)

**API Calls:**
```typescript
// Get cart items
const { data: cartItems } = await supabase
  .from('cart_items')
  .select(`
    *,
    services(*),
    providers(name, logo)
  `)
  .eq('user_id', userId);

// Create booking from cart
const { data } = await supabase
  .from('bookings')
  .insert(bookingsData);

// Clear cart after checkout
await supabase
  .from('cart_items')
  .delete()
  .eq('user_id', userId);
```

### 13. BookmarkedProvidersScreen.tsx ✅
**Supabase needs:**
- `bookmarks` table - User's saved/favorited providers
- Join with `providers` table for full details
- Remove bookmarks
- Quick navigation to provider profiles

**API Calls:**
```typescript
// Get bookmarked providers
const { data: bookmarks } = await supabase
  .from('bookmarks')
  .select(`
    *,
    providers(*)
  `)
  .eq('user_id', userId)
  .order('created_at', { ascending: false });
```

### 14. NotificationsScreen.tsx ✅
**Supabase needs:**
- `notifications` table - System notifications (booking confirmations, reminders, promotions)
- Mark as read/unread
- Delete notifications
- Filter by type
- **Real-time subscriptions:** Push notification updates
- Integration with Expo Push Notifications

**API Calls:**
```typescript
// Get notifications
const { data: notifications } = await supabase
  .from('notifications')
  .select('*')
  .eq('user_id', userId)
  .order('created_at', { ascending: false });

// Mark as read
await supabase
  .from('notifications')
  .update({ read: true })
  .eq('id', notificationId);
```

### 15. UserProfileScreen.tsx ✅
**Supabase needs:**
- `users` table - Update profile (name, email, phone, bio, avatar)
- `user_preferences` table - App settings (notifications, theme, etc.)
- Storage bucket - Profile photo upload
- Change password
- Delete account
- View booking history
- View saved payment methods

**API Calls:**
```typescript
// Update user profile
const { data } = await supabase
  .from('users')
  .update({ name, phone, bio })
  .eq('id', userId);

// Upload profile photo
const { data: fileData } = await supabase.storage
  .from('avatars')
  .upload(`${userId}/avatar.jpg`, photoFile);

// Update password
await supabase.auth.updateUser({ password: newPassword });
```

---

## 💼 Provider Screens (4 screens)

### 16. ProviderHomeScreen.tsx ✅
**Supabase needs:**
- `bookings` table - Provider's appointments (today, upcoming, past)
- `earnings` table - Revenue analytics and insights
- `reviews` table - Recent reviews from clients
- **Real-time subscriptions:** New booking notifications
- Dashboard statistics (total bookings, revenue, ratings)
- Quick actions (accept/decline bookings)

**API Calls:**
```typescript
// Get provider bookings
const { data: bookings } = await supabase
  .from('bookings')
  .select(`
    *,
    users(name, avatar),
    services(name, price)
  `)
  .eq('provider_id', providerId)
  .order('date_time', { ascending: true });

// Get earnings summary
const { data: earnings } = await supabase
  .from('bookings')
  .select('total_price')
  .eq('provider_id', providerId)
  .eq('status', 'completed')
  .gte('created_at', startDate);
```

### 17. ProviderMyProfileScreen.tsx ✅
**Supabase needs:**
- `providers` table - Update business profile (name, bio, location, contact)
- `services` table - Add/edit/delete services (CRUD operations)
- `portfolios` table - Manage portfolio items (add/delete images)
- `availability` table - Set working hours and days off
- Storage bucket - Upload portfolio images and business logo
- Update categories and specialties
- Manage team members (optional)

**API Calls:**
```typescript
// Update provider profile
const { data } = await supabase
  .from('providers')
  .update({ name, bio, location, specialties })
  .eq('id', providerId);

// Add service
await supabase
  .from('services')
  .insert({ provider_id: providerId, name, price, duration });

// Upload portfolio image
const { data: fileData } = await supabase.storage
  .from('portfolios')
  .upload(`${providerId}/${imageId}.jpg`, imageFile);

await supabase
  .from('portfolios')
  .insert({ provider_id: providerId, image_url: fileData.path, caption, category });
```

### 18. ProviderBookingDetailScreen.tsx ✅
**Supabase needs:**
- `bookings` table - Detailed booking information
- Update booking status: `accept`, `decline`, `complete`, `cancel`
- `users` table - Client information
- `services` table - Service details
- **Real-time subscriptions:** Client messages/updates
- Add notes to booking
- Contact client (phone/email)

**API Calls:**
```typescript
// Get booking details
const { data: booking } = await supabase
  .from('bookings')
  .select(`
    *,
    users(name, phone, email, avatar),
    services(name, duration, price),
    providers(name)
  `)
  .eq('id', bookingId)
  .single();

// Update booking status
await supabase
  .from('bookings')
  .update({ status: 'confirmed' })
  .eq('id', bookingId);
```

### 19. InfoRegScreen.tsx ✅
**Supabase needs:**
- `providers` table - Create new provider profile
- `services` table - Add initial services
- `categories` table - Select business categories
- Storage bucket - Upload logo and initial portfolio images
- Verification status (pending approval)

**API Calls:**
```typescript
// Create provider profile
const { data: provider } = await supabase
  .from('providers')
  .insert({
    user_id: userId,
    name: businessName,
    bio,
    location,
    categories,
    logo_url: logoUrl
  })
  .select()
  .single();

// Add initial services
await supabase
  .from('services')
  .insert(servicesArray.map(s => ({ ...s, provider_id: provider.id })));
```

---

## 🎨 Other Screens

### 20. EventDetailScreen.tsx ✅
**Supabase needs:**
- `portfolios` table - Portfolio item details (image, caption, category, tags)
- `providers` table - Provider info for that item
- Like/save functionality
- Share portfolio item
- Navigate to provider profile
- View similar work

**API Calls:**
```typescript
// Get portfolio item
const { data: portfolioItem } = await supabase
  .from('portfolios')
  .select(`
    *,
    providers(*)
  `)
  .eq('id', portfolioId)
  .single();
```

### 21. BeccaScreen.tsx ✅
**AI Chat interface with chat history**

**Supabase needs:**
- `chat_messages` table - Store conversation history
- OpenAI API integration (separate service)
- Load previous conversations
- Search through chat history
- Delete conversations

**API Calls:**
```typescript
// Save chat message
await supabase
  .from('chat_messages')
  .insert({
    user_id: userId,
    message,
    response,
    timestamp: new Date(),
    conversation_id: conversationId
  });

// Get chat history
const { data: history } = await supabase
  .from('chat_messages')
  .select('*')
  .eq('user_id', userId)
  .order('timestamp', { ascending: true });
```

### 22. DevSettingsScreen.tsx
**Backend needed:** ❌ None (dev tools only)

---

## 📊 Summary

| Category | Total Screens | Need Supabase | Don't Need Backend |
|----------|--------------|---------------|-------------------|
| **Authentication** | 6 | 5 | 1 |
| **Client Screens** | 9 | 9 | 0 |
| **Provider Screens** | 4 | 4 | 0 |
| **Other** | 3 | 2 | 1 |
| **TOTAL** | **22** | **20** | **2** |

---

## 🔥 Implementation Priority

### Phase 1 - Critical (Must Have)
**Goal:** Basic authentication and booking flow

1. **Authentication System**
   - LoginScreen
   - SignUpScreens (all 4 steps)
   - Session management

2. **Core Tables**
   - `users` table
   - `providers` table
   - `services` table
   - `bookings` table

3. **Essential Screens**
   - HomeScreen (browse providers)
   - ProviderProfileScreen (view details)
   - CartScreen (checkout)
   - BookingsScreen (view appointments)

### Phase 2 - Core Features
**Goal:** Complete user experience

4. **Discovery & Engagement**
   - ExploreScreen (portfolio browsing)
   - SearchScreen (find providers)
   - `portfolios` table
   - `reviews` table

5. **User Preferences**
   - BookmarkedProvidersScreen
   - UserProfileScreen
   - `bookmarks` table

6. **Provider Management**
   - ProviderHomeScreen (dashboard)
   - ProviderMyProfileScreen (edit profile)
   - ProviderBookingDetailScreen
   - `availability` table

### Phase 3 - Enhanced Features
**Goal:** Professional platform features

7. **Communication & Notifications**
   - NotificationsScreen
   - `notifications` table
   - Push notifications integration
   - Real-time updates

8. **Payments & Analytics**
   - `payments` table
   - `earnings` table
   - Payment processing (Stripe/PayPal integration)

9. **Communication Features**
   - BeccaScreen (AI chat with history)
   - `chat_messages` table
   - OpenAI API integration

10. **Advanced Features**
   - Full-text search optimization
   - Geolocation search
   - Provider verification system
   - Review moderation

---

## 🗄️ Database Schema Overview

### Core Tables Needed:

1. **users** - User accounts (both clients and providers)
2. **providers** - Provider business profiles
3. **services** - Services offered by providers
4. **portfolios** - Provider work gallery
5. **bookings** - Appointments/reservations
6. **reviews** - Customer feedback
7. **bookmarks** - User favorites
8. **cart_items** - Shopping cart
9. **notifications** - System notifications
10. **availability** - Provider schedules
11. **categories** - Service categories
12. **payments** - Payment records
13. **earnings** - Provider revenue tracking
14. **user_preferences** - App settings
16. **chat_messages** - AI chat history and conversations

### Storage Buckets Needed:

1. **avatars** - User profile photos
2. **logos** - Provider business logos
3. **portfolios** - Provider portfolio images

---

## 🚀 Next Steps

1. **Set up Supabase project** at https://supabase.com
2. **Create database schema** (SQL migration scripts)
3. **Set up authentication** (email, OAuth providers)
4. **Configure storage buckets** (file uploads)
5. **Install Supabase client** in the app
6. **Migrate mock data** to real API calls
7. **Set up real-time subscriptions** (for bookings, notifications)
8. **Configure Row Level Security (RLS)** for data protection

---

## 📝 Notes

- All screens currently use mock data from `src/data/` files
- API service layer already exists in `src/services/api.ts` - ready to integrate
- Real-time features are crucial for bookings and notifications
- Image uploads will require storage bucket configuration
- Consider implementing caching strategy for better performance
- Row Level Security (RLS) is essential for multi-tenant data isolation

---

**Last Updated:** February 24, 2026

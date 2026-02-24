# CERVICED App Logic

## Overview

CERVICED is a beauty & wellness marketplace connecting clients with providers. This document outlines every core logic flow in the application.

---

## 1. Authentication Logic

### Login Flow

```
User opens app
  → WelcomeScreen displayed
  → User taps "Log In"
  → LoginScreen: enters email + password
  → AuthContext.login(email, password)
    → Validate inputs (non-empty, valid email format)
    → Send credentials to auth service
    → On success: store session in AsyncStorage, set user state
    → On failure: display error message
  → Navigate to HomeScreen (client) or ProviderHomeScreen (provider)
```

### Sign-Up Flow (4 Steps)

```
Step 1 - SignUpStep1Screen:
  → User enters: first name, last name, email, password
  → Validation: all fields required, email format, password strength
  → Data stored in RegistrationContext

Step 2 - SignUpStep2Screen:
  → User enters: phone number, date of birth
  → Validation: phone format, age verification (must be 16+)
  → Data stored in RegistrationContext

Step 3 - SignUpStep3Screen:
  → User selects: account type ("user" or "provider")
  → If provider: additional business details collected
  → Data stored in RegistrationContext

Step 4 - SignUpStep4Screen:
  → User reviews all entered information
  → Accepts terms & conditions
  → AuthContext.register(registrationData)
    → Create account in auth system
    → Create user profile record
    → Auto-login on success
  → Navigate to HomeScreen or ProviderHomeScreen
```

### Session Persistence

```
App launch
  → AuthContext checks AsyncStorage for existing session
  → If valid session exists: auto-login, navigate to main app
  → If no session / expired: navigate to WelcomeScreen
```

### Role-Based Routing

```
After authentication:
  → If user.accountType === "user"  → Client TabNavigator (Home, Explore, Cart, Becca, Profile)
  → If user.accountType === "provider" → Provider TabNavigator (Home, Services, Bookings, Profile)
```

---

## 2. Home Feed & Personalization Logic

### Feed Generation

```
HomeScreen loads
  → userLearningService.getPersonalizedFeed(userId)
  → Scoring Algorithm computes relevance per provider:

    TOTAL SCORE = (0.4 * categoryScore)
                + (0.3 * providerScore)
                + (0.1 * timeScore)
                + (0.2 * recencyScore)

    Where:
      categoryScore  = weighted sum of interactions per service category
      providerScore  = weighted sum of interactions per provider
      timeScore      = match between current time and user's typical browsing times
      recencyScore   = decay function favoring recent interactions

  → Sort providers by total score descending
  → Return sections:
      "YOUR PROVIDERS"      → Top scored providers user has interacted with
      "RECOMMENDED FOR YOU" → High scored providers user hasn't visited
      "CURRENT OFFERS"      → Promotions ranked by relevance score
```

### Interaction Tracking

```
Every user action is logged with a weight:
  VIEW        (weight 1)  → User views a provider profile
  SEARCH      (weight 2)  → User searches/selects a service category
  OFFER_VIEW  (weight 3)  → User views a promotion or deal
  FAVORITE    (weight 5)  → User bookmarks a provider
  BOOK        (weight 10) → User completes a booking

Storage: interactions stored locally via AsyncStorage
         (future: sync to user_preferences table in Supabase)
```

---

## 3. Search & Discovery Logic

### Search Flow

```
User taps search bar → SearchScreen
  → User types query
  → Real-time filtering:
      1. Match provider name (case-insensitive partial match)
      2. Match service names within providers
      3. Match service categories
  → Results displayed as provider cards
```

### Filter Logic

```
User taps filter icon → FilterModal opens
  → Available filters:
      - Service Category (nails, hair, makeup, lashes, brows, aesthetics)
      - Location / Distance radius
      - Price Range (min - max)
      - Rating (minimum star rating)
      - Availability (date/time)

  → Apply filters:
      filteredProviders = allProviders
        .filter(matchesCategory)
        .filter(withinDistance)
        .filter(withinPriceRange)
        .filter(meetsMinRating)
        .filter(hasAvailability)

  → Sort options: relevance, rating, price (low-high), price (high-low), distance
```

### Explore / Portfolio Browsing

```
ExploreScreen loads
  → Display MasonryGrid of portfolio images from all providers
  → User taps image → EventDetailScreen (full image + details)
  → User taps provider name → ProviderProfileScreen
```

---

## 4. Provider Profile Logic

### Profile Display

```
ProviderProfileScreen(providerId)
  → Load provider data (name, bio, logo, rating, location)
  → Load services list with prices and durations
  → Load portfolio images
  → Load reviews and ratings
  → Track VIEW interaction for personalization
```

### Service Selection

```
User browses provider's services
  → Each service shows: name, description, price, duration, add-ons
  → User taps "Add to Cart"
    → If service has options (e.g., nail shape, hair length):
        → Show options selector
        → User selects options + any add-ons
    → CartContext.addToCart({
        providerId, providerName,
        serviceId, serviceName,
        price, duration,
        selectedOptions, addOns
      })
    → Cart badge updates in tab bar
```

---

## 5. Shopping Cart Logic

### Cart State Management (Reducer Pattern)

```
CartContext uses useReducer with these actions:

ADD_TO_CART:
  → Generate unique ID: `${serviceId}-${instanceId}-${optionsHash}`
  → Group item under its provider
  → If same service already in cart: create new instance (instance numbering)
  → Recalculate totals

REMOVE_FROM_CART:
  → Remove item by unique ID
  → If provider group becomes empty: remove provider group
  → Recalculate totals

UPDATE_QUANTITY:
  → Update item quantity
  → Recalculate totals

CLEAR_CART:
  → Empty all items and provider groups
```

### Price Calculation

```
For each item:
  itemTotal = basePrice + sum(addOn.price for each selected addOn)

For each provider group:
  providerSubtotal = sum(itemTotal for each item in group)

Cart totals:
  subtotal     = sum(providerSubtotal for all providers)
  serviceFee   = max(subtotal * 0.05, 2.00)   // 5% or $2 minimum
  totalAmount  = subtotal + serviceFee
```

### Multi-Provider Support

```
Cart groups items by provider:
  cart = {
    providerGroups: [
      { providerId: "A", providerName: "...", items: [...] },
      { providerId: "B", providerName: "...", items: [...] }
    ]
  }

Each provider group is checked out independently for booking creation
but appears as a single cart to the user.
```

---

## 6. Checkout & Payment Logic

### Pre-Checkout Validation

```
User taps "Checkout" on CartScreen
  → validateBookingsBeforeCheckout()
    → For each cart item:
        1. Check provider still exists
        2. Check service still available
        3. Check selected time slot not already booked (AvailabilityService)
        4. Check no conflicts with user's existing bookings
    → If conflicts found: show error, highlight conflicting items
    → If all valid: proceed to payment
```

### Payment Options

```
Two payment models per provider's settings:

FULL PAYMENT:
  → User pays: subtotal + serviceFee
  → paymentStatus = "PAID_IN_FULL"

DEPOSIT PAYMENT:
  → User pays: (subtotal * 0.20) + serviceFee   // 20% deposit
  → paymentStatus = "DEPOSIT_PAID"
  → Remaining balance due at appointment

Payment breakdown stored:
  paymentBreakdown = {
    subtotal,
    serviceCharge,
    deposit,         // only if deposit model
    remaining,       // only if deposit model
    totalPaid
  }
```

### Booking Creation (Post-Payment)

```
createBookingsFromCart(cartItems, paymentInfo)
  → For each cart item:
      1. Calculate endTime from bookingTime + service duration
         (parse duration string: "1 hour" → 60min, "30 minutes" → 30min)
      2. Create ConfirmedBooking object:
         {
           id: generateUniqueId(),
           cartItemId, providerId, providerName,
           serviceId, serviceName, price,
           bookingDate, bookingTime, endTime,
           status: "UPCOMING",
           paymentType, paymentStatus, paymentBreakdown,
           groupBookingId   // shared ID if multi-provider checkout
         }
      3. Save to BookingContext state
      4. Persist to AsyncStorage
      5. Trigger confirmation notification
  → Clear cart
  → Navigate to BookingsScreen
```

---

## 7. Booking Management Logic

### Booking Status Lifecycle

```
UPCOMING → IN_PROGRESS → COMPLETED
    ↓           ↓
 CANCELLED   NO_SHOW

Auto-status updates (runs every 60 seconds):
  → For each booking with status UPCOMING:
      if (currentTime >= bookingStartTime)
        → status = "IN_PROGRESS"
  → For each booking with status IN_PROGRESS:
      if (currentTime >= bookingEndTime)
        → status = "COMPLETED"
```

### Cancellation Logic

```
User taps "Cancel Booking"
  → Check cancellation policy:
      - Free cancellation: > 24 hours before appointment
      - Late cancellation: < 24 hours (may forfeit deposit)
      - No cancellation: < 2 hours before appointment
  → If allowed:
      booking.status = "CANCELLED"
      booking.cancelledAt = now
      Trigger refund if applicable
      Send cancellation notification to provider
```

### Reschedule Logic (3-Step Process)

```
STEP 1 - User Requests Reschedule:
  requestReschedule(bookingId, preferredDates[])
    → Validate: no active reschedule request exists
    → Validate: 24-hour cooldown since last reschedule has passed
    → Set:
        booking.isPendingReschedule = true
        booking.rescheduleRequest = {
          status: "PENDING",
          requestedDates: preferredDates,
          requestedAt: now
        }
    → Notify provider of reschedule request

STEP 2 - Provider Responds:
  providerRespondToReschedule(bookingId, availableDates[])
    → Provider selects which of the requested dates work
    → Or proposes alternative dates
    → Set:
        booking.rescheduleRequest.providerAvailableDates = availableDates
        booking.rescheduleRequest.status = "AVAILABLE"
    → Notify user that provider has responded

STEP 3 - User Confirms New Date:
  confirmReschedule(bookingId, newDate, newTime)
    → Calculate new endTime
    → Validate no conflicts with new time slot
    → Update:
        booking.bookingDate = newDate
        booking.bookingTime = newTime
        booking.endTime = newEndTime
        booking.isPendingReschedule = false
        booking.rescheduleCount += 1
        booking.lastRescheduledAt = now
        booking.status = "UPCOMING"
    → Clear reschedule request
    → Start new 24-hour cooldown
    → Send confirmation notifications to both parties
```

---

## 8. Availability & Conflict Detection Logic

### AvailabilityService

```
checkAvailability(providerId, date, startTime, duration):
  → Get provider's working hours for that day of week
  → Get all existing bookings for that provider on that date
  → Calculate requested time range: [startTime, startTime + duration]
  → Check conflicts:
      for each existingBooking:
        if (requestedStart < existingEnd AND requestedEnd > existingStart)
          → CONFLICT DETECTED
  → If no conflicts AND within working hours:
      → return { available: true }
  → Else:
      → return { available: false, reason, nextAvailableSlot }

getAvailableSlots(providerId, date):
  → Get provider's working hours for that date
  → Get all booked slots for that date
  → Generate time slots (e.g., every 30 minutes)
  → Remove slots that overlap with existing bookings
  → Return available slots list
```

---

## 9. Bookmark / Favorites Logic

### Zustand Store (useBookmarkStore)

```
bookmarkProvider(providerId):
  → Add providerId to bookmarks Set
  → Persist to AsyncStorage
  → Track FAVORITE interaction (weight 5) for personalization

unbookmarkProvider(providerId):
  → Remove providerId from bookmarks Set
  → Update AsyncStorage

isBookmarked(providerId):
  → Return bookmarks.has(providerId)

BookmarkedProvidersScreen:
  → Get all bookmarked provider IDs
  → Load full provider data for each
  → Display as scrollable list
```

---

## 10. AI Chat (Becca) Logic

### Chat Flow

```
User opens BeccaScreen
  → Load conversation history from storage
  → Display previous messages

User sends message:
  → Add user message to chat state
  → Display typing indicator
  → aiChatService.sendMessage({
      message: userInput,
      conversationHistory: previousMessages,
      userContext: { preferences, recentBookings, location }
    })
  → API call to OpenAI:
      - Model: GPT-4 (or configured model)
      - System prompt: "You are Becca, a friendly beauty service assistant
        for the CERVICED app. Help users find services, answer beauty
        questions, suggest providers, and assist with bookings."
      - Include conversation history for context
  → Receive AI response
  → Add to chat state with typing animation
  → Persist conversation to storage

Enhanced Features (enhancedAIChatService):
  → Context-aware responses using user's booking history
  → Provider recommendations based on conversation
  → Ability to trigger actions (e.g., "Book this for me")
  → Beauty tips and advice knowledge base
```

---

## 11. Notification Logic

### Notification Types

```
notificationService manages these notification types:

BOOKING_CONFIRMED:
  → Triggered: after successful checkout
  → Content: "Your booking with {provider} on {date} is confirmed"

BOOKING_REMINDER:
  → Triggered: 24 hours and 1 hour before appointment
  → Content: "Reminder: {service} with {provider} tomorrow at {time}"

BOOKING_STATUS_CHANGE:
  → Triggered: when booking status changes
  → Content: varies by new status

RESCHEDULE_REQUEST:
  → Triggered: when user requests reschedule (sent to provider)
  → Content: "{user} wants to reschedule {service} on {date}"

RESCHEDULE_RESPONSE:
  → Triggered: when provider responds to reschedule
  → Content: "{provider} has responded to your reschedule request"

PROMOTION:
  → Triggered: when provider creates a new offer
  → Content: "{provider} has a new offer: {description}"
```

### Notification Display

```
NotificationsScreen:
  → Load all notifications for user
  → Sort by timestamp (newest first)
  → Group by: Today, This Week, Earlier
  → Mark as read on view
  → Tap notification → navigate to relevant screen
```

---

## 12. Theme & UI Logic

### Theme Switching

```
ThemeContext manages:
  - colorScheme: "light" | "dark"
  - toggleTheme()
  - colors: resolved color tokens for current scheme

On toggle:
  → Update colorScheme state
  → Persist preference to AsyncStorage
  → All ThemedView/ThemedText components re-render with new colors

Color resolution:
  light mode → Colors.light.{token}
  dark mode  → Colors.dark.{token}
```

### Responsive Layout

```
PlatformDimensions provides:
  → Screen width/height
  → Safe area insets
  → Platform-specific spacing
  → Font scale adjustments

Components use these to:
  → Adjust grid columns (2 on phone, 3 on tablet)
  → Scale font sizes
  → Adjust padding/margins per platform
```

### iOS Liquid Glass (iOS 26+)

```
Platform check:
  if (Platform.OS === 'ios' && platformVersion >= 26)
    → Use NativeGlassPillTabBar (frosted glass effect)
    → Apply blur effects to headers (StatusBarBlur)
    → Enable haptic feedback
  else
    → Use standard AdaptiveTabBar / MinimalTabBar
```

---

## 13. Image Handling Logic

### Image Loading (ImageLoader)

```
loadImage(uri):
  → Check in-memory cache
  → If cached: return immediately
  → Check disk cache (AsyncStorage)
  → If on disk: load to memory cache, return
  → Download from network
  → Resize/optimize if needed
  → Save to disk cache
  → Save to memory cache
  → Return processed image
```

### Image Upload (UploadService)

```
uploadImage(file, bucket, path):
  → Validate file type (jpg, png, webp)
  → Validate file size (< 5MB)
  → Compress image if needed
  → Generate unique filename
  → Upload to Supabase Storage bucket
  → Return public URL
```

---

## 14. Data Persistence Logic

### Storage Layers

```
Layer 1 - In-Memory State:
  → React Context (Auth, Cart, Booking, Theme)
  → Zustand stores (Bookmarks, Planner, AppState)
  → Fastest access, cleared on app restart

Layer 2 - AsyncStorage (Local):
  → Session token
  → User preferences
  → Bookings data
  → Bookmarks
  → Cart state
  → Chat history
  → Theme preference
  → Persists across app restarts

Layer 3 - Supabase (Remote) [Future]:
  → All user data synced to cloud
  → Provider profiles and services
  → Bookings (source of truth)
  → Payments and transactions
  → Chat messages
  → Reviews and ratings
```

### Data Sync Pattern (Future)

```
On app launch:
  → Load from AsyncStorage (instant)
  → Fetch latest from Supabase (background)
  → Merge: server data takes priority for shared state
  → Update AsyncStorage with fresh data

On data mutation:
  → Update in-memory state (instant UI update)
  → Persist to AsyncStorage (offline support)
  → Sync to Supabase (when online)
  → Handle conflicts with server-wins strategy
```

---

## 15. Navigation Logic

### Stack Structure

```
RootNavigator (Stack)
  ├── Auth Stack
  │   ├── WelcomeScreen
  │   ├── LoginScreen
  │   └── SignUpStep1-4Screens
  │
  ├── Client Tab Navigator
  │   ├── Home Tab (Stack)
  │   │   ├── HomeScreen
  │   │   ├── ProviderProfileScreen
  │   │   └── EventDetailScreen
  │   ├── Explore Tab (Stack)
  │   │   ├── ExploreScreen
  │   │   ├── SearchScreen
  │   │   └── ProviderProfileScreen
  │   ├── Cart Tab (Stack)
  │   │   ├── CartScreen
  │   │   └── CheckoutScreen
  │   ├── Becca Tab (Stack)
  │   │   └── BeccaScreen
  │   └── Profile Tab (Stack)
  │       ├── UserProfileScreen
  │       ├── BookingsScreen
  │       ├── BookmarkedProvidersScreen
  │       └── NotificationsScreen
  │
  └── Provider Tab Navigator
      ├── Provider Home Tab
      │   └── ProviderHomeScreen
      ├── Services Tab
      │   └── ProviderServicesScreen
      ├── Bookings Tab
      │   └── ProviderBookingDetailScreen
      └── Profile Tab
          └── ProviderMyProfileScreen
```

### Deep Linking

```
Navigation params passed between screens:
  HomeScreen → ProviderProfileScreen: { providerId }
  ProviderProfileScreen → EventDetailScreen: { imageId, providerId }
  CartScreen → BookingsScreen: { newBookingId } (after checkout)
  NotificationsScreen → relevant screen: { type, referenceId }
```

---

## 16. Error Handling Logic

### Error Boundary

```
AppWithErrorBoundary wraps entire app:
  → Catches unhandled JS errors
  → Displays fallback error screen
  → Logs error to monitoring service
  → Offers "Retry" button to reload app
```

### Network Error Handling

```
API calls follow this pattern:
  try {
    response = await apiCall()
    if (!response.ok) throw new ApiError(response)
    return response.data
  } catch (error) {
    if (error instanceof NetworkError)
      → Show "No internet connection" toast
      → Queue request for retry when online
    if (error instanceof AuthError)
      → Clear session
      → Navigate to LoginScreen
    if (error instanceof ValidationError)
      → Show field-level error messages
    else
      → Log error
      → Show generic error toast
  }
```

### Form Validation

```
validation.ts provides:
  validateEmail(email)      → regex check + format validation
  validatePassword(pass)    → min 8 chars, uppercase, number, special char
  validatePhone(phone)      → format check
  validateDate(date)        → valid date + age check
  validateRequired(fields)  → non-empty check for required fields

Applied at:
  → Login form (email, password)
  → Registration forms (all steps)
  → Booking date/time selection
  → Profile editing
```

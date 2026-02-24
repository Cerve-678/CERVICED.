# Database Requirements - Simple Version

## Login & Signup Pages

### LoginScreen
**Table: users**
- email
- password (encrypted)
- name
- role (client or provider)

### SignUp Pages (Steps 1-4)
**Table: users**
- email
- password
- name
- phone
- role (client or provider)
- created_at

**Table: providers** (if signing up as provider)
- user_id
- business_name
- location
- bio

---

## Client Pages

### HomeScreen (Browse Providers)
**Table: providers**
- id
- name
- logo
- rating
- location
- featured (yes/no)

**Table: portfolios**
- id
- provider_id
- image_url
- caption
- category (Hair, Nails, etc.)

### ExploreScreen (Browse All Work)
**Table: portfolios**
- id
- provider_id
- image_url
- caption
- category
- tags
- created_at

**Table: providers**
- id
- name
- logo

### SearchScreen (Find Providers)
**Table: providers**
- id
- name
- bio
- location
- rating
- service_types
- price_range

### ProviderProfileScreen (View Provider Details)
**Table: providers**
- id
- name
- logo
- bio
- location
- rating
- years_experience
- specialties

**Table: services**
- id
- provider_id
- name
- price
- duration
- description

**Table: reviews**
- id
- provider_id
- user_id
- rating (1-5)
- comment
- date
- service_name

**Table: portfolios**
- id
- provider_id
- image_url
- caption
- category

**Table: availability**
- id
- provider_id
- date
- time_slot
- is_available (yes/no)

**Table: bookmarks**
- id
- user_id
- provider_id
- created_at

### BookingsScreen (My Appointments)
**Table: bookings**
- id
- user_id
- provider_id
- service_id
- date
- time
- status (pending, confirmed, completed, cancelled)
- total_price
- created_at

**Table: providers** (to show provider name/logo)
- name
- logo

**Table: services** (to show service details)
- name
- duration
- price

### CartScreen (Checkout)
**Table: cart_items**
- id
- user_id
- provider_id
- service_id
- date
- time
- price

**Table: bookings** (create new booking when user checks out)
- user_id
- provider_id
- service_id
- date
- time
- total_price
- deposit_paid
- status

**Table: payments**
- id
- booking_id
- amount
- payment_type (deposit or full)
- payment_date
- payment_method

### BookmarkedProvidersScreen (Saved Favorites)
**Table: bookmarks**
- id
- user_id
- provider_id
- created_at

**Table: providers**
- id
- name
- logo
- rating
- location

### NotificationsScreen
**Table: notifications**
- id
- user_id
- title
- message
- type (booking, reminder, promo)
- read (yes/no)
- created_at

### UserProfileScreen (My Account)
**Table: users**
- id
- name
- email
- phone
- avatar_url
- bio

**Table: user_preferences**
- user_id
- notifications_enabled (yes/no)
- theme (light/dark)

---

## Provider Pages

### ProviderHomeScreen (Provider Dashboard)
**Table: bookings**
- id
- provider_id
- user_id
- service_id
- date
- time
- status
- total_price

**Table: users** (to show client info)
- name
- avatar_url

**Table: reviews**
- provider_id
- rating
- comment
- date

**Table: earnings**
- provider_id
- booking_id
- amount
- date

### ProviderMyProfileScreen (Edit Business Profile)
**Table: providers**
- id
- name
- logo_url
- bio
- location
- specialties
- years_experience

**Table: services**
- id
- provider_id
- name
- price
- duration
- description

**Table: portfolios**
- id
- provider_id
- image_url
- caption
- category

**Table: availability**
- provider_id
- day_of_week
- start_time
- end_time
- date (for specific days off)

### ProviderBookingDetailScreen (Manage Booking)
**Table: bookings**
- id
- user_id
- service_id
- date
- time
- status
- total_price
- notes

**Table: users** (client info)
- name
- phone
- email
- avatar_url

**Table: services**
- name
- duration
- price

### InfoRegScreen (Provider Registration)
**Table: providers**
- user_id
- business_name
- bio
- location
- logo_url
- categories

**Table: services** (add initial services)
- provider_id
- name
- price
- duration

---

## Other Pages

### EventDetailScreen (View Portfolio Item)
**Table: portfolios**
- id
- provider_id
- image_url
- caption
- category
- tags

**Table: providers**
- id
- name
- logo

### BeccaScreen (AI Chat)
**Table: chat_messages**
- id
- user_id
- message (user's question)
- response (AI's answer)
- timestamp
- conversation_id

---

## Summary of All Tables Needed

1. users - All user accounts (clients and providers)
2. providers - Business profiles for service providers
3. services - Services offered by each provider
4. portfolios - Photos of provider's work
5. bookings - All appointments/reservations
6. reviews - Customer ratings and comments
7. bookmarks - User's saved/favorited providers
8. cart_items - Temporary shopping cart
9. notifications - System messages and alerts
10. availability - Provider's available time slots
11. payments - Payment records
12. earnings - Provider revenue tracking
13. user_preferences - App settings for each user
14. chat_messages - AI chat conversation history

---

## File Storage Needed

1. **avatars/** - User profile photos
2. **logos/** - Provider business logos  
3. **portfolios/** - Provider work images

---

**Total: 14 database tables + 3 file storage folders**

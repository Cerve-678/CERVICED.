# User Learning Algorithm Documentation

## Overview
The CERVICED app includes an intelligent learning system that tracks user behavior and personalizes the feed based on individual preferences and interaction patterns. The system learns over time to show the most relevant providers and offers first.

---

## How It Works

### 1. **Interaction Tracking**
Every time you interact with the app, the system records and weighs your actions:

| Action Type | Description | Weight | Example |
|------------|-------------|--------|---------|
| **VIEW** | Viewing a provider's profile page | 1 | Clicking on "Hair by Jennifer" to see their services |
| **SEARCH** | Selecting a service category | 2 | Choosing "NAILS" from the service menu |
| **OFFER_VIEW** | Viewing promotional offers | 3 | Clicking on a "20% OFF" offer card |
| **FAVORITE** | Bookmarking a provider | 5 | Adding "Diva Nails" to your favorites |
| **BOOK** | Completing a booking | 10 | Successfully booking an appointment |

Higher weights mean stronger signals about your preferences. For example, actually booking an appointment (weight: 10) is 10x more valuable than just viewing a provider (weight: 1).

---

## 2. **Personalization Scoring System**

The algorithm calculates a relevance score for each provider using **4 key factors**:

### A. Service Category Preference (40% of total score)
- Tracks which services you interact with most
- Example: If you frequently book HAIR appointments, hair providers get boosted
- **Why it matters**: Your favorite service types are a strong indicator of what you'll want to see

### B. Provider-Specific Preference (30% of total score)
- Remembers which individual providers you interact with
- Example: If you've booked with "Hair by Jennifer" multiple times, she appears higher in your feed
- **Why it matters**: You tend to return to providers you trust

### C. Time-Based Relevance (10% of total score)
- Learns what time of day you typically browse or book
- Example: If you usually book appointments at 7PM, providers with evening availability get a boost during that time
- **Why it matters**: Surfacing relevant options when you're most likely to book

### D. Recency Boost (20% of total score)
- Prioritizes services you've interacted with recently
- Example: If you just browsed LASHES providers yesterday, they'll rank higher today
- **Why it matters**: Recent interests are often current needs

---

## 3. **Personalized Sections**

### YOUR PROVIDERS
- Shows providers you've interacted with most
- Requires minimum 3 interactions before personalization kicks in
- Updates automatically as you use the app
- Falls back to default providers for new users

### RECOMMENDED FOR YOU
- Smart recommendations based on your complete interaction history
- Considers all 4 scoring factors above
- Learns which service categories you prefer
- Adapts to seasonal changes in your preferences

### CURRENT OFFERS
- Offers are ranked by relevance to your favorite services
- If you frequently book NAILS, nail-related offers appear first
- Requires minimum 2 interactions before personalization

---

## 4. **Privacy & Data Management**

### What's Stored:
- Last 100 interactions (older ones are automatically removed)
- Service category preferences
- Provider interaction counts
- Time-of-day usage patterns
- Total interaction count

### What's NOT Stored:
- Personal identification beyond app usage
- Location data
- Payment information
- Sensitive booking details

### Data Control:
- All data stored locally on your device using AsyncStorage
- No data shared with third parties
- Can be completely cleared via app settings
- Resets when app is uninstalled

---

## 5. **Learning Timeline**

| Interactions | What Happens |
|--------------|--------------|
| **0-2** | Default feed shown, no personalization |
| **3-10** | Basic personalization starts (service preferences detected) |
| **11-30** | Medium personalization (provider patterns emerge) |
| **31-50** | Strong personalization (time patterns detected) |
| **50+** | Full personalization (highly tailored feed) |

---

## 6. **Real-World Examples**

### Example 1: New User → Regular User
**Week 1**:
- Views 3 NAIL providers → System learns interest in nails
- Books appointment with "Diva Nails" → Major signal (weight: 10)

**Week 2**:
- "YOUR PROVIDERS" now shows "Diva Nails" first
- "RECOMMENDED" section prioritizes other nail providers
- Nail-related offers appear at top of offers section

**Week 3**:
- Views LASHES providers at 7PM → System learns evening browsing pattern
- "RECOMMENDED" section starts mixing nail and lash providers
- Evening sessions show more availability-focused results

**Month 2**:
- Feed is now highly personalized
- Favorite providers appear prominently
- Offers matched to preferred services
- Time-aware recommendations

### Example 2: Multi-Service User
- User regularly books HAIR (60%) and MUA (40%)
- "RECOMMENDED" section shows 60/40 split
- "YOUR PROVIDERS" features both hair and makeup providers
- Offers section shows balanced mix
- Feed adapts if ratios change over time

---

## 7. **Algorithm Updates**

The system continuously learns and improves:
- **Every interaction** updates preference weights
- **Every app launch** recalculates scores
- **Every week** older data naturally deprioritizes
- **No manual input required** - fully automatic

---

## 8. **Technical Details**

### Scoring Formula:
```
Provider Score =
  (Service Weight × 0.4) +
  (Provider Weight × 0.3) +
  (Time Relevance × 0.1) +
  (Recent Interactions × 0.2)
```

### Storage:
- Location: AsyncStorage (`@user_learning_data`)
- Format: JSON
- Size: ~50-100KB typical
- Updates: After each interaction

### Performance:
- Initialization: <100ms
- Score calculation: <10ms per provider
- Storage write: <50ms
- No network required (100% offline)

---

## Benefits

✅ **Saves Time**: Most relevant providers appear first
✅ **Personalized**: Feed adapts to YOUR preferences
✅ **Smart**: Learns patterns you don't consciously notice
✅ **Private**: All data stays on your device
✅ **Automatic**: No configuration or settings needed
✅ **Improves Over Time**: Gets smarter with each use

---

## Frequently Asked Questions

**Q: When does personalization start?**
A: After 3 interactions (views, bookings, searches, etc.)

**Q: How long until my feed is fully personalized?**
A: 20-30 interactions typically provide strong personalization

**Q: Can I reset the learning data?**
A: Yes, through app settings (future feature) or by reinstalling the app

**Q: Does this use my location?**
A: No, the algorithm is based purely on app interactions

**Q: Will my data be shared?**
A: No, all learning data stays on your device

**Q: What if I share my device?**
A: The algorithm will learn from combined usage. Consider separate accounts (future feature)

**Q: Does this cost anything?**
A: No, it's a built-in free feature

---

## For Developers

### Integration Points:
1. `HomeScreen.tsx`: Feed personalization on mount
2. `userLearningService.ts`: Core algorithm logic
3. Provider navigation: Automatic view tracking
4. Service selection: Automatic search tracking
5. Booking completion: Automatic booking tracking

### API Methods:
- `trackInteraction()`: Record user action
- `getPersonalizedProviders()`: Get scored provider list
- `getPersonalizedOffers()`: Get scored offer list
- `getUserInsights()`: Get analytics data
- `clearData()`: Reset all learning data

---

**Last Updated**: January 2026
**Algorithm Version**: 1.0
**Platform**: React Native (iOS & Android)

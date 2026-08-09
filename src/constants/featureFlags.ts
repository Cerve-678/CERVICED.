// Temporary kill-switches for features pulled from the client app without
// deleting the underlying code. See FUTURE_LOGIC.md for why each is off.

export const OFFERS_ENABLED = false;

// Multi-service booking — selecting several services from one provider and
// booking them together as a group (the "Select" mode on a provider profile,
// its floating "Book" bar, and MultiBookingSheet). Off pulls only that grouped
// path from the UI; single-service Book, Offers/Explore "Book Now", the cart,
// and checkout are all untouched. See FUTURE_LOGIC.md.
export const MULTI_SERVICE_BOOKING_ENABLED = false;

// Hair type vocabulary, shared across every screen that asks about hair
// type — the client's own hair type (BeautyProfileScreen, SignUpStep4Screen),
// which hair types a provider's HAIR service suits (InfoRegScreen, stored in
// services.hair_types_suitable), and the client-side Search "Hair Type"
// filter (SearchScreen). A single shared list so the value picked in one
// place always means the same thing everywhere else.
export const HAIR_TYPES = ['Straight', 'Wavy', 'Curly', 'Coily', '4A', '4B', '4C'];

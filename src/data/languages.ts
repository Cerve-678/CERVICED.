// Canonical world-language names, used to recognise free text typed into an
// "Other" language field (SignUpStep5, AboutYouScreen) so "french"/"FRENCH"/
// "Français" all resolve to the same saved value instead of creating
// near-duplicate entries that differ only by casing or spelling.
export const KNOWN_LANGUAGES = [
  'English', 'Urdu', 'Punjabi', 'Polish', 'Arabic', 'French', 'Spanish', 'BSL',
  'Bengali', 'Gujarati', 'Yoruba', 'Igbo', 'Twi/Akan', 'Somali', 'Portuguese',
  'Mandarin', 'Cantonese', 'Hindi', 'Tamil', 'Turkish', 'German', 'Italian',
  'Dutch', 'Greek', 'Russian', 'Ukrainian', 'Romanian', 'Albanian', 'Farsi',
  'Pashto', 'Kurdish', 'Hebrew', 'Swahili', 'Amharic', 'Tigrinya', 'Nepali',
  'Sinhala', 'Malayalam', 'Telugu', 'Marathi', 'Vietnamese', 'Thai', 'Korean',
  'Japanese', 'Indonesian', 'Malay', 'Filipino/Tagalog', 'Lithuanian',
  'Latvian', 'Estonian', 'Czech', 'Slovak', 'Hungarian', 'Bulgarian',
  'Serbian', 'Croatian', 'Bosnian', 'Swedish', 'Norwegian', 'Danish',
  'Finnish', 'Icelandic', 'Irish/Gaelic', 'Welsh',
] as const;

// Common alternate spellings/aliases → the canonical name above.
const ALIASES: Record<string, string> = {
  'farsi': 'Farsi', 'persian': 'Farsi',
  'mandarin chinese': 'Mandarin', 'chinese': 'Mandarin',
  'tagalog': 'Filipino/Tagalog', 'filipino': 'Filipino/Tagalog',
  'gaelic': 'Irish/Gaelic', 'irish': 'Irish/Gaelic',
  'akan': 'Twi/Akan', 'twi': 'Twi/Akan',
  'british sign language': 'BSL',
};

// Resolves free-typed text to a canonical known language name (case/alias
// insensitive) if one matches; otherwise returns the trimmed input as-is so
// a genuinely unrecognised language typed by a provider is never discarded.
export function recognizeLanguage(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return trimmed;
  const lower = trimmed.toLowerCase();

  if (ALIASES[lower]) return ALIASES[lower];

  const known = KNOWN_LANGUAGES.find(l => l.toLowerCase() === lower);
  if (known) return known;

  // Match a single segment of a slash-joined name, e.g. "tagalog" → the
  // "Filipino/Tagalog" entry, "gaelic" → "Irish/Gaelic".
  const partial = KNOWN_LANGUAGES.find(l =>
    l.toLowerCase().split('/').includes(lower)
  );
  if (partial) return partial;

  return trimmed;
}

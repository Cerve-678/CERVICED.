// Fisher-Yates — unbiased in-place-safe shuffle. Deliberately not
// `array.sort(() => Math.random() - 0.5)`, which is a well-known biased
// shuffle (comparator-based sorts don't guarantee every permutation is
// equally likely, and V8's sort isn't even guaranteed stable-random here).
export function shuffle<T>(items: T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j] as T, result[i] as T];
  }
  return result;
}

/** Shuffle a rail while showing a different lead card on the next visit. */
export function shuffleWithDifferentFirst<T extends { id: string }>(items: T[]): T[] {
  const result = shuffle(items);
  if (result.length > 1 && result[0]?.id === items[0]?.id) {
    const swapIndex = 1 + Math.floor(Math.random() * (result.length - 1));
    [result[0], result[swapIndex]] = [result[swapIndex] as T, result[0] as T];
  }
  return result;
}

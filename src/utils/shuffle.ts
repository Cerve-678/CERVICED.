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

// The arithmetic behind takeBack.ts, kept free of Deno imports so the app's
// jest suite can test it.

export function isInsufficientBalance(err: unknown): boolean {
  const code = (err as { code?: unknown; raw?: { code?: unknown } } | null)?.code
    ?? (err as { raw?: { code?: unknown } } | null)?.raw?.code;
  return code === 'balance_insufficient' || code === 'insufficient_funds';
}

/** Splits what to take back into what the transfer can return and the rest. Pure, for tests. */
export function planTakeBack(wantPence: number, reversiblePence: number): { reverse: number; shortfall: number } {
  const want = Math.max(0, Math.round(wantPence));
  const reverse = Math.min(want, Math.max(0, Math.round(reversiblePence)));
  return { reverse, shortfall: want - reverse };
}

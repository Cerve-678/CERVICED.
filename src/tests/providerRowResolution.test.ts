import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * A user should own exactly one provider row, but duplicates have crept in
 * during the account churn and the database does not forbid them. A single-row
 * query filtered on user_id alone does NOT pick one of them — PostgREST errors
 * instead — and every caller handles that error differently: some throw, some
 * swallow it into a null, and loadProviderFromSupabase falls back to a
 * device-local AsyncStorage snapshot. That last one is how two devices ended up
 * showing two different logos for the same business, persisting across reloads.
 *
 * So every "which provider row is mine" lookup has to order deterministically
 * and take one row, and they all have to order the SAME way, or they disagree
 * about which row is the real profile.
 */
describe("owned-provider-row resolution", () => {
  const source = readFileSync(
    join(__dirname, "../services/databaseService.ts"),
    "utf8",
  );
  const lines = source.split("\n");

  /** Every single-row `providers` query in databaseService, with its filters. */
  const providerQueries = lines.flatMap((line, i) => {
    if (!line.includes('from("providers")')) return [];
    const block: string[] = [];
    for (let j = i; j < Math.min(i + 16, lines.length); j++) {
      block.push(lines[j]!);
      if (lines[j]!.includes("maybeSingle()") || lines[j]!.includes("single()")) {
        const text = block.join("\n");
        const keys = [...text.matchAll(/\.eq\("(\w+)"/g)].map((m) => m[1]!);
        let fn = "<unknown>";
        for (let k = i; k >= 0; k--) {
          const m = /(?:export )?(?:async )?function (\w+)/.exec(lines[k]!);
          if (m) {
            fn = m[1]!;
            break;
          }
        }
        return [{ fn, line: i + 1, text, keys }];
      }
    }
    return [];
  });

  it("finds the single-row provider lookups it means to be checking", () => {
    // Guards the parsing above: if this file is restructured so the scan stops
    // matching, the assertions below would pass by finding nothing at all.
    expect(providerQueries.length).toBeGreaterThan(20);
    expect(providerQueries.map((q) => q.fn)).toContain(
      "getProviderRegistrationRecord",
    );
  });

  it("never resolves a provider row from user_id alone without picking one", () => {
    const offenders = providerQueries
      .filter((q) => {
        // A query that also pins the primary key can only match one row.
        const byUserIdAlone =
          q.keys.includes("user_id") && new Set(q.keys).size === 1;
        return byUserIdAlone && !q.text.includes(".limit(1)");
      })
      .map((q) => `${q.fn} (databaseService.ts:${q.line})`);

    expect(offenders).toEqual([]);
  });

  it("orders every such lookup identically, so none can disagree", () => {
    // Scoped to the by-user_id lookups: a query pinned to a unique column
    // (providerSlugExists on slug, say) matches one row by definition and has
    // no competing candidates to order between.
    const misordered = providerQueries
      .filter((q) => q.keys.includes("user_id") && new Set(q.keys).size === 1)
      .filter(
        (q) =>
          !q.text.includes('.order("is_active", { ascending: false })') ||
          !q.text.includes('.order("created_at", { ascending: true })'),
      )
      .map((q) => `${q.fn} (databaseService.ts:${q.line})`);

    expect(misordered).toEqual([]);
  });
});

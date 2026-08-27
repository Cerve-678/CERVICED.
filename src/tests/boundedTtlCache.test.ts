import { BoundedTtlCache } from "../utils/boundedTtlCache";

describe("BoundedTtlCache", () => {
  it("expires entries at the configured TTL", () => {
    const cache = new BoundedTtlCache<string, string>(1_000, 2);
    cache.set("provider-a", "cached", 10_000);

    expect(cache.get("provider-a", 10_999)).toBe("cached");
    expect(cache.get("provider-a", 11_000)).toBeUndefined();
  });

  it("evicts the oldest entry when the bound is exceeded", () => {
    const cache = new BoundedTtlCache<string, number>(10_000, 2);
    cache.set("provider-a", 1, 1);
    cache.set("provider-b", 2, 2);
    cache.set("provider-c", 3, 3);

    expect(cache.get("provider-a", 4)).toBeUndefined();
    expect(cache.get("provider-b", 4)).toBe(2);
    expect(cache.get("provider-c", 4)).toBe(3);
  });
});

describe("BoundedTtlCache.delete", () => {
  it("forgets a key before its TTL would have lapsed", () => {
    const cache = new BoundedTtlCache<string, number>(60_000, 4);
    cache.set("a", 1);
    expect(cache.get("a")).toBe(1);
    cache.delete("a");
    expect(cache.get("a")).toBeUndefined();
  });

  it("leaves other keys alone", () => {
    const cache = new BoundedTtlCache<string, number>(60_000, 4);
    cache.set("a", 1);
    cache.set("b", 2);
    cache.delete("a");
    expect(cache.get("b")).toBe(2);
  });

  it("is a no-op for a key that was never there", () => {
    const cache = new BoundedTtlCache<string, number>(60_000, 4);
    expect(() => cache.delete("missing")).not.toThrow();
  });
});

import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Swapping RootNavigation's MainTabsComponent between the two hats does NOT by
 * itself land the user on the new hat's home tab: React Navigation rehydrates
 * the incoming tab navigator from the state still stored on the MainTabs
 * route, so any route name the two hats share ('Becca', 'Profile') stays
 * focused. Because the switch control lives on the Profile tab of both hats,
 * that put every switch on the other hat's Profile tab. The reset below is
 * what drops that stale state — guard it so it can't be quietly removed.
 */
describe("hat switch lands on the new hat's home tab", () => {
  const rootNav = readFileSync(
    join(__dirname, "../navigation/RootNavigation.tsx"),
    "utf8",
  );

  it("resets the MainTabs route when activeMode actually changes", () => {
    expect(rootNav).toContain(
      "navigationRef.reset({ index: 0, routes: [{ name: 'MainTabs' }] })",
    );
    // Only on a real change — resetting on every render/mount would clobber a
    // cold-start notification deep link.
    expect(rootNav).toContain("previousModeRef.current !== activeMode");
  });

  it("swaps the tab tree without a card animation", () => {
    // The reset gives MainTabs a new route key, which the stack would
    // otherwise slide in from the right — wrong for an identity switch that
    // happens behind a full-screen overlay.
    expect(rootNav).toContain("animation: 'none'");
  });

  it("resets before resolving requestMode() callers, so deep links land on top", () => {
    const resetAt = rootNav.indexOf("navigationRef.reset({ index: 0");
    const resolveAt = rootNav.indexOf("resolveModeChange(activeMode)");
    expect(resetAt).toBeGreaterThan(-1);
    expect(resolveAt).toBeGreaterThan(resetAt);
  });

  it("each tab navigator's initial route is its own home tab", () => {
    const clientTabs = readFileSync(
      join(__dirname, "../navigation/client/ClientTabNavigator.tsx"),
      "utf8",
    );
    const providerTabs = readFileSync(
      join(__dirname, "../navigation/provider/ProviderTabNavigator.tsx"),
      "utf8",
    );
    expect(clientTabs).toContain('initialRouteName="Home"');
    expect(providerTabs).toContain('initialRouteName="ProviderHome"');
  });
});

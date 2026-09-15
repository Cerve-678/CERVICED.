import { readFileSync } from "fs";
import { join } from "path";
import {
  CLIENT_BECCA_SCREENS,
  CLIENT_PROFILE_SCREENS,
  PROVIDER_PUSH_NAV,
  PROVIDER_TAB_NAV,
} from "../services/becca/navigationContract";

/**
 * Every navChip() target in the capability files must be a screen the
 * navigation contract can actually fulfil.
 *
 * beccaCapabilityContract.test.ts already tests `isBeccaNavigationSuggestion`
 * — but only against hand-written sample suggestions, never against the chips
 * the capabilities really emit. So a capability could (and did) ship
 * `navChip("location", "Set my city", "ProfileInfo")`, which looks right and
 * silently does nothing: "ProfileInfo" is a `profileScreen` PARAM under the
 * "Profile" screen, not a screen key of its own.
 *
 * Reading the source is deliberate. Emitting a real chip means running a
 * capability, which means a live database — far too much machinery to protect
 * against a typo'd string constant.
 */

const CAPABILITY_FILES = [
  { path: "src/services/becca/capabilities/client.ts", hat: "client" as const },
  { path: "src/services/becca/capabilities/provider.ts", hat: "provider" as const },
];

/** Top-level arguments of a call whose opening paren is at `open`. */
function callArguments(source: string, open: number): string[] {
  const args: string[] = [];
  let depth = 0;
  let start = open + 1;
  let quote: string | null = null;

  for (let i = open + 1; i < source.length; i++) {
    const char = source[i]!;
    const prev = source[i - 1];

    if (quote) {
      if (char === quote && prev !== "\\") quote = null;
      continue;
    }
    if (char === '"' || char === "'" || char === "`") {
      quote = char;
      continue;
    }
    if (char === "(" || char === "[" || char === "{") depth++;
    else if (char === ")" || char === "]" || char === "}") {
      if (char === ")" && depth === 0) {
        args.push(source.slice(start, i).trim());
        return args;
      }
      depth--;
    } else if (char === "," && depth === 0) {
      args.push(source.slice(start, i).trim());
      start = i + 1;
    }
  }
  return args;
}

function navChipCalls(source: string): { screen: string; rest: string }[] {
  const calls: { screen: string; rest: string }[] = [];
  const marker = /\bnavChip\(/g;
  let match: RegExpExecArray | null;

  while ((match = marker.exec(source)) !== null) {
    const args = callArguments(source, match.index + match[0].length - 1);
    const screenArg = args[2];
    if (!screenArg) continue;
    // Only literal targets are checkable. A computed one (`target.screen`) is
    // validated by whatever produced it.
    const literal = screenArg.match(/^"([^"]+)"$|^'([^']+)'$/);
    if (!literal) continue;
    calls.push({ screen: literal[1] ?? literal[2]!, rest: args.slice(3).join(",") });
  }
  return calls;
}

describe("Becca navigation chips point at reachable screens", () => {
  it.each(CAPABILITY_FILES)("$path", ({ path, hat }) => {
    const source = readFileSync(join(process.cwd(), path), "utf8");
    const calls = navChipCalls(source);

    // A regex that silently matched nothing would make this test pass forever.
    expect(calls.length).toBeGreaterThan(0);

    const valid =
      hat === "provider"
        ? new Set([...Object.keys(PROVIDER_PUSH_NAV), ...Object.keys(PROVIDER_TAB_NAV)])
        : new Set([...CLIENT_BECCA_SCREENS, "Explore", "Profile"]);

    for (const call of calls) {
      expect({ file: path, screen: call.screen, reachable: valid.has(call.screen) }).toEqual({
        file: path,
        screen: call.screen,
        reachable: true,
      });

      // "Profile" is only half a target — the profileScreen param is what
      // decides where it lands, and the contract validates that too.
      if (call.screen === "Profile") {
        const profileScreen = call.rest.match(/profileScreen:\s*"([^"]+)"/);
        if (profileScreen) {
          expect({
            screen: profileScreen[1]!,
            reachable: CLIENT_PROFILE_SCREENS.has(profileScreen[1]!),
          }).toEqual({ screen: profileScreen[1]!, reachable: true });
        }
      }
    }
  });
});

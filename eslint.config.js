// eslint.config.js — ESLint 9 flat config.
// `npm run lint` was broken (no config file at all) until this existed.
const expoConfig = require('eslint-config-expo/flat');

module.exports = [
  {
    // In flat config, a global ignore must live in its own object. Keeping it
    // beside `rules` only scoped it to that one config item, so ESLint still
    // traversed backup snapshots, Deno functions, and stale agent worktrees.
    ignores: [
      'backups/**',
      'docs/vault/**',
      'supabase/functions/**', // Deno runtime, not Node/RN — different globals
      'dist/**',
      '.expo/**',
      '.claude/**', // includes at least one leftover agent worktree with its own backups/ copy
      '.conv.ts', // local one-off diagnostics, not application source
      '.err.ts',
      'jest.setup.js', // executed by Jest with Jest/Node globals
    ],
  },
  ...expoConfig,
  {
    rules: {
      // React Native renders text natively, not as HTML. Apostrophes and quote
      // marks in <Text> are safe and escaping them makes customer copy harder
      // to read and maintain.
      'react/no-unescaped-entities': 'off',
      // Keep this visible during cleanup without blocking a release for the
      // existing memoized leaf components.
      'react/display-name': 'warn',
      // eslint-plugin-react-hooks 7 ships the React Compiler's analysis as
      // lint rules and enables them as ERRORS. This app does not use the React
      // Compiler, and the patterns they flag are the ordinary ones here:
      // Animated.Value / gesture state held in useRef and read while rendering
      // (383 of the 472 hits are `refs`), setState inside an effect to sync
      // from props. They are advisory until the compiler is adopted, so they
      // stay visible as warnings rather than failing every PR on code that
      // predates them. `rules-of-hooks` and `exhaustive-deps` are untouched
      // and still enforced.
      'react-hooks/refs': 'warn',
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/preserve-manual-memoization': 'warn',
      'react-hooks/immutability': 'warn',
      'react-hooks/purity': 'warn',
      'react-hooks/use-memo': 'warn',
    },
  },
];

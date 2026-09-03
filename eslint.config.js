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
      // SDK 56's preset enables React Compiler advisory rules. The app does
      // not use the compiler yet, so retain the pre-upgrade lint contract and
      // migrate these legacy patterns separately from the SDK upgrade.
      'react-hooks/immutability': 'off',
      'react-hooks/preserve-manual-memoization': 'off',
      'react-hooks/purity': 'off',
      'react-hooks/refs': 'off',
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/use-memo': 'off',
    },
  },
];

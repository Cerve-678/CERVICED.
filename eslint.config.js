// eslint.config.js — ESLint 9 flat config.
// `npm run lint` was broken (no config file at all) until this existed.
const expoConfig = require('eslint-config-expo/flat');

module.exports = [
  ...expoConfig,
  {
    ignores: [
      'backups/**',
      'docs/vault/**',
      'supabase/functions/**', // Deno runtime, not Node/RN — different globals
      'dist/**',
      '.expo/**',
      '.claude/**', // includes at least one leftover agent worktree with its own backups/ copy
    ],
    rules: {
      // React Native renders text natively, not as HTML. Apostrophes and quote
      // marks in <Text> are safe and escaping them makes customer copy harder
      // to read and maintain.
      'react/no-unescaped-entities': 'off',
      // Keep this visible during cleanup without blocking a release for the
      // existing memoized leaf components.
      'react/display-name': 'warn',
    },
  },
];

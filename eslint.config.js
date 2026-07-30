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
  },
];

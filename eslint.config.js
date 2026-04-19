import js from '@eslint/js';
import globals from 'globals';

export default [
  {
    ignores: [
      'pdfjs/**',        // vendor — not our code
      'node_modules/**',
    ],
  },
  // CLI scripts — allow console and CJS require
  {
    files: ['setup.js', 'scripts/*.js'],
    ...js.configs.recommended,
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.node },
    },
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'no-var':         'error',
      'prefer-const':   'error',
    },
  },
  {
    files: ['background.js', 'popup/*.js', 'src/*.js'],
    ...js.configs.recommended,
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.webextensions,
        ...globals.node,
      },
    },
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'no-console':     ['warn', { allow: ['warn', 'error'] }],
      'eqeqeq':         ['error', 'always'],
      'no-var':          'error',
      'prefer-const':    'error',
    },
  },
];

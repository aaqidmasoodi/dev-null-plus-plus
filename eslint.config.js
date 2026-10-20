import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/** Background-only code. It is the only place allowed to make network requests. See SECURITY.md. */
const BACKGROUND_FILES = ['src/entrypoints/background.ts', 'src/background/**'];

const HTML_SINKS = [
  'innerHTML',
  'outerHTML',
  'insertAdjacentHTML',
  'srcdoc',
  'setHTMLUnsafe',
  'createContextualFragment',
];

export default tseslint.config(
  {
    ignores: ['.output/**', '.wxt/**', 'node_modules/**', 'playwright-report/**', 'test-results/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      globals: { ...globals.browser },
      parserOptions: {
        projectService: {
          allowDefaultProject: ['eslint.config.js'],
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
      'no-console': 'error',
    },
  },
  {
    // Security rules for shipped code. See SECURITY.md for the reasons behind each.
    files: ['src/**/*.ts'],
    rules: {
      'no-eval': 'error',
      'no-new-func': 'error',
      'no-script-url': 'error',
      'no-restricted-properties': [
        'error',
        ...HTML_SINKS.map((property) => ({
          property,
          message: 'HTML strings are banned. Build nodes with createElement and set text with textContent.',
        })),
        { object: 'document', property: 'write', message: 'document.write is banned.' },
        { object: 'document', property: 'writeln', message: 'document.writeln is banned.' },
        {
          property: 'postMessage',
          message: 'Do not open message channels with the page. Use runtime messaging with verified senders.',
        },
      ],
      'no-restricted-globals': [
        'error',
        ...['localStorage', 'sessionStorage', 'indexedDB'].map((name) => ({
          name,
          message: 'The page can read its own storage. Use browser.storage instead.',
        })),
      ],
    },
  },
  {
    files: ['src/**/*.ts'],
    ignores: BACKGROUND_FILES,
    rules: {
      'no-restricted-globals': [
        'error',
        ...['localStorage', 'sessionStorage', 'indexedDB'].map((name) => ({
          name,
          message: 'The page can read its own storage. Use browser.storage instead.',
        })),
        ...['fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource'].map((name) => ({
          name,
          message: 'Network requests only happen in the background, which holds the secrets. Send it a message.',
        })),
      ],
    },
  },
  {
    files: ['eslint.config.js'],
    ...tseslint.configs.disableTypeChecked,
  },
);

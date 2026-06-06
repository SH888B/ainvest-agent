const globals = require('globals')
const pluginJs = require('@eslint/js')
const tseslint = require('typescript-eslint')
const pluginReactHooks = require('eslint-plugin-react-hooks')
const pluginReactRefresh = require('eslint-plugin-react-refresh')

/** @type {import('eslint').Linter.Config[]} */
module.exports = [
  { files: ['**/*.{ts,tsx}'] },
  { languageOptions: { globals: { ...globals.browser, ...globals.node } } },
  pluginJs.configs.recommended,
  ...tseslint.configs.recommended,
  {
    plugins: {
      'react-hooks': pluginReactHooks,
      'react-refresh': pluginReactRefresh,
    },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      'react-refresh/only-export-components': 'warn',
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
]

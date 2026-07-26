import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { globalIgnores } from 'eslint/config'
import eslintConfigPrettier from 'eslint-config-prettier'

export default tseslint.config([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      {
        // eslint-plugin-react-hooks@7 merged in the React Compiler rule set
        // (immutability/purity/set-state-in-effect/etc.) under its
        // `recommended`/`recommended-latest` configs — much stricter than
        // the rules-of-hooks + exhaustive-deps pair this project has always
        // used. Pin just those two explicitly rather than adopting the full
        // new rule set (and its config's `plugins` array, which is the
        // legacy eslintrc shape ESLint 10's flat config rejects outright).
        plugins: { 'react-hooks': reactHooks },
        rules: {
          'react-hooks/rules-of-hooks': 'error',
          'react-hooks/exhaustive-deps': 'warn',
        },
      },
      reactRefresh.configs.vite,
      eslintConfigPrettier,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
  },
])

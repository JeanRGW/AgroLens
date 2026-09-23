import js from '@eslint/js';
import tseslint from 'typescript-eslint';

/**
 * Shared ESLint flat configuration for AgroLens monorepo.
 * Prettier compatibility note: formatting rules are omitted here so Prettier
 * can format code independently without conflicting rule sets.
 */
export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
        },
      ],
    },
  },
);

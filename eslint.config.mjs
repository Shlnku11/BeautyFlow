import importPlugin from 'eslint-plugin-import';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['node_modules/**', 'coverage/**', 'playwright-report/**', 'test-results/**', 'dist/**'],
  },
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    plugins: {
      import: importPlugin,
      'jsx-a11y': jsxA11y,
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',
      'import/no-cycle': 'error',
      'jsx-a11y/anchor-is-valid': 'error',
    },
  },
  {
    files: ['packages/client/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@/server/**', '**/server/**'],
              message: 'Server modules must not be imported into UI/client code.',
            },
          ],
        },
      ],
    },
  },
);

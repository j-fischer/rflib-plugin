import salesforceTypescriptConfig from 'eslint-config-salesforce-typescript';
import sfPlugin from 'eslint-plugin-sf-plugin';

export default [
  {
    // Migrated from .eslintignore, which ESLint 10 no longer reads.
    ignores: ['**/*.cjs'],
  },
  ...salesforceTypescriptConfig,
  ...sfPlugin.configs.recommended,
  {
    rules: {
      'header/header': 'off',
      // Flow/Aura metadata is parsed from XML, where an absent element yields an empty
      // string rather than undefined. `||` is intentional at those fallbacks.
      '@typescript-eslint/prefer-nullish-coalescing': ['error', { ignorePrimitives: { string: true } }],
    },
  },
  {
    files: ['test/**/*.ts'],
    rules: {
      'no-unused-expressions': 'off',
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/no-empty-function': 'off',
      '@typescript-eslint/require-await': 'off',
      'header/header': 'off',
    },
  },
];

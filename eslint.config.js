import js from '@eslint/js';
import { FlatCompat } from '@eslint/eslintrc';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
  recommendedConfig: js.configs.recommended,
  allConfig: js.configs.all,
});

const testConfigs = compat.config({
  env: {
    mocha: true,
  },
  rules: {
    'no-unused-expressions': 'off',
    '@typescript-eslint/explicit-function-return-type': 'off',
    '@typescript-eslint/no-empty-function': 'off',
    '@typescript-eslint/require-await': 'off',
    header: 'off',
  },
});

testConfigs.forEach((config) => {
  config.files = ['test/**/*.ts'];
});

export default [
  ...compat.extends('eslint-config-salesforce-typescript', 'plugin:sf-plugin/recommended'),
  {
    rules: {
      header: 'off',
    },
  },
  ...testConfigs,
];

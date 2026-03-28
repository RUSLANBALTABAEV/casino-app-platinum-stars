import js from '@eslint/js';
import { FlatCompat } from '@eslint/eslintrc';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import tsEslintRaw from '@typescript-eslint/eslint-plugin/use-at-your-own-risk/raw-plugin';
const compat = new FlatCompat();

const tsTypeCheckedConfigs = ['flat/recommended-type-checked', 'flat/stylistic-type-checked']
  .flatMap((name) => tsEslintRaw.flatConfigs[name] ?? [])
  .map((config) => ({
    ...config,
    languageOptions: {
      ...(config.languageOptions ?? {}),
      parserOptions: {
        ...(config.languageOptions?.parserOptions ?? {}),
        project: ['./tsconfig.json']
      }
    }
  }));

export default [
  {
    ignores: ['.next/**', 'node_modules/**'],
    linterOptions: {
      reportUnusedDisableDirectives: 'off'
    }
  },
  ...compat.extends('next/core-web-vitals'),
  js.configs.recommended,
  ...tsTypeCheckedConfigs,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.browser
      }
    },
    plugins: {
      'react-hooks': reactHooks
    },
    rules: {
      ...reactHooks.configs['recommended-latest'].rules,
      '@typescript-eslint/consistent-type-definitions': 'off',
      '@typescript-eslint/array-type': 'off',
      '@typescript-eslint/prefer-optional-chain': 'off',
      '@typescript-eslint/prefer-nullish-coalescing': 'off',
      '@typescript-eslint/non-nullable-type-assertion-style': 'off',

      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-base-to-string': 'off',
      '@typescript-eslint/prefer-regexp-exec': 'off',
      '@typescript-eslint/no-redundant-type-constituents': 'off',
      '@typescript-eslint/no-unnecessary-type-assertion': 'off'
    }
  }
];

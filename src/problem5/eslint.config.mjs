import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/**', 'coverage/**', 'node_modules/**'] },

  // Plain CommonJS tooling files: migrations and the sequelize-cli config.
  // Not .sequelizerc - it is extensionless, so ESLint does not pick it up.
  {
    files: ['**/*.js', '**/*.cjs'],
    extends: [js.configs.recommended],
    languageOptions: {
      sourceType: 'commonjs',
      globals: { ...globals.node },
    },
  },

  {
    files: ['**/*.ts'],
    extends: [
      js.configs.recommended,
      // Type-aware rules. `parserOptions.project` below is what makes them
      // work: with no project configured, no-floating-promises and
      // no-misused-promises are silently inert - they never report a thing, and
      // ESLint never says why.
      ...tseslint.configs.recommendedTypeChecked,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      globals: { ...globals.node },
    },
    rules: {
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'separate-type-imports' },
      ],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      eqeqeq: ['error', 'always'],
      'no-console': 'error',
      'no-restricted-syntax': [
        'error',
        {
          selector: 'TSEnumDeclaration',
          message:
            'Use an `as const` array plus a derived union type; enums emit runtime code and do not line up with the zod schema.',
        },
        {
          selector: 'ExportDefaultDeclaration',
          message: 'Named exports only - default exports rename freely and hide the module graph.',
        },
      ],
    },
  },

  prettier,
);

module.exports = {
  env: {
    browser: false,
    commonjs: true,
    es6: true,
    node: true,
    jest: true,
  },
  extends: [
    'airbnb-base',
  ],
  globals: {
    Atomics: 'readonly',
    SharedArrayBuffer: 'readonly',
  },
  parserOptions: {
    ecmaVersion: 2020,
    sourceType: 'module',
  },
  overrides: [
    {
      files: ['*.ts'],
      parser: '@typescript-eslint/parser',
      parserOptions: {
        ecmaVersion: 2020,
        sourceType: 'module',
      },
      plugins: ['@typescript-eslint'],
      settings: {
        'import/resolver': {
          node: {
            extensions: ['.js', '.ts'],
          },
        },
      },
      rules: {
        // tsc already enforces module resolution and undefined identifiers;
        // the base rules can't resolve .ts imports and double-report.
        'no-undef': 'off',
        'import/extensions': ['error', 'ignorePackages', { js: 'never', ts: 'never' }],
        // TS-aware unused-vars: base rule misses type-only usage and flags
        // .d.ts signature params.
        'no-unused-vars': 'off',
        '@typescript-eslint/no-unused-vars': ['error', {
          argsIgnorePattern: 'req|res|next|val|^_',
          varsIgnorePattern: '^_',
          ignoreRestSiblings: true,
        }],
        // Intentional idioms in this codebase: lazy require() for cycle-safe
        // loading, for..of loops (airbnb's regenerator rationale is obsolete).
        'global-require': 'off',
        'import/no-dynamic-require': 'off',
        'no-restricted-syntax': 'off',
        // Real smells worth surfacing without blocking the build.
        'max-len': 'warn',
        'no-await-in-loop': 'warn',
        'no-plusplus': 'warn',
        radix: 'warn',
        'no-void': 'warn',
        'no-nested-ternary': 'warn',
        'no-continue': 'warn',
        'guard-for-in': 'warn',
        'no-use-before-define': 'warn',
        'no-shadow': 'warn',
        'prefer-destructuring': 'warn',
        'no-promise-executor-return': 'warn',
        'no-mixed-operators': 'warn',
        'default-param-last': 'warn',
        'no-useless-escape': 'warn',
        'no-case-declarations': 'warn',
        'max-classes-per-file': 'warn',
        'import/order': 'warn',
      },
    },
  ],
  rules: {
    'no-console': process.env.NODE_ENV === 'production' ? 'warn' : 'off',
    'no-debugger': process.env.NODE_ENV === 'production' ? 'warn' : 'off',
    'linebreak-style': 'off',
    'consistent-return': 'off',
    'func-names': 'off',
    'object-shorthand': 'off',
    'no-process-exit': 'off',
    'no-param-reassign': 'off',
    'no-return-await': 'off',
    'no-underscore-dangle': 'off',
    'class-methods-use-this': 'off',
    'prefer-destructuring': ['error', { object: true, array: false }],
    'no-unused-vars': ['error', { argsIgnorePattern: 'req|res|next|val' }],
    'max-len': ['error', { code: 120, ignoreComments: true, ignoreUrls: true }],
  },
};
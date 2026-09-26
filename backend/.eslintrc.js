module.exports = {
  env: {
    browser: false,
    commonjs: true,
    es6: true,
    node: true,
    jest: true,
  },
  globals: {
    Atomics: 'readonly',
    SharedArrayBuffer: 'readonly',
  },
  parserOptions: {
    ecmaVersion: 2020,
    sourceType: 'module',
  },
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
  overrides: [
    {
      // Legacy JavaScript (config/tooling files) keeps the airbnb-base profile.
      files: ['*.js'],
      extends: ['airbnb-base'],
    },
    {
      files: ['*.ts'],
      parser: '@typescript-eslint/parser',
      plugins: ['@typescript-eslint'],
      extends: ['plugin:@typescript-eslint/recommended'],
      rules: {
        // The codebase intentionally keeps CommonJS require() interop in .ts.
        '@typescript-eslint/no-require-imports': 'off',
        '@typescript-eslint/no-var-requires': 'off',
        // Pragmatic any usage during migration; tighten incrementally.
        '@typescript-eslint/no-explicit-any': 'off',
        // @ts-nocheck is a sanctioned convention for untyped interop surfaces.
        '@typescript-eslint/ban-ts-comment': 'off',
        'no-unused-vars': 'off',
        '@typescript-eslint/no-unused-vars': [
          'error',
          {
            argsIgnorePattern: 'req|res|next|val|_',
            varsIgnorePattern: '^_',
            caughtErrorsIgnorePattern: '^_|^error$|^err$',
            ignoreRestSiblings: true,
          },
        ],
        // Converted sources preserve original formatting/line lengths.
        'max-len': 'off',
      },
    },
  ],
};

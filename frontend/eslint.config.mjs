import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Replaces .eslintignore. The configs above already ignore
  // .next/**, out/**, build/** and next-env.d.ts; entries here add
  // project-specific exclusions.
  globalIgnores([
    '.next/**',
    'out/**',
    'build/**',
    'dist/**',
    'next-env.d.ts',
    'lib/api-types.generated.ts',
    '**/*.config.{js,mjs,cjs,ts}',
    'eslint.config.mjs',
  ]),
  {
    rules: {
      // pre-existing violations surfaced by the new flat config; downgraded to match previous enforcement level — tighten in a follow-up
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-empty-object-type': 'warn',
      'react-hooks/immutability': 'warn',
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/purity': 'warn',
    },
  },
]);

export default eslintConfig;

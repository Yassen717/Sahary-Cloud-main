import { execSync } from 'node:child_process';

try {
  execSync('npm run api:types:generate', { stdio: 'inherit' });
  execSync('git diff --exit-code -- lib/api-types.generated.ts ../backend/openapi/openapi.json', {
    stdio: 'inherit',
  });
} catch (error) {
  console.error('\nAPI contract drift detected.');
  console.error('Run: npm run api:types:generate (from frontend) and commit updated files.');
  process.exit(1);
}

console.log('API contract types are up to date.');

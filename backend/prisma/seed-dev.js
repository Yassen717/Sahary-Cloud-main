// Dev seed wrapper: enables SEED_DEMO_DATA cross-platform without cross-env.
// npm run prisma:seed:dev -> node prisma/seed-dev.js
process.env.SEED_DEMO_DATA = 'true';
require('./seed').runCli();

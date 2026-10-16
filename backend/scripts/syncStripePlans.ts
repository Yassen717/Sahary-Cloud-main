// One-off/periodic ops script: sync every active hosting plan to its Stripe
// product + monthly USD price (WP01). Run: npm run stripe:sync-plans
// Requires STRIPE_SECRET_KEY and DATABASE_URL (loaded from backend/.env).
import 'dotenv/config';
import { prisma } from '../src/config/database';
import { syncPlanToStripe } from '../src/services/stripeBillingService';

async function main(): Promise<void> {
  const plans = await prisma.hostingPlan.findMany({
    where: { isActive: true },
    orderBy: { monthlyPrice: 'asc' },
    select: { id: true, name: true },
  });

  if (plans.length === 0) {
    console.log('No active hosting plans to sync.');
    return;
  }

  let synced = 0;
  let failed = 0;
  for (const plan of plans) {
    try {
      // eslint-disable-next-line no-await-in-loop -- sequential on purpose: keeps Stripe calls paced and output readable
      const { stripeProductId, stripePriceId } = await syncPlanToStripe(plan.id);
      synced += 1;
      console.log(`OK   ${plan.name}  product=${stripeProductId} price=${stripePriceId}`);
    } catch (error) {
      failed += 1;
      console.error(`FAIL ${plan.name}  ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  console.log(`Done: ${synced}/${plans.length} plans synced${failed > 0 ? `, ${failed} failed` : ''}.`);
  if (failed > 0) {
    process.exitCode = 1;
  }
}

main()
  .catch((error) => {
    console.error(`stripe:sync-plans failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

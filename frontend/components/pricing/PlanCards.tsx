import type { ReactNode } from 'react';
import { Check, Sun } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { HostingPlanDTO } from '@/lib/hosting-types';

const plural = (n: number, singular: string, pluralForm?: string) =>
  n === 1 ? singular : (pluralForm ?? `${singular}s`);

export function formatPlanPrice(plan: HostingPlanDTO): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: plan.currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(plan.monthlyPrice);
}

function planFeatures(plan: HostingPlanDTO): string[] {
  return [
    `${plan.diskGB} GB SSD storage`,
    `${plan.bandwidthGB} GB monthly bandwidth`,
    `Up to ${plan.maxDomains} custom ${plural(plan.maxDomains, 'domain')}`,
    `${plan.maxDatabases} MySQL ${plural(plan.maxDatabases, 'database')}`,
    `${plan.maxFtpAccounts} FTP ${plural(plan.maxFtpAccounts, 'account')}`,
    'Free yourname.sahary.cloud subdomain',
    'Free SSL certificates',
  ];
}

interface PlanCardsProps {
  plans: HostingPlanDTO[];
  /** Plan id (from `?plan=`) to scroll to and highlight. */
  highlightPlanId?: string | null;
  /** Renders the call-to-action area of each card. */
  action?: (plan: HostingPlanDTO) => ReactNode;
  /** Additional classes for the grid. */
  className?: string;
}

export function PlanCards({ plans, highlightPlanId, action, className }: PlanCardsProps) {
  // Plans arrive sorted by price ascending — the middle one is highlighted.
  const popularIndex = Math.floor(plans.length / 2);

  return (
    <div
      className={cn(
        'grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-3',
        className,
      )}
    >
      {plans.map((plan, index) => {
        const isPopular = index === popularIndex && plans.length > 1;
        const isHighlighted = highlightPlanId === plan.id;
        return (
          <Card
            key={plan.id}
            id={`plan-${plan.id}`}
            className={cn(
              'flex h-full scroll-mt-28 flex-col shadow-lg',
              isPopular && 'relative border-2 border-primary shadow-xl',
              isHighlighted && 'ring-2 ring-primary ring-offset-2',
            )}
          >
            {isPopular && (
              <div className="absolute end-0 top-0 bg-primary px-3 py-1 text-sm font-medium text-primary-foreground">
                Most Popular
              </div>
            )}
            <CardHeader className="pt-8 text-center">
              <CardTitle className="text-2xl">{plan.name}</CardTitle>
              <div className="my-4 flex items-baseline justify-center">
                <span className="text-4xl font-bold">{formatPlanPrice(plan)}</span>
                <span className="ms-1 text-gray-600 dark:text-gray-400">/month</span>
              </div>
              {plan.description && <CardDescription>{plan.description}</CardDescription>}
              <div className="pt-2">
                <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100 dark:bg-amber-900/30 dark:text-amber-400">
                  <Sun className="me-1 h-3 w-3" aria-hidden="true" />
                  Solar powered
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="grow">
              <ul className="space-y-3">
                {planFeatures(plan).map((feature) => (
                  <li key={feature} className="flex items-center">
                    <Check className="me-2 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
                    <span className="text-gray-600 dark:text-gray-400">{feature}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
            {action && <CardFooter>{action(plan)}</CardFooter>}
          </Card>
        );
      })}
    </div>
  );
}

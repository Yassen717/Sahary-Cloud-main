'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Check, Loader2 } from 'lucide-react';
import type { HostingPlanDTO } from '@/lib/hosting-types';

interface PlanChooserProps {
  plans: HostingPlanDTO[];
  busyPlanId: string | null;
  onSelect: (plan: HostingPlanDTO) => void;
}

/** Compact plan picker for subscribing (or re-subscribing) to a hosting plan. */
export function PlanChooser({ plans, busyPlanId, onSelect }: PlanChooserProps) {
  const purchasable = plans.filter((plan) => plan.isActive && plan.purchasable);

  if (purchasable.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">
        No plans are available for purchase right now. Please check back later.
      </p>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" role="list" aria-label="Available plans">
      {purchasable.map((plan) => {
        const busy = busyPlanId === plan.id;
        const limits = [
          `${plan.diskGB} GB storage`,
          `${plan.bandwidthGB} GB bandwidth`,
          `${plan.maxDomains} domain${plan.maxDomains === 1 ? '' : 's'}`,
          `${plan.maxDatabases} database${plan.maxDatabases === 1 ? '' : 's'}`,
        ];
        return (
          <Card key={plan.id} role="listitem" className="flex flex-col">
            <CardContent className="flex flex-1 flex-col gap-4 p-5">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="font-semibold">{plan.name}</h3>
                  <p className="mt-1">
                    <span className="text-2xl font-bold">${plan.monthlyPrice.toFixed(2)}</span>
                    <span className="text-sm text-muted-foreground">/month</span>
                  </p>
                </div>
                <Badge variant="outline" className="shrink-0">Monthly</Badge>
              </div>
              {plan.description && (
                <p className="text-sm text-muted-foreground">{plan.description}</p>
              )}
              <ul className="space-y-1.5 text-sm">
                {limits.map((limit) => (
                  <li key={limit} className="flex items-center gap-2">
                    <Check className="h-4 w-4 shrink-0 text-green-500" aria-hidden="true" />
                    <span>{limit}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-auto pt-2">
                <Button
                  className="w-full"
                  disabled={busyPlanId !== null}
                  onClick={() => onSelect(plan)}
                >
                  {busy ? (
                    <>
                      <Loader2 className="me-2 h-4 w-4 animate-spin" aria-hidden="true" />
                      Redirecting to checkout...
                    </>
                  ) : (
                    `Choose ${plan.name}`
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

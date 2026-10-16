'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ApiError } from '@/lib/api';
import { adminListPlans, adminUpdatePlan } from '@/lib/hosting-api';
import type { AdminHostingPlanDTO } from '@/lib/hosting-types';
import type { AdminUpdatePlanPatch } from '@/lib/hosting-api';
import { AdminNav } from '@/components/admin/AdminNav';
import { NotAuthorized } from '@/components/admin/NotAuthorized';
import { PlanEditDialog } from '@/components/admin/PlanEditDialog';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { AlertTriangle, ArrowLeft, Check, ListChecks, Pencil, RefreshCw, X } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const errorMessage = (err: unknown, fallback: string) =>
  err instanceof Error ? err.message : fallback;

export default function AdminHostingPlansPage() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [plans, setPlans] = useState<AdminHostingPlanDTO[]>([]);
  const [editing, setEditing] = useState<AdminHostingPlanDTO | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let live = true;
    adminListPlans()
      .then((result) => {
        if (!live) return;
        setPlans(result);
        setLoadError(null);
      })
      .catch((err) => {
        if (!live) return;
        if (err instanceof ApiError && err.status === 403) {
          setForbidden(err.message);
        } else {
          setLoadError(errorMessage(err, 'Failed to load hosting plans'));
        }
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [reloadKey]);

  const handleSave = async (id: string, patch: AdminUpdatePlanPatch) => {
    const updated = await adminUpdatePlan(id, patch);
    setPlans((prev) => prev.map((plan) => (plan.id === id ? updated : plan)));
    toast({ title: 'Plan updated', description: `${updated.name} was saved.` });
  };

  if (forbidden) {
    return (
      <div className="container mx-auto max-w-5xl p-6">
        <AdminNav />
        <NotAuthorized />
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-6xl p-6">
      <AdminNav />

      <div className="mb-4">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/admin/hosting">
            <ArrowLeft className="me-2 h-4 w-4" aria-hidden="true" />
            Back to hosting administration
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-primary/10 p-2">
                <ListChecks className="h-5 w-5 text-primary" aria-hidden="true" />
              </div>
              <div>
                <CardTitle>Hosting plans</CardTitle>
                <CardDescription>
                  Prices, quotas and availability. Price changes apply to new subscribers only.
                </CardDescription>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setReloadKey((key) => key + 1)}
              disabled={loading}
            >
              <RefreshCw className="me-2 h-4 w-4" aria-hidden="true" />
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, index) => (
                <Skeleton key={index} className="h-12 w-full" />
              ))}
            </div>
          ) : loadError ? (
            <div className="py-10 text-center">
              <AlertTriangle className="mx-auto mb-3 h-8 w-8 text-destructive" aria-hidden="true" />
              <p className="mb-4 text-sm text-muted-foreground">{loadError}</p>
              <Button variant="outline" size="sm" onClick={() => setReloadKey((key) => key + 1)}>
                Try again
              </Button>
            </div>
          ) : plans.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              No hosting plans are configured yet.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Plan</TableHead>
                    <TableHead>Price</TableHead>
                    <TableHead>Disk</TableHead>
                    <TableHead>Bandwidth</TableHead>
                    <TableHead>Domains</TableHead>
                    <TableHead>DBs</TableHead>
                    <TableHead>FTP</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Stripe</TableHead>
                    <TableHead>Accounts</TableHead>
                    <TableHead className="w-12" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {plans.map((plan) => {
                    const stripeLinked = !!(plan.stripeProductId && plan.stripePriceId);
                    return (
                      <TableRow key={plan.id}>
                        <TableCell className="font-medium">{plan.name}</TableCell>
                        <TableCell>${plan.monthlyPrice.toFixed(2)}/mo</TableCell>
                        <TableCell>{plan.diskGB} GB</TableCell>
                        <TableCell>{plan.bandwidthGB} GB</TableCell>
                        <TableCell>{plan.maxDomains}</TableCell>
                        <TableCell>{plan.maxDatabases}</TableCell>
                        <TableCell>{plan.maxFtpAccounts}</TableCell>
                        <TableCell>
                          {plan.isActive ? (
                            <Badge className="border-transparent bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
                              Active
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-muted-foreground">
                              Inactive
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          {stripeLinked ? (
                            <span
                              className="inline-flex items-center gap-1 text-sm text-green-600 dark:text-green-400"
                              title="Linked to a Stripe product and price"
                            >
                              <Check className="h-4 w-4" aria-hidden="true" />
                              Linked
                            </span>
                          ) : (
                            <span
                              className="inline-flex items-center gap-1 text-sm text-muted-foreground"
                              title="No Stripe product/price — not purchasable"
                            >
                              <X className="h-4 w-4" aria-hidden="true" />
                              Not linked
                            </span>
                          )}
                        </TableCell>
                        <TableCell>{plan.accountCount}</TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`Edit plan ${plan.name}`}
                            onClick={() => setEditing(plan)}
                          >
                            <Pencil className="h-4 w-4" aria-hidden="true" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <PlanEditDialog
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
        plan={editing}
        onConfirm={handleSave}
      />
    </div>
  );
}

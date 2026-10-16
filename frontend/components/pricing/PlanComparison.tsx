import type { ReactNode } from 'react';
import { Check } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { HostingPlanDTO } from '@/lib/hosting-types';
import { formatPlanPrice } from './PlanCards';

interface PlanComparisonProps {
  plans: HostingPlanDTO[];
}

export function PlanComparison({ plans }: PlanComparisonProps) {
  const check = (
    <Check className="mx-auto h-5 w-5 text-primary" aria-label="Included" />
  );

  const rows: Array<{ label: string; render: (plan: HostingPlanDTO) => ReactNode }> = [
    { label: 'Price', render: (p) => `${formatPlanPrice(p)}/month` },
    { label: 'SSD storage', render: (p) => `${p.diskGB} GB` },
    { label: 'Monthly bandwidth', render: (p) => `${p.bandwidthGB} GB` },
    { label: 'Custom domains', render: (p) => `Up to ${p.maxDomains}` },
    { label: 'MySQL databases', render: (p) => p.maxDatabases },
    { label: 'FTP accounts', render: (p) => p.maxFtpAccounts },
    { label: 'Free sahary.cloud subdomain', render: () => check },
    { label: 'Free SSL certificates', render: () => check },
    { label: 'Solar powered', render: () => check },
  ];

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="text-start">Feature</TableHead>
            {plans.map((plan) => (
              <TableHead key={plan.id} className="text-center">
                {plan.name}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.label}>
              <TableCell className="font-medium">{row.label}</TableCell>
              {plans.map((plan) => (
                <TableCell key={plan.id} className="text-center">
                  {row.render(plan)}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

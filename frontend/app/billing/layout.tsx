import { redirect } from 'next/navigation';
import { features } from '@/lib/features';

// The /billing section is the legacy VPS/VM invoicing UI. When VPS features are
// flagged off, send users to the hosting subscription page instead.
export default function BillingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!features.vps) {
    redirect('/dashboard/subscription');
  }
  return <>{children}</>;
}

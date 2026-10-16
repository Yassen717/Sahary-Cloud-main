import Link from 'next/link';
import {
  ChevronRight,
  CreditCard,
  Database,
  FolderOpen,
  Globe,
  KeyRound,
} from 'lucide-react';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

const LINKS = [
  {
    href: '/dashboard/hosting/files',
    label: 'Files',
    description: 'Upload and edit site files',
    icon: FolderOpen,
  },
  {
    href: '/dashboard/hosting/domains',
    label: 'Domains',
    description: 'Verify domains and SSL',
    icon: Globe,
  },
  {
    href: '/dashboard/hosting/databases',
    label: 'Databases',
    description: 'MySQL databases',
    icon: Database,
  },
  {
    href: '/dashboard/hosting/ftp',
    label: 'FTP',
    description: 'Credentials and access',
    icon: KeyRound,
  },
  {
    href: '/dashboard/subscription',
    label: 'Subscription',
    description: 'Plan and billing',
    icon: CreditCard,
  },
];

export function HostingQuickLinks() {
  return (
    <nav aria-label="Hosting quick links">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {LINKS.map(({ href, label, description, icon: Icon }) => (
          <Link key={href} href={href} className="block hover-lift">
            <Card className="h-full border-2 hover:border-primary/50 transition-all-smooth">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <Icon className="h-5 w-5 text-primary" aria-hidden="true" />
                  <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                </div>
                <CardTitle className="text-base">{label}</CardTitle>
                <CardDescription className="text-xs">{description}</CardDescription>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>
    </nav>
  );
}

'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

const tabs = [
  { href: '/dashboard/hosting', label: 'Overview' },
  { href: '/dashboard/hosting/domains', label: 'Domains' },
  { href: '/dashboard/hosting/files', label: 'Files' },
  { href: '/dashboard/hosting/databases', label: 'Databases' },
  { href: '/dashboard/hosting/ftp', label: 'FTP' },
  { href: '/dashboard/subscription', label: 'Subscription' },
];

export default function HostingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const isActive = (href: string) =>
    href === '/dashboard/hosting'
      ? pathname === href
      : pathname.startsWith(href);

  return (
    <div className="container mx-auto max-w-5xl p-6">
      <nav
        aria-label="Hosting sections"
        className="mb-6 flex gap-2 overflow-x-auto border-b"
      >
        {tabs.map(({ href, label }) => (
          <Link
            key={href}
            href={href}
            aria-current={isActive(href) ? 'page' : undefined}
            className={cn(
              '-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition-colors',
              isActive(href)
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {label}
          </Link>
        ))}
      </nav>
      {children}
    </div>
  );
}

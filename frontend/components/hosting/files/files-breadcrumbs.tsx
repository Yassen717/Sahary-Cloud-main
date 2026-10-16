'use client';

import { HardDrive } from 'lucide-react';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { pathSegments } from './utils';
import { Fragment } from 'react';

interface FilesBreadcrumbsProps {
  path: string;
  onNavigate: (path: string) => void;
}

/** Clickable breadcrumb trail for the current directory. */
export function FilesBreadcrumbs({ path, onNavigate }: FilesBreadcrumbsProps) {
  const segments = pathSegments(path);

  return (
    <Breadcrumb aria-label="Current folder">
      <BreadcrumbList className="flex-wrap">
        <BreadcrumbItem>
          {segments.length === 0 ? (
            <BreadcrumbPage className="inline-flex items-center gap-1.5">
              <HardDrive className="h-4 w-4" aria-hidden="true" />
              Home
            </BreadcrumbPage>
          ) : (
            <BreadcrumbLink
              href="/dashboard/hosting/files"
              className="inline-flex items-center gap-1.5"
              onClick={(e) => {
                e.preventDefault();
                onNavigate('/');
              }}
            >
              <HardDrive className="h-4 w-4" aria-hidden="true" />
              Home
            </BreadcrumbLink>
          )}
        </BreadcrumbItem>
        {segments.map((segment, index) => {
          const isLast = index === segments.length - 1;
          return (
            <Fragment key={segment.path}>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                {isLast ? (
                  <BreadcrumbPage>{segment.name}</BreadcrumbPage>
                ) : (
                  <BreadcrumbLink
                    href={`/dashboard/hosting/files?path=${encodeURIComponent(segment.path)}`}
                    onClick={(e) => {
                      e.preventDefault();
                      onNavigate(segment.path);
                    }}
                  >
                    {segment.name}
                  </BreadcrumbLink>
                )}
              </BreadcrumbItem>
            </Fragment>
          );
        })}
      </BreadcrumbList>
    </Breadcrumb>
  );
}

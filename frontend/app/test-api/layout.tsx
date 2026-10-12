import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';

// Developer diagnostics page: never served in production builds
export default function DevOnlyLayout({ children }: { children: ReactNode }) {
  if (process.env.NODE_ENV === 'production') {
    notFound();
  }
  return children;
}

'use client';

import { useEffect } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { trackPageView } from '@/lib/analytics';

export function AnalyticsProvider({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const searchParams = useSearchParams();

    useEffect(() => {
        // Track page view on route change
        if (pathname) {
            const url = searchParams ? `${pathname}?${searchParams}` : pathname;
            trackPageView(url);
        }
    }, [pathname, searchParams]);

    return <>{children}</>;
}

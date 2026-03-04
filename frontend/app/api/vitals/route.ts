import { NextRequest, NextResponse } from 'next/server';

// Allow the browser sendBeacon content-type
export const runtime = 'edge';

interface VitalPayload {
    name: string;
    value: number;
    rating: 'good' | 'needs-improvement' | 'poor';
    delta: number;
    id: string;
    url: string;
    userAgent: string;
    timestamp: string;
}

const RATING_EMOJI = { good: '✅', 'needs-improvement': '⚠️', poor: '❌' } as const;

export async function POST(request: NextRequest) {
    try {
        const body = await request.text();
        const metric: VitalPayload = JSON.parse(body);

        // Basic validation
        const VALID_VITALS = ['CLS', 'INP', 'FCP', 'LCP', 'TTFB'];
        if (!VALID_VITALS.includes(metric.name)) {
            return NextResponse.json({ error: 'Unknown vital name' }, { status: 400 });
        }

        const unit = metric.name === 'CLS' ? '' : 'ms';
        const emoji = RATING_EMOJI[metric.rating] ?? '?';

        // Log to server console — your backend logger picks this up in prod
        console.log(
            `${emoji} [Web Vitals] ${metric.name}: ${metric.value}${unit} (${metric.rating}) — ${new URL(metric.url).pathname}`
        );

        // TODO: forward to a time-series store (Prometheus, ClickHouse, Plausible…)
        // when you're ready. For now logging is enough to prove the pipeline.

        // 204 is ideal for sendBeacon — no response body needed
        return new NextResponse(null, { status: 204 });
    } catch {
        // Never let a vitals error surface to the user
        return new NextResponse(null, { status: 204 });
    }
}

// Preflight for any future cross-origin beacon configuration
export async function OPTIONS() {
    return new NextResponse(null, {
        status: 204,
        headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
        },
    });
}

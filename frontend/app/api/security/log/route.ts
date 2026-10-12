import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

const MAX_BODY_BYTES = 4 * 1024;
const VALID_SEVERITIES = ['low', 'medium', 'high', 'critical'];

interface SecurityEventPayload {
    type?: unknown;
    severity?: unknown;
    details?: unknown;
}

const clean = (value: unknown, max: number) =>
    typeof value === 'string' ? value.replace(/[\r\n]+/g, ' ').slice(0, max) : undefined;

/**
 * Receives client-side security events from lib/security.ts (production only)
 * and records them in the server log.
 */
export async function POST(request: NextRequest) {
    try {
        const body = await request.text();
        if (body.length > MAX_BODY_BYTES) {
            return new NextResponse(null, { status: 413 });
        }

        const event: SecurityEventPayload = JSON.parse(body);
        const type = clean(event.type, 64);
        const severity = clean(event.severity, 16);
        if (!type || !severity || !VALID_SEVERITIES.includes(severity)) {
            return NextResponse.json({ error: 'Invalid security event' }, { status: 400 });
        }

        console.warn(`[Security Event] ${severity.toUpperCase()} ${type}: ${clean(event.details, 500) ?? ''}`);

        return new NextResponse(null, { status: 204 });
    } catch {
        return new NextResponse(null, { status: 204 });
    }
}

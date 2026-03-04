'use client';

import { useEffect } from 'react';
import { onCLS, onFCP, onINP, onLCP, onTTFB, type Metric } from 'web-vitals';

// Where to send the metrics — can be overridden via env var
const REPORT_ENDPOINT =
    process.env.NEXT_PUBLIC_VITALS_ENDPOINT || '/api/vitals';

// Rating thresholds (matches Google's Core Web Vitals)
function getRating(name: string, value: number): 'good' | 'needs-improvement' | 'poor' {
    const thresholds: Record<string, [number, number]> = {
        CLS: [0.1, 0.25],
        INP: [200, 500],
        FCP: [1800, 3000],
        LCP: [2500, 4000],
        TTFB: [800, 1800],
    };
    const [good, poor] = thresholds[name] ?? [0, Infinity];
    if (value <= good) return 'good';
    if (value <= poor) return 'needs-improvement';
    return 'poor';
}

function sendMetric(metric: Metric) {
    const payload = {
        name: metric.name,
        value: Math.round(metric.name === 'CLS' ? metric.value * 1000 : metric.value),
        rating: getRating(metric.name, metric.value),
        delta: Math.round(metric.name === 'CLS' ? metric.delta * 1000 : metric.delta),
        id: metric.id,
        url: window.location.href,
        userAgent: navigator.userAgent,
        timestamp: new Date().toISOString(),
    };

    // Dev: log to console with colour-coded rating
    if (process.env.NODE_ENV === 'development') {
        const colours = { good: '✅', 'needs-improvement': '⚠️', poor: '❌' };
        const unit = metric.name === 'CLS' ? '' : 'ms';
        console.log(
            `${colours[payload.rating]} [Web Vitals] ${metric.name}: ${payload.value}${unit} (${payload.rating})`
        );
    }

    // Send to backend — use sendBeacon so it fires even during page unload
    if (typeof navigator.sendBeacon === 'function') {
        navigator.sendBeacon(
            REPORT_ENDPOINT,
            JSON.stringify(payload)
        );
    } else {
        fetch(REPORT_ENDPOINT, {
            method: 'POST',
            body: JSON.stringify(payload),
            headers: { 'Content-Type': 'application/json' },
            keepalive: true,
        }).catch(() => {/* ignore — non-critical */ });
    }
}

/**
 * WebVitalsReporter
 * Drop this anywhere in the component tree; it measures and reports
 * all five Core Web Vitals the first time each is available.
 */
export default function WebVitalsReporter() {
    useEffect(() => {
        onCLS(sendMetric);
        onINP(sendMetric);
        onFCP(sendMetric);
        onLCP(sendMetric);
        onTTFB(sendMetric);
    }, []);

    // Invisible — renders nothing
    return null;
}

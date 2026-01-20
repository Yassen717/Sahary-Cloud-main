/**
 * Security utilities for XSS prevention and input sanitization
 */

/**
 * Sanitize HTML string to prevent XSS attacks
 * Uses DOMParser for safer sanitization
 * @param dirty Untrusted HTML string
 * @returns Sanitized HTML string
 */
export function sanitizeHtml(dirty: string): string {
    if (typeof window === 'undefined') return dirty;
    
    const parser = new DOMParser();
    const doc = parser.parseFromString(dirty, 'text/html');
    
    // Remove all script tags
    const scripts = doc.querySelectorAll('script');
    scripts.forEach(script => script.remove());
    
    // Remove event handlers
    const allElements = doc.querySelectorAll('*');
    allElements.forEach(el => {
        Array.from(el.attributes).forEach(attr => {
            if (attr.name.startsWith('on')) {
                el.removeAttribute(attr.name);
            }
        });
    });
    
    return doc.body.innerHTML;
}

/**
 * Escape HTML special characters
 * @param unsafe Unsafe string
 * @returns Escaped string
 */
export function escapeHtml(unsafe: string): string {
    return unsafe
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

/**
 * Sanitize user input for forms
 * @param input User input string
 * @returns Sanitized input
 */
export function sanitizeInput(input: string): string {
    // Remove script tags and event handlers
    return input
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
        .replace(/on\w+\s*=\s*["']?[^"']*["']?/gi, '')
        .replace(/javascript:/gi, '')
        .trim();
}

/**
 * Validate email format
 * @param email Email string
 * @returns True if valid email format
 */
export function isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

/**
 * Validate URL format
 * @param url URL string
 * @returns True if valid URL format
 */
export function isValidUrl(url: string): boolean {
    try {
        const urlObj = new URL(url);
        return urlObj.protocol === 'http:' || urlObj.protocol === 'https:';
    } catch {
        return false;
    }
}

/**
 * Sanitize filename to prevent directory traversal
 * @param filename Untrusted filename
 * @returns Safe filename
 */
export function sanitizeFilename(filename: string): string {
    // Remove path separators and special characters
    return filename
        .replace(/[\/\\]/g, '')
        .replace(/\.\./g, '')
        .replace(/[^a-zA-Z0-9._-]/g, '_')
        .substring(0, 255); // Limit length
}

/**
 * Check password strength
 * @param password Password string
 * @returns Strength score (0-4) and feedback
 */
export function checkPasswordStrength(password: string): {
    score: number;
    feedback: string;
} {
    let score = 0;
    const feedback: string[] = [];

    if (password.length >= 8) score++;
    else feedback.push('At least 8 characters');

    if (password.length >= 12) score++;

    if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
    else feedback.push('Mix of uppercase and lowercase');

    if (/\d/.test(password)) score++;
    else feedback.push('Include numbers');

    if (/[^a-zA-Z0-9]/.test(password)) score++;
    else feedback.push('Include special characters');

    return {
        score: Math.min(score, 4),
        feedback: feedback.length > 0 ? feedback.join(', ') : 'Strong password',
    };
}

/**
 * Generate CSRF token
 * @returns CSRF token
 */
export function generateCsrfToken(): string {
    if (typeof window === 'undefined') return '';
    
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Store CSRF token in sessionStorage
 * @param token CSRF token
 */
export function storeCsrfToken(token: string): void {
    if (typeof window !== 'undefined') {
        sessionStorage.setItem('csrf_token', token);
    }
}

/**
 * Get stored CSRF token
 * @returns CSRF token or null
 */
export function getCsrfToken(): string | null {
    if (typeof window !== 'undefined') {
        return sessionStorage.getItem('csrf_token');
    }
    return null;
}

/**
 * Validate CSRF token
 * @param token Token to validate
 * @param storedToken Stored token from session/cookie
 * @returns True if tokens match
 */
export function validateCsrfToken(token: string, storedToken: string): boolean {
    return token === storedToken;
}

/**
 * Content Security Policy headers (for reference)
 */
export const securityHeaders = {
    'Content-Security-Policy':
        "default-src 'self'; " +
        "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://www.googletagmanager.com; " +
        "style-src 'self' 'unsafe-inline'; " +
        "img-src 'self' data: https:; " +
        "font-src 'self' data:; " +
        "connect-src 'self' http://localhost:3000 https:; " +
        "frame-ancestors 'none';",
    'X-Frame-Options': 'DENY',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy':
        'camera=(), microphone=(), geolocation=(), interest-cohort=()',
};

/**
 * Rate limiter for client-side requests
 */
class RateLimiter {
    private requests: Map<string, number[]> = new Map();
    private limit: number;
    private window: number;

    constructor(limit: number = 10, windowMs: number = 60000) {
        this.limit = limit;
        this.window = windowMs;
    }

    canMakeRequest(key: string): boolean {
        const now = Date.now();
        const requests = this.requests.get(key) || [];
        
        // Remove old requests outside the window
        const validRequests = requests.filter(time => now - time < this.window);
        
        if (validRequests.length >= this.limit) {
            return false;
        }
        
        validRequests.push(now);
        this.requests.set(key, validRequests);
        return true;
    }

    reset(key: string): void {
        this.requests.delete(key);
    }
}

export const rateLimiter = new RateLimiter();

/**
 * Detect suspicious patterns in input
 * @param input User input
 * @returns True if suspicious
 */
export function detectSuspiciousInput(input: string): boolean {
    const suspiciousPatterns = [
        /<script/i,
        /javascript:/i,
        /on\w+\s*=/i,
        /<iframe/i,
        /eval\(/i,
        /document\.cookie/i,
        /\.\.\/\.\.\//, // Path traversal
    ];
    
    return suspiciousPatterns.some(pattern => pattern.test(input));
}

/**
 * Log security event
 * @param event Security event details
 */
export function logSecurityEvent(event: {
    type: string;
    severity: 'low' | 'medium' | 'high';
    details: string;
}): void {
    if (process.env.NODE_ENV === 'development') {
        console.warn('[Security Event]', event);
    }
    
    // In production, send to monitoring service
    if (typeof window !== 'undefined' && process.env.NODE_ENV === 'production') {
        // Send to your monitoring service
        fetch('/api/security/log', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(event),
        }).catch(() => {});
    }
}

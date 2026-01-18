/**
 * Security utilities for XSS prevention and input sanitization
 */

/**
 * Sanitize HTML string to prevent XSS attacks
 * @param dirty Untrusted HTML string
 * @returns Sanitized HTML string
 */
export function sanitizeHtml(dirty: string): string {
    // Create a temporary div element
    const div = document.createElement('div');
    div.textContent = dirty;
    return div.innerHTML;
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
 * Generate CSRF token (client-side placeholder)
 * In production, this should come from the server
 * @returns CSRF token
 */
export function generateCsrfToken(): string {
    return Math.random().toString(36).substring(2) + Date.now().toString(36);
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

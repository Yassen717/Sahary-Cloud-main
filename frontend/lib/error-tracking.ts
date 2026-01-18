/**
 * Error tracking and monitoring utilities  
 * Optional Sentry integration for production error tracking
 */

const SENTRY_DSN = process.env.NEXT_PUBLIC_SENTRY_DSN;

/**
 * Initialize error tracking (Sentry)
 * Call this in the root layout or _app
 */
export const initErrorTracking = () => {
    if (typeof window === 'undefined' || !SENTRY_DSN) {
        console.log('Error tracking not initialized (no Sentry DSN)');
        return;
    }

    // If you want to add Sentry, install @sentry/nextjs and initialize here
    console.log('Error tracking initialized');
};

/**
 * Capture an exception
 * @param error Error object  
 * @param context Additional context
 */
export const captureException = (error: Error, context?: Record<string, any>) => {
    if (typeof window === 'undefined') {
        return;
    }

    // Log to console in development
    if (process.env.NODE_ENV === 'development') {
        console.error('Error captured:', error, context);
    }

    // Send to Sentry if configured
    // if (Sentry) {
    //   Sentry.captureException(error, { extra: context });
    // }
};

/**
 * Capture a message
 * @param message Message string
 * @param level Severity level
 * @param context Additional context
 */
export const captureMessage = (
    message: string,
    level: 'info' | 'warning' | 'error' = 'info',
    context?: Record<string, any>
) => {
    if (typeof window === 'undefined') {
        return;
    }

    // Log to console in development
    if (process.env.NODE_ENV === 'development') {
        console[level === 'error' ? 'error' : level === 'warning' ? 'warn' : 'log'](
            `[${level.toUpperCase()}]`,
            message,
            context
        );
    }

    // Send to Sentry if configured
    // if (Sentry) {
    //   Sentry.captureMessage(message, level as any, { extra: context });
    // }
};

/**
 * Set user context for error tracking
 * @param user User information
 */
export const setUserContext = (user: {
    id: string;
    email?: string;
    name?: string;
}) => {
    if (typeof window === 'undefined') {
        return;
    }

    // Set in Sentry if configured
    // if (Sentry) {
    //   Sentry.setUser(user);
    // }
};

/**
 * Clear user context
 */
export const clearUserContext = () => {
    if (typeof window === 'undefined') {
        return;
    }

    // Clear in Sentry if configured
    // if (Sentry) {
    //   Sentry.setUser(null);
    // }
};

/**
 * Add breadcrumb for error context
 * @param message Breadcrumb message
 * @param category Category
 * @param data Additional data
 */
export const addBreadcrumb = (
    message: string,
    category: string = 'user-action',
    data?: Record<string, any>
) => {
    if (typeof window === 'undefined') {
        return;
    }

    // Add to Sentry if configured
    // if (Sentry) {
    //   Sentry.addBreadcrumb({
    //     message,
    //     category,
    //     data,
    //     level: 'info',
    //   });
    // }
};

export const errorTracking = {
    init: initErrorTracking,
    captureException,
    captureMessage,
    setUser: setUserContext,
    clearUser: clearUserContext,
    addBreadcrumb,
};

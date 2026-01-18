/**
 * Analytics tracking utilities
 * Supports Google Analytics with privacy-compliant tracking
 */

// Google Analytics Measurement ID
const GA_MEASUREMENT_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;

/**
 * Initialize Google Analytics
 */
export const initGA = () => {
    if (typeof window === 'undefined' || !GA_MEASUREMENT_ID) {
        return;
    }

    window.gtag('js', new Date());
    window.gtag('config', GA_MEASUREMENT_ID, {
        page_path: window.location.pathname,
    });
};

/**
 * Track page view
 * @param url Page URL
 */
export const trackPageView = (url: string) => {
    if (typeof window === 'undefined' || !GA_MEASUREMENT_ID) {
        return;
    }

    window.gtag('config', GA_MEASUREMENT_ID, {
        page_path: url,
    });
};

/**
 * Track custom event
 * @param action Event action
 * @param params Event parameters
 */
export const trackEvent = (
    action: string,
    params?: {
        category?: string;
        label?: string;
        value?: number;
        [key: string]: any;
    }
) => {
    if (typeof window === 'undefined' || !GA_MEASUREMENT_ID) {
        return;
    }

    window.gtag('event', action, params);
};

/**
 * Track exception/error
 * @param description Error description
 * @param fatal Whether the error is fatal
 */
export const trackException = (description: string, fatal: boolean = false) => {
    if (typeof window === 'undefined' || !GA_MEASUREMENT_ID) {
        return;
    }

    window.gtag('event', 'exception', {
        description,
        fatal,
    });
};

/**
 * Set user properties
 * @param userId User ID
 * @param properties User properties
 */
export const setUserProperties = (
    userId: string,
    properties?: Record<string, any>
) => {
    if (typeof window === 'undefined' || !GA_MEASUREMENT_ID) {
        return;
    }

    window.gtag('set', 'user_properties', {
        user_id: userId,
        ...properties,
    });
};

// Type definitions for gtag
declare global {
    interface Window {
        gtag: (
            command: 'js' | 'config' | 'event' | 'set',
            targetOrDate: string | Date,
            params?: any
        ) => void;
        dataLayer: any[];
    }
}

// Common event tracking helpers
export const analytics = {
    // User actions
    signUp: (method: string) => trackEvent('sign_up', { method }),
    login: (method: string) => trackEvent('login', { method }),
    logout: () => trackEvent('logout'),

    // VM actions
    createVM: (plan: string) => trackEvent('create_vm', { category: 'VM', label: plan }),
    startVM: (vmId: string) => trackEvent('start_vm', { category: 'VM', label: vmId }),
    stopVM: (vmId: string) => trackEvent('stop_vm', { category: 'VM', label: vmId }),
    deleteVM: (vmId: string) => trackEvent('delete_vm', { category: 'VM', label: vmId }),

    // Billing actions
    viewInvoice: (invoiceId: string) => trackEvent('view_invoice', { category: 'Billing', label: invoiceId }),
    payInvoice: (invoiceId: string, amount: number) =>
        trackEvent('pay_invoice', { category: 'Billing', label: invoiceId, value: amount }),

    // Solar monitoring
    viewSolarDashboard: () => trackEvent('view_solar_dashboard', { category: 'Solar' }),
    viewEnvironmentalImpact: () => trackEvent('view_environmental_impact', { category: 'Solar' }),

    // Navigation
    pageView: (pageName: string) => trackPageView(pageName),

    // Errors
    error: (errorMessage: string, fatal: boolean = false) => trackException(errorMessage, fatal),
};

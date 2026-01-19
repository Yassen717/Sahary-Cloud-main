/**
 * Accessibility utilities for keyboard navigation and screen readers
 */

/**
 * Trap focus within a modal/dialog
 * @param element The container element to trap focus within
 */
export function trapFocus(element: HTMLElement) {
    const focusableElements = element.querySelectorAll(
        'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
    );

    const firstElement = focusableElements[0] as HTMLElement;
    const lastElement = focusableElements[focusableElements.length - 1] as HTMLElement;

    const handleTabKey = (e: KeyboardEvent) => {
        if (e.key !== 'Tab') return;

        if (e.shiftKey) {
            if (document.activeElement === firstElement) {
                lastElement?.focus();
                e.preventDefault();
            }
        } else {
            if (document.activeElement === lastElement) {
                firstElement?.focus();
                e.preventDefault();
            }
        }
    };

    element.addEventListener('keydown', handleTabKey);

    // Return cleanup function
    return () => {
        element.removeEventListener('keydown', handleTabKey);
    };
}

/**
 * Announce message to screen readers
 * @param message Message to announce
 * @param priority 'polite' (wait for pause) or 'assertive' (interrupt)
 */
export function announceToScreenReader(
    message: string,
    priority: 'polite' | 'assertive' = 'polite'
) {
    if (typeof document === 'undefined') return;

    const announcement = document.createElement('div');
    announcement.setAttribute('role', 'status');
    announcement.setAttribute('aria-live', priority);
    announcement.setAttribute('aria-atomic', 'true');
    announcement.className = 'sr-only';
    announcement.textContent = message;

    document.body.appendChild(announcement);

    // Remove after announcement
    setTimeout(() => {
        document.body.removeChild(announcement);
    }, 1000);
}

/**
 * Generate unique ID for aria-describedby and aria-labelledby
 * @param prefix Prefix for the ID
 */
export function generateAriaId(prefix: string): string {
    return `${prefix}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Check if element is visible (for keyboard navigation)
 * @param element Element to check
 */
export function isElementVisible(element: HTMLElement): boolean {
    return !!(
        element.offsetWidth ||
        element.offsetHeight ||
        element.getClientRects().length
    );
}

/**
 * Move focus to first error in form
 * @param formElement Form element
 */
export function focusFirstError(formElement: HTMLFormElement) {
    const firstError = formElement.querySelector('[aria-invalid="true"]') as HTMLElement;
    if (firstError) {
        firstError.focus();
        announceToScreenReader('Please fix the errors in the form', 'assertive');
    }
}

/**
 * Skip to main content (for skip links)
 */
export function skipToMainContent() {
    const main = document.querySelector('main');
    if (main) {
        main.setAttribute('tabindex', '-1');
        main.focus();
        main.removeAttribute('tabindex');
    }
}

/**
 * Check color contrast ratio
 * @param foreground Foreground color (hex)
 * @param background Background color (hex)
 * @returns Contrast ratio
 */
export function getContrastRatio(foreground: string, background: string): number {
    const getLuminance = (hex: string) => {
        const rgb = parseInt(hex.slice(1), 16);
        const r = (rgb >> 16) & 0xff;
        const g = (rgb >> 8) & 0xff;
        const b = (rgb >> 0) & 0xff;

        const [rs, gs, bs] = [r, g, b].map(c => {
            c = c / 255;
            return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
        });

        return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
    };

    const l1 = getLuminance(foreground);
    const l2 = getLuminance(background);

    return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

/**
 * Check if contrast meets WCAG AA standards
 * @param foreground Foreground color
 * @param background Background color
 * @param level 'AA' or 'AAA'
 * @returns Whether contrast is sufficient
 */
export function meetsContrastRequirement(
    foreground: string,
    background: string,
    level: 'AA' | 'AAA' = 'AA'
): boolean {
    const ratio = getContrastRatio(foreground, background);
    return level === 'AA' ? ratio >= 4.5 : ratio >= 7;
}

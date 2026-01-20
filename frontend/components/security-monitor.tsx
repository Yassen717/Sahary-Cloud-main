'use client';

import { useEffect } from 'react';
import { logSecurityEvent } from '@/lib/security';

export function SecurityMonitor() {
  useEffect(() => {
    // Monitor for console tampering
    const originalConsole = { ...console };
    
    // Detect DevTools opening (basic detection)
    let devtoolsOpen = false;
    const detectDevTools = () => {
      const threshold = 160;
      if (
        window.outerWidth - window.innerWidth > threshold ||
        window.outerHeight - window.innerHeight > threshold
      ) {
        if (!devtoolsOpen) {
          devtoolsOpen = true;
          logSecurityEvent({
            type: 'DEVTOOLS_OPENED',
            severity: 'low',
            details: 'Developer tools detected',
          });
        }
      } else {
        devtoolsOpen = false;
      }
    };

    // Monitor for suspicious clipboard activity
    const handleCopy = (e: ClipboardEvent) => {
      const selection = window.getSelection()?.toString();
      if (selection && selection.length > 1000) {
        logSecurityEvent({
          type: 'LARGE_CLIPBOARD_COPY',
          severity: 'low',
          details: 'Large amount of data copied to clipboard',
        });
      }
    };

    // Monitor for rapid form submissions (potential bot)
    let lastSubmitTime = 0;
    const handleSubmit = () => {
      const now = Date.now();
      if (now - lastSubmitTime < 1000) {
        logSecurityEvent({
          type: 'RAPID_FORM_SUBMISSION',
          severity: 'medium',
          details: 'Rapid form submissions detected',
        });
      }
      lastSubmitTime = now;
    };

    // Monitor for suspicious navigation patterns
    let navigationCount = 0;
    const handleNavigation = () => {
      navigationCount++;
      if (navigationCount > 50) {
        logSecurityEvent({
          type: 'EXCESSIVE_NAVIGATION',
          severity: 'medium',
          details: 'Excessive page navigation detected',
        });
        navigationCount = 0;
      }
    };

    // Set up event listeners
    const devToolsInterval = setInterval(detectDevTools, 1000);
    document.addEventListener('copy', handleCopy);
    document.addEventListener('submit', handleSubmit, true);
    window.addEventListener('popstate', handleNavigation);

    // Cleanup
    return () => {
      clearInterval(devToolsInterval);
      document.removeEventListener('copy', handleCopy);
      document.removeEventListener('submit', handleSubmit, true);
      window.removeEventListener('popstate', handleNavigation);
    };
  }, []);

  return null; // This component doesn't render anything
}

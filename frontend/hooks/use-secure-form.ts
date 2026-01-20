'use client';

import { useState, useCallback, useEffect } from 'react';
import { sanitizeInput, detectSuspiciousInput, logSecurityEvent, generateCsrfToken, storeCsrfToken, getCsrfToken } from '@/lib/security';

interface UseSecureFormOptions {
  onSubmit: (data: Record<string, any>) => Promise<void>;
  sanitize?: boolean;
  detectThreats?: boolean;
}

export function useSecureForm({ onSubmit, sanitize = true, detectThreats = true }: UseSecureFormOptions) {
  const [csrfToken, setCsrfToken] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string>('');

  useEffect(() => {
    // Generate and store CSRF token on mount
    let token = getCsrfToken();
    if (!token) {
      token = generateCsrfToken();
      storeCsrfToken(token);
    }
    setCsrfToken(token);
  }, []);

  const handleSecureSubmit = useCallback(
    async (data: Record<string, any>) => {
      setError('');
      setIsSubmitting(true);

      try {
        // Validate CSRF token
        const storedToken = getCsrfToken();
        if (csrfToken !== storedToken) {
          throw new Error('Invalid security token. Please refresh the page.');
        }

        // Sanitize and validate inputs
        const processedData: Record<string, any> = {};
        
        for (const [key, value] of Object.entries(data)) {
          if (typeof value === 'string') {
            // Detect suspicious patterns
            if (detectThreats && detectSuspiciousInput(value)) {
              logSecurityEvent({
                type: 'SUSPICIOUS_INPUT',
                severity: 'high',
                details: `Suspicious input detected in field: ${key}`,
              });
              throw new Error('Invalid input detected. Please check your data.');
            }

            // Sanitize input
            processedData[key] = sanitize ? sanitizeInput(value) : value;
          } else {
            processedData[key] = value;
          }
        }

        // Add CSRF token to submission
        processedData._csrf = csrfToken;

        await onSubmit(processedData);
      } catch (err: any) {
        setError(err.message || 'An error occurred');
        throw err;
      } finally {
        setIsSubmitting(false);
      }
    },
    [csrfToken, onSubmit, sanitize, detectThreats]
  );

  return {
    handleSecureSubmit,
    isSubmitting,
    error,
    csrfToken,
  };
}

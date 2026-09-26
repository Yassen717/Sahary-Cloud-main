declare module 'validator' {
  export function stripLow(input: string): string;
  export function escape(input: string): string;
  export function isEmail(input: string): boolean;
  export function normalizeEmail(input: string): string | false;
  export function isURL(input: string, options?: Record<string, unknown>): boolean;
  export function isUUID(input: string): boolean;
}

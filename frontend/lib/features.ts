// Feature flags driven by NEXT_PUBLIC_* env vars (inlined at build time).
// NEXT_PUBLIC_ENABLE_VPS: 'true' enables the VPS/VM management UI; the hosting
// MVP ships with VPS features flagged off.
export const features = {
  vps: process.env.NEXT_PUBLIC_ENABLE_VPS === 'true',
} as const;

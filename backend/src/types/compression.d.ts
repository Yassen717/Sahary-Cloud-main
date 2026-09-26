declare module 'compression' {
  import type { RequestHandler } from 'express';

  const compression: (options?: Record<string, unknown>) => RequestHandler;
  export default compression;
}

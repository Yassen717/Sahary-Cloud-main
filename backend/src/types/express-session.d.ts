declare module 'express-session' {
  import type { RequestHandler } from 'express';

  const session: (options?: Record<string, unknown>) => RequestHandler;
  export default session;
}
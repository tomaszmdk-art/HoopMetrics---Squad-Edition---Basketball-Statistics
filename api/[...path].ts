import type { IncomingMessage, ServerResponse } from 'http';
import { createApiApp } from './_app.js';

let cachedApp: ReturnType<typeof createApiApp> | null = null;

export default function handler(req: IncomingMessage, res: ServerResponse) {
  try {
    if (!cachedApp) {
      cachedApp = createApiApp({ supportsWebSocket: false });
    }
    return cachedApp(req as any, res as any);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal Server Error';
    console.error('Vercel API handler error:', err);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
    }
    res.end(JSON.stringify({ success: false, error: message }));
  }
}

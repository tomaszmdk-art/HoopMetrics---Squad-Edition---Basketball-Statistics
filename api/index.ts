import type { IncomingMessage, ServerResponse } from 'http';
import { createApiApp } from './_app.js';

let cachedApp: ReturnType<typeof createApiApp> | null = null;

function normalizeVercelUrl(rawUrl: string | undefined): string {
  const urlStr = rawUrl || '/api';
  try {
    const parsed = new URL(urlStr, 'http://localhost');
    const vercelPath = parsed.searchParams.get('__vercel_path');

    if (vercelPath !== null) {
      parsed.searchParams.delete('__vercel_path');
      const remainingSearch = parsed.searchParams.toString();
      const suffix = remainingSearch ? `?${remainingSearch}` : '';

      if (parsed.pathname === '/api/index' || parsed.pathname === '/api') {
        const cleanSubpath = vercelPath.replace(/^\/+/, '');
        return cleanSubpath ? `/api/${cleanSubpath}${suffix}` : `/api${suffix}`;
      }
      return `${parsed.pathname}${suffix}`;
    }

    return urlStr;
  } catch {
    return urlStr;
  }
}

export default function handler(req: IncomingMessage, res: ServerResponse) {
  try {
    req.url = normalizeVercelUrl(req.url);
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

import express, { Request, Response } from 'express';
import http from 'http';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { WebSocketServer, WebSocket } from 'ws';
import { buildPublicRoomState, createApiApp, loadRoom, sanitizeRoomId } from './api/_app.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// WebSocket room subscriptions: roomId -> Set<WebSocket>
const roomClients = new Map<string, Set<WebSocket>>();

function broadcastToRoom(roomId: string, payload: unknown): void {
  const clients = roomClients.get(roomId);
  if (!clients || clients.size === 0) return;

  const message = JSON.stringify(payload);
  for (const ws of clients) {
    if (ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(message);
      } catch {
        // ignore broken socket
      }
    }
  }
}

const app = createApiApp({
  supportsWebSocket: true,
  onRoomUpdated: (roomId, publicState) => {
    broadcastToRoom(roomId, {
      type: 'ROOM_STATE_UPDATED',
      roomId,
      state: publicState,
    });
  },
});

const port = parseInt(process.env.PORT || '3000', 10);

app.use(express.static(path.resolve(__dirname, 'public')));

// Serve fresh PWA manifest in dev mode
if (process.env.NODE_ENV !== 'production') {
  app.get('/manifest.webmanifest', (_req: Request, res: Response) => {
    res.setHeader('Content-Type', 'application/manifest+json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.json({
      id: '/',
      name: 'BasketStats Pro - Statystyki Koszykarskie Live',
      short_name: 'BasketStats',
      description: 'Profesjonalna aplikacja PWA do statystyk meczowych na żywo dla drużyn koszykarskich.',
      theme_color: '#020617',
      background_color: '#020617',
      display: 'standalone',
      orientation: 'portrait',
      start_url: '/',
      scope: '/',
      icons: [
        { src: '/pwa-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
        { src: '/pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
        { src: '/pwa-maskable-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      ],
    });
  });
}

// Serve fonts with proper TTF mime type
app.get('/fonts/:filename', (req: Request, res: Response) => {
  const fontPath = path.resolve(__dirname, 'public', 'fonts', req.params.filename);
  if (fs.existsSync(fontPath)) {
    res.setHeader('Content-Type', 'font/ttf');
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.sendFile(fontPath);
  } else {
    res.status(404).send('Font not found');
  }
});

async function startServer() {
  const httpServer = http.createServer(app);

  // Real-time WebSocket server for isolated per-room live match & stats updates
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

  wss.on('connection', async (ws, req) => {
    try {
      const reqUrl = new URL(req.url || '/ws', `http://${req.headers.host || 'localhost'}`);
      const roomId = sanitizeRoomId(reqUrl.searchParams.get('room') || '');
      if (!roomId) {
        ws.close(1008, 'Missing or invalid room ID');
        return;
      }

      if (!roomClients.has(roomId)) {
        roomClients.set(roomId, new Set());
      }
      roomClients.get(roomId)!.add(ws);

      // Send initial room snapshot on connection if room exists
      const room = await loadRoom(roomId);
      if (room && ws.readyState === WebSocket.OPEN) {
        ws.send(
          JSON.stringify({
            type: 'ROOM_STATE_UPDATED',
            roomId,
            state: buildPublicRoomState(room, false),
          })
        );
      }

      ws.on('message', (rawMsg) => {
        try {
          const msg = JSON.parse(rawMsg.toString());
          if (msg?.type === 'PING') {
            ws.send(JSON.stringify({ type: 'PONG', ts: Date.now() }));
          }
        } catch {
          // ignore malformed messages
        }
      });

      ws.on('close', () => {
        const set = roomClients.get(roomId);
        if (set) {
          set.delete(ws);
          if (set.size === 0) {
            roomClients.delete(roomId);
          }
        }
      });

      ws.on('error', () => {
        const set = roomClients.get(roomId);
        if (set) set.delete(ws);
      });
    } catch {
      ws.close(1011, 'WebSocket initialization error');
    }
  });

  if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  httpServer.listen(port, '0.0.0.0', () => {
    console.log(`BasketStats Pro multi-room server running on port ${port}`);
  });
}

startServer();

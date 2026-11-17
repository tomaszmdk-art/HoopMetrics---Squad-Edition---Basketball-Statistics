import express, { Request, Response } from 'express';
import http from 'http';
import crypto from 'crypto';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from '@google/genai';
import { WebSocketServer, WebSocket } from 'ws';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Data directory for persistent sync state across devices and server restarts
const dataDir = path.resolve(__dirname, 'data');
const roomsDir = path.join(dataDir, 'rooms');
const legacySyncFilePath = path.join(dataDir, 'sync_state.json');

for (const dir of [dataDir, roomsDir]) {
  if (!fs.existsSync(dir)) {
    try {
      fs.mkdirSync(dir, { recursive: true });
    } catch (err) {
      console.error('Failed to create dir:', dir, err);
    }
  }
}

interface ServerClubProfile {
  id: string;
  name: string;
  shortName: string;
  city: string;
  badgeEmoji: string;
  badgeLogoUrl?: string;
  primaryColor: string;
  secondaryColor: string;
  headCoach?: string;
  assistantCoach?: string;
  categories: string[];
  season: string;
  leagueName?: string;
  updatedAt?: number;
}

interface ServerRoomState {
  roomId: string;
  coachPin: string;
  coachToken: string;
  matches: any[];
  players: any[];
  activeMatchId: string | null;
  deletedMatchIds: string[];
  clubProfile: ServerClubProfile;
  createdAt: number;
  lastUpdated: number;
}

const DEMO_SINGLE_TEAM_PLAYERS = [
  { id: 'demo-team-1', teamCategory: 'TEAM', firstName: 'Jan', lastName: 'Kowalski', number: 4, position: 'PG', notes: 'Rozgrywający • Kapitan', createdAt: Date.now() },
  { id: 'demo-team-2', teamCategory: 'TEAM', firstName: 'Adam', lastName: 'Nowak', number: 7, position: 'SG', notes: 'Strzelec dystansowy', createdAt: Date.now() },
  { id: 'demo-team-3', teamCategory: 'TEAM', firstName: 'Piotr', lastName: 'Wiśniewski', number: 10, position: 'SF', notes: 'Skrzydłowy', createdAt: Date.now() },
  { id: 'demo-team-4', teamCategory: 'TEAM', firstName: 'Kacper', lastName: 'Wójcik', number: 13, position: 'PF', notes: 'Silny skrzydłowy', createdAt: Date.now() },
  { id: 'demo-team-5', teamCategory: 'TEAM', firstName: 'Filip', lastName: 'Kamiński', number: 15, position: 'C', notes: 'Środkowy', createdAt: Date.now() },
  { id: 'demo-team-6', teamCategory: 'TEAM', firstName: 'Mikołaj', lastName: 'Lewandowski', number: 21, position: 'PG', notes: 'Obrońca', createdAt: Date.now() },
  { id: 'demo-team-7', teamCategory: 'TEAM', firstName: 'Szymon', lastName: 'Zieliński', number: 33, position: 'SG', notes: 'Rzucający obrońca', createdAt: Date.now() },
  { id: 'demo-team-8', teamCategory: 'TEAM', firstName: 'Jakub', lastName: 'Dąbrowski', number: 24, position: 'PF', notes: 'Skrzydłowy', createdAt: Date.now() },
];

const ROOM_ID_REGEX = /^[a-z0-9_-]{3,64}$/;

function sanitizeRoomId(raw: string): string | null {
  if (!raw || typeof raw !== 'string') return null;
  const normalized = raw.trim().toLowerCase();
  if (!ROOM_ID_REGEX.test(normalized)) return null;
  return normalized;
}

function slugifyTeamName(name: string): string {
  const polishMap: Record<string, string> = {
    ą: 'a', ć: 'c', ę: 'e', ł: 'l', ń: 'n', ó: 'o', ś: 's', ź: 'z', ż: 'z',
    Ą: 'a', Ć: 'c', Ę: 'e', Ł: 'l', Ń: 'n', Ó: 'o', Ś: 's', Ź: 'z', Ż: 'z',
  };
  const ascii = name
    .split('')
    .map((ch) => polishMap[ch] || ch)
    .join('')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 28);
  const suffix = crypto.randomBytes(3).toString('hex');
  return ascii ? `${ascii}-${suffix}` : `team-${suffix}`;
}

function generateCoachToken(): string {
  return crypto.randomBytes(16).toString('hex');
}

function createDefaultClubProfile(overrides: Partial<ServerClubProfile> = {}): ServerClubProfile {
  return {
    id: 'club-main',
    name: 'Moja Drużyna Koszykarska',
    shortName: 'DRUŻYNA',
    city: 'Polska',
    badgeEmoji: '🏀',
    primaryColor: '#f59e0b',
    secondaryColor: '#0a192f',
    headCoach: '',
    assistantCoach: '',
    categories: ['TEAM'],
    season: '2026/2027',
    leagueName: 'Rozgrywki Ligowe',
    updatedAt: Date.now(),
    ...overrides,
  };
}

// In-memory cache of active rooms
const roomsCache = new Map<string, ServerRoomState>();

function getRoomFilePath(roomId: string): string {
  return path.join(roomsDir, `${roomId}.json`);
}

function saveRoomToDisk(room: ServerRoomState): void {
  try {
    fs.writeFileSync(getRoomFilePath(room.roomId), JSON.stringify(room, null, 2), 'utf-8');
  } catch (err) {
    console.error(`Failed to persist room ${room.roomId}:`, err);
  }
}

function loadRoom(roomId: string): ServerRoomState | null {
  const cleanId = sanitizeRoomId(roomId);
  if (!cleanId) return null;

  const cached = roomsCache.get(cleanId);
  if (cached) return cached;

  const filePath = getRoomFilePath(cleanId);
  if (!fs.existsSync(filePath)) return null;

  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(raw) as ServerRoomState;
    if (!parsed || !parsed.roomId) return null;
    if (!parsed.coachToken) {
      parsed.coachToken = generateCoachToken();
    }
    if (!parsed.coachPin) {
      parsed.coachPin = '1234';
    }
    roomsCache.set(cleanId, parsed);
    return parsed;
  } catch (err) {
    console.error(`Failed to parse room ${cleanId}:`, err);
    return null;
  }
}

function buildPublicRoomState(room: ServerRoomState, isCoachAuthenticated: boolean) {
  return {
    roomId: room.roomId,
    matches: room.matches || [],
    players: room.players || [],
    activeMatchId: room.activeMatchId || null,
    deletedMatchIds: room.deletedMatchIds || [],
    clubProfile: room.clubProfile,
    lastUpdated: room.lastUpdated,
    isCoachAuthenticated,
    ...(isCoachAuthenticated ? { coachPin: room.coachPin } : {}),
  };
}

function isCoachRequestAuthorized(room: ServerRoomState, req: Request): boolean {
  const headerToken = (req.headers['x-coach-token'] as string | undefined)?.trim();
  const queryToken = (req.query.coachToken as string | undefined)?.trim();
  const bodyToken = typeof req.body?.coachToken === 'string' ? req.body.coachToken.trim() : undefined;
  const suppliedToken = headerToken || queryToken || bodyToken;

  if (suppliedToken && suppliedToken === room.coachToken) {
    return true;
  }

  const headerPin = (req.headers['x-coach-pin'] as string | undefined)?.trim();
  const bodyPin = typeof req.body?.pin === 'string' ? req.body.pin.trim() : undefined;
  const suppliedPin = headerPin || bodyPin;
  if (suppliedPin && suppliedPin === room.coachPin) {
    return true;
  }

  return false;
}

// Legacy single-room fallback state (kept only if /api/sync/state is ever hit directly)
let legacySyncState: {
  matches: unknown[];
  players: unknown[];
  activeMatchId: string | null;
  deletedMatchIds: string[];
  clubProfile?: unknown;
  lastUpdated: number;
} = {
  matches: [],
  players: [],
  activeMatchId: null,
  deletedMatchIds: ['match-demo-u13-skierniewice'],
  clubProfile: createDefaultClubProfile(),
  lastUpdated: Date.now(),
};

if (fs.existsSync(legacySyncFilePath)) {
  try {
    const parsed = JSON.parse(fs.readFileSync(legacySyncFilePath, 'utf-8'));
    legacySyncState = {
      matches: Array.isArray(parsed.matches) ? parsed.matches : [],
      players: Array.isArray(parsed.players) ? parsed.players : [],
      activeMatchId: parsed.activeMatchId || null,
      deletedMatchIds: Array.isArray(parsed.deletedMatchIds) ? parsed.deletedMatchIds : [],
      clubProfile: parsed.clubProfile || createDefaultClubProfile(),
      lastUpdated: parsed.lastUpdated || Date.now(),
    };
  } catch {
    // ignore
  }
}

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

const app = express();
const port = parseInt(process.env.PORT || '3000', 10);

app.use(express.json({ limit: '10mb' }));
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

// Enable CORS for cross-origin access between ais-dev and ais-pre domains
app.use((req: Request, res: Response, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, x-coach-token, x-coach-pin');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') {
    res.sendStatus(204);
    return;
  }
  next();
});

// Initialize Google GenAI
const apiKey = process.env.GEMINI_API_KEY || '';
const ai = new GoogleGenAI({
  apiKey: apiKey,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    },
  },
});

// ==========================================
// MULTI-TEAM ROOMS API (POKOJE DRUŻYNOWE)
// ==========================================

// Create a new isolated team room
app.post('/api/rooms', (req: Request, res: Response) => {
  try {
    const {
      teamName,
      shortName,
      city,
      season,
      leagueName,
      headCoach,
      badgeEmoji,
      primaryColor,
      secondaryColor,
      coachPin,
      seedDemoPlayers,
      customRoomId,
    } = req.body || {};

    const cleanName = typeof teamName === 'string' && teamName.trim()
      ? teamName.trim().slice(0, 80)
      : 'Moja Drużyna Koszykarska';

    const cleanShort = typeof shortName === 'string' && shortName.trim()
      ? shortName.trim().toUpperCase().slice(0, 10)
      : cleanName.replace(/[^a-zA-Z0-9ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/g, '').slice(0, 5).toUpperCase() || 'TEAM';

    const cleanPin = typeof coachPin === 'string' && coachPin.trim().length >= 3
      ? coachPin.trim().slice(0, 16)
      : '1234';

    let roomId = customRoomId ? sanitizeRoomId(customRoomId) : null;
    if (roomId && loadRoom(roomId)) {
      // Collision fallback
      roomId = null;
    }
    if (!roomId) {
      roomId = slugifyTeamName(cleanName);
      while (loadRoom(roomId)) {
        roomId = slugifyTeamName(cleanName);
      }
    }

    const now = Date.now();
    const coachToken = generateCoachToken();

    const clubProfile = createDefaultClubProfile({
      name: cleanName,
      shortName: cleanShort,
      city: typeof city === 'string' && city.trim() ? city.trim().slice(0, 50) : 'Polska',
      season: typeof season === 'string' && season.trim() ? season.trim().slice(0, 20) : '2026/2027',
      leagueName: typeof leagueName === 'string' && leagueName.trim() ? leagueName.trim().slice(0, 60) : 'Rozgrywki Ligowe',
      headCoach: typeof headCoach === 'string' ? headCoach.trim().slice(0, 60) : '',
      badgeEmoji: typeof badgeEmoji === 'string' && badgeEmoji.trim() ? badgeEmoji.trim() : '🏀',
      primaryColor: typeof primaryColor === 'string' && primaryColor.startsWith('#') ? primaryColor : '#f59e0b',
      secondaryColor: typeof secondaryColor === 'string' && secondaryColor.startsWith('#') ? secondaryColor : '#0a192f',
      categories: ['TEAM'],
      updatedAt: now,
    });

    const players = seedDemoPlayers
      ? DEMO_SINGLE_TEAM_PLAYERS.map((p) => ({ ...p, createdAt: now }))
      : [];

    const room: ServerRoomState = {
      roomId,
      coachPin: cleanPin,
      coachToken,
      matches: [],
      players,
      activeMatchId: null,
      deletedMatchIds: [],
      clubProfile,
      createdAt: now,
      lastUpdated: now,
    };

    roomsCache.set(roomId, room);
    saveRoomToDisk(room);

    res.status(201).json({
      success: true,
      roomId,
      coachToken,
      state: buildPublicRoomState(room, true),
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Błąd tworzenia pokoju drużyny';
    res.status(500).json({ error: msg });
  }
});

// Check if room exists and return lightweight public preview info
app.get('/api/rooms/:roomId/exists', (req: Request, res: Response) => {
  const roomId = sanitizeRoomId(req.params.roomId);
  if (!roomId) {
    res.status(400).json({ exists: false, error: 'Nieprawidłowy kod pokoju' });
    return;
  }

  const room = loadRoom(roomId);
  if (!room) {
    res.status(404).json({ exists: false, roomId });
    return;
  }

  const activeMatch = room.activeMatchId
    ? room.matches.find((m: any) => m && m.id === room.activeMatchId && m.status === 'live')
    : room.matches.find((m: any) => m && m.status === 'live');

  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.json({
    exists: true,
    roomId: room.roomId,
    teamName: room.clubProfile?.name || 'Drużyna',
    shortName: room.clubProfile?.shortName || 'TEAM',
    city: room.clubProfile?.city || '',
    badgeEmoji: room.clubProfile?.badgeEmoji || '🏀',
    season: room.clubProfile?.season || '2026/2027',
    hasLiveMatch: Boolean(activeMatch),
    liveOpponent: activeMatch?.opponent,
    liveScore: activeMatch ? `${activeMatch.ourScore}:${activeMatch.opponentScore}` : undefined,
    playersCount: Array.isArray(room.players) ? room.players.length : 0,
    matchesCount: Array.isArray(room.matches) ? room.matches.length : 0,
  });
});

// Verify coach PIN or coach token for a room
app.post('/api/rooms/:roomId/auth', (req: Request, res: Response) => {
  const roomId = sanitizeRoomId(req.params.roomId);
  if (!roomId) {
    res.status(400).json({ authenticated: false, error: 'Nieprawidłowy kod pokoju' });
    return;
  }

  const room = loadRoom(roomId);
  if (!room) {
    res.status(404).json({ authenticated: false, error: 'Pokój drużyny nie istnieje' });
    return;
  }

  const { pin, coachToken } = req.body || {};
  const pinMatch = typeof pin === 'string' && pin.trim() !== '' && pin.trim() === room.coachPin;
  const tokenMatch = typeof coachToken === 'string' && coachToken.trim() !== '' && coachToken.trim() === room.coachToken;

  if (!pinMatch && !tokenMatch) {
    res.status(401).json({ authenticated: false, error: 'Nieprawidłowy kod PIN lub token trenera.' });
    return;
  }

  res.json({
    authenticated: true,
    roomId: room.roomId,
    coachToken: room.coachToken,
  });
});

// Fetch isolated room state (safe for parents/spectators; hides PIN/token unless coach authenticated)
app.get('/api/rooms/:roomId/state', (req: Request, res: Response) => {
  const roomId = sanitizeRoomId(req.params.roomId);
  if (!roomId) {
    res.status(400).json({ error: 'Nieprawidłowy kod pokoju' });
    return;
  }

  const room = loadRoom(roomId);
  if (!room) {
    res.status(404).json({ error: 'Pokój drużyny nie został znaleziony' });
    return;
  }

  const isCoach = isCoachRequestAuthorized(room, req);
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.json(buildPublicRoomState(room, isCoach));
});

// Update room state (strictly requires coachToken or coachPin) and broadcast via WebSocket
app.post('/api/rooms/:roomId/state', (req: Request, res: Response) => {
  try {
    const roomId = sanitizeRoomId(req.params.roomId);
    if (!roomId) {
      res.status(400).json({ error: 'Nieprawidłowy kod pokoju' });
      return;
    }

    const room = loadRoom(roomId);
    if (!room) {
      res.status(404).json({ error: 'Pokój drużyny nie istnieje' });
      return;
    }

    if (!isCoachRequestAuthorized(room, req)) {
      res.status(401).json({ error: 'Brak uprawnień trenera (nieprawidłowy token lub PIN).' });
      return;
    }

    const {
      matches,
      players,
      activeMatchId,
      deletedMatchId,
      deletedMatchIds,
      clubProfile,
      newCoachPin,
    } = req.body || {};

    const deletedSet = new Set<string>(
      Array.isArray(room.deletedMatchIds) ? room.deletedMatchIds : []
    );

    if (deletedMatchId && typeof deletedMatchId === 'string') {
      deletedSet.add(deletedMatchId);
    }
    if (Array.isArray(deletedMatchIds)) {
      for (const did of deletedMatchIds) {
        if (typeof did === 'string' && did) {
          deletedSet.add(did);
        }
      }
    }

    const deletedArr = Array.from(deletedSet);
    room.deletedMatchIds = deletedArr.length > 500 ? deletedArr.slice(-500) : deletedArr;

    // Remove deleted matches
    room.matches = (room.matches || []).filter(
      (m: any) => m && m.id && !deletedSet.has(m.id)
    );
    if (room.activeMatchId && deletedSet.has(room.activeMatchId)) {
      room.activeMatchId = null;
    }

    if (Array.isArray(matches)) {
      const existingMap = new Map<string, any>();
      for (const m of room.matches) {
        if (m && m.id && !deletedSet.has(m.id)) existingMap.set(m.id, m);
      }

      for (const m of matches) {
        if (!m || !m.id || deletedSet.has(m.id)) continue;
        const current = existingMap.get(m.id);
        if (!current) {
          existingMap.set(m.id, m);
        } else {
          const incomingTs = m.updatedAt || 0;
          const currentTs = current.updatedAt || 0;
          if (incomingTs > currentTs || (incomingTs === currentTs && m.status === 'finished' && current.status !== 'finished')) {
            existingMap.set(m.id, m);
          }
        }
      }

      room.matches = Array.from(existingMap.values()).sort(
        (a: any, b: any) => (b.updatedAt || 0) - (a.updatedAt || 0)
      );
    }

    if (Array.isArray(players)) {
      room.players = players;
    }

    if (clubProfile && typeof clubProfile.name === 'string') {
      room.clubProfile = {
        ...room.clubProfile,
        ...clubProfile,
        categories: ['TEAM'],
        updatedAt: Date.now(),
      };
    }

    if (activeMatchId !== undefined) {
      room.activeMatchId = activeMatchId;
    }

    if (room.activeMatchId) {
      const activeCandidate = room.matches.find(
        (m: any) => m && m.id === room.activeMatchId && m.status === 'live'
      );
      if (!activeCandidate) {
        room.activeMatchId = null;
      }
    }

    if (typeof newCoachPin === 'string' && newCoachPin.trim().length >= 3) {
      room.coachPin = newCoachPin.trim().slice(0, 16);
    }

    room.lastUpdated = Date.now();
    saveRoomToDisk(room);

    const publicState = buildPublicRoomState(room, false);

    // Broadcast real-time update to all spectators & other devices connected to this room
    broadcastToRoom(room.roomId, {
      type: 'ROOM_STATE_UPDATED',
      roomId: room.roomId,
      state: publicState,
    });

    res.json({
      success: true,
      ...buildPublicRoomState(room, true),
      matchesCount: room.matches.length,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Błąd synchronizacji pokoju';
    res.status(500).json({ error: msg });
  }
});

// ==========================================
// AI & VOICE ENDPOINTS
// ==========================================

// TTS Endpoint using gemini-3.8-flash-tts
app.post('/api/tts', async (req: Request, res: Response) => {
  try {
    const { text, voice = 'Puck', style = 'Energetic Polish basketball announcer' } = req.body;

    if (!text || typeof text !== 'string') {
      res.status(400).json({ error: 'Brak tekstu do syntezy mowy' });
      return;
    }

    if (!apiKey) {
      res.status(200).json({
        success: false,
        fallback: true,
        message: 'Klucz GEMINI_API_KEY niedostępny, użyj syntezatora przeglądarki.',
      });
      return;
    }

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash-tts',
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: text.slice(0, 500),
              speechMetadata: {
                style: style,
              },
            },
          ],
        },
      ],
      config: {
        responseModalities: ['AUDIO'],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: voice },
          },
        },
      },
    });

    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;

    if (!base64Audio) {
      res.status(200).json({
        success: false,
        fallback: true,
        message: 'Brak strumienia audio w odpowiedzi modelu.',
      });
      return;
    }

    res.json({
      success: true,
      audioData: base64Audio,
      mimeType: 'audio/wav',
    });
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : 'Błąd generowania głosu';
    console.error('Błąd TTS Gemini:', errorMessage);
    res.status(200).json({
      success: false,
      fallback: true,
      error: errorMessage,
    });
  }
});

// AI Coach Match Recap using gemini-3.8-flash
app.post('/api/ai-recap', async (req: Request, res: Response) => {
  try {
    const { matchData } = req.body;
    if (!matchData) {
      res.status(400).json({ error: 'Brak danych meczu' });
      return;
    }

    if (!apiKey) {
      res.status(200).json({
        recap: 'Brak klucza API do wygenerowania analizy trenerskiej. Zapisz statystyki lokalnie.',
      });
      return;
    }

    const clubName = matchData.clubName || 'naszej drużyny koszykarskiej';
    const catSuffix = matchData.teamCategory && matchData.teamCategory !== 'TEAM' ? ` (${matchData.teamCategory})` : '';
    const prompt = `Jesteś doświadczonym, motywującym trenerem koszykówki w drużynie ${clubName}${catSuffix} w sezonie 2026/2027.
Przeanalizuj poniższy mecz i przygotuj krótkie, zwięzłe (maks. 150 słów) podsumowanie pomeczowe dla drużyny i rodziców.
Wskaż mocne strony (np. walka na tablicach, asysty, skuteczność), liderów spotkania oraz elementy do poprawy na najbliższym treningu.
Zachowaj pozytywny, budujący ton sportowy.

Dane meczu:
Drużyna: ${clubName}${catSuffix} vs ${matchData.opponent} (Sezon 2026/2027)
Wynik: ${matchData.ourScore} : ${matchData.opponentScore} (${matchData.isWon ? 'Zwycięstwo' : 'Porażka'})
Kwarty: Q1: ${matchData.quarters?.q1?.our}-${matchData.quarters?.q1?.opp}, Q2: ${matchData.quarters?.q2?.our}-${matchData.quarters?.q2?.opp}, Q3: ${matchData.quarters?.q3?.our}-${matchData.quarters?.q3?.opp}, Q4: ${matchData.quarters?.q4?.our}-${matchData.quarters?.q4?.opp}
Statystyki drużyny:
Punkty: ${matchData.ourScore}, Zbiórki: ${matchData.teamTotals?.reb || 0} (Of: ${matchData.teamTotals?.offReb || 0}, Def: ${matchData.teamTotals?.defReb || 0}), Asysty: ${matchData.teamTotals?.ast || 0}, Przechwyty: ${matchData.teamTotals?.stl || 0}, Bloki: ${matchData.teamTotals?.blk || 0}, Straty: ${matchData.teamTotals?.tov || 0}, Faule: ${matchData.teamTotals?.fouls || 0}.
Skuteczność: 2PT: ${matchData.teamTotals?.fg2m || 0}/${matchData.teamTotals?.fg2a || 0}, 3PT: ${matchData.teamTotals?.fg3m || 0}/${matchData.teamTotals?.fg3a || 0}, Wolne FT: ${matchData.teamTotals?.ftm || 0}/${matchData.teamTotals?.fta || 0}.
Wyróżniający się gracze: ${JSON.stringify(matchData.topPerformers || [])}`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: prompt,
    });

    res.json({ recap: response.text || 'Brak treści podsumowania.' });
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : 'Błąd analizy';
    console.error('Błąd AI Recap:', errorMessage);
    res.status(500).json({ error: errorMessage });
  }
});

// AI Voice Command Parser using gemini-3.8-flash
app.post('/api/parse-voice-command', async (req: Request, res: Response) => {
  try {
    const { text, players } = req.body;
    if (!text || typeof text !== 'string') {
      res.status(400).json({ error: 'Brak tekstu komendy' });
      return;
    }

    if (!apiKey) {
      res.status(200).json({ actions: [] });
      return;
    }

    const prompt = `Jesteś asystentem sędziego/trenera drużyny koszykarskiej.
Przekształć polską wypowiedź głosową trenera w tablicę akcji meczowych.
Tekst komendy trenera: "${text}"

Lista dostępnych zawodników naszej drużyny:
${JSON.stringify(players || [])}

Dozwolone kody akcji:
- 2PT_MADE (celny za 2)
- 2PT_MISS (pudło za 2)
- 3PT_MADE (celna trójka)
- 3PT_MISS (niecelna trójka)
- FT_MADE (celny wolny)
- FT_MISS (niecelny wolny)
- OFF_REB (zbiórka w ataku)
- DEF_REB (zbiórka w obronie)
- ASSIST (asysta)
- STEAL (przechwyt)
- BLOCK (blok)
- TURNOVER (strata)
- FOUL (faul osobisty)
- OPP_2PT (kosz rywala za 2)
- OPP_3PT (trójka rywala)
- OPP_1PT (punkt rywala)
- OPP_FOUL (faul rywala)
- UNDO (cofnij akcję)

Zwróć TYLKO poprawny JSON (bez markdown) w formacie:
{
  "actions": [
    {
      "actionType": "2PT_MADE" | "OFF_REB" | ...,
      "playerNumber": numer_zawodnika_lub_null,
      "team": "our" | "opp",
      "label": "krótka etykieta",
      "isUndo": true_lub_false
    }
  ]
}`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
      },
    });

    const parsed = JSON.parse(response.text || '{"actions":[]}');
    res.json(parsed);
  } catch (err: unknown) {
    console.warn('Błąd AI parse voice command:', err);
    res.status(200).json({ actions: [] });
  }
});

// Legacy single-state endpoints (kept for backward compatibility)
app.get('/api/sync/state', (_req: Request, res: Response) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.json(legacySyncState);
});

app.post('/api/sync/state', (req: Request, res: Response) => {
  try {
    const { matches, players, activeMatchId, deletedMatchId, deletedMatchIds, clubProfile } = req.body || {};
    const deletedSet = new Set<string>(legacySyncState.deletedMatchIds || []);
    if (deletedMatchId && typeof deletedMatchId === 'string') deletedSet.add(deletedMatchId);
    if (Array.isArray(deletedMatchIds)) {
      deletedMatchIds.forEach((id: unknown) => {
        if (typeof id === 'string' && id) deletedSet.add(id);
      });
    }
    legacySyncState.deletedMatchIds = Array.from(deletedSet).slice(-500);
    if (Array.isArray(matches)) {
      legacySyncState.matches = matches.filter((m: any) => m && m.id && !deletedSet.has(m.id));
    }
    if (Array.isArray(players)) legacySyncState.players = players;
    if (clubProfile) legacySyncState.clubProfile = clubProfile;
    if (activeMatchId !== undefined) legacySyncState.activeMatchId = activeMatchId;
    legacySyncState.lastUpdated = Date.now();
    try {
      fs.writeFileSync(legacySyncFilePath, JSON.stringify(legacySyncState, null, 2), 'utf-8');
    } catch {
      // ignore
    }
    res.json({ success: true, ...legacySyncState });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Błąd synchronizacji';
    res.status(500).json({ error: msg });
  }
});

// Health check
app.get('/api/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', service: 'BasketStats Pro Multi-Room API' });
});

async function startServer() {
  const httpServer = http.createServer(app);

  // Real-time WebSocket server for isolated per-room live match & stats updates
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

  wss.on('connection', (ws, req) => {
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
      const room = loadRoom(roomId);
      if (room) {
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

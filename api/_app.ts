import express, { Express, Request, Response } from 'express';
import crypto from 'crypto';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { GoogleGenAI } from '@google/genai';
import {
  getLzkoszClubs,
  getLzkoszClubTeams,
  previewLzkoszTeam,
} from './_lzkosz.js';

dotenv.config();

export interface ServerClubProfile {
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

export interface ServerRoomState {
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
  { id: 'demo-team-1', teamCategory: 'TEAM', firstName: '', lastName: '', number: 4, position: 'PG', createdAt: Date.now() },
  { id: 'demo-team-2', teamCategory: 'TEAM', firstName: '', lastName: '', number: 7, position: 'SG', createdAt: Date.now() },
  { id: 'demo-team-3', teamCategory: 'TEAM', firstName: '', lastName: '', number: 10, position: 'SF', createdAt: Date.now() },
  { id: 'demo-team-4', teamCategory: 'TEAM', firstName: '', lastName: '', number: 13, position: 'PF', createdAt: Date.now() },
  { id: 'demo-team-5', teamCategory: 'TEAM', firstName: '', lastName: '', number: 15, position: 'C', createdAt: Date.now() },
  { id: 'demo-team-6', teamCategory: 'TEAM', firstName: '', lastName: '', number: 21, position: 'PG', createdAt: Date.now() },
  { id: 'demo-team-7', teamCategory: 'TEAM', firstName: '', lastName: '', number: 33, position: 'SG', createdAt: Date.now() },
  { id: 'demo-team-8', teamCategory: 'TEAM', firstName: '', lastName: '', number: 24, position: 'PF', createdAt: Date.now() },
];

const ROOM_ID_REGEX = /^[a-z0-9_-]{3,64}$/;

export function sanitizeRoomId(raw: string): string | null {
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

function sanitizePlayerForStorage(p: any): any {
  if (!p || typeof p !== 'object') return p;
  return {
    id: String(p.id || ''),
    teamCategory: p.teamCategory || 'TEAM',
    firstName: '',
    lastName: '',
    number: Number(p.number) || 0,
    ...(p.position ? { position: p.position } : {}),
    createdAt: typeof p.createdAt === 'number' ? p.createdAt : Date.now(),
  };
}

function sanitizeEventForStorage(e: any): any {
  if (!e || typeof e !== 'object') return e;
  const { playerName: _pn, assistedByPlayerName: _apn, ...rest } = e;
  return rest;
}

function sanitizeMatchForStorage(m: any): any {
  if (!m || typeof m !== 'object') return m;
  return {
    ...m,
    events: Array.isArray(m.events) ? m.events.map(sanitizeEventForStorage) : [],
  };
}

function sanitizeClubForStorage(c: ServerClubProfile): ServerClubProfile {
  if (!c || typeof c !== 'object') return c;
  return {
    ...c,
    headCoach: '',
    assistantCoach: '',
  };
}

// ==========================================
// PERSISTENCE LAYER (Postgres + Redis/KV + Disk/Tmp)
// ==========================================

const isVercelEnv = Boolean(process.env.VERCEL);

function findEnvValue(
  exactKeys: string[],
  suffixPatterns: string[],
  validator?: (val: string) => boolean
): string | null {
  for (const key of exactKeys) {
    const val = (process.env[key] || '').trim();
    if (val && (!validator || validator(val))) return val;
  }
  for (const [key, rawVal] of Object.entries(process.env)) {
    if (!rawVal || !rawVal.trim()) continue;
    const trimmed = rawVal.trim();
    for (const suffix of suffixPatterns) {
      if (key.endsWith(suffix) && (!validator || validator(trimmed))) {
        return trimmed;
      }
    }
  }
  return null;
}

function getPostgresConnectionString(): string | null {
  return findEnvValue(
    ['POSTGRES_URL', 'POSTGRES_PRISMA_URL', 'POSTGRES_URL_NON_POOLING', 'DATABASE_URL'],
    ['_POSTGRES_URL', '_POSTGRES_PRISMA_URL', '_POSTGRES_URL_NON_POOLING', '_DATABASE_URL', '_DATABASE_URL_UNPOOLED'],
    (v) => v.startsWith('postgres://') || v.startsWith('postgresql://')
  );
}

function getRedisRestConfig(): { url: string; token: string } | null {
  const url = findEnvValue(
    ['KV_REST_API_URL', 'UPSTASH_REDIS_REST_URL'],
    ['_KV_REST_API_URL', '_UPSTASH_REDIS_REST_URL'],
    (v) => v.startsWith('http://') || v.startsWith('https://')
  );
  const token = findEnvValue(
    ['KV_REST_API_TOKEN', 'UPSTASH_REDIS_REST_TOKEN'],
    ['_KV_REST_API_TOKEN', '_UPSTASH_REDIS_REST_TOKEN']
  );
  if (url && token) {
    return { url: url.replace(/\/+$/, ''), token };
  }
  return null;
}

function getRedisTcpUrl(): string | null {
  return findEnvValue(
    ['REDIS_URL', 'KV_URL'],
    ['_REDIS_URL', '_KV_URL'],
    (v) => v.startsWith('redis://') || v.startsWith('rediss://')
  );
}

export function getPersistenceMode(): 'postgres' | 'redis' | 'ephemeral-tmp' | 'disk' {
  if (getPostgresConnectionString()) return 'postgres';
  if (getRedisRestConfig() || getRedisTcpUrl()) return 'redis';
  if (isVercelEnv) return 'ephemeral-tmp';
  return 'disk';
}

function resolveDataDirs(): { dataDir: string; roomsDir: string } {
  const baseDir = isVercelEnv
    ? path.join(os.tmpdir(), 'basketstats-data')
    : path.resolve(process.cwd(), 'data');
  const roomsDir = path.join(baseDir, 'rooms');

  for (const dir of [baseDir, roomsDir]) {
    if (!fs.existsSync(dir)) {
      try {
        fs.mkdirSync(dir, { recursive: true });
      } catch {
        const fallbackBase = path.join(os.tmpdir(), 'basketstats-data');
        const fallbackRooms = path.join(fallbackBase, 'rooms');
        try {
          fs.mkdirSync(fallbackRooms, { recursive: true });
        } catch {
          // ignore
        }
        return { dataDir: fallbackBase, roomsDir: fallbackRooms };
      }
    }
  }

  return { dataDir: baseDir, roomsDir };
}

const { dataDir, roomsDir } = resolveDataDirs();
const legacySyncFilePath = path.join(dataDir, 'sync_state.json');

// In-memory cache of active rooms
const roomsCache = new Map<string, ServerRoomState>();

function getRoomFilePath(roomId: string): string {
  return path.join(roomsDir, `${roomId}.json`);
}

function getRedisRoomKey(roomId: string): string {
  return `basketstats:room:${roomId}`;
}

// Lazy PostgreSQL pool & schema initialization
let pgPoolPromise: Promise<any> | null = null;

async function getPgPool(): Promise<any | null> {
  const connStr = getPostgresConnectionString();
  if (!connStr) return null;

  if (!pgPoolPromise) {
    pgPoolPromise = (async () => {
      const pgMod = await import('pg');
      const PoolCtor = pgMod.default?.Pool || pgMod.Pool;
      const useSsl = !connStr.includes('sslmode=disable') && !connStr.includes('localhost') && !connStr.includes('127.0.0.1');
      const pool = new PoolCtor({
        connectionString: connStr,
        max: 5,
        ssl: useSsl ? { rejectUnauthorized: false } : undefined,
      });
      await pool.query(`
        CREATE TABLE IF NOT EXISTS basketstats_rooms (
          room_id TEXT PRIMARY KEY,
          data JSONB NOT NULL,
          updated_at BIGINT NOT NULL
        );
      `);
      return pool;
    })().catch((err) => {
      console.error('PostgreSQL init error:', err);
      pgPoolPromise = null;
      return null;
    });
  }

  return pgPoolPromise;
}

let redisTcpPromise: Promise<any> | null = null;

async function getRedisTcpClient(): Promise<any | null> {
  const redisUrl = getRedisTcpUrl();
  if (!redisUrl) return null;

  if (!redisTcpPromise) {
    redisTcpPromise = (async () => {
      const mod = await import('ioredis');
      const RedisCtor = (mod as any).default || mod;
      const client = new RedisCtor(redisUrl, {
        maxRetriesPerRequest: 2,
        connectTimeout: 5000,
        ...(redisUrl.startsWith('rediss://') ? { tls: { rejectUnauthorized: false } } : {}),
      });
      return client;
    })().catch((err) => {
      console.error('Redis TCP init error:', err);
      redisTcpPromise = null;
      return null;
    });
  }

  return redisTcpPromise;
}

async function redisCommand<T = unknown>(command: unknown[]): Promise<T | null> {
  const cfg = getRedisRestConfig();
  if (!cfg) return null;

  try {
    const res = await fetch(cfg.url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${cfg.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(command),
    });
    if (!res.ok) {
      console.error('Redis REST error:', res.status, await res.text().catch(() => ''));
      return null;
    }
    const json = (await res.json()) as { result?: T; error?: string };
    if (json.error) {
      console.error('Redis command error:', json.error);
      return null;
    }
    return json.result ?? null;
  } catch (err) {
    console.error('Redis REST request failed:', err);
    return null;
  }
}

function normalizeLoadedRoom(parsed: ServerRoomState): ServerRoomState | null {
  if (!parsed || !parsed.roomId) return null;
  if (!parsed.coachToken) {
    parsed.coachToken = generateCoachToken();
  }
  if (!parsed.coachPin) {
    parsed.coachPin = '1234';
  }
  parsed.players = Array.isArray(parsed.players) ? parsed.players.map(sanitizePlayerForStorage) : [];
  parsed.matches = Array.isArray(parsed.matches) ? parsed.matches.map(sanitizeMatchForStorage) : [];
  if (parsed.clubProfile) {
    parsed.clubProfile = sanitizeClubForStorage(parsed.clubProfile);
  }
  return parsed;
}

export async function saveRoom(room: ServerRoomState, throwOnDbError = false): Promise<void> {
  roomsCache.set(room.roomId, room);

  // 1. PostgreSQL (Neon / Supabase / Vercel Postgres)
  const connStr = getPostgresConnectionString();
  if (connStr) {
    const pool = await getPgPool();
    if (!pool) {
      const errMsg = 'Nie udało się połączyć z bazą PostgreSQL.';
      if (throwOnDbError) throw new Error(errMsg);
    } else {
      try {
        await pool.query(
          `INSERT INTO basketstats_rooms (room_id, data, updated_at)
           VALUES ($1, $2::jsonb, $3)
           ON CONFLICT (room_id)
           DO UPDATE SET data = EXCLUDED.data, updated_at = EXCLUDED.updated_at`,
          [room.roomId, JSON.stringify(room), room.lastUpdated || Date.now()]
        );
      } catch (err) {
        console.error(`Failed to save room ${room.roomId} to PostgreSQL:`, err);
        if (throwOnDbError) throw err;
      }
    }
  }

  // 2. Upstash Redis / Vercel KV REST
  const redisCfg = getRedisRestConfig();
  if (redisCfg) {
    const res = await redisCommand(['SET', getRedisRoomKey(room.roomId), JSON.stringify(room)]);
    if (res === null && throwOnDbError) {
      throw new Error('Nie udało się zapisać pokoju w bazie Redis.');
    }
  }

  // 2b. Redis TCP (REDIS_URL / KV_URL)
  const redisTcpUrl = !redisCfg ? getRedisTcpUrl() : null;
  if (redisTcpUrl) {
    const client = await getRedisTcpClient();
    if (!client) {
      if (throwOnDbError) throw new Error('Nie udało się połączyć z bazą Redis (REDIS_URL).');
    } else {
      try {
        await client.set(getRedisRoomKey(room.roomId), JSON.stringify(room));
      } catch (err) {
        console.error(`Failed to save room ${room.roomId} to Redis TCP:`, err);
        if (throwOnDbError) throw err;
      }
    }
  }

  // 3. Disk / tmp fallback
  try {
    if (!fs.existsSync(roomsDir)) {
      fs.mkdirSync(roomsDir, { recursive: true });
    }
    fs.writeFileSync(getRoomFilePath(room.roomId), JSON.stringify(room, null, 2), 'utf-8');
  } catch (err) {
    if (!connStr && !redisCfg && !redisTcpUrl) {
      console.error(`Failed to persist room ${room.roomId}:`, err);
    }
  }
}

export async function loadRoom(roomId: string): Promise<ServerRoomState | null> {
  const cleanId = sanitizeRoomId(roomId);
  if (!cleanId) return null;

  // 1. PostgreSQL
  const pool = await getPgPool();
  if (pool) {
    try {
      const result = await pool.query(
        'SELECT data FROM basketstats_rooms WHERE room_id = $1 LIMIT 1',
        [cleanId]
      );
      if (result.rows && result.rows.length > 0 && result.rows[0].data) {
        const rawData = result.rows[0].data;
        const parsedObj = typeof rawData === 'string' ? JSON.parse(rawData) : rawData;
        const parsed = normalizeLoadedRoom(parsedObj as ServerRoomState);
        if (parsed) {
          roomsCache.set(cleanId, parsed);
          return parsed;
        }
      }
    } catch (err) {
      console.error(`Failed to load room ${cleanId} from PostgreSQL:`, err);
    }
  }

  // 2. Upstash Redis / Vercel KV REST
  const redisCfg = getRedisRestConfig();
  if (redisCfg) {
    const raw = await redisCommand<string>(['GET', getRedisRoomKey(cleanId)]);
    if (typeof raw === 'string' && raw.length > 0) {
      try {
        const parsed = normalizeLoadedRoom(JSON.parse(raw) as ServerRoomState);
        if (parsed) {
          roomsCache.set(cleanId, parsed);
          return parsed;
        }
      } catch (err) {
        console.error(`Failed to parse Redis room ${cleanId}:`, err);
      }
    }
  }

  // 2b. Redis TCP (REDIS_URL / KV_URL)
  if (!redisCfg && getRedisTcpUrl()) {
    const client = await getRedisTcpClient();
    if (client) {
      try {
        const raw = await client.get(getRedisRoomKey(cleanId));
        if (typeof raw === 'string' && raw.length > 0) {
          const parsed = normalizeLoadedRoom(JSON.parse(raw) as ServerRoomState);
          if (parsed) {
            roomsCache.set(cleanId, parsed);
            return parsed;
          }
        }
      } catch (err) {
        console.error(`Failed to load room ${cleanId} from Redis TCP:`, err);
      }
    }
  }

  // 3. In-memory cache & disk/tmp fallback
  const cached = roomsCache.get(cleanId);
  if (cached) return cached;

  const filePath = getRoomFilePath(cleanId);
  if (!fs.existsSync(filePath)) return null;

  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const parsed = normalizeLoadedRoom(JSON.parse(raw) as ServerRoomState);
    if (!parsed) return null;
    roomsCache.set(cleanId, parsed);
    return parsed;
  } catch (err) {
    console.error(`Failed to parse room ${cleanId}:`, err);
    return null;
  }
}

export async function getRoomUpdatedAt(roomId: string): Promise<number | null> {
  const cleanId = sanitizeRoomId(roomId);
  if (!cleanId) return null;

  // In PostgreSQL mode, read only the indexed 8-byte updated_at column without fetching the JSONB blob
  const pool = await getPgPool();
  if (pool) {
    try {
      const result = await pool.query(
        'SELECT updated_at FROM basketstats_rooms WHERE room_id = $1 LIMIT 1',
        [cleanId]
      );
      if (result.rows && result.rows.length > 0) {
        const ts = Number(result.rows[0].updated_at);
        if (Number.isFinite(ts) && ts > 0) {
          return ts;
        }
      }
    } catch (err) {
      console.error(`Failed to check updated_at for room ${cleanId} from PostgreSQL:`, err);
    }
  }

  const room = await loadRoom(cleanId);
  return room ? room.lastUpdated || 0 : null;
}

export function buildPublicRoomState(room: ServerRoomState, isCoachAuthenticated: boolean) {
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

// Legacy single-room fallback state
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
      matches: Array.isArray(parsed.matches) ? parsed.matches.map(sanitizeMatchForStorage) : [],
      players: Array.isArray(parsed.players) ? parsed.players.map(sanitizePlayerForStorage) : [],
      activeMatchId: parsed.activeMatchId || null,
      deletedMatchIds: Array.isArray(parsed.deletedMatchIds) ? parsed.deletedMatchIds : [],
      clubProfile: parsed.clubProfile ? sanitizeClubForStorage(parsed.clubProfile) : createDefaultClubProfile(),
      lastUpdated: parsed.lastUpdated || Date.now(),
    };
  } catch {
    // ignore
  }
}

export interface CreateApiAppOptions {
  onRoomUpdated?: (roomId: string, publicState: ReturnType<typeof buildPublicRoomState>) => void;
  supportsWebSocket?: boolean;
}

export function createApiApp(options: CreateApiAppOptions = {}): Express {
  const app = express();
  const supportsWebSocket = options.supportsWebSocket ?? !isVercelEnv;

  app.use(express.json({ limit: '10mb' }));

  // Enable CORS for cross-origin access
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

  // Lazily create GoogleGenAI client only when GEMINI_API_KEY is available
  const getGenAIClient = () => {
    const apiKey = (process.env.GEMINI_API_KEY || '').trim();
    if (!apiKey) return null;
    return new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  };

  // ==========================================
  // MULTI-TEAM ROOMS API (POKOJE DRUŻYNOWE)
  // ==========================================

  // Create a new isolated team room
  app.post('/api/rooms', async (req: Request, res: Response) => {
    try {
      const {
        teamName,
        shortName,
        city,
        season,
        leagueName,
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
      if (roomId && (await loadRoom(roomId))) {
        roomId = null;
      }
      if (!roomId) {
        roomId = slugifyTeamName(cleanName);
        while (await loadRoom(roomId)) {
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
        headCoach: '',
        assistantCoach: '',
        badgeEmoji: typeof badgeEmoji === 'string' && badgeEmoji.trim() ? badgeEmoji.trim() : '🏀',
        primaryColor: typeof primaryColor === 'string' && primaryColor.startsWith('#') ? primaryColor : '#f59e0b',
        secondaryColor: typeof secondaryColor === 'string' && secondaryColor.startsWith('#') ? secondaryColor : '#0a192f',
        categories: ['TEAM'],
        updatedAt: now,
      });

      const players = seedDemoPlayers
        ? DEMO_SINGLE_TEAM_PLAYERS.map((p) => sanitizePlayerForStorage({ ...p, createdAt: now }))
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

      await saveRoom(room, true);

      res.status(201).json({
        success: true,
        roomId,
        coachToken,
        persistence: getPersistenceMode(),
        state: buildPublicRoomState(room, true),
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Błąd tworzenia pokoju drużyny';
      res.status(500).json({ success: false, error: msg });
    }
  });

  // Check if room exists and return lightweight public preview info
  app.get('/api/rooms/:roomId/exists', async (req: Request, res: Response) => {
    const roomId = sanitizeRoomId(req.params.roomId);
    if (!roomId) {
      res.status(400).json({ exists: false, error: 'Nieprawidłowy kod pokoju' });
      return;
    }

    const room = await loadRoom(roomId);
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
  app.post('/api/rooms/:roomId/auth', async (req: Request, res: Response) => {
    const roomId = sanitizeRoomId(req.params.roomId);
    if (!roomId) {
      res.status(400).json({ authenticated: false, error: 'Nieprawidłowy kod pokoju' });
      return;
    }

    const room = await loadRoom(roomId);
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
  // Supports ?since=<timestamp> for conditional 304 Not Modified responses without reading full JSONB payloads
  app.get('/api/rooms/:roomId/state', async (req: Request, res: Response) => {
    const roomId = sanitizeRoomId(req.params.roomId);
    if (!roomId) {
      res.status(400).json({ error: 'Nieprawidłowy kod pokoju' });
      return;
    }

    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');

    const rawSince = typeof req.query.since === 'string' ? Number(req.query.since) : NaN;
    const since = Number.isFinite(rawSince) && rawSince > 0 ? Math.floor(rawSince) : 0;
    const hasCoachHeaders = Boolean(
      (req.headers['x-coach-token'] as string | undefined)?.trim() ||
      (req.query.coachToken as string | undefined)?.trim() ||
      (req.headers['x-coach-pin'] as string | undefined)?.trim()
    );

    if (since > 0 && !hasCoachHeaders) {
      const updatedAt = await getRoomUpdatedAt(roomId);
      if (updatedAt === null) {
        res.status(404).json({ error: 'Pokój drużyny nie został znaleziony' });
        return;
      }
      if (updatedAt <= since) {
        res.status(304).end();
        return;
      }
    }

    const room = await loadRoom(roomId);
    if (!room) {
      res.status(404).json({ error: 'Pokój drużyny nie został znaleziony' });
      return;
    }

    if (since > 0 && !hasCoachHeaders && (room.lastUpdated || 0) <= since) {
      res.status(304).end();
      return;
    }

    const isCoach = isCoachRequestAuthorized(room, req);
    res.json(buildPublicRoomState(room, isCoach));
  });

  // Update room state (strictly requires coachToken or coachPin) and broadcast via WebSocket
  app.post('/api/rooms/:roomId/state', async (req: Request, res: Response) => {
    try {
      const roomId = sanitizeRoomId(req.params.roomId);
      if (!roomId) {
        res.status(400).json({ error: 'Nieprawidłowy kod pokoju' });
        return;
      }

      const room = await loadRoom(roomId);
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
          const sanitizedMatch = sanitizeMatchForStorage(m);
          const current = existingMap.get(m.id);
          if (!current) {
            existingMap.set(m.id, sanitizedMatch);
          } else {
            const incomingTs = sanitizedMatch.updatedAt || 0;
            const currentTs = current.updatedAt || 0;
            if (incomingTs > currentTs || (incomingTs === currentTs && sanitizedMatch.status === 'finished' && current.status !== 'finished')) {
              existingMap.set(m.id, sanitizedMatch);
            }
          }
        }

        room.matches = Array.from(existingMap.values()).sort(
          (a: any, b: any) => (b.updatedAt || 0) - (a.updatedAt || 0)
        );
      }

      if (Array.isArray(players)) {
        room.players = players.map(sanitizePlayerForStorage);
      }

      if (clubProfile && typeof clubProfile.name === 'string') {
        room.clubProfile = sanitizeClubForStorage({
          ...room.clubProfile,
          ...clubProfile,
          categories: ['TEAM'],
          updatedAt: Date.now(),
        });
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

      room.lastUpdated = Math.max(Date.now(), (room.lastUpdated || 0) + 1);
      await saveRoom(room);

      const publicState = buildPublicRoomState(room, false);
      options.onRoomUpdated?.(room.roomId, publicState);

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

  app.post('/api/tts', async (req: Request, res: Response) => {
    try {
      const { text, voice = 'Puck', style = 'Energetic Polish basketball announcer' } = req.body;

      if (!text || typeof text !== 'string') {
        res.status(400).json({ error: 'Brak tekstu do syntezy mowy' });
        return;
      }

      const ai = getGenAIClient();
      if (!ai) {
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

  app.post('/api/ai-recap', async (req: Request, res: Response) => {
    try {
      const { matchData } = req.body;
      if (!matchData) {
        res.status(400).json({ error: 'Brak danych meczu' });
        return;
      }

      const ai = getGenAIClient();
      if (!ai) {
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

  app.post('/api/parse-voice-command', async (req: Request, res: Response) => {
    try {
      const { text, players } = req.body;
      if (!text || typeof text !== 'string') {
        res.status(400).json({ error: 'Brak tekstu komendy' });
        return;
      }

      const ai = getGenAIClient();
      if (!ai) {
        res.status(200).json({ actions: [] });
        return;
      }

      const safePlayers = Array.isArray(players)
        ? players.map((p: any) => ({ id: p?.id, number: p?.number }))
        : [];

      const prompt = `Jesteś asystentem sędziego/trenera drużyny koszykarskiej.
Przekształć polską wypowiedź głosową trenera w tablicę akcji meczowych.
Tekst komendy trenera: "${text}"

Lista dostępnych zawodników naszej drużyny:
${JSON.stringify(safePlayers)}

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
        legacySyncState.matches = matches
          .filter((m: any) => m && m.id && !deletedSet.has(m.id))
          .map(sanitizeMatchForStorage);
      }
      if (Array.isArray(players)) legacySyncState.players = players.map(sanitizePlayerForStorage);
      if (clubProfile) legacySyncState.clubProfile = sanitizeClubForStorage(clubProfile);
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

  // ==========================================
  // ŁZKosz.pl Roster & Club Import Endpoints
  // ==========================================
  app.get('/api/lzkosz/clubs', async (req: Request, res: Response) => {
    try {
      const forceRefresh = req.query.refresh === '1';
      const data = await getLzkoszClubs(forceRefresh);
      res.setHeader('Cache-Control', 'public, max-age=300');
      res.json(data);
    } catch (err: unknown) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      const msg = err instanceof Error ? err.message : 'Nie udało się pobrać listy klubów ŁZKosz.pl';
      res.status(422).json({ error: msg });
    }
  });

  app.get('/api/lzkosz/club-teams', async (req: Request, res: Response) => {
    try {
      const clubId = typeof req.query.clubId === 'string' ? req.query.clubId.trim() : '';
      if (!/^\d{1,8}$/.test(clubId)) {
        res.status(400).json({ error: 'Podaj poprawny numer identyfikacyjny klubu ŁZKosz.' });
        return;
      }
      const data = await getLzkoszClubTeams(clubId);
      res.setHeader('Cache-Control', 'public, max-age=300');
      res.json(data);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Nie udało się pobrać drużyn wybranego klubu';
      res.status(422).json({ error: msg });
    }
  });

  app.post('/api/lzkosz/team-preview', async (req: Request, res: Response) => {
    try {
      const rawUrl = typeof req.body?.url === 'string' ? req.body.url : '';
      const includePhotos = req.body?.includePhotos !== false;
      if (!rawUrl.trim()) {
        res.status(400).json({ error: 'Wklej link do strony drużyny na lzkosz.pl.' });
        return;
      }
      const data = await previewLzkoszTeam(rawUrl, includePhotos);
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.json(data);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Nie udało się pobrać danych drużyny z lzkosz.pl';
      const isValidationError =
        msg.includes('Podaj adres') ||
        msg.includes('domeny') ||
        msg.includes('URL') ||
        msg.includes('HTTPS') ||
        msg.includes('port') ||
        msg.includes('Nieprawidłowy');
      res.status(isValidationError ? 400 : 422).json({ error: msg });
    }
  });

  // Health check
  app.get('/api/health', async (_req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    const persistence = getPersistenceMode();
    let dbReachable = persistence === 'disk' || persistence === 'ephemeral-tmp';
    let dbError: string | undefined;

    if (persistence === 'postgres') {
      try {
        const pool = await getPgPool();
        if (pool) {
          await pool.query('SELECT 1');
          dbReachable = true;
        } else {
          dbReachable = false;
          dbError = 'PostgreSQL pool initialization failed';
        }
      } catch (err) {
        dbReachable = false;
        dbError = err instanceof Error ? err.message : 'PostgreSQL connection error';
      }
    } else if (persistence === 'redis') {
      if (getRedisRestConfig()) {
        const pong = await redisCommand(['PING']);
        dbReachable = pong !== null;
        if (!dbReachable) {
          dbError = 'Redis REST PING failed';
        }
      } else {
        try {
          const client = await getRedisTcpClient();
          if (client) {
            const pong = await client.ping();
            dbReachable = Boolean(pong);
          } else {
            dbReachable = false;
            dbError = 'Redis TCP client initialization failed';
          }
        } catch (err) {
          dbReachable = false;
          dbError = err instanceof Error ? err.message : 'Redis TCP connection error';
        }
      }
    }

    const detectedDbEnvKeys = Object.keys(process.env)
      .filter((k) => /(POSTGRES|DATABASE|REDIS|KV_|UPSTASH|NEON|SUPABASE|PRISMA)/i.test(k))
      .sort();

    res.json({
      status: 'ok',
      service: 'BasketStats Pro Multi-Room API',
      persistence,
      dbReachable,
      detectedDbEnvKeys,
      ...(dbError ? { dbError } : {}),
      supportsWebSocket,
    });
  });

  return app;
}

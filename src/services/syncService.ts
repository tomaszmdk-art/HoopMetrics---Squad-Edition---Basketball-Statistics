import { ClubProfile, Match, Player, RoomPublicInfo } from '../types/basketball';
import { getCurrentRoomId, getRoomStorageKey } from './db';

export interface ServerSyncData {
  roomId?: string;
  matches: Match[];
  players: Player[];
  activeMatchId: string | null;
  deletedMatchIds?: string[];
  coachPin?: string;
  clubProfile?: ClubProfile;
  isCoachAuthenticated?: boolean;
  lastUpdated: number;
}

export interface ServerSyncResponse {
  success: boolean;
  roomId?: string;
  matches?: Match[];
  players?: Player[];
  activeMatchId?: string | null;
  deletedMatchIds?: string[];
  clubProfile?: ClubProfile;
  coachPin?: string;
  lastUpdated?: number;
  matchesCount?: number;
  unauthorized?: boolean;
}

export interface CreateRoomPayload {
  teamName: string;
  shortName?: string;
  city?: string;
  season?: string;
  leagueName?: string;
  headCoach?: string;
  badgeEmoji?: string;
  primaryColor?: string;
  secondaryColor?: string;
  coachPin: string;
  seedDemoPlayers?: boolean;
  customRoomId?: string;
}

export interface CreateRoomResult {
  success: boolean;
  roomId?: string;
  coachToken?: string;
  persistence?: 'redis' | 'ephemeral-tmp' | 'disk';
  state?: ServerSyncData;
  error?: string;
}

const ROOM_ID_PATTERN = /^[a-z0-9_-]{3,64}$/;
let pushTimeout: ReturnType<typeof setTimeout> | null = null;

// ==========================================
// URL & TOKEN HELPERS
// ==========================================

export function sanitizeRoomCode(raw: string): string | null {
  const cleaned = raw.trim().toLowerCase();
  return ROOM_ID_PATTERN.test(cleaned) ? cleaned : null;
}

export function parseRoomFromUrl(): { roomId: string | null; coachTokenFromUrl: string | null } {
  if (typeof window === 'undefined') {
    return { roomId: null, coachTokenFromUrl: null };
  }

  let roomId: string | null = null;
  let coachTokenFromUrl: string | null = null;

  try {
    const params = new URLSearchParams(window.location.search);
    const paramRoom = params.get('room') || params.get('team') || params.get('pokoj');
    if (paramRoom) {
      roomId = sanitizeRoomCode(paramRoom);
    }

    const paramCoach = params.get('coach') || params.get('token');
    if (paramCoach && paramCoach.trim()) {
      coachTokenFromUrl = paramCoach.trim();
    }

    if (!roomId) {
      const pathMatch = window.location.pathname.match(/^\/room\/([a-zA-Z0-9_-]{3,64})(?:\/coach\/([a-zA-Z0-9_-]+))?/i);
      if (pathMatch) {
        roomId = sanitizeRoomCode(pathMatch[1]);
        if (pathMatch[2] && !coachTokenFromUrl) {
          coachTokenFromUrl = pathMatch[2].trim();
        }
      }
    }

    if (!roomId && window.location.hash) {
      const hashMatch = window.location.hash.match(/room=([a-zA-Z0-9_-]{3,64})/i);
      if (hashMatch) {
        roomId = sanitizeRoomCode(hashMatch[1]);
      }
    }
  } catch {
    // ignore malformed URL
  }

  return { roomId, coachTokenFromUrl };
}

export function extractRoomFromInput(input: string): { roomId: string | null; coachToken?: string } {
  const trimmed = input.trim();
  if (!trimmed) return { roomId: null };

  // Try parsing as URL
  if (trimmed.includes('http://') || trimmed.includes('https://') || trimmed.includes('?') || trimmed.includes('/room/')) {
    try {
      const normalizedUrl = trimmed.startsWith('http') ? trimmed : `https://dummy.local/${trimmed.replace(/^\/+/, '')}`;
      const u = new URL(normalizedUrl);
      const paramRoom = u.searchParams.get('room') || u.searchParams.get('team') || u.searchParams.get('pokoj');
      const paramCoach = u.searchParams.get('coach') || u.searchParams.get('token') || undefined;
      if (paramRoom) {
        const rid = sanitizeRoomCode(paramRoom);
        if (rid) return { roomId: rid, coachToken: paramCoach };
      }
      const pathMatch = u.pathname.match(/\/room\/([a-zA-Z0-9_-]{3,64})(?:\/coach\/([a-zA-Z0-9_-]+))?/i);
      if (pathMatch) {
        const rid = sanitizeRoomCode(pathMatch[1]);
        if (rid) return { roomId: rid, coachToken: pathMatch[2] || paramCoach };
      }
    } catch {
      // fall through to raw slug
    }
  }

  return { roomId: sanitizeRoomCode(trimmed) };
}

export function getShareBaseOrigin(): string {
  if (typeof window === 'undefined') return '';
  try {
    const custom = localStorage.getItem('basketstats_custom_base_origin');
    if (custom && custom.startsWith('http')) {
      return custom.replace(/\/+$/, '');
    }
  } catch {
    // ignore
  }
  return window.location.origin;
}

export function setShareBaseOrigin(origin: string | null): void {
  if (typeof window === 'undefined') return;
  try {
    if (!origin || !origin.trim()) {
      localStorage.removeItem('basketstats_custom_base_origin');
    } else {
      let clean = origin.trim().replace(/\/+$/, '');
      if (!clean.startsWith('http://') && !clean.startsWith('https://')) {
        clean = `https://${clean}`;
      }
      localStorage.setItem('basketstats_custom_base_origin', clean);
    }
  } catch {
    // ignore
  }
}

export function buildParentRoomUrl(roomId: string, baseOrigin?: string): string {
  const origin = (baseOrigin || getShareBaseOrigin()).replace(/\/+$/, '');
  return `${origin}/?room=${encodeURIComponent(roomId)}`;
}

export function buildCoachRoomUrl(roomId: string, coachToken: string, baseOrigin?: string): string {
  const origin = (baseOrigin || getShareBaseOrigin()).replace(/\/+$/, '');
  return `${origin}/?room=${encodeURIComponent(roomId)}&coach=${encodeURIComponent(coachToken)}`;
}

export function getStoredCoachToken(roomId: string | null): string | null {
  if (typeof window === 'undefined' || !roomId) return null;
  try {
    return localStorage.getItem(`basketstats_coach_token_${roomId}`);
  } catch {
    return null;
  }
}

export function setStoredCoachToken(roomId: string, token: string): void {
  if (typeof window === 'undefined' || !roomId || !token) return;
  try {
    localStorage.setItem(`basketstats_coach_token_${roomId}`, token);
  } catch {
    // ignore
  }
}

export function clearStoredCoachToken(roomId: string | null): void {
  if (typeof window === 'undefined' || !roomId) return;
  try {
    localStorage.removeItem(`basketstats_coach_token_${roomId}`);
  } catch {
    // ignore
  }
}

// ==========================================
// DELETED MATCH IDS (PER ROOM)
// ==========================================

export function getLocalDeletedMatchIds(roomIdOverride?: string | null): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const key = getRoomStorageKey('basketstats_deleted_match_ids', roomIdOverride);
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return Array.from(new Set(parsed.filter((id): id is string => typeof id === 'string' && id.length > 0)));
    }
  } catch {
    // ignore
  }
  return [];
}

export function addLocalDeletedMatchIds(ids: string[], roomIdOverride?: string | null): string[] {
  const merged = new Set<string>([...getLocalDeletedMatchIds(roomIdOverride), ...ids.filter(Boolean)]);
  const arr = Array.from(merged).slice(-500);
  if (typeof window !== 'undefined') {
    try {
      const key = getRoomStorageKey('basketstats_deleted_match_ids', roomIdOverride);
      localStorage.setItem(key, JSON.stringify(arr));
    } catch {
      // ignore
    }
  }
  return arr;
}

// ==========================================
// ROOM REST API
// ==========================================

export async function createRoomOnServer(payload: CreateRoomPayload): Promise<CreateRoomResult> {
  try {
    const res = await fetch('/api/rooms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      return {
        success: false,
        error: `Serwer API nie zwrócił odpowiedzi JSON (HTTP ${res.status}). Upewnij się, że backend /api działa poprawnie.`,
      };
    }
    const data = await res.json();
    if (!res.ok || !data.success) {
      return { success: false, error: data.error || 'Nie udało się utworzyć pokoju drużyny.' };
    }
    return {
      success: true,
      roomId: data.roomId,
      coachToken: data.coachToken,
      persistence: data.persistence,
      state: data.state,
    };
  } catch {
    return { success: false, error: 'Błąd połączenia z serwerem podczas tworzenia pokoju.' };
  }
}

export async function checkRoomExists(roomId: string): Promise<RoomPublicInfo | null> {
  try {
    const res = await fetch(`/api/rooms/${encodeURIComponent(roomId)}/exists`, { cache: 'no-store' });
    if (res.status === 404) {
      return {
        exists: false,
        roomId,
        teamName: '',
        shortName: '',
        badgeEmoji: '🏀',
        season: '2026/2027',
        hasLiveMatch: false,
        playersCount: 0,
        matchesCount: 0,
      };
    }
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function authenticateRoomCoach(
  roomId: string,
  credentials: { pin?: string; coachToken?: string }
): Promise<{ authenticated: boolean; coachToken?: string; error?: string }> {
  try {
    const res = await fetch(`/api/rooms/${encodeURIComponent(roomId)}/auth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(credentials),
    });
    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      return { authenticated: false, error: 'Błąd odpowiedzi serwera API.' };
    }
    const data = await res.json();
    if (!res.ok || !data.authenticated) {
      return { authenticated: false, error: data.error || 'Nieprawidłowy kod PIN.' };
    }
    return { authenticated: true, coachToken: data.coachToken };
  } catch {
    return { authenticated: false, error: 'Błąd połączenia z serwerem.' };
  }
}

export async function fetchRoomState(
  roomId: string,
  coachToken?: string | null
): Promise<{ status: number; data: ServerSyncData | null }> {
  try {
    const headers: Record<string, string> = {};
    if (coachToken) {
      headers['x-coach-token'] = coachToken;
    }
    const res = await fetch(`/api/rooms/${encodeURIComponent(roomId)}/state`, {
      cache: 'no-store',
      headers,
    });
    if (!res.ok) {
      return { status: res.status, data: null };
    }
    const data: ServerSyncData = await res.json();
    return { status: res.status, data };
  } catch (err) {
    console.warn('Nie udało się pobrać stanu pokoju:', err);
    return { status: 0, data: null };
  }
}

export async function pushRoomStateImmediate(
  roomId: string,
  coachToken: string | null,
  payload: {
    matches?: Match[];
    players?: Player[];
    activeMatchId?: string | null;
    deletedMatchId?: string;
    deletedMatchIds?: string[];
    clubProfile?: ClubProfile;
    newCoachPin?: string;
  }
): Promise<ServerSyncResponse> {
  if (pushTimeout) {
    clearTimeout(pushTimeout);
    pushTimeout = null;
  }
  if (!roomId || !coachToken) {
    return { success: false, unauthorized: true };
  }

  try {
    const res = await fetch(`/api/rooms/${encodeURIComponent(roomId)}/state`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-coach-token': coachToken,
      },
      body: JSON.stringify(payload),
    });
    if (res.status === 401 || res.status === 403) {
      return { success: false, unauthorized: true };
    }
    if (!res.ok) return { success: false };
    const data = await res.json();
    return {
      success: true,
      roomId: data.roomId,
      matches: data.matches,
      players: data.players,
      activeMatchId: data.activeMatchId,
      deletedMatchIds: data.deletedMatchIds,
      clubProfile: data.clubProfile,
      coachPin: data.coachPin,
      lastUpdated: data.lastUpdated,
      matchesCount: data.matchesCount,
    };
  } catch (err) {
    console.warn('Nie udało się wysłać danych pokoju:', err);
    return { success: false };
  }
}

export function pushRoomStateDebounced(
  roomId: string,
  coachToken: string | null,
  payload: {
    matches?: Match[];
    players?: Player[];
    activeMatchId?: string | null;
    clubProfile?: ClubProfile;
  },
  delayMs = 450
): void {
  if (!roomId || !coachToken) return;
  if (pushTimeout) {
    clearTimeout(pushTimeout);
  }
  pushTimeout = setTimeout(() => {
    pushTimeout = null;
    pushRoomStateImmediate(roomId, coachToken, payload);
  }, delayMs);
}

// ==========================================
// REAL-TIME WEBSOCKET SUBSCRIPTION PER ROOM
// ==========================================

export type WsConnectionStatus = 'connecting' | 'connected' | 'reconnecting' | 'disconnected';

export function subscribeToRoomUpdates(
  roomId: string,
  onStateUpdate: (state: ServerSyncData) => void,
  onStatusChange?: (status: WsConnectionStatus) => void
): () => void {
  if (typeof window === 'undefined' || !roomId) {
    return () => {};
  }

  let ws: WebSocket | null = null;
  let closedByCaller = false;
  let hasConnectedOnce = false;
  let reconnectAttempts = 0;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let pingInterval: ReturnType<typeof setInterval> | null = null;

  const cleanupTimers = () => {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    if (pingInterval) {
      clearInterval(pingInterval);
      pingInterval = null;
    }
  };

  const connect = () => {
    if (closedByCaller) return;
    cleanupTimers();
    onStatusChange?.(reconnectAttempts === 0 ? 'connecting' : 'reconnecting');

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws?room=${encodeURIComponent(roomId)}`;

    try {
      ws = new WebSocket(wsUrl);
    } catch {
      scheduleReconnect();
      return;
    }

    ws.onopen = () => {
      hasConnectedOnce = true;
      reconnectAttempts = 0;
      onStatusChange?.('connected');
      pingInterval = setInterval(() => {
        if (ws && ws.readyState === WebSocket.OPEN) {
          try {
            ws.send(JSON.stringify({ type: 'PING', ts: Date.now() }));
          } catch {
            // ignore
          }
        }
      }, 25000);
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg?.type === 'ROOM_STATE_UPDATED' && msg.roomId === roomId && msg.state) {
          onStateUpdate(msg.state as ServerSyncData);
        }
      } catch {
        // ignore malformed frames
      }
    };

    ws.onclose = () => {
      cleanupTimers();
      if (!closedByCaller) {
        scheduleReconnect();
      } else {
        onStatusChange?.('disconnected');
      }
    };

    ws.onerror = () => {
      // onclose will trigger reconnect
    };
  };

  const scheduleReconnect = () => {
    if (closedByCaller) return;
    reconnectAttempts += 1;
    onStatusChange?.('reconnecting');
    const delay = Math.min(1000 * Math.pow(1.6, Math.min(reconnectAttempts, 6)), 15000);
    reconnectTimer = setTimeout(connect, delay);
  };

  // Check if backend supports WebSocket (serverless environments like Vercel use REST polling instead)
  fetch('/api/health', { cache: 'no-store' })
    .then((res) => (res.ok ? res.json() : null))
    .then((health) => {
      if (closedByCaller) return;
      if (health && health.supportsWebSocket === false) {
        onStatusChange?.('disconnected');
        return;
      }
      connect();
    })
    .catch(() => {
      if (!closedByCaller && !hasConnectedOnce) {
        connect();
      }
    });

  return () => {
    closedByCaller = true;
    cleanupTimers();
    if (ws) {
      try {
        ws.close(1000, 'Unsubscribed');
      } catch {
        // ignore
      }
      ws = null;
    }
    onStatusChange?.('disconnected');
  };
}

// ==========================================
// LEGACY / ACTIVE-ROOM CONVENIENCE WRAPPERS
// ==========================================

export async function fetchServerState(): Promise<ServerSyncData | null> {
  const roomId = getCurrentRoomId();
  if (roomId) {
    const token = getStoredCoachToken(roomId);
    const { data } = await fetchRoomState(roomId, token);
    return data;
  }
  try {
    const res = await fetch('/api/sync/state', { cache: 'no-store' });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function pushServerStateImmediate(
  matches: Match[],
  players: Player[],
  activeMatchId: string | null = null,
  deletedMatchId?: string,
  newCoachPin?: string,
  clubProfile?: ClubProfile,
  deletedMatchIds?: string[]
): Promise<ServerSyncResponse> {
  const roomId = getCurrentRoomId();
  if (roomId) {
    const token = getStoredCoachToken(roomId);
    return pushRoomStateImmediate(roomId, token, {
      matches,
      players,
      activeMatchId,
      deletedMatchId,
      deletedMatchIds,
      clubProfile,
      newCoachPin,
    });
  }
  return { success: false };
}

export function pushServerStateDebounced(
  matches: Match[],
  players: Player[],
  activeMatchId: string | null = null,
  delayMs = 500
): void {
  const roomId = getCurrentRoomId();
  if (roomId) {
    const token = getStoredCoachToken(roomId);
    pushRoomStateDebounced(roomId, token, { matches, players, activeMatchId }, delayMs);
  }
}

export async function deleteServerMatch(deletedMatchId: string): Promise<boolean> {
  const roomId = getCurrentRoomId();
  const deletedIds = addLocalDeletedMatchIds([deletedMatchId], roomId);
  if (roomId) {
    const token = getStoredCoachToken(roomId);
    const res = await pushRoomStateImmediate(roomId, token, {
      deletedMatchId,
      deletedMatchIds: deletedIds,
    });
    return res.success;
  }
  return false;
}

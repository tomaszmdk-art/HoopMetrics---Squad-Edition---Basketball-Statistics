import {
  AppSettings,
  ChildMatchRecord,
  ChildProfile,
  ClubProfile,
  Match,
  Player,
  RoomSummary,
  TeamCategory,
} from '../types/basketball';

const DB_VERSION = 1;
const RECENT_ROOMS_STORAGE_KEY = 'basketstats_recent_rooms';

let currentRoomId: string | null = null;

export function setCurrentRoomId(roomId: string | null): void {
  currentRoomId = roomId ? roomId.trim().toLowerCase() : null;
}

export function getCurrentRoomId(): string | null {
  return currentRoomId;
}

function getRoomDbName(): string {
  return currentRoomId ? `BasketStatsRoom_${currentRoomId}` : 'BasketStatsDB';
}

export function getRoomStorageKey(baseKey: string, roomIdOverride?: string | null): string {
  const rid = roomIdOverride !== undefined ? roomIdOverride : currentRoomId;
  return rid ? `${baseKey}_${rid}` : baseKey;
}

export const DEFAULT_CLUB_PROFILE: ClubProfile = {
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
};

export const DEMO_SINGLE_TEAM_PLAYERS: Player[] = [
  { id: 'demo-team-1', teamCategory: 'TEAM', firstName: 'Jan', lastName: 'Kowalski', number: 4, position: 'PG', notes: 'Rozgrywający • Kapitan', createdAt: Date.now() },
  { id: 'demo-team-2', teamCategory: 'TEAM', firstName: 'Adam', lastName: 'Nowak', number: 7, position: 'SG', notes: 'Strzelec dystansowy', createdAt: Date.now() },
  { id: 'demo-team-3', teamCategory: 'TEAM', firstName: 'Piotr', lastName: 'Wiśniewski', number: 10, position: 'SF', notes: 'Skrzydłowy', createdAt: Date.now() },
  { id: 'demo-team-4', teamCategory: 'TEAM', firstName: 'Kacper', lastName: 'Wójcik', number: 13, position: 'PF', notes: 'Silny skrzydłowy', createdAt: Date.now() },
  { id: 'demo-team-5', teamCategory: 'TEAM', firstName: 'Filip', lastName: 'Kamiński', number: 15, position: 'C', notes: 'Środkowy', createdAt: Date.now() },
  { id: 'demo-team-6', teamCategory: 'TEAM', firstName: 'Mikołaj', lastName: 'Lewandowski', number: 21, position: 'PG', notes: 'Obrońca', createdAt: Date.now() },
  { id: 'demo-team-7', teamCategory: 'TEAM', firstName: 'Szymon', lastName: 'Zieliński', number: 33, position: 'SG', notes: 'Rzucający obrońca', createdAt: Date.now() },
  { id: 'demo-team-8', teamCategory: 'TEAM', firstName: 'Jakub', lastName: 'Dąbrowski', number: 24, position: 'PF', notes: 'Skrzydłowy', createdAt: Date.now() },
];

export const SEED_PLAYERS: Player[] = DEMO_SINGLE_TEAM_PLAYERS;

export const PRESET_CLUBS: { id: string; title: string; subtitle: string; profile: ClubProfile; seedPlayers: Player[] }[] = [
  {
    id: 'custom_clean',
    title: 'Czysty Start (Pusty Skład)',
    subtitle: 'Wprowadź własną nazwę drużyny, barwy i dodaj zawodników od podstaw.',
    profile: {
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
    },
    seedPlayers: [],
  },
  {
    id: 'demo_single_team',
    title: 'Orły Basket (Przykładowy Skład 8 Graczy)',
    subtitle: 'Gotowy przykładowy skład jednej drużyny koszykarskiej do szybkiego przetestowania statystyk.',
    profile: {
      id: 'club-main',
      name: 'Orły Basket Warszawa',
      shortName: 'ORŁY',
      city: 'Warszawa',
      badgeEmoji: '🦅',
      primaryColor: '#2563eb',
      secondaryColor: '#0f172a',
      headCoach: 'Trener Tomasz Nowak',
      assistantCoach: 'Trener Michał Krawczyk',
      categories: ['TEAM'],
      season: '2026/2027',
      leagueName: 'Liga Koszykarska',
      updatedAt: Date.now(),
    },
    seedPlayers: DEMO_SINGLE_TEAM_PLAYERS,
  },
];

const DEFAULT_SETTINGS: AppSettings = {
  ttsEnabled: true,
  soundEffects: true,
  handMode: 'right',
  autoAdvanceQuarter: false,
  defaultQuarterMinutes: 8,
  announcerVoice: 'Puck',
  coachPin: '1234',
};

function openNamedDB(dbName: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      reject(new Error('IndexedDB not supported in this environment'));
      return;
    }

    const request = window.indexedDB.open(dbName, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      if (!db.objectStoreNames.contains('players')) {
        const playerStore = db.createObjectStore('players', { keyPath: 'id' });
        playerStore.createIndex('teamCategory', 'teamCategory', { unique: false });
      }

      if (!db.objectStoreNames.contains('matches')) {
        const matchStore = db.createObjectStore('matches', { keyPath: 'id' });
        matchStore.createIndex('teamCategory', 'teamCategory', { unique: false });
        matchStore.createIndex('status', 'status', { unique: false });
      }

      if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings', { keyPath: 'key' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function openDB(): Promise<IDBDatabase> {
  return openNamedDB(getRoomDbName());
}

function openParentDB(): Promise<IDBDatabase> {
  return openNamedDB('BasketStatsParentDB');
}

export async function initDatabase(autoSeed = false): Promise<void> {
  try {
    if (!autoSeed) return;
    const players = await getPlayers();
    if (players.length === 0) {
      for (const p of DEMO_SINGLE_TEAM_PLAYERS) {
        await savePlayer(p);
      }
    }
  } catch (err) {
    console.error('Failed to initialize database:', err);
  }
}

export function getClubProfileSync(): ClubProfile | null {
  if (typeof window === 'undefined') return null;
  try {
    const local = localStorage.getItem(getRoomStorageKey('BasketStats_ClubProfile'));
    if (local) {
      const parsed = JSON.parse(local);
      if (parsed && parsed.name) {
        return { ...DEFAULT_CLUB_PROFILE, ...parsed };
      }
    }
  } catch {
    // ignore
  }
  return null;
}

export async function getClubProfile(): Promise<ClubProfile> {
  const syncProfile = getClubProfileSync();
  if (syncProfile) return syncProfile;

  const db = await openDB();
  return new Promise((resolve) => {
    const tx = db.transaction('settings', 'readonly');
    const store = tx.objectStore('settings');
    const request = store.get('club_profile');
    request.onsuccess = () => {
      const result = request.result?.data;
      if (result && result.name) {
        resolve({ ...DEFAULT_CLUB_PROFILE, ...result });
      } else {
        resolve(DEFAULT_CLUB_PROFILE);
      }
    };
    request.onerror = () => resolve(DEFAULT_CLUB_PROFILE);
  });
}

export async function saveClubProfile(profile: ClubProfile): Promise<void> {
  const normalized: ClubProfile = {
    ...profile,
    categories: ['TEAM'],
    updatedAt: Date.now(),
  };

  try {
    localStorage.setItem(getRoomStorageKey('BasketStats_ClubProfile'), JSON.stringify(normalized));
  } catch {
    // ignore
  }

  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('settings', 'readwrite');
    const store = tx.objectStore('settings');
    const request = store.put({ key: 'club_profile', data: normalized });
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

/**
 * Resets or applies a pre-configured single-team preset
 */
export async function resetToClubPreset(presetId: string): Promise<{ club: ClubProfile; players: Player[] }> {
  let targetProfile: ClubProfile = DEFAULT_CLUB_PROFILE;
  let targetPlayers: Player[] = [];

  if (presetId === 'demo_single_team' || presetId === 'demo_universal') {
    const demo = PRESET_CLUBS.find((p) => p.id === 'demo_single_team');
    if (demo) {
      targetProfile = demo.profile;
      targetPlayers = demo.seedPlayers;
    }
  } else if (presetId === 'custom_clean') {
    const clean = PRESET_CLUBS.find((p) => p.id === 'custom_clean');
    if (clean) {
      targetProfile = clean.profile;
      targetPlayers = [];
    }
  }

  const current = await getPlayers();
  for (const p of current) {
    await deletePlayer(p.id);
  }

  for (const p of targetPlayers) {
    await savePlayer({ ...p, teamCategory: 'TEAM' });
  }

  await saveClubProfile(targetProfile);

  return {
    club: targetProfile,
    players: await getPlayers(),
  };
}

/**
 * Parses raw text lines (from Excel, Word, or manual notes) into structured Player objects.
 */
export function parsePlayerText(rawText: string, category: TeamCategory = 'TEAM'): Player[] {
  const lines = rawText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const players: Player[] = [];

  const POSITIONS = ['PG', 'SG', 'SF', 'PF', 'C', 'OBROŃCA', 'SKRZYDŁOWY', 'ŚRODKOWY'];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const cleaned = line.replace(/#/g, '').replace(/,/g, ' ').replace(/-/g, ' ');
    const tokens = cleaned.split(/\s+/).filter(Boolean);
    if (tokens.length < 2) continue;

    let number: number | null = null;
    let position: Player['position'] | undefined = undefined;
    const nameTokens: string[] = [];
    const noteTokens: string[] = [];

    for (const token of tokens) {
      const cleanToken = token.replace(/[()]/g, '').toUpperCase();
      if (number === null && /^\d{1,2}$/.test(token)) {
        number = parseInt(token, 10);
      } else if (!position && POSITIONS.includes(cleanToken)) {
        position = cleanToken as Player['position'];
      } else if (
        token.startsWith('(') ||
        token.endsWith(')') ||
        token.toLowerCase().includes('rocznik') ||
        token.toLowerCase().includes('cm')
      ) {
        noteTokens.push(token);
      } else {
        nameTokens.push(token);
      }
    }

    if (nameTokens.length === 0) continue;

    const firstName = nameTokens[0] || 'Zawodnik';
    const lastName = nameTokens.slice(1).join(' ') || '';
    const finalNumber = number !== null ? number : i + 1;

    players.push({
      id: `player-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 6)}`,
      teamCategory: category || 'TEAM',
      firstName,
      lastName,
      number: finalNumber,
      position: position || 'PG',
      notes: noteTokens.join(' ').replace(/[()]/g, '') || undefined,
      createdAt: Date.now() + i,
    });
  }

  return players;
}

export async function bulkImportPlayers(category: TeamCategory = 'TEAM', rawText: string): Promise<Player[]> {
  const parsed = parsePlayerText(rawText, category || 'TEAM');
  for (const p of parsed) {
    await savePlayer(p);
  }
  return await getPlayers();
}

export async function resetToOfficialLZKoszRosters(): Promise<Player[]> {
  const current = await getPlayers();
  for (const p of current) {
    await deletePlayer(p.id);
  }
  for (const p of DEMO_SINGLE_TEAM_PLAYERS) {
    await savePlayer(p);
  }
  return await getPlayers();
}

export async function getPlayers(_category?: TeamCategory): Promise<Player[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('players', 'readonly');
    const store = tx.objectStore('players');
    const request = store.getAll();

    request.onsuccess = () => {
      const result = (request.result || []).sort((a, b) => a.number - b.number);
      resolve(result);
    };
    request.onerror = () => reject(request.error);
  });
}

export async function savePlayer(player: Player): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('players', 'readwrite');
    const store = tx.objectStore('players');
    const request = store.put({ ...player, teamCategory: player.teamCategory || 'TEAM' });
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function savePlayersBulk(playersToSave: Player[]): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('players', 'readwrite');
    const store = tx.objectStore('players');
    for (const p of playersToSave) {
      store.put({ ...p, teamCategory: p.teamCategory || 'TEAM' });
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function replacePlayersInRoom(playersToSave: Player[]): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('players', 'readwrite');
    const store = tx.objectStore('players');
    store.clear();
    for (const p of playersToSave) {
      store.put({ ...p, teamCategory: p.teamCategory || 'TEAM' });
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function deletePlayer(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('players', 'readwrite');
    const store = tx.objectStore('players');
    const request = store.delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function getMatches(_category?: TeamCategory): Promise<Match[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('matches', 'readonly');
    const store = tx.objectStore('matches');
    const request = store.getAll();

    request.onsuccess = () => {
      const matches = (request.result || []).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
      resolve(matches);
    };
    request.onerror = () => reject(request.error);
  });
}

export async function getMatch(id: string): Promise<Match | undefined> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('matches', 'readonly');
    const store = tx.objectStore('matches');
    const request = store.get(id);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveMatch(match: Match): Promise<void> {
  const db = await openDB();
  const activeKey = getRoomStorageKey('basketstats_active_match_id');
  try {
    if (match.status === 'live') {
      localStorage.setItem(activeKey, match.id);
    } else if (localStorage.getItem(activeKey) === match.id) {
      localStorage.removeItem(activeKey);
    }
  } catch {
    // Ignore quota issues
  }

  return new Promise((resolve, reject) => {
    const tx = db.transaction('matches', 'readwrite');
    const store = tx.objectStore('matches');
    const request = store.put({ ...match, updatedAt: Date.now() });
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function deleteMatch(id: string): Promise<void> {
  const db = await openDB();
  const activeKey = getRoomStorageKey('basketstats_active_match_id');
  return new Promise((resolve, reject) => {
    const tx = db.transaction('matches', 'readwrite');
    const store = tx.objectStore('matches');
    const request = store.delete(id);
    request.onsuccess = () => {
      try {
        if (localStorage.getItem(activeKey) === id) {
          localStorage.removeItem(activeKey);
        }
      } catch {
        // ignore
      }
      resolve();
    };
    request.onerror = () => reject(request.error);
  });
}

export async function getActiveMatch(): Promise<Match | undefined> {
  const activeKey = getRoomStorageKey('basketstats_active_match_id');
  try {
    const activeId = localStorage.getItem(activeKey);
    if (activeId) {
      const m = await getMatch(activeId);
      if (m && m.status === 'live') return m;
    }
  } catch {
    // ignore
  }

  const allMatches = await getMatches();
  return allMatches.find((m) => m.status === 'live');
}

export async function getSettings(): Promise<AppSettings> {
  const db = await openDB();
  return new Promise((resolve) => {
    const tx = db.transaction('settings', 'readonly');
    const store = tx.objectStore('settings');
    const request = store.get('app_settings');
    request.onsuccess = () => {
      resolve(request.result?.data || DEFAULT_SETTINGS);
    };
    request.onerror = () => {
      resolve(DEFAULT_SETTINGS);
    };
  });
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('settings', 'readwrite');
    const store = tx.objectStore('settings');
    const request = store.put({ key: 'app_settings', data: settings });
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

/**
 * Saves multiple matches in a single IndexedDB transaction
 */
export async function saveMatchesBulk(matchesToSave: Match[]): Promise<void> {
  if (!matchesToSave || matchesToSave.length === 0) return;
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('matches', 'readwrite');
    const store = tx.objectStore('matches');
    for (const match of matchesToSave) {
      store.put(match);
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Recent rooms history (localStorage)
 */
export function getRecentRooms(): RoomSummary[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(RECENT_ROOMS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((r: any): r is RoomSummary => r && typeof r.roomId === 'string' && typeof r.teamName === 'string')
      .sort((a, b) => (b.lastVisited || 0) - (a.lastVisited || 0));
  } catch {
    return [];
  }
}

export function saveRecentRoom(summary: RoomSummary): RoomSummary[] {
  const current = getRecentRooms().filter((r) => r.roomId !== summary.roomId);
  const updated = [summary, ...current].slice(0, 15);
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(RECENT_ROOMS_STORAGE_KEY, JSON.stringify(updated));
    } catch {
      // ignore
    }
  }
  return updated;
}

export function removeRecentRoom(roomId: string): RoomSummary[] {
  const updated = getRecentRooms().filter((r) => r.roomId !== roomId);
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(RECENT_ROOMS_STORAGE_KEY, JSON.stringify(updated));
    } catch {
      // ignore
    }
  }
  return updated;
}

/**
 * Exports complete application database (matches, players, settings, club profile) to formatted JSON
 */
export async function exportAllDataAsJson(): Promise<string> {
  const [players, matches, settings, clubProfile] = await Promise.all([
    getPlayers(),
    getMatches(),
    getSettings(),
    getClubProfile(),
  ]);

  const exportPayload = {
    app: 'BasketStats Pro',
    club: clubProfile.name,
    roomId: currentRoomId || undefined,
    version: '2026/2027',
    exportedAt: new Date().toISOString(),
    matchesCount: matches.length,
    playersCount: players.length,
    clubProfile,
    matches,
    players,
    settings,
  };

  return JSON.stringify(exportPayload, null, 2);
}

/**
 * Imports matches, players and club configuration from a JSON string into IndexedDB
 */
export async function importDataFromJson(jsonStr: string): Promise<{
  importedMatches: Match[];
  importedPlayers: Player[];
  importedClub?: ClubProfile;
  matchesCount: number;
}> {
  const parsed = JSON.parse(jsonStr);
  const rawMatches: unknown[] = Array.isArray(parsed) ? parsed : parsed.matches || [];
  const rawPlayers: unknown[] = Array.isArray(parsed.players) ? parsed.players : [];

  let importedClub: ClubProfile | undefined = undefined;
  if (parsed.clubProfile && typeof parsed.clubProfile.name === 'string') {
    const clubToSave: ClubProfile = { ...DEFAULT_CLUB_PROFILE, ...parsed.clubProfile, categories: ['TEAM'] };
    importedClub = clubToSave;
    await saveClubProfile(clubToSave);
  }

  const validMatches: Match[] = rawMatches.filter(
    (m: any): m is Match => m && typeof m.id === 'string' && typeof m.opponent === 'string'
  );

  if (validMatches.length > 0) {
    await saveMatchesBulk(validMatches);
  }

  const validPlayers: Player[] = rawPlayers.filter(
    (p: any): p is Player => p && typeof p.id === 'string' && typeof p.lastName === 'string'
  );

  if (validPlayers.length > 0) {
    await savePlayersBulk(validPlayers);
  }

  return {
    importedMatches: validMatches,
    importedPlayers: validPlayers,
    importedClub,
    matchesCount: validMatches.length,
  };
}

// ==========================================
// PARENT MODE STORAGE (TRYB RODZICA - GLOBAL)
// ==========================================

export const DEFAULT_PARENT_CHILDREN: ChildProfile[] = [
  {
    id: 'child-1',
    name: 'Kacper Nowak',
    number: 7,
    clubName: 'Moja Drużyna Koszykarska',
    category: 'U13',
    birthYear: 2014,
    position: 'SG - Rzucający Obrońca',
    color: '#f97316',
    avatarEmoji: '⚡',
    notes: 'Strzelec dystansowy, szybki powrót do obrony',
    createdAt: Date.now() - 30 * 86400000,
  },
  {
    id: 'child-2',
    name: 'Maja Nowak',
    number: 12,
    clubName: 'Basket Warszawa',
    category: 'U11',
    birthYear: 2016,
    position: 'PG - Rozgrywająca',
    color: '#3b82f6',
    avatarEmoji: '🌟',
    notes: 'Świetny przegląd pola i drybling lewą ręką',
    createdAt: Date.now() - 15 * 86400000,
  },
];

export const DEFAULT_CHILD_MATCHES: ChildMatchRecord[] = [
  {
    id: 'child-match-demo-1',
    childId: 'child-1',
    childName: 'Kacper Nowak',
    childNumber: 7,
    childClub: 'Moja Drużyna Koszykarska',
    childCategory: 'U13',
    opponent: 'ŁKS Łódź',
    location: 'Dom',
    date: '2026-10-14',
    competition: 'Liga Wojewódzka',
    quarterMinutes: 8,
    status: 'finished',
    currentQuarter: 4,
    isOnCourt: false,
    secondsPlayed: 1240,
    pts: 14,
    fg2m: 4,
    fg2a: 7,
    fg3m: 2,
    fg3a: 4,
    ftm: 0,
    fta: 2,
    offReb: 1,
    defReb: 4,
    totReb: 5,
    ast: 4,
    stl: 3,
    blk: 1,
    tov: 2,
    fouls: 2,
    plusMinus: 12,
    eval: 18,
    events: [
      { id: 'ev-1', timestamp: Date.now() - 600000, quarter: 1, timeFormatted: 'Q1', type: '2PT_MADE', label: 'Wjazd pod kosz (+2)', pointsDelta: 2 },
      { id: 'ev-2', timestamp: Date.now() - 500000, quarter: 1, timeFormatted: 'Q1', type: 'DEF_REB', label: 'Zbiórka w obronie', pointsDelta: 0 },
      { id: 'ev-3', timestamp: Date.now() - 400000, quarter: 2, timeFormatted: 'Q2', type: '3PT_MADE', label: 'Trójka ze skrzydła (+3)', pointsDelta: 3 },
      { id: 'ev-4', timestamp: Date.now() - 300000, quarter: 2, timeFormatted: 'Q2', type: 'ASSIST', label: 'Asysta do środkowego', pointsDelta: 0 },
      { id: 'ev-5', timestamp: Date.now() - 200000, quarter: 3, timeFormatted: 'Q3', type: 'STEAL', label: 'Przechwyt piłki', pointsDelta: 0 },
      { id: 'ev-6', timestamp: Date.now() - 100000, quarter: 4, timeFormatted: 'Q4', type: '3PT_MADE', label: 'Trójka z rogu boiska (+3)', pointsDelta: 3 },
    ],
    quarterScores: {
      q1: { pts: 4, reb: 2, ast: 1 },
      q2: { pts: 3, reb: 1, ast: 2 },
      q3: { pts: 2, reb: 1, ast: 1 },
      q4: { pts: 5, reb: 1, ast: 0 },
    },
    finalTeamScoreOur: 68,
    finalTeamScoreOpp: 54,
    notes: 'Świetny mecz! Kluczowa trójka w 4. kwarcie powiększyła prowadzenie.',
    highlights: ['Trójka w 4. kwarcie', 'Przechwyt i szybki atak', 'Asysta za plecami'],
    updatedAt: Date.now() - 6 * 86400000,
  },
];

const LOCAL_STORAGE_CHILDREN_KEY = 'BasketStats_ParentChildren';
const LOCAL_STORAGE_CHILD_MATCHES_KEY = 'BasketStats_ParentChildMatches';
const LOCAL_STORAGE_ACTIVE_CHILD_KEY = 'BasketStats_ParentActiveChildId';

export async function getParentChildren(): Promise<ChildProfile[]> {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_CHILDREN_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch (err) {
    console.warn('Error reading parent children from localStorage:', err);
  }

  try {
    const db = await openParentDB();
    const result = await new Promise<ChildProfile[] | null>((resolve) => {
      const tx = db.transaction('settings', 'readonly');
      const store = tx.objectStore('settings');
      const req = store.get('parent_children');
      req.onsuccess = () => resolve(req.result?.data || null);
      req.onerror = () => resolve(null);
    });
    if (result && Array.isArray(result) && result.length > 0) {
      return result;
    }
  } catch (err) {
    console.warn('Error reading parent children from IndexedDB:', err);
  }

  try {
    localStorage.setItem(LOCAL_STORAGE_CHILDREN_KEY, JSON.stringify(DEFAULT_PARENT_CHILDREN));
  } catch {
    // ignore
  }
  return DEFAULT_PARENT_CHILDREN;
}

export async function saveParentChildren(children: ChildProfile[]): Promise<void> {
  const safeList = children.slice(0, 3);
  try {
    localStorage.setItem(LOCAL_STORAGE_CHILDREN_KEY, JSON.stringify(safeList));
  } catch {
    // ignore
  }

  try {
    const db = await openParentDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('settings', 'readwrite');
      const store = tx.objectStore('settings');
      store.put({ key: 'parent_children', data: safeList });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.warn('Error saving parent children to IndexedDB:', err);
  }
}

export async function saveParentChild(child: ChildProfile): Promise<ChildProfile[]> {
  const current = await getParentChildren();
  const existingIndex = current.findIndex((c) => c.id === child.id);
  let updated: ChildProfile[];
  if (existingIndex >= 0) {
    updated = [...current];
    updated[existingIndex] = child;
  } else {
    if (current.length >= 3) {
      throw new Error('Możesz dodać maksymalnie 3 dzieci.');
    }
    updated = [...current, child];
  }
  await saveParentChildren(updated);
  return updated;
}

export async function deleteParentChild(childId: string): Promise<ChildProfile[]> {
  const current = await getParentChildren();
  const updated = current.filter((c) => c.id !== childId);
  await saveParentChildren(updated);
  return updated;
}

export async function getParentChildMatches(childId?: string): Promise<ChildMatchRecord[]> {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_CHILD_MATCHES_KEY);
    if (raw) {
      const parsed: ChildMatchRecord[] = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return childId ? parsed.filter((m) => m.childId === childId) : parsed;
      }
    }
  } catch (err) {
    console.warn('Error reading child matches from localStorage:', err);
  }

  try {
    const db = await openParentDB();
    const result = await new Promise<ChildMatchRecord[] | null>((resolve) => {
      const tx = db.transaction('settings', 'readonly');
      const store = tx.objectStore('settings');
      const req = store.get('parent_child_matches');
      req.onsuccess = () => resolve(req.result?.data || null);
      req.onerror = () => resolve(null);
    });
    if (result && Array.isArray(result)) {
      return childId ? result.filter((m) => m.childId === childId) : result;
    }
  } catch (err) {
    console.warn('Error reading child matches from IndexedDB:', err);
  }

  try {
    localStorage.setItem(LOCAL_STORAGE_CHILD_MATCHES_KEY, JSON.stringify(DEFAULT_CHILD_MATCHES));
  } catch {
    // ignore
  }
  return childId ? DEFAULT_CHILD_MATCHES.filter((m) => m.childId === childId) : DEFAULT_CHILD_MATCHES;
}

export async function saveParentChildMatch(match: ChildMatchRecord): Promise<void> {
  const allMatches = await getParentChildMatches();
  const index = allMatches.findIndex((m) => m.id === match.id);
  let updated: ChildMatchRecord[];
  if (index >= 0) {
    updated = [...allMatches];
    updated[index] = match;
  } else {
    updated = [match, ...allMatches];
  }

  try {
    localStorage.setItem(LOCAL_STORAGE_CHILD_MATCHES_KEY, JSON.stringify(updated));
  } catch {
    // ignore
  }

  try {
    const db = await openParentDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('settings', 'readwrite');
      const store = tx.objectStore('settings');
      store.put({ key: 'parent_child_matches', data: updated });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.warn('Error saving child match to IndexedDB:', err);
  }
}

export async function deleteParentChildMatch(matchId: string): Promise<ChildMatchRecord[]> {
  const allMatches = await getParentChildMatches();
  const updated = allMatches.filter((m) => m.id !== matchId);

  try {
    localStorage.setItem(LOCAL_STORAGE_CHILD_MATCHES_KEY, JSON.stringify(updated));
  } catch {
    // ignore
  }

  try {
    const db = await openParentDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('settings', 'readwrite');
      const store = tx.objectStore('settings');
      store.put({ key: 'parent_child_matches', data: updated });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.warn('Error deleting child match from IndexedDB:', err);
  }

  return updated;
}

export function getParentActiveChildId(): string {
  try {
    const id = localStorage.getItem(LOCAL_STORAGE_ACTIVE_CHILD_KEY);
    if (id) return id;
  } catch {
    // ignore
  }
  return 'child-1';
}

export function setParentActiveChildId(childId: string): void {
  try {
    localStorage.setItem(LOCAL_STORAGE_ACTIVE_CHILD_KEY, childId);
  } catch {
    // ignore
  }
}

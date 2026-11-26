import React, { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react';
import { AppSettings, ClubProfile, Match, Player } from './types/basketball';

import { Navbar } from './components/Navbar';
import { HomePage } from './components/HomePage';
import { LiveMatch } from './components/LiveMatch';
import { RosterManagement } from './components/RosterManagement';
import { MatchHistory } from './components/MatchHistory';
import { NewMatchModal } from './components/NewMatchModal';
import { SettingsModal } from './components/SettingsModal';
import { FinishMatchModal } from './components/FinishMatchModal';
import { OfflineIndicator } from './components/OfflineIndicator';
import { ShareLinkModal } from './components/ShareLinkModal';
import { CoachPinModal } from './components/CoachPinModal';
import { ClubProfileModal } from './components/ClubProfileModal';
import { LegalLicensesModal } from './components/LegalLicensesModal';
import { ParentView } from './components/ParentView';
import { TeamExportImportModal } from './components/TeamExportImportModal';
import { VirtualLiveMatchCustomizer } from './components/VirtualLiveMatchCustomizer';
import { DataTransferModal } from './components/DataTransferModal';
import { RoomLobby } from './components/RoomLobby';
import {
  initDatabase,
  getPlayers,
  savePlayer,
  deletePlayer,
  getMatches,
  saveMatch,
  saveMatchesBulk,
  deleteMatch,
  getActiveMatch,
  getSettings,
  saveSettings,
  getClubProfile,
  saveClubProfile,
  resetToClubPreset,
  DEFAULT_CLUB_PROFILE,
  setCurrentRoomId,
  saveRecentRoom,
  replacePlayersInRoom,
} from './services/db';
import {
  authenticateRoomCoach,
  clearStoredCoachToken,
  fetchRoomState,
  getLocalDeletedMatchIds,
  addLocalDeletedMatchIds,
  getStoredCoachToken,
  parseRoomFromUrl,
  pushRoomStateDebounced,
  pushRoomStateImmediate,
  ServerPersistenceMode,
  ServerSyncData,
  setStoredCoachToken,
  subscribeToRoomUpdates,
  WsConnectionStatus,
} from './services/syncService';
import {
  mergeServerClubWithLocal,
  mergeServerPlayersWithLocal,
} from './services/playerDisplay';
import {
  Trophy,
  Users,
  PlusCircle,
  ArrowRight,
  ShieldCheck,
  RefreshCw,
  AlertTriangle,
} from 'lucide-react';
import { playClickSound, triggerHaptic } from './services/tts';
import {
  AppTab,
  buildRoomUrl,
  initNavigationHistory,
  pushPageHistory,
  replacePageHistory,
  subscribeToPagePopState,
  useBackHandler,
} from './services/navigationHistory';

const VALID_TABS: ReadonlySet<string> = new Set(['home', 'live', 'roster', 'history', 'parent']);
function parseTabFromUrl(): AppTab | null {
  if (typeof window === 'undefined') return null;
  const tabParam = new URLSearchParams(window.location.search).get('tab');
  return tabParam && VALID_TABS.has(tabParam) ? (tabParam as AppTab) : null;
}

function buildActiveMatchFingerprint(m: Match | undefined): string {
  if (!m) return 'none';
  const totalSec = m.playerSecondsPlayed
    ? Object.values(m.playerSecondsPlayed).reduce((sum, s) => sum + (s || 0), 0)
    : 0;
  return `${m.id}:${m.updatedAt || 0}:${m.clockSeconds}:${m.isClockRunning}:${m.currentQuarter}:${m.ourScore}:${m.opponentScore}:${m.events?.length || 0}:${m.onCourtPlayerIds?.join(',') || ''}:${totalSec}`;
}

function buildPlayersFingerprint(list: Player[]): string {
  return `${list.length}:${list
    .map(
      (p) =>
        `${p.id}-${p.number}-${p.firstName || ''}-${p.lastName || ''}-${p.position || ''}-${p.notes || ''}-${p.photo ? p.photo.length : '0'}`
    )
    .join(',')}`;
}

function isSpectatorModeInUrl(): boolean {
  if (typeof window === 'undefined') return false;
  const p = new URLSearchParams(window.location.search);
  return (
    p.get('view') === 'spectator' ||
    p.get('mode') === 'view' ||
    p.get('role') === 'viewer' ||
    p.get('podglad') === '1'
  );
}

export default function App() {
  const initialUrlRef = useRef(parseRoomFromUrl());
  const sessionRoleRef = useRef<'coach' | 'spectator' | null>(
    (() => {
      const rid = initialUrlRef.current.roomId;
      if (!rid) return null;
      if (isSpectatorModeInUrl() && !initialUrlRef.current.coachTokenFromUrl) {
        return 'spectator';
      }
      if (initialUrlRef.current.coachTokenFromUrl || getStoredCoachToken(rid)) {
        return 'coach';
      }
      return 'spectator';
    })()
  );

  const [roomId, setRoomId] = useState<string | null>(() => {
    const rid = initialUrlRef.current.roomId;
    setCurrentRoomId(rid);
    return rid;
  });

  const [coachToken, setCoachToken] = useState<string | null>(() => {
    const rid = initialUrlRef.current.roomId;
    if (!rid) return null;
    if (isSpectatorModeInUrl() && !initialUrlRef.current.coachTokenFromUrl) {
      return null;
    }
    return initialUrlRef.current.coachTokenFromUrl || getStoredCoachToken(rid);
  });

  const [isReadOnlyViewer, setIsReadOnlyViewer] = useState<boolean>(() => {
    const rid = initialUrlRef.current.roomId;
    if (!rid) return true;
    if (isSpectatorModeInUrl() && !initialUrlRef.current.coachTokenFromUrl) {
      return true;
    }
    const token = initialUrlRef.current.coachTokenFromUrl || getStoredCoachToken(rid);
    return !token;
  });

  const [lobbyParentMode, setLobbyParentMode] = useState<boolean>(() => {
    if (typeof window === 'undefined' || initialUrlRef.current.roomId) return false;
    return new URLSearchParams(window.location.search).get('parent') === '1';
  });
  const [roomLoadError, setRoomLoadError] = useState<string | null>(null);
  const [justCreatedRoom, setJustCreatedRoom] = useState(false);
  const [wsStatus, setWsStatus] = useState<WsConnectionStatus>('disconnected');

  const [currentTab, setCurrentTab] = useState<AppTab>(() => {
    if (typeof window !== 'undefined') {
      const urlTab = parseTabFromUrl();
      if (urlTab) return urlTab;
      if (isSpectatorModeInUrl()) {
        return 'live';
      }
    }
    return 'home';
  });
  const roomIdRef = useRef<string | null>(roomId);
  const currentTabRef = useRef<AppTab>(currentTab);
  const isReadOnlyViewerRef = useRef<boolean>(isReadOnlyViewer);
  roomIdRef.current = roomId;
  currentTabRef.current = currentTab;
  isReadOnlyViewerRef.current = isReadOnlyViewer;

  const [players, setPlayers] = useState<Player[]>([]);
  const playersRef = useRef<Player[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [activeMatch, setActiveMatch] = useState<Match | undefined>(undefined);
  const activeMatchRef = useRef<Match | undefined>(undefined);

  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [isCoachPinOpen, setIsCoachPinOpen] = useState(false);
  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
  const [isTeamExportImportOpen, setIsTeamExportImportOpen] = useState(false);
  const [teamExportImportTab, setTeamExportImportTab] = useState<'export' | 'import'>('export');
  const [isLiveCustomizerOpen, setIsLiveCustomizerOpen] = useState(false);

  const [clubProfile, setClubProfile] = useState<ClubProfile>(DEFAULT_CLUB_PROFILE);
  const clubProfileRef = useRef<ClubProfile>(DEFAULT_CLUB_PROFILE);
  const [isClubProfileOpen, setIsClubProfileOpen] = useState(false);
  const [isLegalModalOpen, setIsLegalModalOpen] = useState(false);
  const [isFinishModalOpen, setIsFinishModalOpen] = useState(false);
  const [settings, setSettings] = useState<AppSettings>({
    ttsEnabled: true,
    soundEffects: true,
    handMode: 'right',
    autoAdvanceQuarter: false,
    defaultQuarterMinutes: 8,
    announcerVoice: 'Puck',
    coachPin: '1234',
  });

  const [isNewMatchOpen, setIsNewMatchOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState<boolean>(() => Boolean(initialUrlRef.current.roomId));

  const [serverPersistence, setServerPersistence] = useState<ServerPersistenceMode | null>(null);
  const [detectedDbKeys, setDetectedDbKeys] = useState<string[] | null>(null);
  const [dismissedPersistenceBanner, setDismissedPersistenceBanner] = useState(false);
  const pendingCreatedStateRef = useRef<{ roomId: string; state: ServerSyncData } | null>(null);

  useEffect(() => {
    if (serverPersistence !== 'ephemeral-tmp') return;
    fetch('/api/health', { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data && Array.isArray(data.detectedDbEnvKeys)) {
          setDetectedDbKeys(data.detectedDbEnvKeys);
        }
      })
      .catch(() => {});
  }, [serverPersistence]);

  const lastLocalWriteAtRef = useRef<number>(0);
  const lastServerUpdatedRef = useRef<number>(0);
  const syncFingerprintsRef = useRef({
    club: '',
    players: '',
    matches: '',
    activeMatch: '',
  });

  useEffect(() => {
    activeMatchRef.current = activeMatch;
  }, [activeMatch]);

  useEffect(() => {
    playersRef.current = players;
  }, [players]);

  useEffect(() => {
    clubProfileRef.current = clubProfile;
  }, [clubProfile]);

  const handleOpenTeamExportImport = (tab: 'export' | 'import' = 'export') => {
    setTeamExportImportTab(tab);
    setIsTeamExportImportOpen(true);
  };

  useBackHandler(
    !isReadOnlyViewer && Boolean(activeMatch) && isFinishModalOpen,
    () => setIsFinishModalOpen(false),
    'finish-match'
  );
  useBackHandler(!isReadOnlyViewer && isNewMatchOpen, () => setIsNewMatchOpen(false), 'new-match');
  useBackHandler(!isReadOnlyViewer && isSettingsOpen, () => setIsSettingsOpen(false), 'settings');
  useBackHandler(
    !isReadOnlyViewer && isClubProfileOpen,
    () => setIsClubProfileOpen(false),
    'club-profile'
  );
  useBackHandler(isLegalModalOpen, () => setIsLegalModalOpen(false), 'legal');
  useBackHandler(isShareModalOpen, () => setIsShareModalOpen(false), 'share');
  useBackHandler(isCoachPinOpen, () => setIsCoachPinOpen(false), 'coach-pin');
  useBackHandler(
    isTeamExportImportOpen,
    () => setIsTeamExportImportOpen(false),
    'team-export-import'
  );
  useBackHandler(isTransferModalOpen, () => setIsTransferModalOpen(false), 'transfer');
  useBackHandler(isLiveCustomizerOpen, () => setIsLiveCustomizerOpen(false), 'live-customizer');

  // Update browser URL cleanly via unified navigationHistory
  const updateUrlForRoom = useCallback(
    (
      rid: string | null,
      replace = false,
      viewMode: 'coach' | 'spectator' = 'coach',
      tab: AppTab = 'home'
    ) => {
      if (typeof window === 'undefined') return;
      const nav = rid
        ? {
            bsKind: 'room' as const,
            bsRoomId: rid,
            bsViewMode: viewMode,
            bsTab: tab,
          }
        : { bsKind: 'lobby' as const };
      const nextUrl = rid ? buildRoomUrl(rid, viewMode, tab) : '/';
      if (replace) {
        replacePageHistory(nav, nextUrl);
      } else {
        pushPageHistory(nav, nextUrl);
      }
    },
    []
  );

  // Navigate between tabs inside a room while recording history for mobile Back button
  const navigateToTab = useCallback((nextTab: AppTab) => {
    if (currentTabRef.current === nextTab) return;
    currentTabRef.current = nextTab;
    setCurrentTab(nextTab);
    const activeRid = roomIdRef.current;
    if (activeRid) {
      const viewMode =
        sessionRoleRef.current === 'spectator' || isReadOnlyViewerRef.current
          ? 'spectator'
          : 'coach';
      pushPageHistory(
        {
          bsKind: 'room',
          bsRoomId: activeRid,
          bsViewMode: viewMode,
          bsTab: nextTab,
        },
        buildRoomUrl(activeRid, viewMode, nextTab)
      );
    }
  }, []);

  const handleOpenLobbyParentMode = useCallback(() => {
    setLobbyParentMode(true);
    pushPageHistory({ bsKind: 'lobby-parent' }, '/?parent=1');
  }, []);

  const handleCloseLobbyParentMode = useCallback(() => {
    if (typeof window !== 'undefined' && window.history.state?.bsKind === 'lobby-parent') {
      window.history.back();
      return;
    }
    setLobbyParentMode(false);
    replacePageHistory({ bsKind: 'lobby' }, '/');
  }, []);

  // Enter a specific room from RoomLobby or deep-link
  const handleEnterRoom = useCallback(
    (
      nextRoomId: string,
      nextCoachToken: string | null,
      justCreated = false,
      initialState?: ServerSyncData,
      persistence?: ServerPersistenceMode
    ) => {
      const normalizedRoomId = nextRoomId.trim().toLowerCase();
      setRoomLoadError(null);
      setLobbyParentMode(false);
      setCurrentRoomId(normalizedRoomId);
      lastServerUpdatedRef.current = 0;
      syncFingerprintsRef.current = { club: '', players: '', matches: '', activeMatch: '' };

      if (initialState) {
        pendingCreatedStateRef.current = { roomId: normalizedRoomId, state: initialState };
      } else {
        pendingCreatedStateRef.current = null;
      }

      if (persistence) {
        setServerPersistence(persistence);
        if (persistence === 'ephemeral-tmp') {
          setDismissedPersistenceBanner(false);
        }
      }

      currentTabRef.current = 'home';
      setCurrentTab('home');

      if (nextCoachToken) {
        sessionRoleRef.current = 'coach';
        setStoredCoachToken(normalizedRoomId, nextCoachToken);
        setCoachToken(nextCoachToken);
        setIsReadOnlyViewer(false);
        updateUrlForRoom(normalizedRoomId, false, 'coach', 'home');
      } else {
        // Keep any previously saved coach token intact so user can still switch back to Coach from Lobby
        sessionRoleRef.current = 'spectator';
        setCoachToken(null);
        setIsReadOnlyViewer(true);
        updateUrlForRoom(normalizedRoomId, false, 'spectator', 'home');
      }

      setJustCreatedRoom(justCreated);
      setIsLoading(true);
      setRoomId(normalizedRoomId);
    },
    [updateUrlForRoom]
  );

  // Return to Room Lobby
  const handleExitRoom = useCallback(() => {
    playClickSound();
    triggerHaptic(25);
    pendingCreatedStateRef.current = null;
    sessionRoleRef.current = null;
    setServerPersistence(null);
    setCurrentRoomId(null);
    setRoomId(null);
    setCoachToken(null);
    setIsReadOnlyViewer(true);
    setActiveMatch(undefined);
    activeMatchRef.current = undefined;
    setPlayers([]);
    playersRef.current = [];
    setMatches([]);
    setClubProfile(DEFAULT_CLUB_PROFILE);
    clubProfileRef.current = DEFAULT_CLUB_PROFILE;
    setJustCreatedRoom(false);
    setIsShareModalOpen(false);
    setLobbyParentMode(false);
    setRoomLoadError(null);
    lastServerUpdatedRef.current = 0;
    syncFingerprintsRef.current = { club: '', players: '', matches: '', activeMatch: '' };
    updateUrlForRoom(null, false);
  }, [updateUrlForRoom]);

  // Initialize base history state and listen to Back/Forward navigation
  useLayoutEffect(() => {
    const initialRid = roomIdRef.current;
    if (initialRid) {
      initNavigationHistory({
        bsKind: 'room',
        bsRoomId: initialRid,
        bsViewMode: isReadOnlyViewerRef.current ? 'spectator' : 'coach',
        bsTab: currentTabRef.current,
      });
    } else if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('parent') === '1') {
      initNavigationHistory({ bsKind: 'lobby-parent' });
    } else {
      initNavigationHistory({ bsKind: 'lobby' });
    }

    return subscribeToPagePopState((incomingState) => {
      const parsed = parseRoomFromUrl();

      if (!parsed.roomId) {
        const wantsParent =
          incomingState?.bsKind === 'lobby-parent' ||
          (typeof window !== 'undefined' &&
            new URLSearchParams(window.location.search).get('parent') === '1');
        setLobbyParentMode(wantsParent);

        if (roomIdRef.current !== null) {
          sessionRoleRef.current = null;
          setCurrentRoomId(null);
          lastServerUpdatedRef.current = 0;
          syncFingerprintsRef.current = { club: '', players: '', matches: '', activeMatch: '' };
          setRoomId(null);
          setCoachToken(null);
          setIsReadOnlyViewer(true);
          setActiveMatch(undefined);
          activeMatchRef.current = undefined;
          setPlayers([]);
          setMatches([]);
          setIsLoading(false);
        }
        return;
      }

      setLobbyParentMode(false);
      const urlSpectator = isSpectatorModeInUrl() && !parsed.coachTokenFromUrl;
      const token = urlSpectator ? null : parsed.coachTokenFromUrl || getStoredCoachToken(parsed.roomId);
      const targetRole: 'coach' | 'spectator' = token ? 'coach' : 'spectator';
      const targetTab: AppTab =
        parseTabFromUrl() || incomingState?.bsTab || (urlSpectator ? 'live' : 'home');

      if (parsed.roomId === roomIdRef.current && sessionRoleRef.current === targetRole) {
        // Same room and role: switch tab instantaneously without full room reload
        currentTabRef.current = targetTab;
        setCurrentTab(targetTab);
        return;
      }

      setCurrentRoomId(parsed.roomId);
      lastServerUpdatedRef.current = 0;
      syncFingerprintsRef.current = { club: '', players: '', matches: '', activeMatch: '' };
      sessionRoleRef.current = targetRole;
      currentTabRef.current = targetTab;
      setCurrentTab(targetTab);
      setRoomId(parsed.roomId);
      setCoachToken(token);
      setIsReadOnlyViewer(!token);
      setIsLoading(true);
    });
  }, []);

  // Helper: Apply incoming room state (from WebSocket or REST poll)
  const applyServerRoomState = useCallback(
    (serverData: ServerSyncData, allowForCoach = false) => {
      if (!serverData || (serverData.roomId && serverData.roomId !== roomId)) return;

      if (typeof serverData.lastUpdated === 'number' && serverData.lastUpdated > 0) {
        lastServerUpdatedRef.current = Math.max(
          lastServerUpdatedRef.current,
          serverData.lastUpdated
        );
      }

      // Avoid echoing back our own local write immediately while clock/action is ticking
      if (!isReadOnlyViewer && !allowForCoach) {
        if (Date.now() - lastLocalWriteAtRef.current < 1500) {
          return;
        }
      }

      // 1. Club profile (preserve local coach names if stored)
      if (serverData.clubProfile) {
        const mergedClub = mergeServerClubWithLocal(serverData.clubProfile, clubProfileRef.current);
        const clubJson = JSON.stringify(mergedClub);
        if (clubJson !== syncFingerprintsRef.current.club) {
          syncFingerprintsRef.current.club = clubJson;
          clubProfileRef.current = mergedClub;
          setClubProfile(mergedClub);
          saveClubProfile(mergedClub).catch(() => {});
        }
      }

      // 2. Players (merge server jersey numbers with local names & photos)
      if (Array.isArray(serverData.players)) {
        const mergedPlayers = mergeServerPlayersWithLocal(serverData.players, playersRef.current);
        const playersFp = buildPlayersFingerprint(mergedPlayers);
        if (playersFp !== syncFingerprintsRef.current.players) {
          syncFingerprintsRef.current.players = playersFp;
          playersRef.current = mergedPlayers;
          setPlayers(mergedPlayers);
          replacePlayersInRoom(mergedPlayers).catch(() => {});
        }
      }

      const serverDeletedSet = new Set<string>([
        ...getLocalDeletedMatchIds(roomId),
        ...(Array.isArray(serverData.deletedMatchIds) ? serverData.deletedMatchIds : []),
      ]);
      if (Array.isArray(serverData.deletedMatchIds) && serverData.deletedMatchIds.length > 0) {
        addLocalDeletedMatchIds(serverData.deletedMatchIds, roomId);
      }

      const validServerMatches = Array.isArray(serverData.matches)
        ? serverData.matches.filter((m) => m && m.id && !serverDeletedSet.has(m.id))
        : [];

      // 3. Matches list
      if (Array.isArray(serverData.matches)) {
        const matchesFp = `${validServerMatches.length}:${validServerMatches
          .map((m) => `${m.id}-${m.updatedAt || 0}-${m.ourScore}-${m.opponentScore}-${m.status}-${m.events?.length || 0}`)
          .join(',')}`;
        if (matchesFp !== syncFingerprintsRef.current.matches) {
          syncFingerprintsRef.current.matches = matchesFp;
          setMatches(validServerMatches);
          if (validServerMatches.length > 0) {
            saveMatchesBulk(validServerMatches).catch(() => {});
          }
        }
      }

      // 4. Active live match
      let liveMatch: Match | undefined = undefined;
      if (serverData.activeMatchId && !serverDeletedSet.has(serverData.activeMatchId)) {
        liveMatch = validServerMatches.find(
          (m) => m.id === serverData.activeMatchId && m.status === 'live'
        );
      }
      if (!liveMatch && validServerMatches.length > 0) {
        liveMatch = validServerMatches.find((m) => m.status === 'live');
      }

      const activeFp = buildActiveMatchFingerprint(liveMatch);
      if (activeFp !== syncFingerprintsRef.current.activeMatch) {
        syncFingerprintsRef.current.activeMatch = activeFp;
        setActiveMatch(liveMatch);
        activeMatchRef.current = liveMatch;
      }
    },
    [roomId, isReadOnlyViewer]
  );

  // Load room data when entering/switching roomId
  useEffect(() => {
    if (!roomId) {
      setIsLoading(false);
      return;
    }

    let cancelled = false;

    async function loadRoomData() {
      setIsLoading(true);
      setRoomLoadError(null);
      setCurrentRoomId(roomId);

      try {
        // Resolve effective coach token (prefer URL token if present in this navigation, then stored unless explicitly opened as spectator)
        const parsed = parseRoomFromUrl();
        const hasCoachParamInUrl = parsed.roomId === roomId && Boolean(parsed.coachTokenFromUrl);
        const explicitSpectator =
          !hasCoachParamInUrl &&
          (isSpectatorModeInUrl() || sessionRoleRef.current === 'spectator');

        let effectiveToken = explicitSpectator
          ? null
          : hasCoachParamInUrl
            ? parsed.coachTokenFromUrl
            : coachToken || getStoredCoachToken(roomId);

        if (hasCoachParamInUrl && parsed.coachTokenFromUrl) {
          const authCheck = await authenticateRoomCoach(roomId!, {
            coachToken: parsed.coachTokenFromUrl,
          });
          if (authCheck.authenticated && authCheck.coachToken) {
            effectiveToken = authCheck.coachToken;
            sessionRoleRef.current = 'coach';
            setStoredCoachToken(roomId!, effectiveToken);
            // Strip &coach= from browser address bar so copying URL shares the safe parent link
            updateUrlForRoom(roomId!, true, 'coach', currentTabRef.current);
          } else {
            effectiveToken = null;
            clearStoredCoachToken(roomId);
          }
        }

        await initDatabase(false);

        const [loadedPlayers, loadedMatches, loadedSettings, liveMatch, roomRes, loadedClub] =
          await Promise.all([
            getPlayers(),
            getMatches(),
            getSettings(),
            getActiveMatch(),
            fetchRoomState(roomId!, effectiveToken),
            getClubProfile(),
          ]);

        if (cancelled) return;

        const pendingCreated =
          pendingCreatedStateRef.current?.roomId === roomId
            ? pendingCreatedStateRef.current.state
            : null;
        pendingCreatedStateRef.current = null;

        const hasLocalCoachBackup =
          Boolean(effectiveToken) &&
          (Boolean(pendingCreated) || loadedPlayers.length > 0 || loadedMatches.length > 0);

        if (roomRes.status === 404 && !hasLocalCoachBackup) {
          setCurrentRoomId(null);
          clearStoredCoachToken(roomId);
          setRoomId(null);
          setCoachToken(null);
          setIsReadOnlyViewer(true);
          setRoomLoadError(`Nie znaleziono pokoju o kodzie "${roomId}". Sprawdź link lub utwórz nowy pokój.`);
          updateUrlForRoom(null, true);
          return;
        }

        if (roomRes.status === 404 && hasLocalCoachBackup) {
          fetch('/api/health', { cache: 'no-store' })
            .then((r) => (r.ok ? r.json() : null))
            .then((h) => {
              if (!cancelled && h?.persistence) {
                setServerPersistence(h.persistence);
                if (Array.isArray(h.detectedDbEnvKeys)) {
                  setDetectedDbKeys(h.detectedDbEnvKeys);
                }
              }
            })
            .catch(() => {});
        }

        const serverData = roomRes.data || pendingCreated;
        if (serverData && typeof serverData.lastUpdated === 'number' && serverData.lastUpdated > 0) {
          lastServerUpdatedRef.current = Math.max(
            lastServerUpdatedRef.current,
            serverData.lastUpdated
          );
        }
        const serverConfirmedCoach = serverData
          ? Boolean(serverData.isCoachAuthenticated)
          : Boolean(effectiveToken);

        const isCoachActive = !explicitSpectator && Boolean(effectiveToken) && serverConfirmedCoach;

        if (!serverConfirmedCoach && effectiveToken && serverData) {
          // Stale or wrong token for this room
          clearStoredCoachToken(roomId);
          effectiveToken = null;
        }

        if (!cancelled) {
          sessionRoleRef.current = isCoachActive ? 'coach' : 'spectator';
          setCoachToken(isCoachActive ? effectiveToken : null);
          setIsReadOnlyViewer(!isCoachActive);
        }

        const mergedDeletedIds = addLocalDeletedMatchIds(
          Array.isArray(serverData?.deletedMatchIds) ? serverData.deletedMatchIds : [],
          roomId
        );
        const deletedIdsSet = new Set<string>(mergedDeletedIds);

        const cleanLocalMatches: Match[] = [];
        for (const m of loadedMatches) {
          if (deletedIdsSet.has(m.id)) {
            await deleteMatch(m.id).catch(() => {});
          } else {
            cleanLocalMatches.push(m);
          }
        }

        let finalPlayers = loadedPlayers;
        let finalMatches = cleanLocalMatches;
        let finalActiveMatch: Match | undefined =
          liveMatch && !deletedIdsSet.has(liveMatch.id) && liveMatch.status === 'live'
            ? liveMatch
            : undefined;
        let finalClub = loadedClub;

        if (serverData) {
          if (serverData.clubProfile) {
            // Prefer server profile for spectators, or when server has newer update; preserve local coach names
            if (!isCoachActive || (serverData.clubProfile.updatedAt || 0) >= (loadedClub.updatedAt || 0)) {
              finalClub = mergeServerClubWithLocal(serverData.clubProfile, loadedClub);
              await saveClubProfile(finalClub).catch(() => {});
            }
          }

          if (Array.isArray(serverData.matches)) {
            if (!isCoachActive) {
              finalMatches = serverData.matches
                .filter((m) => m && m.id && !deletedIdsSet.has(m.id))
                .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
            } else {
              const mergedMap = new Map<string, Match>();
              for (const m of cleanLocalMatches) {
                mergedMap.set(m.id, m);
              }
              let hasNewServerMatches = false;
              for (const sm of serverData.matches) {
                if (!sm || !sm.id || deletedIdsSet.has(sm.id)) continue;
                const local = mergedMap.get(sm.id);
                const smTs = sm.updatedAt || 0;
                const localTs = local?.updatedAt || 0;
                if (
                  !local ||
                  smTs > localTs ||
                  (smTs === localTs && sm.status === 'finished' && local.status !== 'finished')
                ) {
                  mergedMap.set(sm.id, sm);
                  hasNewServerMatches = true;
                }
              }
              finalMatches = Array.from(mergedMap.values()).sort(
                (a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)
              );
              if (hasNewServerMatches) {
                saveMatchesBulk(finalMatches).catch(() => {});
              }
            }
          }

          if (Array.isArray(serverData.players)) {
            if (!isCoachActive) {
              finalPlayers = mergeServerPlayersWithLocal(serverData.players, loadedPlayers);
              if (finalPlayers.length > 0 || loadedPlayers.length > 0) {
                await replacePlayersInRoom(finalPlayers).catch(() => {});
              }
            } else if (loadedPlayers.length === 0 && serverData.players.length > 0) {
              finalPlayers = mergeServerPlayersWithLocal(serverData.players, loadedPlayers);
              await replacePlayersInRoom(finalPlayers).catch(() => {});
            }
          }
        }

        // Resolve active live match
        const serverActiveCandidate =
          serverData?.activeMatchId && !deletedIdsSet.has(serverData.activeMatchId)
            ? finalMatches.find((m) => m.id === serverData.activeMatchId && m.status === 'live')
            : undefined;
        const localActiveCandidate = finalActiveMatch
          ? finalMatches.find((m) => m.id === finalActiveMatch!.id && m.status === 'live')
          : undefined;

        finalActiveMatch = isCoachActive
          ? serverActiveCandidate || localActiveCandidate || finalMatches.find((m) => m.status === 'live')
          : serverActiveCandidate || finalMatches.find((m) => m.status === 'live');

        if (!finalActiveMatch && typeof window !== 'undefined') {
          try {
            localStorage.removeItem(`basketstats_active_match_id_${roomId}`);
          } catch {
            // ignore
          }
        }

        // If coach has newer local offline changes, push them to server room
        if (
          isCoachActive &&
          effectiveToken &&
          (finalPlayers.length > 0 || finalMatches.length > 0 || mergedDeletedIds.length > 0)
        ) {
          lastLocalWriteAtRef.current = Date.now();
          pushRoomStateImmediate(roomId!, effectiveToken, {
            matches: finalMatches,
            players: finalPlayers,
            activeMatchId: finalActiveMatch?.id || null,
            clubProfile: finalClub,
            deletedMatchIds: mergedDeletedIds,
          });
        }

        // Seed fingerprints
        syncFingerprintsRef.current = {
          club: JSON.stringify(finalClub),
          players: buildPlayersFingerprint(finalPlayers),
          matches: `${finalMatches.length}:${finalMatches
            .map((m) => `${m.id}-${m.updatedAt || 0}-${m.ourScore}-${m.opponentScore}-${m.status}-${m.events?.length || 0}`)
            .join(',')}`,
          activeMatch: buildActiveMatchFingerprint(finalActiveMatch),
        };

        const mergedSettings: AppSettings = {
          ...loadedSettings,
          coachPin: serverData?.coachPin || loadedSettings.coachPin || '1234',
        };
        if (serverData?.coachPin && serverData.coachPin !== loadedSettings.coachPin) {
          saveSettings(mergedSettings).catch(() => {});
        }

        clubProfileRef.current = finalClub;
        playersRef.current = finalPlayers;
        setClubProfile(finalClub);
        setPlayers(finalPlayers);
        setMatches(finalMatches);
        setSettings(mergedSettings);

        saveRecentRoom({
          roomId: roomId!,
          teamName: finalClub.name || 'Drużyna Koszykarska',
          shortName: finalClub.shortName || 'DRUŻYNA',
          city: finalClub.city || '',
          badgeEmoji: finalClub.badgeEmoji || '🏀',
          season: finalClub.season || '2026/2027',
          role: isCoachActive ? 'coach' : 'spectator',
          coachToken: isCoachActive ? effectiveToken || undefined : undefined,
          lastVisited: Date.now(),
        });

        if (finalActiveMatch) {
          setActiveMatch(finalActiveMatch);
          activeMatchRef.current = finalActiveMatch;
          if (!isCoachActive && !parseTabFromUrl()) {
            currentTabRef.current = 'live';
            setCurrentTab('live');
            updateUrlForRoom(roomId!, true, 'spectator', 'live');
          }
        } else {
          setActiveMatch(undefined);
          activeMatchRef.current = undefined;
        }

        if (justCreatedRoom && isCoachActive) {
          setIsShareModalOpen(true);
        }
      } catch (err) {
        console.error('Błąd ładowania danych pokoju:', err);
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    loadRoomData();
    return () => {
      cancelled = true;
    };
  }, [roomId]);

  // Real-time WebSocket subscription for the active room
  useEffect(() => {
    if (!roomId) {
      setWsStatus('disconnected');
      return;
    }

    const unsubscribe = subscribeToRoomUpdates(
      roomId,
      (incomingState) => {
        applyServerRoomState(incomingState, false);
      },
      setWsStatus
    );

    return () => {
      unsubscribe();
    };
  }, [roomId, applyServerRoomState]);

  const hasLiveMatchForSync = Boolean(
    activeMatch?.status === 'live' || matches.some((m) => m.status === 'live')
  );

  // Adaptive conditional REST polling for Spectator mode:
  // - Uses ?since=<lastUpdated> so unchanged polls return 304 without fetching full JSONB
  // - Pauses automatically while the tab/screen is hidden and refreshes immediately on return
  // - Polls every 1.5s during an active live match, 12s when idle, or 15s when WebSocket is active
  useEffect(() => {
    if (!roomId || !isReadOnlyViewer) return;

    let cancelled = false;
    let isPollingInFlight = false;

    const pollRoom = async (force = false) => {
      if (cancelled || isPollingInFlight) return;
      if (!force && typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        return;
      }
      isPollingInFlight = true;
      try {
        const since = lastServerUpdatedRef.current || undefined;
        const { status, data } = await fetchRoomState(roomId, null, since);
        if (!cancelled && status === 200 && data) {
          applyServerRoomState(data, true);
        }
      } finally {
        isPollingInFlight = false;
      }
    };

    const intervalMs =
      wsStatus === 'connected' ? 15000 : hasLiveMatchForSync ? 1500 : 12000;
    const timer = setInterval(() => {
      void pollRoom(false);
    }, intervalMs);

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        void pollRoom(true);
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [roomId, isReadOnlyViewer, wsStatus, hasLiveMatchForSync, applyServerRoomState]);

  // Same-browser cross-tab BroadcastChannel scoped strictly by roomId
  useEffect(() => {
    if (!roomId || typeof window === 'undefined' || !('BroadcastChannel' in window)) return;
    try {
      const channel = new BroadcastChannel(`basketstats_room_sync_${roomId}`);
      channel.onmessage = (event) => {
        if (event.data?.type === 'MATCH_UPDATED' && event.data.roomId === roomId && event.data.match) {
          const incoming = event.data.match as Match;
          setActiveMatch((prev) => {
            if (!prev || prev.id === incoming.id) {
              activeMatchRef.current = incoming;
              return incoming.status === 'live' ? incoming : undefined;
            }
            return prev;
          });
          setMatches((prev) => {
            const idx = prev.findIndex((m) => m.id === incoming.id);
            if (idx >= 0) {
              const updated = [...prev];
              updated[idx] = incoming;
              return updated;
            }
            return [incoming, ...prev];
          });
        }
      };
      return () => {
        channel.close();
      };
    } catch {
      // ignore
    }
  }, [roomId]);

  // Update Match handler
  const handleUpdateMatch = async (updatedOrUpdater: Match | ((prevMatch: Match) => Match)) => {
    if (isReadOnlyViewer || !roomId) return;
    const current = activeMatchRef.current || activeMatch;
    if (!current) return;

    const rawNext = typeof updatedOrUpdater === 'function' ? updatedOrUpdater(current) : updatedOrUpdater;
    const nextMatch: Match = {
      ...rawNext,
      updatedAt: Date.now(),
    };
    activeMatchRef.current = nextMatch;
    setActiveMatch(nextMatch);

    const updatedMatchesList = matches.some((m) => m.id === nextMatch.id)
      ? matches.map((m) => (m.id === nextMatch.id ? nextMatch : m))
      : [nextMatch, ...matches];

    setMatches(updatedMatchesList);
    lastLocalWriteAtRef.current = Date.now();
    await saveMatch(nextMatch);

    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      try {
        const channel = new BroadcastChannel(`basketstats_room_sync_${roomId}`);
        channel.postMessage({ type: 'MATCH_UPDATED', roomId, match: nextMatch });
        channel.close();
      } catch {
        // ignore
      }
    }

    const isScoreOrEventChange =
      current.events.length !== nextMatch.events.length ||
      current.ourScore !== nextMatch.ourScore ||
      current.opponentScore !== nextMatch.opponentScore ||
      current.currentQuarter !== nextMatch.currentQuarter ||
      current.isClockRunning !== nextMatch.isClockRunning;

    if (isScoreOrEventChange) {
      pushRoomStateImmediate(roomId, coachToken, {
        matches: updatedMatchesList,
        players,
        activeMatchId: nextMatch.status === 'live' ? nextMatch.id : null,
        clubProfile,
      });
    } else {
      pushRoomStateDebounced(
        roomId,
        coachToken,
        {
          matches: updatedMatchesList,
          players,
          activeMatchId: nextMatch.status === 'live' ? nextMatch.id : null,
        },
        500
      );
    }
  };

  // Request Finish Match
  const handleRequestFinishMatch = () => {
    if (!activeMatch) return;
    setIsFinishModalOpen(true);
  };

  // Confirm Finish Match
  const handleConfirmFinishMatch = async () => {
    if (!roomId || isReadOnlyViewer) return;
    const targetMatch = activeMatchRef.current || activeMatch;
    if (!targetMatch) return;
    playClickSound();
    triggerHaptic(50);
    const finished: Match = {
      ...targetMatch,
      status: 'finished',
      isClockRunning: false,
      updatedAt: Date.now(),
    };
    activeMatchRef.current = undefined;
    setActiveMatch(undefined);
    setIsFinishModalOpen(false);
    lastLocalWriteAtRef.current = Date.now();
    await saveMatch(finished);
    const updatedMatches = matches.some((m) => m.id === finished.id)
      ? matches.map((m) => (m.id === finished.id ? finished : m))
      : [finished, ...matches];
    setMatches(updatedMatches);
    await pushRoomStateImmediate(roomId, coachToken, {
      matches: updatedMatches,
      players,
      activeMatchId: null,
      clubProfile,
      deletedMatchIds: getLocalDeletedMatchIds(roomId),
    });
    navigateToTab('history');
  };

  // Start new match
  const handleStartNewMatch = async (newMatch: Match) => {
    if (!roomId || isReadOnlyViewer) return;
    playClickSound();
    triggerHaptic(40);
    lastLocalWriteAtRef.current = Date.now();
    await saveMatch(newMatch);
    setActiveMatch(newMatch);
    activeMatchRef.current = newMatch;
    const updatedMatches = [newMatch, ...matches];
    setMatches(updatedMatches);
    pushRoomStateImmediate(roomId, coachToken, {
      matches: updatedMatches,
      players,
      activeMatchId: newMatch.id,
      clubProfile,
    });
    navigateToTab('live');
  };

  // Resume a match
  const handleResumeMatch = (matchToResume: Match) => {
    if (!roomId || isReadOnlyViewer) return;
    playClickSound();
    triggerHaptic(30);
    const liveVersion: Match = {
      ...matchToResume,
      status: 'live',
      updatedAt: Date.now(),
    };
    lastLocalWriteAtRef.current = Date.now();
    saveMatch(liveVersion);
    setActiveMatch(liveVersion);
    activeMatchRef.current = liveVersion;
    const updatedMatches = matches.map((m) => (m.id === liveVersion.id ? liveVersion : m));
    setMatches(updatedMatches);
    pushRoomStateImmediate(roomId, coachToken, {
      matches: updatedMatches,
      players,
      activeMatchId: liveVersion.id,
      clubProfile,
    });
    navigateToTab('live');
  };

  // Delete match
  const handleDeleteMatch = async (id: string) => {
    if (!roomId || isReadOnlyViewer) return;
    const updatedDeletedIds = addLocalDeletedMatchIds([id], roomId);
    lastLocalWriteAtRef.current = Date.now();
    await deleteMatch(id);
    const updatedMatches = matches.filter((m) => m.id !== id);
    setMatches(updatedMatches);
    const isDeletingActive = activeMatch?.id === id || activeMatchRef.current?.id === id;
    if (isDeletingActive) {
      activeMatchRef.current = undefined;
      setActiveMatch(undefined);
    }
    const nextActiveId = isDeletingActive ? null : activeMatch?.id || null;
    await pushRoomStateImmediate(roomId, coachToken, {
      matches: updatedMatches,
      players,
      activeMatchId: nextActiveId,
      deletedMatchId: id,
      deletedMatchIds: updatedDeletedIds,
      clubProfile,
    });
  };

  // Data import from transfer modal
  const handleDataImported = (
    updatedMatches: Match[],
    updatedPlayers: Player[],
    updatedClub?: ClubProfile
  ) => {
    lastLocalWriteAtRef.current = Date.now();
    playersRef.current = updatedPlayers;
    syncFingerprintsRef.current.players = buildPlayersFingerprint(updatedPlayers);
    setMatches(updatedMatches);
    setPlayers(updatedPlayers);
    if (updatedClub) {
      clubProfileRef.current = updatedClub;
      syncFingerprintsRef.current.club = JSON.stringify(updatedClub);
      setClubProfile(updatedClub);
    }
    const live = updatedMatches.find((m) => m.status === 'live');
    if (live) {
      setActiveMatch(live);
      activeMatchRef.current = live;
    }
  };

  // Save Player handler (coach syncs jersey numbers to server; parent/spectator saves strictly locally)
  const handleSavePlayer = async (player: Player) => {
    const currentList = playersRef.current;
    const category = player.teamCategory || 'TEAM';
    const existingById = currentList.find((p) => p.id === player.id);
    const existingByNumber = !existingById
      ? currentList.find((p) => p.number === player.number && (p.teamCategory || 'TEAM') === category)
      : undefined;

    let normalized: Player;
    if (existingByNumber) {
      normalized = {
        ...existingByNumber,
        ...player,
        id: existingByNumber.id,
        teamCategory: category,
        createdAt: existingByNumber.createdAt || player.createdAt || Date.now(),
      };
    } else if (isReadOnlyViewer && !existingById) {
      const safeId = player.id.startsWith('local-')
        ? player.id
        : `local-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      normalized = { ...player, id: safeId, teamCategory: category };
    } else if (isReadOnlyViewer && existingById && !existingById.id.startsWith('local-')) {
      normalized = {
        ...existingById,
        ...player,
        id: existingById.id,
        number: existingById.number,
        teamCategory: existingById.teamCategory || category,
      };
    } else {
      normalized = { ...player, teamCategory: category };
    }

    lastLocalWriteAtRef.current = Date.now();
    await savePlayer(normalized);
    const nextPlayers = (() => {
      const idx = currentList.findIndex((p) => p.id === normalized.id);
      if (idx >= 0) {
        const copy = [...currentList];
        copy[idx] = normalized;
        return copy;
      }
      return [...currentList, normalized];
    })().sort((a, b) => a.number - b.number);

    playersRef.current = nextPlayers;
    syncFingerprintsRef.current.players = buildPlayersFingerprint(nextPlayers);
    setPlayers(nextPlayers);

    if (!isReadOnlyViewer && roomId && coachToken) {
      pushRoomStateImmediate(roomId, coachToken, {
        matches,
        players: nextPlayers,
        activeMatchId: activeMatch?.id || null,
        clubProfile,
      });
    }
  };

  // Bulk upsert players (coach syncs jersey numbers; parent/spectator keeps everything strictly local)
  const handleSavePlayersBulk = async (incomingPlayers: Player[]) => {
    const currentList = playersRef.current;
    const mergedMap = new Map<string, Player>();
    currentList.forEach((p) => mergedMap.set(p.id, p));

    for (const incoming of incomingPlayers) {
      const category = incoming.teamCategory || 'TEAM';
      const byId = mergedMap.get(incoming.id);
      const byNumber = !byId
        ? Array.from(mergedMap.values()).find(
            (p) => p.number === incoming.number && (p.teamCategory || 'TEAM') === category
          )
        : undefined;

      if (byId) {
        const keepNumber =
          isReadOnlyViewer && !byId.id.startsWith('local-') ? byId.number : incoming.number;
        mergedMap.set(byId.id, {
          ...byId,
          ...incoming,
          id: byId.id,
          number: keepNumber,
          teamCategory: byId.teamCategory || category,
        });
      } else if (byNumber) {
        mergedMap.set(byNumber.id, {
          ...byNumber,
          ...incoming,
          id: byNumber.id,
          number: byNumber.number,
          teamCategory: byNumber.teamCategory || category,
        });
      } else {
        const nextId = isReadOnlyViewer
          ? incoming.id.startsWith('local-')
            ? incoming.id
            : `local-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
          : incoming.id || `player-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        mergedMap.set(nextId, {
          ...incoming,
          id: nextId,
          teamCategory: category,
          createdAt: incoming.createdAt || Date.now(),
        });
      }
    }

    const nextPlayers = Array.from(mergedMap.values()).sort((a, b) => a.number - b.number);
    lastLocalWriteAtRef.current = Date.now();
    await replacePlayersInRoom(nextPlayers);
    playersRef.current = nextPlayers;
    syncFingerprintsRef.current.players = buildPlayersFingerprint(nextPlayers);
    setPlayers(nextPlayers);

    if (!isReadOnlyViewer && roomId && coachToken) {
      pushRoomStateImmediate(roomId, coachToken, {
        matches,
        players: nextPlayers,
        activeMatchId: activeMatch?.id || null,
        clubProfile,
      });
    }
  };

  // Delete Player handler
  const handleDeletePlayer = async (id: string) => {
    const target = playersRef.current.find((p) => p.id === id);
    if (!target) return;

    lastLocalWriteAtRef.current = Date.now();

    if (isReadOnlyViewer) {
      if (id.startsWith('local-')) {
        await deletePlayer(id);
        const nextPlayers = playersRef.current.filter((p) => p.id !== id);
        playersRef.current = nextPlayers;
        syncFingerprintsRef.current.players = buildPlayersFingerprint(nextPlayers);
        setPlayers(nextPlayers);
      } else {
        // Server-synced player: keep jersey number & stats linkage, wipe only local PII
        const cleared: Player = {
          ...target,
          firstName: '',
          lastName: '',
          photo: undefined,
          notes: undefined,
        };
        await savePlayer(cleared);
        const nextPlayers = playersRef.current.map((p) => (p.id === id ? cleared : p));
        playersRef.current = nextPlayers;
        syncFingerprintsRef.current.players = buildPlayersFingerprint(nextPlayers);
        setPlayers(nextPlayers);
      }
      return;
    }

    await deletePlayer(id);
    const nextPlayers = playersRef.current.filter((p) => p.id !== id);
    playersRef.current = nextPlayers;
    syncFingerprintsRef.current.players = buildPlayersFingerprint(nextPlayers);
    setPlayers(nextPlayers);

    if (roomId && coachToken) {
      pushRoomStateImmediate(roomId, coachToken, {
        matches,
        players: nextPlayers,
        activeMatchId: activeMatch?.id || null,
        clubProfile,
      });
    }
  };

  // Save Settings handler (including server PIN updates)
  const handleSaveSettings = async (newSettings: AppSettings) => {
    const pinChanged =
      !isReadOnlyViewer &&
      roomId &&
      coachToken &&
      newSettings.coachPin &&
      newSettings.coachPin.trim().length >= 3 &&
      newSettings.coachPin.trim() !== (settings.coachPin || '').trim();

    setSettings(newSettings);
    await saveSettings(newSettings);

    if (pinChanged && roomId && coachToken) {
      lastLocalWriteAtRef.current = Date.now();
      await pushRoomStateImmediate(roomId, coachToken, {
        newCoachPin: newSettings.coachPin!.trim(),
      });
    }
  };

  // Save Club Profile handler
  const handleSaveClubProfile = async (newProfile: ClubProfile) => {
    if (isReadOnlyViewer || !roomId) return;
    lastLocalWriteAtRef.current = Date.now();
    clubProfileRef.current = newProfile;
    setClubProfile(newProfile);
    await saveClubProfile(newProfile);
    pushRoomStateImmediate(roomId, coachToken, {
      matches,
      players,
      activeMatchId: activeMatch?.id || null,
      clubProfile: newProfile,
    });
    saveRecentRoom({
      roomId,
      teamName: newProfile.name || 'Drużyna Koszykarska',
      shortName: newProfile.shortName || 'DRUŻYNA',
      city: newProfile.city || '',
      badgeEmoji: newProfile.badgeEmoji || '🏀',
      season: newProfile.season || '2026/2027',
      role: 'coach',
      coachToken: coachToken || undefined,
      lastVisited: Date.now(),
    });
  };

  // Apply predefined club preset
  const handleApplyClubPreset = async (presetId: string) => {
    if (isReadOnlyViewer || !roomId) return;
    lastLocalWriteAtRef.current = Date.now();
    const result = await resetToClubPreset(presetId);
    setClubProfile(result.club);
    setPlayers(result.players);
    pushRoomStateImmediate(roomId, coachToken, {
      matches,
      players: result.players,
      activeMatchId: activeMatch?.id || null,
      clubProfile: result.club,
    });
  };

  // Players updated after bulk import
  const handlePlayersUpdated = async () => {
    if (isReadOnlyViewer || !roomId) return;
    lastLocalWriteAtRef.current = Date.now();
    const updated = await getPlayers();
    playersRef.current = updated;
    setPlayers(updated);
    pushRoomStateImmediate(roomId, coachToken, {
      matches,
      players: updated,
      activeMatchId: activeMatch?.id || null,
      clubProfile,
    });
  };

  // Lock coach controls and switch to Parent / Spectator read-only mode (preserving stored coach access)
  const handleLockOrSwitchToSpectator = () => {
    playClickSound();
    triggerHaptic(30);
    sessionRoleRef.current = 'spectator';
    if (roomId) {
      updateUrlForRoom(roomId, true, 'spectator', currentTabRef.current);
      saveRecentRoom({
        roomId,
        teamName: clubProfile.name || 'Drużyna Koszykarska',
        shortName: clubProfile.shortName || 'DRUŻYNA',
        city: clubProfile.city || '',
        badgeEmoji: clubProfile.badgeEmoji || '🏀',
        season: clubProfile.season || '2026/2027',
        role: 'spectator',
        lastVisited: Date.now(),
      });
    }
    setCoachToken(null);
    setIsReadOnlyViewer(true);
  };

  // 1. Standalone Parent Mode from Lobby (1 child tracker)
  if (!roomId && lobbyParentMode) {
    return (
      <div className="min-h-screen w-full bg-slate-950 text-slate-100 p-3 sm:p-6">
        <div className="max-w-7xl mx-auto">
          <ParentView
            onBackToHome={handleCloseLobbyParentMode}
            soundEnabled={settings.ttsEnabled}
          />
        </div>
        <OfflineIndicator />
      </div>
    );
  }

  // 2. Room Lobby (when no ?room= is selected)
  if (!roomId) {
    return (
      <>
        <RoomLobby
          onEnterRoom={handleEnterRoom}
          onOpenParentMode={handleOpenLobbyParentMode}
          initialError={roomLoadError}
        />
        <OfflineIndicator />
      </>
    );
  }

  // 3. Loading Room Screen
  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4 text-slate-100">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center text-3xl shadow-xl shadow-orange-950/50">
          {clubProfile.badgeEmoji || '🏀'}
        </div>
        <h2 className="mt-4 text-base font-black tracking-tight text-white uppercase">
          {clubProfile.name || 'BasketStats Pro'}
        </h2>
        <p className="text-xs text-amber-400 font-medium mt-1">
          Łączenie z pokojem drużyny ({roomId})...
        </p>
      </div>
    );
  }

  const activeRosterPlayers = activeMatch
    ? activeMatch.rosterPlayerIds?.length
      ? players.filter((p) => activeMatch.rosterPlayerIds.includes(p.id))
      : players
    : players;

  return (
    <div className="min-h-screen w-full max-w-full overflow-x-hidden bg-slate-950 text-slate-100 flex flex-col selection:bg-amber-500 selection:text-slate-950">
      {/* Top Navigation */}
      <Navbar
        currentTab={currentTab}
        onSelectTab={navigateToTab}
        activeMatch={activeMatch}
        clubProfile={clubProfile}
        roomId={roomId}
        onExitRoom={handleExitRoom}
        onOpenClubProfile={!isReadOnlyViewer ? () => setIsClubProfileOpen(true) : undefined}
        onOpenLegalModal={() => setIsLegalModalOpen(true)}
        onOpenNewMatchModal={!isReadOnlyViewer ? () => setIsNewMatchOpen(true) : undefined}
        onOpenSettingsModal={!isReadOnlyViewer ? () => setIsSettingsOpen(true) : undefined}
        soundEnabled={settings.ttsEnabled}
        onToggleSound={() => handleSaveSettings({ ...settings, ttsEnabled: !settings.ttsEnabled })}
        readOnly={isReadOnlyViewer}
        onOpenShareModal={() => {
          setJustCreatedRoom(false);
          setIsShareModalOpen(true);
        }}
        onOpenCoachLogin={() => setIsCoachPinOpen(true)}
        onSwitchToSpectator={handleLockOrSwitchToSpectator}
        onOpenTransferModal={() => setIsTransferModalOpen(true)}
        onOpenTeamExportImport={handleOpenTeamExportImport}
      />

      {!isReadOnlyViewer && serverPersistence === 'ephemeral-tmp' && !dismissedPersistenceBanner && (
        <div className="bg-amber-950/70 border-b border-amber-500/40 px-4 py-2.5 text-xs text-amber-200 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 max-w-5xl mx-auto">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
            <span>
              <strong>Brak trwałej bazy danych na Vercel:</strong> pokój działa lokalnie w tej przeglądarce, ale bez podłączonej bazy (<strong>Neon Postgres</strong>, <strong>Upstash</strong> lub <strong>Redis</strong> w zakładce <em>Storage</em> na Vercel + Redeploy) link nie zadziała na telefonach rodziców.
              {detectedDbKeys !== null && (
                <span className="ml-1 text-amber-300/90 font-mono text-[11px]">
                  ({detectedDbKeys.length > 0 ? `Wykryte klucze: ${detectedDbKeys.join(', ')}` : 'Brak wykrytych zmiennych bazy w Production'})
                </span>
              )}
            </span>
          </div>
          <button
            onClick={() => setDismissedPersistenceBanner(true)}
            className="text-amber-300 hover:text-white font-bold px-2 py-0.5 rounded shrink-0"
          >
            Ukryj
          </button>
        </div>
      )}

      {/* Main Container */}
      <main className="flex-1 flex flex-col">
        {/* VIEW 0: HOME PAGE */}
        {currentTab === 'home' && (
          <HomePage
            activeMatch={activeMatch}
            matches={matches}
            players={players}
            clubProfile={clubProfile}
            onOpenClubProfile={!isReadOnlyViewer ? () => setIsClubProfileOpen(true) : undefined}
            onOpenLegalModal={() => setIsLegalModalOpen(true)}
            onOpenNewMatch={!isReadOnlyViewer ? () => setIsNewMatchOpen(true) : undefined}
            onResumeMatch={!isReadOnlyViewer ? handleResumeMatch : undefined}
            onGoToLive={() => navigateToTab('live')}
            onGoToRoster={() => navigateToTab('roster')}
            onGoToHistory={() => navigateToTab('history')}
            onGoToParent={() => navigateToTab('parent')}
            readOnly={isReadOnlyViewer}
            onOpenShareModal={() => {
              setJustCreatedRoom(false);
              setIsShareModalOpen(true);
            }}
            onOpenTransferModal={() => setIsTransferModalOpen(true)}
            onOpenTeamExport={!isReadOnlyViewer ? () => handleOpenTeamExportImport('export') : undefined}
            onOpenTeamImport={isReadOnlyViewer ? () => handleOpenTeamExportImport('import') : undefined}
          />
        )}

        {/* VIEW 1: LIVE MATCH */}
        {currentTab === 'live' && (
          <>
            {activeMatch ? (
              <LiveMatch
                match={activeMatch}
                players={players}
                clubProfile={clubProfile}
                onUpdateMatch={handleUpdateMatch}
                onFinishMatch={handleRequestFinishMatch}
                soundEnabled={settings.ttsEnabled}
                onToggleSound={() =>
                  handleSaveSettings({ ...settings, ttsEnabled: !settings.ttsEnabled })
                }
                handMode={settings.handMode}
                readOnly={isReadOnlyViewer}
              />
            ) : isReadOnlyViewer ? (
              /* Spectator View: No Active Match */
              <div className="flex-1 flex flex-col items-center justify-center p-4 sm:p-6 text-center max-w-lg mx-auto">
                <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-amber-500/20 to-orange-600/20 border-2 border-amber-500/40 flex items-center justify-center text-4xl shadow-2xl mb-5">
                  {clubProfile.badgeEmoji || '🏀'}
                </div>

                <div className="flex flex-wrap items-center justify-center gap-2 mb-3">
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-300 text-xs font-bold">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span>{clubProfile.name}</span>
                  </div>
                  <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs font-bold">
                    <span className="w-2 h-2 rounded-full bg-rose-500" />
                    <span>
                      {wsStatus === 'connected'
                        ? 'Tryb Kibica • Połączono na żywo'
                        : 'Tryb Kibica • Nasłuchiwanie na żywo'}
                    </span>
                  </div>
                </div>

                <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
                  Oczekiwanie na mecz na żywo...
                </h2>
                <p className="text-xs sm:text-sm text-slate-400 mt-2 leading-relaxed">
                  Aktualnie żaden mecz drużyny w tym pokoju nie jest w trakcie rozgrywania. Gdy trener rozpocznie rejestrację meczu, tablica wyników i protokół pojawią się tutaj automatycznie.
                </p>

                <div className="w-full mt-5 flex items-center justify-center">
                  <button
                    onClick={async () => {
                      playClickSound();
                      const { data: serverData } = await fetchRoomState(roomId, null);
                      if (serverData) {
                        applyServerRoomState(serverData, true);
                      }
                    }}
                    className="py-2.5 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 hover:text-white text-xs font-bold transition flex items-center gap-2 shadow-sm"
                  >
                    <RefreshCw className="w-3.5 h-3.5 text-amber-400" />
                    <span>Sprawdź pokój teraz</span>
                  </button>
                </div>

                <div className="w-full mt-6 grid grid-cols-2 gap-2.5">
                  <button
                    onClick={() => navigateToTab('roster')}
                    className="py-3 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-200 text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-md"
                  >
                    <Users className="w-4 h-4 text-amber-400" />
                    <span>Kadra & Eval ({players.length})</span>
                  </button>

                  <button
                    onClick={() => navigateToTab('history')}
                    className="py-3 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-200 text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-md"
                  >
                    <Trophy className="w-4 h-4 text-amber-400" />
                    <span>Historia meczów</span>
                  </button>
                </div>

                {matches.length > 0 && (
                  <div className="w-full mt-6 p-4 rounded-2xl bg-slate-900/90 border border-slate-800 text-left">
                    <div className="text-[11px] font-black uppercase text-amber-400 tracking-wider mb-2 flex items-center justify-between">
                      <span>Ostatni zarejestrowany mecz:</span>
                      <span className="text-slate-400 font-mono text-[10px]">{matches[0].date}</span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-bold text-white">
                          vs {matches[0].opponent}
                        </div>
                        <div className="text-xs text-amber-400 font-mono font-bold mt-0.5">
                          Wynik: {matches[0].ourScore} : {matches[0].opponentScore}
                        </div>
                      </div>
                      <button
                        onClick={() => navigateToTab('history')}
                        className="py-2 px-3 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-300 text-xs font-bold transition flex items-center gap-1 shrink-0"
                      >
                        <span>Protokół</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                )}

                {matches.length > 1 && (
                  <div className="w-full mt-8 text-left border-t border-slate-800/80 pt-4">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block mb-2">
                      Ostatnie zakończone mecze:
                    </span>
                    <div className="space-y-2">
                      {matches.slice(0, 3).map((m) => (
                        <div
                          key={m.id}
                          onClick={() => navigateToTab('history')}
                          className="p-3 rounded-xl bg-slate-900 border border-slate-800 hover:border-slate-700 flex items-center justify-between cursor-pointer transition"
                        >
                          <div>
                            <div className="text-xs font-bold text-white">vs {m.opponent}</div>
                            <div className="text-[10px] text-slate-400 font-mono">
                              {m.date} • {m.ourScore} : {m.opponentScore}
                            </div>
                          </div>
                          <span className="text-xs font-bold text-amber-400 flex items-center gap-1">
                            <span>Zobacz raport</span>
                            <ArrowRight className="w-3.5 h-3.5" />
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              /* Coach View: No Active Match Court Lobby */
              <div className="flex-1 flex flex-col items-center justify-center p-4 sm:p-6 text-center max-w-lg mx-auto">
                <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-amber-500/20 to-orange-600/20 border-2 border-amber-500/40 flex items-center justify-center text-4xl shadow-2xl mb-5">
                  {clubProfile.badgeEmoji || '🏀'}
                </div>

                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-300 text-xs font-bold mb-3">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>{clubProfile.name}</span>
                </div>

                <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
                  Gotowy do rejestracji meczu?
                </h2>
                <p className="text-xs sm:text-sm text-slate-400 mt-2 leading-relaxed">
                  Profesjonalne statystyki meczowe na żywo dostosowane do obsługi jedną ręką na telefonie. Wszystkie dane synchronizują się z tym pokojem i działają także offline.
                </p>

                <div className="w-full mt-6 space-y-3">
                  <button
                    onClick={() => setIsNewMatchOpen(true)}
                    className="w-full py-4 px-6 rounded-2xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 font-black text-base shadow-xl shadow-orange-950/50 transition transform active:scale-98 flex items-center justify-center gap-2"
                  >
                    <PlusCircle className="w-5 h-5" />
                    <span>Rozpocznij Nowy Mecz</span>
                  </button>

                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => navigateToTab('roster')}
                      className="py-3 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-200 text-xs font-bold transition flex items-center justify-center gap-1.5"
                    >
                      <Users className="w-4 h-4 text-amber-400" />
                      <span>Kadra ({players.length} graczy)</span>
                    </button>

                    <button
                      onClick={() => navigateToTab('history')}
                      className="py-3 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-200 text-xs font-bold transition flex items-center justify-center gap-1.5"
                    >
                      <Trophy className="w-4 h-4 text-amber-400" />
                      <span>Historia spotkań</span>
                    </button>
                  </div>
                </div>

                {matches.length > 0 && (
                  <div className="w-full mt-8 text-left border-t border-slate-800/80 pt-4">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block mb-2">
                      Ostatnie mecze drużyny:
                    </span>
                    <div className="space-y-2">
                      {matches.slice(0, 2).map((m) => (
                        <div
                          key={m.id}
                          onClick={() => handleResumeMatch(m)}
                          className="p-3 rounded-xl bg-slate-900 border border-slate-800 hover:border-slate-700 flex items-center justify-between cursor-pointer transition"
                        >
                          <div>
                            <div className="text-xs font-bold text-white">vs {m.opponent}</div>
                            <div className="text-[10px] text-slate-400 font-mono">
                              {m.date} • {m.ourScore} : {m.opponentScore}
                            </div>
                          </div>
                          <span className="text-xs font-bold text-amber-400 flex items-center gap-1">
                            <span>Wznów</span>
                            <ArrowRight className="w-3.5 h-3.5" />
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {/* VIEW 2: ROSTER MANAGEMENT */}
        {currentTab === 'roster' && (
          <div className="flex-1 p-3 sm:p-6 max-w-7xl mx-auto w-full">
            <RosterManagement
              players={players}
              clubProfile={clubProfile}
              onOpenClubProfile={!isReadOnlyViewer ? () => setIsClubProfileOpen(true) : undefined}
              onSavePlayer={handleSavePlayer}
              onSavePlayersBulk={handleSavePlayersBulk}
              onDeletePlayer={handleDeletePlayer}
              matches={matches}
              readOnly={isReadOnlyViewer}
              onOpenTeamExport={!isReadOnlyViewer ? () => handleOpenTeamExportImport('export') : undefined}
              onOpenTeamImport={() => handleOpenTeamExportImport('import')}
            />
          </div>
        )}

        {/* VIEW 3: MATCH HISTORY & REPORTS */}
        {currentTab === 'history' && (
          <div className="flex-1 p-3 sm:p-6 max-w-7xl mx-auto w-full">
            <MatchHistory
              matches={matches}
              players={players}
              clubProfile={clubProfile}
              onResumeMatch={!isReadOnlyViewer ? handleResumeMatch : undefined}
              onDeleteMatch={!isReadOnlyViewer ? handleDeleteMatch : undefined}
              readOnly={isReadOnlyViewer}
              onGoToLive={() => navigateToTab('live')}
              onGoToRoster={() => navigateToTab('roster')}
              onOpenTransferModal={() => setIsTransferModalOpen(true)}
              onOpenTeamExport={!isReadOnlyViewer ? () => handleOpenTeamExportImport('export') : undefined}
            />
          </div>
        )}

        {/* VIEW 4: PARENT MODE (STATYSTYKI WŁASNEGO DZIECKA) */}
        {currentTab === 'parent' && (
          <div className="flex-1 p-3 sm:p-6 max-w-7xl mx-auto w-full">
            <ParentView
              onBackToHome={() => navigateToTab('home')}
              soundEnabled={settings.ttsEnabled}
            />
          </div>
        )}
      </main>

      {/* Offline Connectivity Banner */}
      <OfflineIndicator />

      {/* Safety Confirmation Modal: Finish Match (Coach Mode Only) */}
      {!isReadOnlyViewer && activeMatch && (
        <FinishMatchModal
          isOpen={isFinishModalOpen}
          match={activeMatch}
          rosterPlayers={activeRosterPlayers}
          onConfirmFinish={handleConfirmFinishMatch}
          onCancel={() => setIsFinishModalOpen(false)}
        />
      )}

      {/* New Match Modal (Coach Mode Only) */}
      {!isReadOnlyViewer && (
        <NewMatchModal
          isOpen={isNewMatchOpen}
          onClose={() => setIsNewMatchOpen(false)}
          players={players}
          clubProfile={clubProfile}
          onStartMatch={handleStartNewMatch}
        />
      )}

      {/* Settings Modal (Coach Mode Only) */}
      {!isReadOnlyViewer && (
        <SettingsModal
          isOpen={isSettingsOpen}
          onClose={() => setIsSettingsOpen(false)}
          settings={settings}
          onSaveSettings={handleSaveSettings}
          onOpenTransferModal={() => setIsTransferModalOpen(true)}
          onOpenLiveCustomizer={() => setIsLiveCustomizerOpen(true)}
        />
      )}

      {/* Club Profile & Customization Modal */}
      {!isReadOnlyViewer && (
        <ClubProfileModal
          isOpen={isClubProfileOpen}
          onClose={() => setIsClubProfileOpen(false)}
          clubProfile={clubProfile}
          onSaveClubProfile={handleSaveClubProfile}
          onApplyPreset={handleApplyClubPreset}
          onPlayersUpdated={handlePlayersUpdated}
          onOpenTeamExportModal={() => handleOpenTeamExportImport('export')}
        />
      )}

      {/* Google Play, Licenses & Copyright Modal */}
      <LegalLicensesModal
        isOpen={isLegalModalOpen}
        onClose={() => setIsLegalModalOpen(false)}
      />

      {/* Data Transfer & Cloud Sync Modal */}
      <DataTransferModal
        isOpen={isTransferModalOpen}
        onClose={() => setIsTransferModalOpen(false)}
        matches={matches}
        players={players}
        activeMatchId={activeMatch?.id || null}
        roomId={roomId}
        onDataImported={handleDataImported}
        onOpenTeamExportModal={() => handleOpenTeamExportImport('export')}
      />

      {/* Team Export / Import Modal */}
      <TeamExportImportModal
        isOpen={isTeamExportImportOpen}
        onClose={() => setIsTeamExportImportOpen(false)}
        clubProfile={clubProfile}
        players={players}
        matches={matches}
        onDataImported={handleDataImported}
        defaultTab={teamExportImportTab}
        readOnly={isReadOnlyViewer}
      />

      {/* Share Spectator & Coach Room Links Modal */}
      <ShareLinkModal
        isOpen={isShareModalOpen}
        onClose={() => {
          setIsShareModalOpen(false);
          setJustCreatedRoom(false);
        }}
        roomId={roomId}
        coachToken={coachToken}
        isCoach={!isReadOnlyViewer}
        coachPin={settings.coachPin}
        justCreated={justCreatedRoom}
        onSwitchToSpectatorMode={handleLockOrSwitchToSpectator}
        clubProfile={clubProfile}
      />

      {/* Coach PIN Unlock Modal (Room-Authenticated) */}
      <CoachPinModal
        isOpen={isCoachPinOpen}
        onClose={() => setIsCoachPinOpen(false)}
        teamName={clubProfile.name}
        onVerifyPin={async (pin) => {
          if (!roomId) {
            return { ok: false, error: 'Brak aktywnego pokoju.' };
          }
          const res = await authenticateRoomCoach(roomId, { pin });
          if (!res.authenticated || !res.coachToken) {
            return { ok: false, error: res.error || 'Nieprawidłowy kod PIN trenera dla tego pokoju.' };
          }
          const validToken = res.coachToken;
          sessionRoleRef.current = 'coach';
          setStoredCoachToken(roomId, validToken);
          setCoachToken(validToken);
          setIsReadOnlyViewer(false);
          setIsCoachPinOpen(false);
          updateUrlForRoom(roomId, true, 'coach', currentTabRef.current);

          saveRecentRoom({
            roomId,
            teamName: clubProfile.name || 'Drużyna Koszykarska',
            shortName: clubProfile.shortName || 'DRUŻYNA',
            city: clubProfile.city || '',
            badgeEmoji: clubProfile.badgeEmoji || '🏀',
            season: clubProfile.season || '2026/2027',
            role: 'coach',
            coachToken: validToken,
            lastVisited: Date.now(),
          });

          // Fetch room state with coach token to sync coachPin and latest data
          const { data: authedState } = await fetchRoomState(roomId, validToken);
          if (authedState?.coachPin) {
            const nextSettings = { ...settings, coachPin: authedState.coachPin };
            setSettings(nextSettings);
            saveSettings(nextSettings).catch(() => {});
          }
          return { ok: true };
        }}
      />

      {/* Virtual Live Match Customizer */}
      <VirtualLiveMatchCustomizer
        isOpen={isLiveCustomizerOpen}
        onClose={() => setIsLiveCustomizerOpen(false)}
      />
    </div>
  );
}

import React, { useState, useEffect } from 'react';
import { RoomPublicInfo, RoomSummary } from '../types/basketball';
import {
  authenticateRoomCoach,
  checkRoomExists,
  createRoomOnServer,
  extractRoomFromInput,
  setStoredCoachToken,
} from '../services/syncService';
import { getRecentRooms, removeRecentRoom, saveRecentRoom } from '../services/db';
import { playClickSound, triggerHaptic } from '../services/tts';
import {
  PlusCircle,
  Search,
  ShieldCheck,
  Eye,
  Lock,
  Users,
  Trophy,
  Flame,
  ArrowRight,
  Clock,
  Trash2,
  Heart,
  EyeOff,
  AlertCircle,
  Sparkles,
  KeyRound,
} from 'lucide-react';

interface RoomLobbyProps {
  onEnterRoom: (roomId: string, coachToken: string | null, justCreated?: boolean) => void;
  onOpenParentMode?: () => void;
  initialError?: string | null;
}

export const RoomLobby: React.FC<RoomLobbyProps> = ({
  onEnterRoom,
  onOpenParentMode,
  initialError = null,
}) => {
  // Create Room state
  const [teamName, setTeamName] = useState('');
  const [shortName, setShortName] = useState('');
  const [city, setCity] = useState('');
  const [coachPin, setCoachPin] = useState('1234');
  const [showCreatePin, setShowCreatePin] = useState(false);
  const [seedDemoPlayers, setSeedDemoPlayers] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Join Room state
  const [joinInput, setJoinInput] = useState('');
  const [isCheckingRoom, setIsCheckingRoom] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(initialError);
  const [foundRoom, setFoundRoom] = useState<RoomPublicInfo | null>(null);
  const [pastedCoachToken, setPastedCoachToken] = useState<string | null>(null);
  const [joinPin, setJoinPin] = useState('');
  const [showPinJoin, setShowPinJoin] = useState(false);
  const [isAuthenticatingPin, setIsAuthenticatingPin] = useState(false);

  // Recent Rooms
  const [recentRooms, setRecentRooms] = useState<RoomSummary[]>([]);

  useEffect(() => {
    setRecentRooms(getRecentRooms());
  }, []);

  useEffect(() => {
    if (initialError) {
      setJoinError(initialError);
    }
  }, [initialError]);

  const handleCreateRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError(null);

    if (!teamName.trim()) {
      setCreateError('Wpisz nazwę swojej drużyny (np. Orły Warszawa).');
      return;
    }
    if (coachPin.trim().length < 3) {
      setCreateError('Kod PIN trenera musi mieć co najmniej 3 znaki.');
      return;
    }

    playClickSound();
    triggerHaptic(35);
    setIsCreating(true);

    try {
      const result = await createRoomOnServer({
        teamName: teamName.trim(),
        shortName: shortName.trim() || undefined,
        city: city.trim() || undefined,
        coachPin: coachPin.trim(),
        seedDemoPlayers,
      });

      if (!result.success || !result.roomId || !result.coachToken) {
        setCreateError(result.error || 'Nie udało się utworzyć pokoju.');
        return;
      }

      setStoredCoachToken(result.roomId, result.coachToken);
      saveRecentRoom({
        roomId: result.roomId,
        teamName: result.state?.clubProfile?.name || teamName.trim(),
        shortName: result.state?.clubProfile?.shortName || shortName.trim() || 'TEAM',
        city: result.state?.clubProfile?.city || city.trim(),
        badgeEmoji: result.state?.clubProfile?.badgeEmoji || '🏀',
        season: result.state?.clubProfile?.season || '2026/2027',
        role: 'coach',
        coachToken: result.coachToken,
        lastVisited: Date.now(),
      });

      onEnterRoom(result.roomId, result.coachToken, true);
    } finally {
      setIsCreating(false);
    }
  };

  const handleLookupRoom = async (e?: React.FormEvent, overrideInput?: string) => {
    if (e) e.preventDefault();
    const raw = (overrideInput !== undefined ? overrideInput : joinInput).trim();
    setJoinError(null);
    setFoundRoom(null);
    setPastedCoachToken(null);

    const parsed = extractRoomFromInput(raw);
    if (!parsed.roomId) {
      setJoinError('Podaj prawidłowy kod pokoju lub wklej pełny link do drużyny.');
      return;
    }

    playClickSound();
    triggerHaptic(20);
    setIsCheckingRoom(true);

    try {
      const info = await checkRoomExists(parsed.roomId);
      if (!info) {
        setJoinError('Nie udało się połączyć z serwerem. Spróbuj ponownie.');
        return;
      }
      if (!info.exists) {
        setJoinError(`Nie znaleziono pokoju o kodzie "${parsed.roomId}". Sprawdź kod lub poproś trenera o nowy link.`);
        return;
      }

      setFoundRoom(info);

      if (parsed.coachToken) {
        const auth = await authenticateRoomCoach(info.roomId, { coachToken: parsed.coachToken });
        if (auth.authenticated && auth.coachToken) {
          setPastedCoachToken(auth.coachToken);
        }
      }
    } finally {
      setIsCheckingRoom(false);
    }
  };

  const handleEnterAsSpectator = () => {
    if (!foundRoom) return;
    playClickSound();
    triggerHaptic(25);
    saveRecentRoom({
      roomId: foundRoom.roomId,
      teamName: foundRoom.teamName,
      shortName: foundRoom.shortName,
      city: foundRoom.city,
      badgeEmoji: foundRoom.badgeEmoji,
      season: foundRoom.season,
      role: 'spectator',
      lastVisited: Date.now(),
    });
    onEnterRoom(foundRoom.roomId, null, false);
  };

  const handleEnterAsCoachWithToken = (token: string) => {
    if (!foundRoom) return;
    playClickSound();
    triggerHaptic(35);
    setStoredCoachToken(foundRoom.roomId, token);
    saveRecentRoom({
      roomId: foundRoom.roomId,
      teamName: foundRoom.teamName,
      shortName: foundRoom.shortName,
      city: foundRoom.city,
      badgeEmoji: foundRoom.badgeEmoji,
      season: foundRoom.season,
      role: 'coach',
      coachToken: token,
      lastVisited: Date.now(),
    });
    onEnterRoom(foundRoom.roomId, token, false);
  };

  const handleVerifyJoinPin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!foundRoom || !joinPin.trim()) return;
    setJoinError(null);
    setIsAuthenticatingPin(true);
    playClickSound();

    try {
      const auth = await authenticateRoomCoach(foundRoom.roomId, { pin: joinPin.trim() });
      if (!auth.authenticated || !auth.coachToken) {
        setJoinError(auth.error || 'Nieprawidłowy kod PIN trenera dla tego pokoju.');
        triggerHaptic(90);
        return;
      }
      handleEnterAsCoachWithToken(auth.coachToken);
    } finally {
      setIsAuthenticatingPin(false);
    }
  };

  const handleOpenRecent = (room: RoomSummary) => {
    playClickSound();
    triggerHaptic(25);
    onEnterRoom(room.roomId, room.role === 'coach' ? room.coachToken || null : null, false);
  };

  const handleDeleteRecent = (e: React.MouseEvent, roomId: string) => {
    e.stopPropagation();
    playClickSound();
    setRecentRooms(removeRecentRoom(roomId));
  };

  return (
    <div className="min-h-screen w-full bg-slate-950 text-slate-100 flex flex-col selection:bg-amber-500 selection:text-slate-950">
      {/* Top Minimal Header */}
      <header className="w-full border-b border-slate-800/80 bg-slate-900/70 backdrop-blur">
        <div className="max-w-5xl mx-auto px-4 py-3.5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center text-xl shadow-lg shadow-orange-950/50 border border-amber-300/40">
              🏀
            </div>
            <div>
              <h1 className="text-base sm:text-lg font-black tracking-tight text-white">
                BasketStats Pro
              </h1>
              <p className="text-[11px] text-amber-400 font-semibold">
                Pokoje Drużynowe • Statystyki & Mecz na Żywo
              </p>
            </div>
          </div>

          {onOpenParentMode && (
            <button
              type="button"
              onClick={() => {
                playClickSound();
                onOpenParentMode();
              }}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/40 text-rose-300 text-xs font-bold transition active:scale-95"
            >
              <Heart className="w-3.5 h-3.5 fill-current" />
              <span className="hidden sm:inline">Tryb Rodzica (1 dziecko)</span>
              <span className="sm:hidden">Rodzic</span>
            </button>
          )}
        </div>
      </header>

      <main className="flex-1 w-full max-w-5xl mx-auto px-4 py-6 sm:py-10 space-y-8">
        {/* Hero Intro */}
        <div className="text-center max-w-2xl mx-auto space-y-2.5">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-300 text-xs font-bold">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Niezależne pokoje dla wielu drużyn jednocześnie</span>
          </div>
          <h2 className="text-2xl sm:text-4xl font-black text-white tracking-tight">
            Wybierz lub utwórz pokój swojej drużyny
          </h2>
          <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">
            Każda drużyna otrzymuje osobny pokój z własnym składem, historią meczów i transmisją na żywo.
            Rodzice i kibice wchodzą przez <strong className="text-emerald-400">link podglądu</strong>, a trener/statystyk
            zarządza meczem przez <strong className="text-amber-400">link trenera lub kod PIN</strong>.
          </p>
        </div>

        {/* Two Main Columns: Create vs Join */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          {/* CARD 1: CREATE NEW TEAM ROOM */}
          <form
            onSubmit={handleCreateRoom}
            className="rounded-3xl bg-slate-900 border border-slate-800 p-5 sm:p-6 shadow-2xl space-y-4"
          >
            <div className="flex items-center gap-3 pb-3 border-b border-slate-800">
              <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 shrink-0">
                <PlusCircle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base sm:text-lg font-black text-white">
                  Utwórz pokój nowej drużyny
                </h3>
                <p className="text-xs text-slate-400">
                  Dla trenera lub statystyka prowadzącego swój zespół
                </p>
              </div>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-300 mb-1">
                  Nazwa drużyny *
                </label>
                <input
                  type="text"
                  required
                  value={teamName}
                  onChange={(e) => setTeamName(e.target.value)}
                  placeholder="np. Orły Warszawa, Basket Gdańsk, MKS Łódź"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 font-semibold"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-400 mb-1">
                    Skrót na tablicy (opcjonalnie)
                  </label>
                  <input
                    type="text"
                    maxLength={8}
                    value={shortName}
                    onChange={(e) => setShortName(e.target.value.toUpperCase())}
                    placeholder="np. ORŁY"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 font-mono font-bold uppercase"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-400 mb-1">
                    Miasto (opcjonalnie)
                  </label>
                  <input
                    type="text"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    placeholder="np. Warszawa"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-300 mb-1 flex items-center justify-between">
                  <span>Kod PIN Trenera (do edycji i logowania na innych urządzeniach) *</span>
                </label>
                <div className="relative">
                  <input
                    type={showCreatePin ? 'text' : 'password'}
                    required
                    minLength={3}
                    maxLength={16}
                    value={coachPin}
                    onChange={(e) => setCoachPin(e.target.value)}
                    placeholder="Minimum 3 znaki, np. 1234"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 pr-10 text-sm font-mono font-bold tracking-widest text-white focus:outline-none focus:border-amber-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowCreatePin(!showCreatePin)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                  >
                    {showCreatePin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <label className="flex items-center gap-2.5 p-3 rounded-xl bg-slate-950/70 border border-slate-800 cursor-pointer select-none hover:border-slate-700 transition">
                <input
                  type="checkbox"
                  checked={seedDemoPlayers}
                  onChange={(e) => setSeedDemoPlayers(e.target.checked)}
                  className="w-4 h-4 accent-amber-500 rounded"
                />
                <div>
                  <span className="font-bold text-slate-200 block">
                    Dodaj przykładowy skład (8 zawodników demo)
                  </span>
                  <span className="text-[11px] text-slate-400">
                    Zaznacz, jeśli chcesz od razu przetestować mecz bez wpisywania graczy.
                  </span>
                </div>
              </label>

              {createError && (
                <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs font-semibold flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{createError}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={isCreating}
                className="w-full py-3.5 px-5 rounded-2xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 disabled:opacity-50 text-slate-950 font-black text-sm shadow-xl shadow-orange-950/40 transition active:scale-95 flex items-center justify-center gap-2"
              >
                <PlusCircle className="w-4 h-4" />
                <span>{isCreating ? 'Tworzenie pokoju...' : 'Utwórz pokój drużyny'}</span>
              </button>
            </div>
          </form>

          {/* CARD 2: JOIN EXISTING ROOM */}
          <div className="rounded-3xl bg-slate-900 border border-slate-800 p-5 sm:p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3 pb-3 border-b border-slate-800">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 shrink-0">
                <Search className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base sm:text-lg font-black text-white">
                  Dołącz do istniejącego pokoju
                </h3>
                <p className="text-xs text-slate-400">
                  Dla rodziców, kibiców oraz trenera na drugim urządzeniu
                </p>
              </div>
            </div>

            <form onSubmit={(e) => handleLookupRoom(e)} className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-300 mb-1">
                  Kod pokoju lub wklejony link od trenera:
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={joinInput}
                    onChange={(e) => {
                      setJoinInput(e.target.value);
                      setJoinError(null);
                    }}
                    placeholder="np. orly-warszawa-a1b2c3 lub https://.../?room=..."
                    className="flex-1 bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 font-mono"
                  />
                  <button
                    type="submit"
                    disabled={isCheckingRoom || !joinInput.trim()}
                    className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold text-xs transition active:scale-95 shrink-0"
                  >
                    {isCheckingRoom ? 'Szukam...' : 'Znajdź'}
                  </button>
                </div>
              </div>
            </form>

            {joinError && (
              <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs font-semibold flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{joinError}</span>
              </div>
            )}

            {/* Found Room Preview Card */}
            {foundRoom && foundRoom.exists && (
              <div className="p-4 rounded-2xl bg-slate-950 border border-emerald-500/40 space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-11 h-11 rounded-xl bg-slate-900 border border-slate-700 flex items-center justify-center text-2xl shrink-0">
                      {foundRoom.badgeEmoji}
                    </div>
                    <div className="min-w-0">
                      <h4 className="font-black text-white text-sm sm:text-base truncate">
                        {foundRoom.teamName}
                      </h4>
                      <div className="text-[11px] text-slate-400 flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-amber-400 font-bold">{foundRoom.shortName}</span>
                        {foundRoom.city && <span>• {foundRoom.city}</span>}
                        <span>• Sezon {foundRoom.season}</span>
                      </div>
                    </div>
                  </div>
                  {foundRoom.hasLiveMatch && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/40 text-[10px] font-black shrink-0">
                      <Flame className="w-3 h-3 text-rose-400" />
                      <span>LIVE {foundRoom.liveScore}</span>
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-4 text-[11px] text-slate-400 font-mono">
                  <span className="flex items-center gap-1">
                    <Users className="w-3.5 h-3.5 text-sky-400" />
                    {foundRoom.playersCount} graczy
                  </span>
                  <span className="flex items-center gap-1">
                    <Trophy className="w-3.5 h-3.5 text-amber-400" />
                    {foundRoom.matchesCount} meczów
                  </span>
                </div>

                {pastedCoachToken ? (
                  <div className="space-y-2">
                    <button
                      type="button"
                      onClick={() => handleEnterAsCoachWithToken(pastedCoachToken)}
                      className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 font-black text-xs flex items-center justify-center gap-2 transition active:scale-95"
                    >
                      <ShieldCheck className="w-4 h-4" />
                      <span>Wejdź jako Trener / Statystyk (z linku)</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleEnterAsSpectator}
                      className="w-full py-2.5 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-700 font-bold text-xs flex items-center justify-center gap-2 transition"
                    >
                      <Eye className="w-4 h-4 text-emerald-400" />
                      <span>Wejdź tylko jako Rodzic / Kibic</span>
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    <button
                      type="button"
                      onClick={handleEnterAsSpectator}
                      className="w-full py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs flex items-center justify-center gap-2 transition active:scale-95 shadow-lg shadow-emerald-950/40"
                    >
                      <Eye className="w-4 h-4" />
                      <span>Wejdź jako Rodzic / Kibic (Podgląd Live)</span>
                    </button>

                    {!showPinJoin ? (
                      <button
                        type="button"
                        onClick={() => setShowPinJoin(true)}
                        className="w-full py-2 px-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-amber-300 border border-amber-500/30 font-bold text-xs flex items-center justify-center gap-1.5 transition"
                      >
                        <Lock className="w-3.5 h-3.5" />
                        <span>Jesteś trenerem? Odblokuj kodem PIN</span>
                      </button>
                    ) : (
                      <form onSubmit={handleVerifyJoinPin} className="flex gap-2 pt-1">
                        <input
                          type="password"
                          autoFocus
                          value={joinPin}
                          onChange={(e) => setJoinPin(e.target.value)}
                          placeholder="Kod PIN trenera"
                          className="flex-1 bg-slate-900 border border-amber-500/40 rounded-xl px-3 py-2 text-xs font-mono tracking-widest text-white focus:outline-none focus:border-amber-400"
                        />
                        <button
                          type="submit"
                          disabled={isAuthenticatingPin || !joinPin.trim()}
                          className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 font-black text-xs flex items-center gap-1 transition shrink-0"
                        >
                          <KeyRound className="w-3.5 h-3.5" />
                          <span>{isAuthenticatingPin ? '...' : 'Odblokuj'}</span>
                        </button>
                      </form>
                    )}
                  </div>
                )}
              </div>
            )}

            {!foundRoom && !joinError && (
              <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800 text-xs text-slate-400 space-y-2 leading-relaxed">
                <div className="font-bold text-slate-200">Jak dołączyć?</div>
                <ul className="list-disc pl-4 space-y-1 text-[11px]">
                  <li>
                    <strong className="text-emerald-400">Rodzice i kibice:</strong> wystarczy kliknąć link z sufiksem pokoju otrzymany od trenera lub wpisać kod pokoju powyżej.
                  </li>
                  <li>
                    <strong className="text-amber-400">Trener / Statystyk:</strong> otwórz swój specjalny link trenerski lub wpisz kod pokoju i podaj kod PIN trenera.
                  </li>
                </ul>
              </div>
            )}
          </div>
        </div>

        {/* RECENT ROOMS */}
        {recentRooms.length > 0 && (
          <div className="rounded-3xl bg-slate-900 border border-slate-800 p-5 shadow-xl space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-amber-400" />
                <h3 className="text-sm font-black text-white uppercase tracking-wider">
                  Ostatnio odwiedzane pokoje
                </h3>
              </div>
              <span className="text-[11px] text-slate-500 font-mono">
                {recentRooms.length} zapisanych
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {recentRooms.map((room) => (
                <div
                  key={room.roomId}
                  onClick={() => handleOpenRecent(room)}
                  className="p-3.5 rounded-2xl bg-slate-950/80 border border-slate-800 hover:border-amber-500/50 cursor-pointer transition flex items-center justify-between gap-2.5 group"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-center text-xl shrink-0">
                      {room.badgeEmoji || '🏀'}
                    </div>
                    <div className="min-w-0">
                      <div className="font-bold text-white text-xs sm:text-sm truncate group-hover:text-amber-400 transition">
                        {room.teamName}
                      </div>
                      <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                        <span
                          className={`text-[9px] font-black px-1.5 py-0.5 rounded uppercase ${
                            room.role === 'coach'
                              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                              : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                          }`}
                        >
                          {room.role === 'coach' ? 'Trener' : 'Rodzic / Kibic'}
                        </span>
                        <span className="text-[10px] text-slate-500 font-mono truncate max-w-[110px]">
                          {room.roomId}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={(e) => handleDeleteRecent(e, room.roomId)}
                      className="p-1.5 rounded-lg text-slate-600 hover:text-rose-400 hover:bg-rose-500/10 transition"
                      title="Usuń z listy ostatnich"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                    <ArrowRight className="w-4 h-4 text-slate-600 group-hover:text-amber-400 transition" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

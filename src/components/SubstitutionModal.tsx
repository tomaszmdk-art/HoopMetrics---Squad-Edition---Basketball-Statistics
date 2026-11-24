import React, { useState } from 'react';
import { Player, Match } from '../types/basketball';
import { calculatePlayerStats, formatSecondsToMMSS } from '../services/statsCalculator';
import {
  Users,
  ArrowLeftRight,
  Check,
  CheckCircle2,
  X,
  Sparkles,
  RefreshCw,
  SlidersHorizontal,
  RotateCcw,
  UserMinus,
  UserPlus,
} from 'lucide-react';
import { playClickSound, triggerHaptic } from '../services/tts';
import { createSubstitutionEvent } from '../services/playerDisplay';
import { applyMatchLineupChange } from '../services/playingTime';

const formatNumAndName = (p: Player): string => {
  const n = p.lastName?.trim() || p.firstName?.trim();
  return n ? `#${p.number} ${n}` : `#${p.number}`;
};

const getCardPrimaryName = (p: Player): string =>
  p.lastName?.trim() || p.firstName?.trim() || 'Zawodnik';

const getCardSecondaryName = (p: Player): string =>
  p.lastName?.trim() ? (p.firstName?.trim() || '') : (p.position || '');

export interface SubRecord {
  id: string;
  eventId?: string;
  outPlayer: Player;
  inPlayer: Player;
  time: string;
}

interface SubstitutionModalProps {
  isOpen: boolean;
  onClose: () => void;
  match: Match;
  rosterPlayers: Player[];
  selectedPlayerId: string | null;
  onSelectPlayer: (playerId: string | null) => void;
  onUpdateMatch: (updatedOrUpdater: Match | ((prevMatch: Match) => Match)) => void;
}

export const SubstitutionModal: React.FC<SubstitutionModalProps> = ({
  isOpen,
  onClose,
  match,
  rosterPlayers,
  selectedPlayerId,
  onSelectPlayer,
  onUpdateMatch,
}) => {
  const [subCourtPlayerId, setSubCourtPlayerId] = useState<string | null>(null);
  const [subBenchPlayerId, setSubBenchPlayerId] = useState<string | null>(null);
  const [subMode, setSubMode] = useState<'rotation' | 'lineup'>('rotation');
  const [lastSwapMessage, setLastSwapMessage] = useState<string | null>(null);
  const [subHistory, setSubHistory] = useState<SubRecord[]>([]);

  if (!isOpen) return null;

  const onCourtPlayers = rosterPlayers.filter((p) =>
    match.onCourtPlayerIds.includes(p.id)
  );
  const benchPlayers = rosterPlayers.filter(
    (p) => !match.onCourtPlayerIds.includes(p.id)
  );

  const activeCourtTarget = rosterPlayers.find((p) => p.id === subCourtPlayerId);
  const activeBenchTarget = rosterPlayers.find((p) => p.id === subBenchPlayerId);

  const handleExecuteSwap = (courtPlayerId: string, benchPlayerId: string) => {
    playClickSound();
    triggerHaptic(35);

    const courtPlayer = rosterPlayers.find((p) => p.id === courtPlayerId);
    const benchPlayer = rosterPlayers.find((p) => p.id === benchPlayerId);
    const eventId = `evt-sub-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

    onUpdateMatch((prev) => {
      const newOnCourt = prev.onCourtPlayerIds.map((id) =>
        id === courtPlayerId ? benchPlayerId : id
      );
      const subEvent = createSubstitutionEvent(prev, {
        type: 'SUBSTITUTION',
        inPlayer: benchPlayer,
        outPlayer: courtPlayer,
        nextOnCourt: newOnCourt,
        eventId,
      });
      return {
        ...applyMatchLineupChange(prev, newOnCourt),
        events: [...prev.events, subEvent],
        updatedAt: Date.now(),
      };
    });

    if (courtPlayer && benchPlayer) {
      const nowStr = new Date().toLocaleTimeString('pl-PL', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
      setLastSwapMessage(
        `Wymieniono: ${formatNumAndName(courtPlayer)} ➔ ${formatNumAndName(benchPlayer)}`
      );
      setSubHistory((prev) => [
        {
          id: `${Date.now()}-${Math.random()}`,
          eventId,
          outPlayer: courtPlayer,
          inPlayer: benchPlayer,
          time: nowStr,
        },
        ...prev,
      ]);
    }

    if (selectedPlayerId === courtPlayerId) {
      onSelectPlayer(benchPlayerId);
    }

    setSubCourtPlayerId(null);
    setSubBenchPlayerId(null);
  };

  const handleCourtPlayerClick = (playerId: string) => {
    playClickSound();
    triggerHaptic(20);

    if (subBenchPlayerId) {
      handleExecuteSwap(playerId, subBenchPlayerId);
      return;
    }

    if (subCourtPlayerId === playerId) {
      setSubCourtPlayerId(null);
    } else {
      setSubCourtPlayerId(playerId);
    }
  };

  const handleBenchPlayerClick = (playerId: string) => {
    playClickSound();
    triggerHaptic(20);

    if (subCourtPlayerId) {
      handleExecuteSwap(subCourtPlayerId, playerId);
      return;
    }

    // Gdy na parkiecie jest mniej niż 5 zawodników (np. po kliknięciu "Schodzi cała piątka"),
    // kliknięcie gracza z ławki od razu wprowadza go na boisko.
    if (match.onCourtPlayerIds.length < 5) {
      const targetPlayer = rosterPlayers.find((p) => p.id === playerId);
      onUpdateMatch((prev) => {
        if (prev.onCourtPlayerIds.includes(playerId) || prev.onCourtPlayerIds.length >= 5) {
          return prev;
        }
        const nextOnCourt = [...prev.onCourtPlayerIds, playerId];
        const subEvent = createSubstitutionEvent(prev, {
          type: 'SUB_IN',
          inPlayer: targetPlayer,
          nextOnCourt,
        });
        return {
          ...applyMatchLineupChange(prev, nextOnCourt),
          events: [...prev.events, subEvent],
          updatedAt: Date.now(),
        };
      });
      if (!selectedPlayerId) {
        onSelectPlayer(playerId);
      }
      if (targetPlayer) {
        setLastSwapMessage(`Wszedł na parkiet: ${formatNumAndName(targetPlayer)}`);
      }
      setSubBenchPlayerId(null);
      return;
    }

    if (subBenchPlayerId === playerId) {
      setSubBenchPlayerId(null);
    } else {
      setSubBenchPlayerId(playerId);
    }
  };

  const handleClearCourt = () => {
    if (match.onCourtPlayerIds.length === 0) return;
    playClickSound();
    triggerHaptic(45);

    onUpdateMatch((prev) => {
      const subEvents = prev.onCourtPlayerIds.map((id) =>
        createSubstitutionEvent(prev, {
          type: 'SUB_OUT',
          outPlayer: rosterPlayers.find((p) => p.id === id),
          nextOnCourt: [],
        })
      );
      return {
        ...applyMatchLineupChange(prev, []),
        events: [...prev.events, ...subEvents],
        updatedAt: Date.now(),
      };
    });

    onSelectPlayer(null);
    setSubCourtPlayerId(null);
    setSubBenchPlayerId(null);
    setLastSwapMessage('Zeszła cała piątka (0/5). Wybierz nowy skład z ławki rezerwowych.');
  };

  const handleRemoveSingleFromCourt = (playerId: string) => {
    playClickSound();
    triggerHaptic(20);
    const targetPlayer = rosterPlayers.find((p) => p.id === playerId);

    onUpdateMatch((prev) => {
      if (!prev.onCourtPlayerIds.includes(playerId)) return prev;
      const nextOnCourt = prev.onCourtPlayerIds.filter((id) => id !== playerId);
      const subEvent = createSubstitutionEvent(prev, {
        type: 'SUB_OUT',
        outPlayer: targetPlayer,
        nextOnCourt,
      });
      return {
        ...applyMatchLineupChange(prev, nextOnCourt),
        events: [...prev.events, subEvent],
        updatedAt: Date.now(),
      };
    });

    if (selectedPlayerId === playerId) {
      onSelectPlayer(null);
    }
    if (subCourtPlayerId === playerId) {
      setSubCourtPlayerId(null);
    }
  };

  const handleSwapEntireFive = () => {
    if (benchPlayers.length < 5) return;
    playClickSound();
    triggerHaptic(50);

    const newFiveIds = benchPlayers.slice(0, 5).map((p) => p.id);
    onUpdateMatch((prev) => {
      const leavingIds = prev.onCourtPlayerIds.filter((id) => !newFiveIds.includes(id));
      const enteringIds = newFiveIds.filter((id) => !prev.onCourtPlayerIds.includes(id));
      const pairCount = Math.min(leavingIds.length, enteringIds.length);
      const subEvents = [];

      for (let i = 0; i < pairCount; i++) {
        subEvents.push(
          createSubstitutionEvent(prev, {
            type: 'SUBSTITUTION',
            outPlayer: rosterPlayers.find((p) => p.id === leavingIds[i]),
            inPlayer: rosterPlayers.find((p) => p.id === enteringIds[i]),
            nextOnCourt: newFiveIds,
          })
        );
      }
      for (let i = pairCount; i < leavingIds.length; i++) {
        subEvents.push(
          createSubstitutionEvent(prev, {
            type: 'SUB_OUT',
            outPlayer: rosterPlayers.find((p) => p.id === leavingIds[i]),
            nextOnCourt: newFiveIds,
          })
        );
      }
      for (let i = pairCount; i < enteringIds.length; i++) {
        subEvents.push(
          createSubstitutionEvent(prev, {
            type: 'SUB_IN',
            inPlayer: rosterPlayers.find((p) => p.id === enteringIds[i]),
            nextOnCourt: newFiveIds,
          })
        );
      }

      return {
        ...applyMatchLineupChange(prev, newFiveIds),
        events: [...prev.events, ...subEvents],
        updatedAt: Date.now(),
      };
    });

    if (newFiveIds.length > 0) {
      onSelectPlayer(newFiveIds[0]);
    }
    setLastSwapMessage('Wprowadzono drugą piątkę zawodników!');
  };

  const handleToggleLineupPlayer = (playerId: string) => {
    playClickSound();
    triggerHaptic(20);
    const targetPlayer = rosterPlayers.find((p) => p.id === playerId);

    onUpdateMatch((prev) => {
      const current = prev.onCourtPlayerIds;
      if (current.includes(playerId)) {
        const nextOnCourt = current.filter((id) => id !== playerId);
        const subEvent = createSubstitutionEvent(prev, {
          type: 'SUB_OUT',
          outPlayer: targetPlayer,
          nextOnCourt,
        });
        return {
          ...applyMatchLineupChange(prev, nextOnCourt),
          events: [...prev.events, subEvent],
          updatedAt: Date.now(),
        };
      } else {
        if (current.length >= 5) return prev;
        const nextOnCourt = [...current, playerId];
        const subEvent = createSubstitutionEvent(prev, {
          type: 'SUB_IN',
          inPlayer: targetPlayer,
          nextOnCourt,
        });
        return {
          ...applyMatchLineupChange(prev, nextOnCourt),
          events: [...prev.events, subEvent],
          updatedAt: Date.now(),
        };
      }
    });
  };

  const handleUndoSwap = (record: SubRecord) => {
    playClickSound();
    triggerHaptic(30);

    onUpdateMatch((prev) => {
      const newOnCourt = prev.onCourtPlayerIds.map((id) =>
        id === record.inPlayer.id ? record.outPlayer.id : id
      );
      return {
        ...applyMatchLineupChange(prev, newOnCourt),
        events: record.eventId
          ? prev.events.filter((e) => e.id !== record.eventId)
          : prev.events,
        updatedAt: Date.now(),
      };
    });

    setSubHistory((prev) => prev.filter((r) => r.id !== record.id));
    setLastSwapMessage(
      `Cofnięto zmianę: #${record.outPlayer.number} wrócił na parkiet za #${record.inPlayer.number}`
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-950/90 overflow-y-auto select-none">
      <div className="w-full max-w-2xl max-h-[92vh] flex flex-col rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl text-slate-100 overflow-hidden my-auto">
        {/* Modal Header */}
        <div className="flex items-center justify-between p-3.5 sm:p-4 border-b border-slate-800 bg-slate-950">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-orange-500/20 border border-orange-500/40 text-orange-400">
              <ArrowLeftRight className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base sm:text-lg font-black text-white">
                  Zarządzanie zmianami zawodników
                </h3>
                {subHistory.length > 0 && (
                  <span className="px-2 py-0.5 rounded-full text-[11px] font-black bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 font-mono">
                    Zmian: {subHistory.length}
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-400">
                Wymieniaj zawodników bez ograniczeń — okno pozostaje otwarte.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-md shadow-emerald-950/40 active:scale-95 transition"
          >
            <Check className="w-4 h-4" />
            <span>Zakończ zmiany</span>
          </button>
        </div>

        {/* Mode Switcher Tabs */}
        <div className="flex items-center justify-between gap-2 flex-wrap px-3.5 sm:px-4 pt-3 pb-2 border-b border-slate-800/80 bg-slate-900">
          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              onClick={() => {
                playClickSound();
                setSubMode('rotation');
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                subMode === 'rotation'
                  ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-950/40'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              <ArrowLeftRight className="w-3.5 h-3.5" />
              <span>Szybka rotacja (1 na 1)</span>
            </button>

            <button
              onClick={() => {
                playClickSound();
                setSubMode('lineup');
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                subMode === 'lineup'
                  ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-950/40'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              <span>Zaznacz całą piątkę ({match.onCourtPlayerIds.length}/5)</span>
            </button>

            <button
              type="button"
              disabled={onCourtPlayers.length === 0}
              onClick={handleClearCourt}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-black border transition ${
                onCourtPlayers.length > 0
                  ? 'bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border-rose-500/40 active:scale-95'
                  : 'bg-slate-800/50 text-slate-600 border-slate-800 cursor-not-allowed'
              }`}
              title="Wszyscy zawodnicy schodzą z parkietu — wybierz całą nową piątkę z ławki"
            >
              <UserMinus className="w-3.5 h-3.5" />
              <span>Schodzi cała piątka</span>
            </button>
          </div>

          {benchPlayers.length >= 5 && subMode === 'rotation' && (
            <button
              onClick={handleSwapEntireFive}
              className="hidden sm:flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-300 border border-amber-500/30 text-xs font-semibold transition active:scale-95"
              title="Wymień na raz całą piątkę na rezerwowych"
            >
              <RefreshCw className="w-3.5 h-3.5 text-amber-400" />
              <span>Druga piątka (5 za 5)</span>
            </button>
          )}
        </div>

        {/* Notification / Last Swap Toast */}
        {lastSwapMessage && (
          <div className="mx-3.5 sm:mx-4 mt-3 p-2.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs font-bold flex items-center justify-between gap-2 animate-in fade-in">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>{lastSwapMessage}</span>
            </div>
          </div>
        )}

        {/* Scrollable Content Arena */}
        <div className="flex-1 overflow-y-auto p-3.5 sm:p-5 space-y-4">
          {subMode === 'rotation' ? (
            <div className="space-y-4">
              {/* Helper / Status */}
              <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-300 flex items-center justify-between gap-2">
                <span>
                  {onCourtPlayers.length === 0 ? (
                    <>
                      Na parkiecie nikogo nie ma (<strong className="text-amber-400 font-mono">0/5</strong>) — wybierz z ławki rezerwowych 5 nowych zawodników.
                    </>
                  ) : onCourtPlayers.length < 5 ? (
                    <>
                      Na parkiecie <strong className="text-amber-400 font-mono">{onCourtPlayers.length}/5</strong> — kliknij kolejnych{' '}
                      <strong className="text-emerald-400">{5 - onCourtPlayers.length}</strong> z ławki rezerwowych.
                    </>
                  ) : subCourtPlayerId && activeCourtTarget ? (
                    <>
                      Schodzi: <strong className="text-rose-400 font-mono">{formatNumAndName(activeCourtTarget)}</strong> — wybierz zmiennika z ławki.
                    </>
                  ) : subBenchPlayerId && activeBenchTarget ? (
                    <>
                      Wchodzi: <strong className="text-emerald-400 font-mono">{formatNumAndName(activeBenchTarget)}</strong> — kliknij kogo zastępuje.
                    </>
                  ) : (
                    'Kliknij gracza na parkiecie i z ławki (1 na 1) lub użyj „Schodzi cała piątka”.'
                  )}
                </span>
              </div>

              {/* Parkiet (On-court) */}
              <div>
                <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
                  <span className="text-xs font-black uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                    <UserMinus className="w-3.5 h-3.5 text-rose-400" />
                    <span>1. Zawodnicy na parkiecie ({onCourtPlayers.length}/5):</span>
                  </span>
                </div>

                {onCourtPlayers.length === 0 ? (
                  <div className="p-4 rounded-xl bg-slate-950 border border-dashed border-amber-500/40 text-center text-xs text-amber-300/90 font-semibold">
                    Na parkiecie nikt nie zostaje (0/5). Wybierz poniżej cały nowy skład z ławki rezerwowych.
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                    {onCourtPlayers.map((player) => {
                      const isTarget = subCourtPlayerId === player.id;
                      const stats = calculatePlayerStats(player, match.events, match);

                      return (
                        <div key={player.id} className="relative">
                          <button
                            type="button"
                            onClick={() => handleCourtPlayerClick(player.id)}
                            className={`w-full h-full p-2.5 rounded-xl text-left border transition active:scale-95 flex flex-col justify-between ${
                              isTarget
                                ? 'bg-rose-500/25 border-rose-500 ring-2 ring-rose-400'
                                : 'bg-slate-800 hover:bg-slate-750 border-slate-700 text-slate-200'
                            }`}
                          >
                            <div className="flex items-center justify-between pr-6">
                              <span className="font-mono font-black text-amber-400 text-lg">
                                #{player.number}
                              </span>
                              <span className="text-[10px] font-mono text-slate-400">
                                <span className="text-sky-300">{formatSecondsToMMSS(stats.secondsPlayed)}</span> • {stats.pts}p | {stats.fouls}F
                              </span>
                            </div>
                            <div className="font-bold text-xs text-white truncate mt-1">
                              {getCardPrimaryName(player)}
                            </div>
                            {getCardSecondaryName(player) && (
                              <div className="text-[10px] text-slate-400 truncate">
                                {getCardSecondaryName(player)}
                              </div>
                            )}
                            {isTarget && (
                              <span className="mt-1.5 text-[9px] font-bold text-rose-300 uppercase block">
                                Wybrano do zejścia
                              </span>
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRemoveSingleFromCourt(player.id)}
                            className="absolute top-1.5 right-1.5 w-5 h-5 rounded-md bg-slate-900/90 hover:bg-rose-600 text-slate-300 hover:text-white border border-slate-700 flex items-center justify-center transition"
                            title="Zdejmij z parkietu"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Ławka (Bench) */}
              <div>
                <span className="text-xs font-black uppercase tracking-wider text-emerald-400 mb-2 flex items-center gap-1.5">
                  <UserPlus className="w-3.5 h-3.5 text-emerald-400" />
                  <span>2. Ławka rezerwowych ({benchPlayers.length}):</span>
                </span>
                {benchPlayers.length === 0 ? (
                  <p className="text-xs text-slate-500 italic p-3 rounded-xl bg-slate-950">
                    Brak rezerwowych zawodników w kadrze meczu.
                  </p>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                    {benchPlayers.map((player) => {
                      const isTarget = subBenchPlayerId === player.id;
                      const stats = calculatePlayerStats(player, match.events, match);

                      return (
                        <button
                          key={player.id}
                          onClick={() => handleBenchPlayerClick(player.id)}
                          className={`p-2.5 rounded-xl text-left border transition active:scale-95 relative flex flex-col justify-between ${
                            isTarget
                              ? 'bg-emerald-500/25 border-emerald-500 ring-2 ring-emerald-400'
                              : onCourtPlayers.length < 5
                              ? 'bg-slate-950 hover:bg-emerald-950/30 border-emerald-500/50 text-slate-200'
                              : 'bg-slate-950 hover:bg-slate-800 border-slate-800 text-slate-300'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-mono font-bold text-emerald-400 text-base">
                              #{player.number}
                            </span>
                            <span className="text-[10px] font-mono text-slate-400">
                              <span className="text-sky-300">{formatSecondsToMMSS(stats.secondsPlayed)}</span> • {stats.pts}p | {stats.fouls}F
                            </span>
                          </div>
                          <div className="font-bold text-xs text-slate-200 truncate mt-1">
                            {getCardPrimaryName(player)}
                          </div>
                          {getCardSecondaryName(player) && (
                            <div className="text-[10px] text-slate-400 truncate">
                              {getCardSecondaryName(player)}
                            </div>
                          )}
                          {onCourtPlayers.length < 5 && !subCourtPlayerId ? (
                            <span className="mt-1.5 text-[9px] font-bold text-emerald-400 uppercase block">
                              + Wchodzi na parkiet
                            </span>
                          ) : isTarget ? (
                            <span className="mt-1.5 text-[9px] font-bold text-emerald-300 uppercase block">
                              Wybrano do wejścia
                            </span>
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Sub History & Undo */}
              {subHistory.length > 0 && (
                <div className="pt-3 border-t border-slate-800">
                  <span className="text-xs font-bold text-slate-400 mb-2 block">
                    Ostatnie wykonane zmiany w tej sesji:
                  </span>
                  <div className="space-y-1.5 max-h-36 overflow-y-auto">
                    {subHistory.map((rec) => (
                      <div
                        key={rec.id}
                        className="flex items-center justify-between p-2 rounded-xl bg-slate-950 border border-slate-800 text-xs"
                      >
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-slate-500 text-[10px]">{rec.time}</span>
                          <span className="text-rose-400 font-mono font-bold">
                            {formatNumAndName(rec.outPlayer)}
                          </span>
                          <ArrowLeftRight className="w-3 h-3 text-slate-600" />
                          <span className="text-emerald-400 font-mono font-bold">
                            {formatNumAndName(rec.inPlayer)}
                          </span>
                        </div>
                        <button
                          onClick={() => handleUndoSwap(rec)}
                          className="flex items-center gap-1 text-[11px] text-amber-400 hover:text-amber-300 px-2 py-0.5 rounded bg-slate-900 border border-amber-500/30"
                        >
                          <RotateCcw className="w-3 h-3" />
                          <span>Cofnij</span>
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* LINEUP PICKER MODE */
            <div className="space-y-3">
              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-300 flex items-center justify-between gap-2">
                <span>
                  Wybierz dokładnie 5 zawodników, którzy mają grać na parkiecie:{' '}
                  <strong className="text-amber-400 font-mono text-sm">
                    {match.onCourtPlayerIds.length}/5
                  </strong>
                </span>
                {match.onCourtPlayerIds.length > 0 && (
                  <button
                    type="button"
                    onClick={handleClearCourt}
                    className="text-[11px] text-rose-400 hover:text-rose-300 underline font-semibold shrink-0"
                  >
                    Schodzi cała piątka
                  </button>
                )}
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {rosterPlayers.map((player) => {
                  const isOnCourt = match.onCourtPlayerIds.includes(player.id);
                  const stats = calculatePlayerStats(player, match.events, match);

                  return (
                    <button
                      key={player.id}
                      onClick={() => handleToggleLineupPlayer(player.id)}
                      className={`p-3 rounded-xl text-left border transition flex items-center justify-between ${
                        isOnCourt
                          ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-md font-bold'
                          : 'bg-slate-950 text-slate-400 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="font-mono font-black text-base">#{player.number}</div>
                        <div className="truncate text-xs">{getCardPrimaryName(player)}</div>
                      </div>
                      <div className="text-right font-mono text-[11px]">
                        <div className={isOnCourt ? 'text-slate-900 font-bold' : 'text-sky-300'}>
                          {formatSecondsToMMSS(stats.secondsPlayed)}
                        </div>
                        <div>{stats.pts} pkt | {stats.fouls}F</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-3 sm:p-4 border-t border-slate-800 bg-slate-950 flex items-center justify-between">
          <div className="text-xs text-slate-400">
            Na parkiecie:{' '}
            <strong className="text-white font-mono">{match.onCourtPlayerIds.length}/5</strong>
          </div>
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs shadow-md transition active:scale-95"
          >
            Zatwierdź i wróć do meczu
          </button>
        </div>
      </div>
    </div>
  );
};

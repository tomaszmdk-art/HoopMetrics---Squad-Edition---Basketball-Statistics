import React, { useState } from 'react';
import { Player, Match } from '../types/basketball';
import { calculatePlayerStats } from '../services/statsCalculator';
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
} from 'lucide-react';
import { playClickSound, triggerHaptic } from '../services/tts';

export interface SubRecord {
  id: string;
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

    onUpdateMatch((prev) => {
      const newOnCourt = prev.onCourtPlayerIds.map((id) =>
        id === courtPlayerId ? benchPlayerId : id
      );
      return {
        ...prev,
        onCourtPlayerIds: newOnCourt,
      };
    });

    if (courtPlayer && benchPlayer) {
      const nowStr = new Date().toLocaleTimeString('pl-PL', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
      setLastSwapMessage(
        `Wymieniono: #${courtPlayer.number} ${courtPlayer.lastName} ➔ #${benchPlayer.number} ${benchPlayer.lastName}`
      );
      setSubHistory((prev) => [
        {
          id: `${Date.now()}-${Math.random()}`,
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

    if (subBenchPlayerId === playerId) {
      setSubBenchPlayerId(null);
    } else {
      setSubBenchPlayerId(playerId);
    }
  };

  const handleSwapEntireFive = () => {
    if (benchPlayers.length < 5) return;
    playClickSound();
    triggerHaptic(50);

    const newFiveIds = benchPlayers.slice(0, 5).map((p) => p.id);
    onUpdateMatch((prev) => ({
      ...prev,
      onCourtPlayerIds: newFiveIds,
    }));

    if (newFiveIds.length > 0) {
      onSelectPlayer(newFiveIds[0]);
    }
    setLastSwapMessage('Wprowadzono drugą piątkę zawodników!');
  };

  const handleToggleLineupPlayer = (playerId: string) => {
    playClickSound();
    triggerHaptic(20);

    onUpdateMatch((prev) => {
      const current = prev.onCourtPlayerIds;
      if (current.includes(playerId)) {
        if (current.length <= 1) return prev;
        return {
          ...prev,
          onCourtPlayerIds: current.filter((id) => id !== playerId),
        };
      } else {
        if (current.length >= 5) return prev;
        return {
          ...prev,
          onCourtPlayerIds: [...current, playerId],
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
        ...prev,
        onCourtPlayerIds: newOnCourt,
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
        <div className="flex items-center justify-between gap-2 px-3.5 sm:px-4 pt-3 pb-2 border-b border-slate-800/80 bg-slate-900">
          <div className="flex items-center gap-1.5">
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
              {/* Parkiet (On-court) */}
              <div>
                <span className="text-xs font-black uppercase tracking-wider text-amber-400 mb-2 block">
                  1. Zawodnicy na parkiecie ({onCourtPlayers.length}/5):
                </span>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                  {onCourtPlayers.map((player) => {
                    const isTarget = subCourtPlayerId === player.id;
                    const stats = calculatePlayerStats(player, match.events, match);

                    return (
                      <button
                        key={player.id}
                        onClick={() => handleCourtPlayerClick(player.id)}
                        className={`p-2.5 rounded-xl text-left border transition active:scale-95 relative flex flex-col justify-between ${
                          isTarget
                            ? 'bg-rose-500/25 border-rose-500 ring-2 ring-rose-400'
                            : 'bg-slate-800 hover:bg-slate-750 border-slate-700 text-slate-200'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-mono font-black text-amber-400 text-lg">
                            #{player.number}
                          </span>
                          <span className="text-[10px] font-mono text-slate-400">
                            {stats.pts}p | {stats.fouls}F
                          </span>
                        </div>
                        <div className="font-bold text-xs text-white truncate mt-1">
                          {player.lastName}
                        </div>
                        <div className="text-[10px] text-slate-400 truncate">
                          {player.firstName}
                        </div>
                        {isTarget && (
                          <span className="mt-1.5 text-[9px] font-bold text-rose-300 uppercase block">
                            Wybrano do zejścia
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Ławka (Bench) */}
              <div>
                <span className="text-xs font-black uppercase tracking-wider text-emerald-400 mb-2 block">
                  2. Ławka rezerwowych ({benchPlayers.length}):
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
                              : 'bg-slate-950 hover:bg-slate-800 border-slate-800 text-slate-300'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-mono font-bold text-emerald-400 text-base">
                              #{player.number}
                            </span>
                            <span className="text-[10px] font-mono text-slate-400">
                              {stats.pts}p | {stats.fouls}F
                            </span>
                          </div>
                          <div className="font-bold text-xs text-slate-200 truncate mt-1">
                            {player.lastName}
                          </div>
                          <div className="text-[10px] text-slate-400 truncate">
                            {player.firstName}
                          </div>
                          {isTarget && (
                            <span className="mt-1.5 text-[9px] font-bold text-emerald-300 uppercase block">
                              Wybrano do wejścia
                            </span>
                          )}
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
                            #{rec.outPlayer.number} {rec.outPlayer.lastName}
                          </span>
                          <ArrowLeftRight className="w-3 h-3 text-slate-600" />
                          <span className="text-emerald-400 font-mono font-bold">
                            #{rec.inPlayer.number} {rec.inPlayer.lastName}
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
              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-300 flex items-center justify-between">
                <span>
                  Wybierz dokładnie 5 zawodników, którzy mają grać na parkiecie:{' '}
                  <strong className="text-amber-400 font-mono text-sm">
                    {match.onCourtPlayerIds.length}/5
                  </strong>
                </span>
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
                        <div className="truncate text-xs">{player.lastName}</div>
                      </div>
                      <div className="text-right font-mono text-[11px]">
                        <div>{stats.pts} pkt</div>
                        <div>{stats.fouls}F</div>
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

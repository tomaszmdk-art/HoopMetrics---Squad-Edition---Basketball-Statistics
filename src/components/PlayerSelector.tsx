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
  UserMinus,
  UserPlus,
} from 'lucide-react';
import { playClickSound, triggerHaptic } from '../services/tts';
import { LiveMatchTheme, TileFontFamily } from '../types/liveMatchTheme';
import {
  createSubstitutionEvent,
  getPlayerFullName,
  getPlayerShortName,
} from '../services/playerDisplay';
import { applyMatchLineupChange } from '../services/playingTime';
import { useBackHandler } from '../services/navigationHistory';

const formatNumAndName = (p: Player): string => {
  const n = p.lastName?.trim() || p.firstName?.trim();
  return n ? `#${p.number} ${n}` : `#${p.number}`;
};

const getCardPrimaryName = (p: Player): string =>
  p.lastName?.trim() || p.firstName?.trim() || 'Zawodnik';

const getCardSecondaryName = (p: Player): string =>
  p.lastName?.trim() ? (p.firstName?.trim() || '') : (p.position || '');

interface PlayerSelectorProps {
  match: Match;
  rosterPlayers: Player[];
  selectedPlayerId: string | null;
  onSelectPlayer: (playerId: string | null) => void;
  onUpdateMatch: (updatedOrUpdater: Match | ((prevMatch: Match) => Match)) => void;
  liveTheme?: LiveMatchTheme;
}

const getFontFamilyCss = (ff?: TileFontFamily) => {
  switch (ff) {
    case 'mono':
      return 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace';
    case 'sans':
      return 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    case 'display':
      return 'Impact, "Arial Black", "Trebuchet MS", sans-serif';
    case 'serif':
      return 'Georgia, Cambria, "Times New Roman", Times, serif';
    default:
      return undefined;
  }
};

interface SubRecord {
  id: string;
  outPlayer: Player;
  inPlayer: Player;
  time: string;
}

export const PlayerSelector: React.FC<PlayerSelectorProps> = ({
  match,
  rosterPlayers,
  selectedPlayerId,
  onSelectPlayer,
  onUpdateMatch,
  liveTheme,
}) => {
  const [isSubModalOpen, setIsSubModalOpen] = useState(false);
  useBackHandler(isSubModalOpen, () => setIsSubModalOpen(false), 'selector-sub');
  const [subCourtPlayerId, setSubCourtPlayerId] = useState<string | null>(null);
  const [subBenchPlayerId, setSubBenchPlayerId] = useState<string | null>(null);
  const [subMode, setSubMode] = useState<'rotation' | 'lineup'>('rotation');
  const [lastSwapMessage, setLastSwapMessage] = useState<string | null>(null);
  const [subHistory, setSubHistory] = useState<SubRecord[]>([]);

  // Divide players into onCourt and bench based on match.onCourtPlayerIds
  const onCourtPlayers = rosterPlayers.filter((p) =>
    match.onCourtPlayerIds.includes(p.id)
  );
  const benchPlayers = rosterPlayers.filter(
    (p) => !match.onCourtPlayerIds.includes(p.id)
  );

  const handlePlayerTap = (player: Player) => {
    playClickSound();
    triggerHaptic(20);
    if (selectedPlayerId === player.id) {
      onSelectPlayer(null); // toggle off
    } else {
      onSelectPlayer(player.id);
    }
  };

  // Perform a 1-to-1 substitution without closing the modal
  const handleExecuteSwap = (courtPlayerId: string, benchPlayerId: string) => {
    playClickSound();
    triggerHaptic(35);

    const courtPlayer = rosterPlayers.find((p) => p.id === courtPlayerId);
    const benchPlayer = rosterPlayers.find((p) => p.id === benchPlayerId);

    onUpdateMatch((prev) => {
      const newOnCourt = prev.onCourtPlayerIds.map((id) =>
        id === courtPlayerId ? benchPlayerId : id
      );
      const subEvent = createSubstitutionEvent(prev, {
        type: 'SUBSTITUTION',
        inPlayer: benchPlayer,
        outPlayer: courtPlayer,
        nextOnCourt: newOnCourt,
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
          outPlayer: courtPlayer,
          inPlayer: benchPlayer,
          time: nowStr,
        },
        ...prev,
      ]);
    }

    // If currently selected player was subbed out, automatically select the new player
    if (selectedPlayerId === courtPlayerId) {
      onSelectPlayer(benchPlayerId);
    }

    // Reset selection so coach can immediately perform the next substitution!
    setSubCourtPlayerId(null);
    setSubBenchPlayerId(null);
  };

  // Handling click on court player in modal
  const handleCourtPlayerClick = (playerId: string) => {
    playClickSound();
    triggerHaptic(20);

    // If a bench player was already selected, execute the swap immediately!
    if (subBenchPlayerId) {
      handleExecuteSwap(playerId, subBenchPlayerId);
      return;
    }

    // Toggle court player selection
    if (subCourtPlayerId === playerId) {
      setSubCourtPlayerId(null);
    } else {
      setSubCourtPlayerId(playerId);
    }
  };

  // Handling click on bench player in modal
  const handleBenchPlayerClick = (playerId: string) => {
    playClickSound();
    triggerHaptic(20);

    // If a court player was already selected, execute the swap immediately!
    if (subCourtPlayerId) {
      handleExecuteSwap(subCourtPlayerId, playerId);
      return;
    }

    // If court has fewer than 5 players, just add them directly!
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

    // Toggle bench player selection
    if (subBenchPlayerId === playerId) {
      setSubBenchPlayerId(null);
    } else {
      setSubBenchPlayerId(playerId);
    }
  };

  // Pick 5 Lineup mode: toggle player on/off court
  const handleTogglePlayerInFive = (playerId: string) => {
    playClickSound();
    triggerHaptic(20);
    const targetPlayer = rosterPlayers.find((p) => p.id === playerId);

    onUpdateMatch((prev) => {
      const isOnCourt = prev.onCourtPlayerIds.includes(playerId);
      if (isOnCourt) {
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
      } else {
        if (prev.onCourtPlayerIds.length >= 5) {
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
      }
    });
  };

  // Swap entire five if bench >= 5
  const handleSwapEntireFive = () => {
    if (benchPlayers.length < 5) return;
    playClickSound();
    triggerHaptic(50);

    const newFive = benchPlayers.slice(0, 5).map((p) => p.id);
    onUpdateMatch((prev) => {
      const leavingIds = prev.onCourtPlayerIds.filter((id) => !newFive.includes(id));
      const enteringIds = newFive.filter((id) => !prev.onCourtPlayerIds.includes(id));
      const pairCount = Math.min(leavingIds.length, enteringIds.length);
      const subEvents = [];

      for (let i = 0; i < pairCount; i++) {
        subEvents.push(
          createSubstitutionEvent(prev, {
            type: 'SUBSTITUTION',
            outPlayer: rosterPlayers.find((p) => p.id === leavingIds[i]),
            inPlayer: rosterPlayers.find((p) => p.id === enteringIds[i]),
            nextOnCourt: newFive,
          })
        );
      }
      for (let i = pairCount; i < leavingIds.length; i++) {
        subEvents.push(
          createSubstitutionEvent(prev, {
            type: 'SUB_OUT',
            outPlayer: rosterPlayers.find((p) => p.id === leavingIds[i]),
            nextOnCourt: newFive,
          })
        );
      }
      for (let i = pairCount; i < enteringIds.length; i++) {
        subEvents.push(
          createSubstitutionEvent(prev, {
            type: 'SUB_IN',
            inPlayer: rosterPlayers.find((p) => p.id === enteringIds[i]),
            nextOnCourt: newFive,
          })
        );
      }

      return {
        ...applyMatchLineupChange(prev, newFive),
        events: [...prev.events, ...subEvents],
        updatedAt: Date.now(),
      };
    });
    setLastSwapMessage(`Wymieniono całą piątkę na rezerwowych!`);
    setSubCourtPlayerId(null);
    setSubBenchPlayerId(null);
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
    setLastSwapMessage(`Zeszła cała piątka (0/5). Wybierz nowy skład z ławki rezerwowych.`);
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

  const handleCloseModal = () => {
    playClickSound();
    triggerHaptic(20);
    setIsSubModalOpen(false);
    setSubCourtPlayerId(null);
    setSubBenchPlayerId(null);
    setLastSwapMessage(null);
  };

  const selectedPlayer = rosterPlayers.find((p) => p.id === selectedPlayerId);
  const activeCourtTarget = rosterPlayers.find((p) => p.id === subCourtPlayerId);
  const activeBenchTarget = rosterPlayers.find((p) => p.id === subBenchPlayerId);

  return (
    <div className="w-full bg-slate-900 border border-slate-800 rounded-2xl p-2.5 sm:p-3 text-slate-100 shadow-xl">
      {/* Header bar: Selected player callout & Substitution button */}
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
            Krok 1: Wybierz gracza:
          </span>
          {selectedPlayer ? (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-500 text-slate-950 font-black text-xs shadow-md">
              {selectedPlayer.photo ? (
                <img
                  src={selectedPlayer.photo}
                  alt={getPlayerShortName(selectedPlayer)}
                  className="w-5 h-5 rounded-md object-cover border border-slate-950/40 shrink-0"
                />
              ) : null}
              <span className="font-mono">#{selectedPlayer.number}</span>
              {(selectedPlayer.lastName?.trim() || selectedPlayer.firstName?.trim()) && (
                <span className="truncate max-w-[100px] sm:max-w-xs">
                  {getPlayerShortName(selectedPlayer)}
                </span>
              )}
              {(() => {
                const s = calculatePlayerStats(selectedPlayer, match.events, match);
                return (
                  <>
                    <span className="bg-slate-950 text-amber-300 px-1.5 py-0.5 rounded font-mono text-[11px] font-black">
                      {s.pts} pkt
                    </span>
                    <span
                      className={`px-1.5 py-0.5 rounded font-mono text-[11px] font-black ${
                        s.plusMinus > 0
                          ? 'bg-slate-950 text-emerald-400'
                          : s.plusMinus < 0
                          ? 'bg-slate-950 text-rose-400'
                          : 'bg-slate-950 text-slate-300'
                      }`}
                      title="Bilans punktowy drużyny podczas obecności zawodnika na parkiecie (+/-)"
                    >
                      +/- {s.plusMinus > 0 ? `+${s.plusMinus}` : s.plusMinus}
                    </span>
                    <span className="bg-slate-950 text-sky-300 px-1.5 py-0.5 rounded font-mono text-[11px] font-black" title="Czas na parkiecie">
                      {formatSecondsToMMSS(s.secondsPlayed)}
                    </span>
                    <span className="bg-slate-950 text-emerald-400 px-1.5 py-0.5 rounded font-mono text-[11px] font-black">
                      Eval: {s.eval}
                    </span>
                  </>
                );
              })()}
            </span>
          ) : (
            <span className="text-xs font-semibold text-amber-400/80 italic">
              (Dotknij zawodnika na boisku)
            </span>
          )}
        </div>

        <button
          onClick={() => {
            playClickSound();
            triggerHaptic(20);
            onUpdateMatch((prev) =>
              prev.isClockRunning
                ? { ...prev, isClockRunning: false, updatedAt: Date.now() }
                : prev
            );
            setIsSubModalOpen(true);
            setSubHistory([]);
            setLastSwapMessage(null);
          }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 text-xs font-bold transition active:scale-95 shrink-0 shadow-sm"
          title="Zarządzaj zmianami (wymieniaj wielu zawodników bez zamykania okna)"
        >
          <ArrowLeftRight className="w-3.5 h-3.5 text-amber-400" />
          <span>Zmiana składu</span>
        </button>
      </div>

      {/* Primary Row: The 5 On-Court Players (Top: Photo, Name & Prominent Points; Bottom: Eval, +/- & Fouls) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-1.5 sm:gap-2">
        {onCourtPlayers.map((player, idx) => {
          const isSelected = selectedPlayerId === player.id;
          const stats = calculatePlayerStats(player, match.events, match);
          const isFifthOnTwoCol = idx === 4;
          const pTheme = liveTheme?.playerCards;
          const statFontStyle = pTheme ? { fontSize: `${pTheme.nameFontSize}px` } : undefined;

          return (
            <button
              key={player.id}
              onClick={() => handlePlayerTap(player)}
              style={
                pTheme
                  ? {
                      background: isSelected ? pTheme.bgSelected : pTheme.bgUnselected,
                      borderColor: isSelected ? pTheme.borderSelected : pTheme.borderUnselected,
                      minHeight: `${pTheme.cardMinHeight}px`,
                      fontFamily: getFontFamilyCss(pTheme.fontFamily),
                    }
                  : undefined
              }
              className={`relative flex flex-col justify-between gap-1.5 p-2 sm:p-2.5 transition duration-150 active:scale-95 border select-none cursor-pointer overflow-hidden ${
                pTheme ? pTheme.borderRadius : 'rounded-2xl'
              } ${isFifthOnTwoCol ? 'col-span-2 sm:col-span-1' : ''} ${
                isSelected
                  ? 'bg-gradient-to-r from-amber-400 via-amber-400 to-amber-500 text-slate-950 border-amber-300 ring-2 ring-amber-300/80 shadow-lg shadow-amber-950/50 scale-[1.02] z-10'
                  : 'bg-slate-900/90 text-slate-200 border-slate-800 hover:border-slate-700 hover:bg-slate-850'
              }`}
            >
              {/* GÓRNA CZĘŚĆ: ZDJĘCIE, NAZWISKO + NUMER ORAZ WYRAŹNA LICZBA PUNKTÓW PO PRAWEJ */}
              <div className="flex items-center justify-between gap-2 w-full min-w-0">
                <div className="flex items-center min-w-0 flex-1">
                  {/* ZDJĘCIE / IKONA ZAWODNIKA */}
                  <div className="shrink-0 mr-2">
                    {player.photo ? (
                      <div className="relative w-10 h-10 sm:w-11 sm:h-11 rounded-xl overflow-hidden border border-amber-400/50 shadow-md bg-slate-950">
                        <img
                          src={player.photo}
                          alt={getPlayerShortName(player)}
                          className="w-full h-full object-cover"
                        />
                      </div>
                    ) : (
                      <div
                        className={`w-10 h-10 sm:w-11 sm:h-11 rounded-xl flex flex-col items-center justify-center font-mono font-black border shadow-inner ${
                          isSelected
                            ? 'bg-slate-950/25 border-slate-950/30 text-slate-950'
                            : 'bg-slate-950 border-amber-500/30 text-amber-400'
                        }`}
                      >
                        <span className="text-[8px] font-bold opacity-60 leading-none">NR</span>
                        <span
                          style={pTheme ? { fontSize: `${pTheme.numberFontSize}px` } : undefined}
                          className="text-base leading-none"
                        >
                          #{player.number}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* NAZWISKO, NUMER I CZAS GRY */}
                  <div className="flex-1 min-w-0 flex flex-col justify-center text-left">
                    <div className="flex items-center gap-1 min-w-0">
                      <span
                        style={pTheme ? { fontSize: `${pTheme.numberFontSize}px` } : undefined}
                        className={`font-mono font-black text-sm sm:text-base leading-none shrink-0 ${
                          isSelected ? 'text-slate-950' : 'text-amber-400'
                        }`}
                      >
                        #{player.number}
                      </span>
                      <span
                        style={
                          pTheme
                            ? {
                                fontSize: `${pTheme.nameFontSize}px`,
                                color: isSelected ? pTheme.textSelected : pTheme.textUnselected,
                              }
                            : undefined
                        }
                        className={`font-black text-xs sm:text-sm uppercase tracking-tight truncate leading-tight ${
                          isSelected ? 'text-slate-950' : 'text-white'
                        }`}
                        title={getPlayerFullName(player)}
                      >
                        {getCardPrimaryName(player)}
                      </span>
                    </div>
                    <div
                      className={`text-[10px] sm:text-[11px] font-semibold truncate leading-none mt-1 flex items-center gap-1 ${
                        isSelected ? 'text-slate-900/80 font-bold' : 'text-slate-400'
                      }`}
                    >
                      <span
                        className={`font-mono font-bold shrink-0 ${
                          isSelected ? 'text-slate-950' : 'text-sky-300'
                        }`}
                        title="Czas przebywania na parkiecie"
                      >
                        {formatSecondsToMMSS(stats.secondsPlayed)}
                      </span>
                      {getCardSecondaryName(player) && (
                        <span className="truncate">• {getCardSecondaryName(player)}</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* PRAWA STRONA: TYLKO WYRAŹNA LICZBA ZDOBYTYCH PUNKTÓW */}
                <div
                  className={`shrink-0 min-w-[38px] px-2 py-1 rounded-xl font-mono font-black leading-none flex items-center justify-center ${
                    isSelected
                      ? 'bg-slate-950 text-amber-300 shadow-inner'
                      : 'bg-amber-500/15 text-amber-300 border border-amber-500/35'
                  }`}
                  style={{ fontSize: pTheme ? `${Math.max(pTheme.ptsFontSize, 24)}px` : '26px' }}
                  title="Zdobyte punkty w meczu"
                >
                  {stats.pts}
                </div>
              </div>

              {/* DOLNY RZĄD (POD IKONKĄ I NAZWISKIEM): EVAL:, +-: ORAZ Faule: (ROZMIAR CZCIONKI = NAZWISKO) */}
              <div
                className={`w-full flex flex-wrap items-center justify-between gap-1 pt-1.5 border-t tabular-nums ${
                  isSelected ? 'border-slate-950/20' : 'border-slate-800/70'
                }`}
              >
                {/* EVAL */}
                <span
                  style={statFontStyle}
                  className={`px-1 py-0.5 rounded font-normal text-xs sm:text-sm leading-none whitespace-nowrap ${
                    isSelected
                      ? 'bg-slate-950/20 text-slate-950'
                      : stats.eval > 0
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                      : stats.eval < 0
                      ? 'text-rose-400 bg-rose-500/20 border border-rose-500/30'
                      : 'bg-slate-800 text-slate-300'
                  }`}
                  title="Wskaźnik efektywności EVAL (FIBA)"
                >
                  <span>EVAL: </span>
                  <span className="font-black">{stats.eval}</span>
                </span>

                {/* +/- STATYSTYKA BILANSU */}
                <span
                  style={statFontStyle}
                  className={`px-1 py-0.5 rounded font-normal text-xs sm:text-sm leading-none whitespace-nowrap ${
                    isSelected
                      ? stats.plusMinus > 0
                        ? 'bg-slate-950 text-emerald-300'
                        : stats.plusMinus < 0
                        ? 'bg-slate-950 text-rose-300'
                        : 'bg-slate-950 text-slate-300'
                      : stats.plusMinus > 0
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/35'
                      : stats.plusMinus < 0
                      ? 'bg-rose-500/20 text-rose-300 border border-rose-500/35'
                      : 'bg-slate-800 text-slate-300 border border-slate-700/60'
                  }`}
                  title="Wskaźnik +/- (bilans punktowy drużyny podczas obecności zawodnika na parkiecie)"
                >
                  <span>+-: </span>
                  <span className="font-black">
                    {stats.plusMinus > 0 ? `+${stats.plusMinus}` : stats.plusMinus}
                  </span>
                </span>

                {/* FAULE */}
                <span
                  style={statFontStyle}
                  className={`px-1 py-0.5 rounded font-normal text-xs sm:text-sm leading-none whitespace-nowrap ${
                    stats.fouls >= 5
                      ? 'bg-rose-600 text-white'
                      : stats.fouls >= 4
                      ? 'bg-rose-500 text-white'
                      : isSelected
                      ? 'bg-slate-950/20 text-slate-950'
                      : stats.fouls > 0
                      ? 'bg-slate-800 text-amber-300 border border-slate-700'
                      : 'bg-slate-800/60 text-slate-300'
                  }`}
                  title={
                    stats.fouls >= 5
                      ? '5 fauli - zawodnik wykluczony!'
                      : `Faule osobiste (${stats.fouls}/5)`
                  }
                >
                  <span>Faule: </span>
                  <span className="font-black">{stats.fouls}</span>
                </span>
              </div>
            </button>
          );
        })}
      </div>

      {/* Secondary mini row: Bench Players for immediate action or quick selection */}
      {benchPlayers.length > 0 && (
        <div className="mt-2 pt-2 border-t border-slate-800/60 flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
          <span className="text-[10px] font-bold uppercase text-slate-500 shrink-0 mr-1">
            Ławka:
          </span>
          {benchPlayers.map((player) => {
            const isSelected = selectedPlayerId === player.id;
            const stats = calculatePlayerStats(player, match.events, match);

            return (
              <button
                key={player.id}
                onClick={() => handlePlayerTap(player)}
                className={`px-2 py-1 rounded-lg text-xs font-semibold shrink-0 transition flex items-center gap-1.5 border ${
                  isSelected
                    ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-md scale-105'
                    : 'bg-slate-950/60 text-slate-400 border-slate-800 hover:text-slate-200 hover:bg-slate-800'
                }`}
              >
                {player.photo ? (
                  <div className="w-5 h-5 rounded-md overflow-hidden shrink-0 border border-amber-400/40 bg-slate-950">
                    <img src={player.photo} alt={getPlayerShortName(player)} className="w-full h-full object-cover" />
                  </div>
                ) : null}
                <span className="font-mono font-bold text-amber-400">#{player.number}</span>
                {(player.lastName?.trim() || player.firstName?.trim()) && (
                  <span className="truncate max-w-[70px]">{getPlayerShortName(player)}</span>
                )}
                <span className={`text-[9px] font-mono font-bold ${isSelected ? 'text-slate-900' : 'text-sky-300'}`}>
                  {formatSecondsToMMSS(stats.secondsPlayed)}
                </span>
                <span className={`text-[9px] font-mono ${isSelected ? 'text-slate-900' : 'text-slate-400'}`}>({stats.pts}p)</span>
                <span
                  className={`text-[9px] font-mono font-black px-1 rounded ${
                    isSelected
                      ? 'bg-slate-950 text-slate-300'
                      : stats.plusMinus > 0
                      ? 'text-emerald-400 bg-emerald-500/15'
                      : stats.plusMinus < 0
                      ? 'text-rose-400 bg-rose-500/15'
                      : 'text-slate-400 bg-slate-800/60'
                  }`}
                  title="Wskaźnik +/- na boisku"
                >
                  {stats.plusMinus > 0 ? `+${stats.plusMinus}` : stats.plusMinus}
                </span>
                <span
                  className={`text-[9px] font-mono font-black px-1 rounded ${
                    isSelected
                      ? 'bg-slate-950 text-emerald-300'
                      : stats.eval > 0
                      ? 'text-emerald-400 bg-emerald-500/15'
                      : stats.eval < 0
                      ? 'text-rose-400 bg-rose-500/15'
                      : 'text-slate-400 bg-slate-800/60'
                  }`}
                  title="Aktualny EVAL"
                >
                  E:{stats.eval}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* ADVANCED MULTI-PLAYER SUBSTITUTIONS MODAL */}
      {isSubModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-950/90 overflow-y-auto">
          <div className="w-full max-w-2xl max-h-[92vh] flex flex-col rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl text-slate-100 overflow-hidden my-auto">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-3.5 sm:p-4 border-b border-slate-800 bg-slate-950">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-amber-500/20 border border-amber-500/40 text-amber-400">
                  <ArrowLeftRight className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base sm:text-lg font-black text-white">
                      Wymiana zawodników
                    </h3>
                    {subHistory.length > 0 && (
                      <span className="px-2 py-0.5 rounded-full text-[11px] font-black bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 font-mono">
                        Zmian: {subHistory.length}
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-400">
                    Wymieniaj tylu zawodników, ilu potrzebujesz — okno nie zamyka się automatycznie.
                  </p>
                </div>
              </div>

              {/* Top Done Button */}
              <button
                onClick={handleCloseModal}
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
                  title="Wszyscy zawodnicy schodzą z parkietu — wybierz cały nowy skład z ławki"
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
                <span className="text-[10px] text-emerald-400/80 font-normal hidden sm:inline">
                  Możesz wymienić kolejnego gracza lub kliknąć „Zakończ zmiany”
                </span>
              </div>
            )}

            {/* Scrollable Content Arena */}
            <div className="flex-1 overflow-y-auto p-3.5 sm:p-5 space-y-4">
              {subMode === 'rotation' ? (
                /* ROTATION MODE (1 on 1 swaps, repeatable) */
                <div className="space-y-4">
                  {/* Status Helper */}
                  <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-300 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />
                      <span>
                        {onCourtPlayers.length === 0 ? (
                          <>
                            Na parkiecie nikogo nie ma (<strong className="text-amber-400 font-mono">0/5</strong>). Wybierz poniżej z ławki rezerwowych nowy skład.
                          </>
                        ) : onCourtPlayers.length < 5 ? (
                          <>
                            Na parkiecie <strong className="text-amber-400 font-mono">{onCourtPlayers.length}/5</strong> — kliknij kolejnych{' '}
                            <strong className="text-emerald-400">{5 - onCourtPlayers.length}</strong> graczy z ławki poniżej.
                          </>
                        ) : subCourtPlayerId && activeCourtTarget ? (
                          <>
                            Wybrano schodzącego:{' '}
                            <strong className="text-rose-400 font-mono">
                              {formatNumAndName(activeCourtTarget)}
                            </strong>
                            . Teraz kliknij gracza z ławki poniżej.
                          </>
                        ) : subBenchPlayerId && activeBenchTarget ? (
                          <>
                            Wybrano wchodzącego:{' '}
                            <strong className="text-emerald-400 font-mono">
                              {formatNumAndName(activeBenchTarget)}
                            </strong>
                            . Teraz kliknij gracza z parkietu, którego zastępuje.
                          </>
                        ) : (
                          'Kliknij zawodnika schodzącego (z parkietu) LUB wchodzącego (z ławki), albo użyj „Schodzi cała piątka”.'
                        )}
                      </span>
                    </div>

                    {(subCourtPlayerId || subBenchPlayerId) && (
                      <button
                        onClick={() => {
                          setSubCourtPlayerId(null);
                          setSubBenchPlayerId(null);
                        }}
                        className="text-[11px] text-slate-400 hover:text-white underline shrink-0"
                      >
                        Anuluj wybór
                      </button>
                    )}
                  </div>

                  {/* Section 1: NA PARKIECIE (On-Court Players) */}
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
                      <span className="text-xs font-black text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
                        <UserMinus className="w-3.5 h-3.5 text-rose-400" />
                        <span>1. Parkiet ({onCourtPlayers.length}/5):</span>
                      </span>
                      <span className="text-[11px] text-slate-400 hidden sm:inline">
                        {subBenchPlayerId ? 'Kliknij, kogo zastępuje' : 'Dotknij, aby zmienić lub × aby zdjąć'}
                      </span>
                    </div>

                    {onCourtPlayers.length === 0 ? (
                      <div className="p-4 rounded-xl bg-slate-950 border border-dashed border-amber-500/40 text-center text-xs text-amber-300/90 font-semibold">
                        Na parkiecie nikt nie zostaje (0/5). Wybierz poniżej cały nowy skład z ławki rezerwowych.
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                        {onCourtPlayers.map((player) => {
                          const isTargetedForSub = subCourtPlayerId === player.id;
                          const stats = calculatePlayerStats(player, match.events, match);

                          return (
                            <div key={player.id} className="relative">
                              <button
                                type="button"
                                onClick={() => handleCourtPlayerClick(player.id)}
                                className={`w-full h-full p-2.5 rounded-xl border text-center transition active:scale-95 flex flex-col justify-between ${
                                  isTargetedForSub
                                    ? 'bg-rose-500/25 border-rose-400 text-rose-200 ring-2 ring-rose-400/60 shadow-lg shadow-rose-950/40 scale-[1.02]'
                                    : subBenchPlayerId
                                    ? 'bg-slate-950 border-amber-500/50 hover:bg-rose-950/30 hover:border-rose-400 text-slate-200'
                                    : 'bg-slate-950 border-slate-800 text-slate-200 hover:bg-slate-800 hover:border-slate-700'
                                }`}
                              >
                                <div className="flex items-center justify-between w-full mb-1 pr-6">
                                  <span className="font-mono text-base font-black text-amber-400">
                                    #{player.number}
                                  </span>
                                  {isTargetedForSub && (
                                    <span className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded bg-rose-500 text-white">
                                      Schodzi ⬇
                                    </span>
                                  )}
                                  {subBenchPlayerId && !isTargetedForSub && (
                                    <span className="text-[9px] font-bold text-amber-300">
                                      Zastąp ➔
                                    </span>
                                  )}
                                </div>

                                <div className="text-xs font-bold truncate max-w-full text-white my-0.5">
                                  {getCardPrimaryName(player)}
                                </div>
                                {getCardSecondaryName(player) && (
                                  <div className="text-[10px] text-slate-400 truncate max-w-full">
                                    {getCardSecondaryName(player)}
                                  </div>
                                )}

                                <div className="flex items-center justify-center gap-1.5 text-[10px] font-mono mt-1 pt-1 border-t border-slate-800/80">
                                  <span className="text-sky-300 font-bold">{formatSecondsToMMSS(stats.secondsPlayed)}</span>
                                  <span className="text-amber-300 font-bold">{stats.pts}p</span>
                                  <span
                                    className={`font-black ${
                                      stats.plusMinus > 0
                                        ? 'text-emerald-400'
                                        : stats.plusMinus < 0
                                        ? 'text-rose-400'
                                        : 'text-slate-400'
                                    }`}
                                    title="Bilans +/-"
                                  >
                                    {stats.plusMinus > 0 ? `+${stats.plusMinus}` : stats.plusMinus}
                                  </span>
                                  <span
                                    className={`font-black ${
                                      stats.eval > 0
                                        ? 'text-emerald-400'
                                        : stats.eval < 0
                                        ? 'text-rose-400'
                                        : 'text-slate-400'
                                    }`}
                                  >
                                    E:{stats.eval}
                                  </span>
                                  <span className="text-slate-400">{stats.fouls}F</span>
                                </div>
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

                  {/* Section 2: NA ŁAWCE (Bench Players) */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-black text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                        <UserPlus className="w-3.5 h-3.5 text-emerald-400" />
                        <span>2. Ławka rezerwowych ({benchPlayers.length} graczy):</span>
                      </span>
                      <span className="text-[11px] text-slate-400">
                        {subCourtPlayerId
                          ? `Kliknij, kto wchodzi za #${activeCourtTarget?.number}`
                          : 'Dotknij, aby przygotować do wejścia'}
                      </span>
                    </div>

                    {benchPlayers.length === 0 ? (
                      <div className="text-xs text-slate-500 italic p-4 text-center bg-slate-950 rounded-xl border border-slate-800/60">
                        Wszyscy zawodnicy z listy są obecnie na parkiecie.
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {benchPlayers.map((player) => {
                          const isTargetedForSub = subBenchPlayerId === player.id;
                          const stats = calculatePlayerStats(player, match.events, match);

                          return (
                            <button
                              key={player.id}
                              onClick={() => handleBenchPlayerClick(player.id)}
                              className={`p-2.5 rounded-xl border text-left transition active:scale-95 flex items-center justify-between gap-2 ${
                                isTargetedForSub
                                  ? 'bg-emerald-500/25 border-emerald-400 text-emerald-200 ring-2 ring-emerald-400/60 shadow-lg shadow-emerald-950/40'
                                  : subCourtPlayerId
                                  ? 'bg-slate-950 border-emerald-500/60 hover:bg-emerald-950/30 hover:border-emerald-400 text-slate-200'
                                  : 'bg-slate-950 border-slate-800 text-slate-200 hover:bg-slate-800 hover:border-slate-700'
                              }`}
                            >
                              <div className="min-w-0">
                                <div className="flex items-center gap-1.5">
                                  <span className="font-mono text-sm font-black text-amber-400">
                                    #{player.number}
                                  </span>
                                  <span className="text-xs font-bold text-white truncate">
                                    {getCardPrimaryName(player)}
                                  </span>
                                </div>
                                <div className="text-[10px] text-slate-400 flex items-center gap-1 mt-0.5">
                                  {getCardSecondaryName(player) && (
                                    <span>{getCardSecondaryName(player)}</span>
                                  )}
                                  <span className="text-sky-300 font-mono font-bold">{formatSecondsToMMSS(stats.secondsPlayed)}</span>
                                  <span className="text-amber-300 font-mono font-bold">({stats.pts}p</span>
                                  <span
                                    className={`font-mono font-bold ${
                                      stats.plusMinus > 0
                                        ? 'text-emerald-400'
                                        : stats.plusMinus < 0
                                        ? 'text-rose-400'
                                        : 'text-slate-400'
                                    }`}
                                  >
                                    {stats.plusMinus > 0 ? `+${stats.plusMinus}` : stats.plusMinus}
                                  </span>
                                  <span
                                    className={`font-mono font-bold ${
                                      stats.eval > 0
                                        ? 'text-emerald-400'
                                        : stats.eval < 0
                                        ? 'text-rose-400'
                                        : 'text-slate-400'
                                    }`}
                                  >
                                    E:{stats.eval})
                                  </span>
                                </div>
                              </div>

                              {subCourtPlayerId ? (
                                <div className="shrink-0 p-1.5 rounded-lg bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 text-[10px] font-bold">
                                  Wchodzi ➔
                                </div>
                              ) : onCourtPlayers.length < 5 ? (
                                <div className="shrink-0 px-1.5 py-1 rounded-lg bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[10px] font-bold">
                                  + Wejdź
                                </div>
                              ) : isTargetedForSub ? (
                                <span className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded bg-emerald-500 text-slate-950 shrink-0">
                                  Wchodzi ⬆
                                </span>
                              ) : (
                                <Check className="w-3.5 h-3.5 text-slate-600 shrink-0" />
                              )}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                /* PICK 5 / LINEUP MODE */
                <div className="space-y-3">
                  <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-slate-300">Stan wyboru piątki:</span>
                      <span
                        className={`font-mono font-black px-2 py-0.5 rounded ${
                          match.onCourtPlayerIds.length === 5
                            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                            : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                        }`}
                      >
                        {match.onCourtPlayerIds.length} / 5
                      </span>
                      {match.onCourtPlayerIds.length === 5 ? (
                        <span className="text-emerald-400 font-bold hidden sm:inline">
                          ✓ Skład kompletny
                        </span>
                      ) : (
                        <span className="text-amber-400 font-semibold hidden sm:inline">
                          (Wybierz jeszcze {5 - match.onCourtPlayerIds.length} graczy)
                        </span>
                      )}
                    </div>

                    <button
                      onClick={handleClearCourt}
                      className="text-[11px] text-rose-400 hover:text-rose-300 underline font-semibold"
                    >
                      Schodzi cała piątka
                    </button>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {rosterPlayers.map((player) => {
                      const isOnCourt = match.onCourtPlayerIds.includes(player.id);
                      const stats = calculatePlayerStats(player, match.events, match);
                      const isLimitReached = !isOnCourt && match.onCourtPlayerIds.length >= 5;

                      return (
                        <button
                          key={player.id}
                          disabled={isLimitReached}
                          onClick={() => handleTogglePlayerInFive(player.id)}
                          className={`p-3 rounded-xl border text-left transition flex items-center justify-between gap-2 ${
                            isOnCourt
                              ? 'bg-amber-500/20 border-amber-400 text-white shadow-md ring-1 ring-amber-400/50'
                              : isLimitReached
                              ? 'opacity-40 cursor-not-allowed bg-slate-950 border-slate-800'
                              : 'bg-slate-950 border-slate-800 hover:border-slate-700 hover:bg-slate-800/80 text-slate-300'
                          }`}
                        >
                          <div>
                            <div className="flex items-center gap-1.5">
                              <span className="font-mono text-sm font-black text-amber-400">
                                #{player.number}
                              </span>
                              <span className="text-xs font-bold text-white truncate">
                                {getCardPrimaryName(player)}
                              </span>
                            </div>
                            <div className="text-[10px] text-slate-400 mt-0.5">
                              {getCardSecondaryName(player) ? `${getCardSecondaryName(player)} • ` : ''}
                              <span className="text-sky-300 font-mono font-bold">{formatSecondsToMMSS(stats.secondsPlayed)}</span> • {stats.pts}p • +/- {stats.plusMinus > 0 ? `+${stats.plusMinus}` : stats.plusMinus} • Eval {stats.eval}
                            </div>
                          </div>

                          <div
                            className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 border ${
                              isOnCourt
                                ? 'bg-amber-500 border-amber-300 text-slate-950'
                                : 'border-slate-700 bg-slate-900 text-transparent'
                            }`}
                          >
                            <Check className="w-3.5 h-3.5 stroke-[3]" />
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Substitution Session History Log */}
              {subHistory.length > 0 && (
                <div className="mt-4 pt-3 border-t border-slate-800">
                  <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                    <Sparkles className="w-3 h-3 text-amber-400" />
                    <span>Wykonane zmiany w tej turze ({subHistory.length}):</span>
                  </div>
                  <div className="space-y-1 max-h-28 overflow-y-auto pr-1">
                    {subHistory.map((rec) => (
                      <div
                        key={rec.id}
                        className="text-xs font-mono py-1 px-2.5 rounded-lg bg-slate-950 border border-slate-800/80 flex items-center justify-between text-slate-300"
                      >
                        <div className="flex items-center gap-1.5">
                          <span className="text-rose-400 font-bold">
                            ⬇ {formatNumAndName(rec.outPlayer)}
                          </span>
                          <span className="text-slate-500">➔</span>
                          <span className="text-emerald-400 font-bold">
                            ⬆ {formatNumAndName(rec.inPlayer)}
                          </span>
                        </div>
                        <span className="text-[10px] text-slate-500">{rec.time}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Modal Bottom Bar with Prominent "Zakończ i wróć" Button */}
            <div className="p-3 sm:p-4 border-t border-slate-800 bg-slate-950 flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="text-xs text-slate-300 flex items-center gap-1.5 flex-wrap">
                <span className="text-slate-400">Aktualnie na parkiecie:</span>
                <span className="font-mono text-amber-400 font-bold">
                  {onCourtPlayers.map((p) => formatNumAndName(p)).join(', ') || 'Brak'}
                </span>
              </div>

              <button
                onClick={handleCloseModal}
                className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-sm shadow-lg shadow-emerald-950/50 active:scale-95 transition"
              >
                <Check className="w-4 h-4 stroke-[3]" />
                <span>Zatwierdź i wróć do meczu</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

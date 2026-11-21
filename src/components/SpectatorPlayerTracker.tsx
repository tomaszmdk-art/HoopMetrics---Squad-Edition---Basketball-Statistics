import React, { useMemo, useState } from 'react';
import { Match, Player } from '../types/basketball';
import { calculatePlayerStats, formatSecondsToMMSS } from '../services/statsCalculator';
import { getPlayerFullName } from '../services/playerDisplay';
import { playClickSound, triggerHaptic } from '../services/tts';
import { UserCheck, ArrowLeftRight, Clock } from 'lucide-react';

interface SpectatorPlayerTrackerProps {
  match: Match;
  players: Player[];
  selectedPlayerId: string | null;
  onSelectPlayer: (playerId: string | null) => void;
}

export const SpectatorPlayerTracker: React.FC<SpectatorPlayerTrackerProps> = ({
  match,
  players,
  selectedPlayerId,
  onSelectPlayer,
}) => {
  const [showPicker, setShowPicker] = useState<boolean>(!selectedPlayerId);

  const availablePlayers = useMemo(() => {
    const map = new Map<string, Player>();
    players.forEach((p) => map.set(p.id, p));

    match.events.forEach((e) => {
      if (e.team === 'our' && e.playerId && !map.has(e.playerId)) {
        map.set(e.playerId, {
          id: e.playerId,
          teamCategory: match.teamCategory || 'TEAM',
          firstName: '',
          lastName: '',
          number: e.playerNumber ?? 0,
          createdAt: 0,
        });
      }
    });

    return Array.from(map.values()).sort((a, b) => a.number - b.number);
  }, [players, match.events, match.teamCategory]);

  const trackedPlayer = useMemo(
    () => availablePlayers.find((p) => p.id === selectedPlayerId) || null,
    [availablePlayers, selectedPlayerId]
  );

  const stats = useMemo(() => {
    if (!trackedPlayer) return null;
    return calculatePlayerStats(trackedPlayer, match.events, match);
  }, [trackedPlayer, match]);

  const isOnCourt = trackedPlayer ? match.onCourtPlayerIds.includes(trackedPlayer.id) : false;

  const formatDisplayName = (p: Player) => {
    const full = getPlayerFullName(p);
    if (full.startsWith('Zawodnik #')) return full;
    return `#${p.number} ${full}`;
  };

  const handlePickPlayer = (playerId: string) => {
    playClickSound();
    triggerHaptic(20);
    onSelectPlayer(playerId);
    setShowPicker(false);
  };

  // Show compact picker when no player is selected yet or user clicked "Zmień"
  if (!trackedPlayer || !stats || showPicker) {
    return (
      <div className="w-full max-w-3xl mx-auto bg-slate-900 border border-slate-800 rounded-2xl p-3 shadow-lg text-slate-100">
        <div className="flex items-center justify-between gap-2 pb-2 mb-2.5 border-b border-slate-800">
          <div className="flex items-center gap-2 min-w-0">
            <UserCheck className="w-4 h-4 text-amber-400 shrink-0" />
            <h3 className="text-xs sm:text-sm font-black text-white truncate">
              Wybierz zawodnika do śledzenia
            </h3>
          </div>
          {trackedPlayer && (
            <button
              type="button"
              onClick={() => {
                playClickSound();
                setShowPicker(false);
              }}
              className="px-2.5 py-1 min-h-[32px] rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold transition whitespace-nowrap shrink-0"
            >
              Powrót
            </button>
          )}
        </div>

        {availablePlayers.length === 0 ? (
          <p className="text-xs text-slate-400 text-center py-4">
            Brak zawodników w składzie tego meczu.
          </p>
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-1.5 max-h-[140px] overflow-y-auto pr-0.5">
            {availablePlayers.map((p) => {
              const onFloor = match.onCourtPlayerIds.includes(p.id);
              const isSelected = p.id === selectedPlayerId;
              const full = getPlayerFullName(p);
              const hasRealName = !full.startsWith('Zawodnik #');
              return (
                <button
                  type="button"
                  key={p.id}
                  onClick={() => handlePickPlayer(p.id)}
                  className={`flex flex-col items-center justify-center px-2 py-1.5 min-h-[44px] rounded-xl border text-center transition active:scale-95 ${
                    isSelected
                      ? 'bg-amber-500 text-slate-950 border-amber-400 font-black'
                      : onFloor
                        ? 'bg-slate-950 hover:bg-slate-800 text-white border-emerald-500/40'
                        : 'bg-slate-950/70 hover:bg-slate-800 text-slate-300 border-slate-800'
                  }`}
                >
                  <span className="font-mono tabular-nums font-black text-sm leading-tight">
                    #{p.number}
                  </span>
                  <span
                    className={`text-[10px] truncate max-w-full leading-tight mt-0.5 ${
                      isSelected ? 'text-slate-900 font-bold' : 'text-slate-400'
                    }`}
                  >
                    {hasRealName ? full : onFloor ? 'Na boisku' : 'Ławka'}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  const plusMinusFormatted =
    stats.plusMinus > 0 ? `+${stats.plusMinus}` : `${stats.plusMinus}`;

  return (
    <div className="w-full max-w-4xl mx-auto bg-slate-900 border border-slate-800 rounded-2xl p-3 sm:p-3.5 shadow-lg text-slate-100">
      {/* Compact Header Row: Player identity + status + Switch player */}
      <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-800">
        <div className="flex items-center gap-2.5 min-w-0">
          {trackedPlayer.photo ? (
            <img
              src={trackedPlayer.photo}
              alt={formatDisplayName(trackedPlayer)}
              className="w-9 h-9 rounded-lg object-cover border border-slate-700 shrink-0"
            />
          ) : (
            <div className="w-9 h-9 rounded-lg bg-amber-500/15 border border-amber-500/40 flex items-center justify-center font-mono tabular-nums font-black text-sm text-amber-400 shrink-0">
              #{trackedPlayer.number}
            </div>
          )}

          <div className="min-w-0">
            <div className="text-sm sm:text-base font-black text-white truncate leading-tight">
              {formatDisplayName(trackedPlayer)}
            </div>
            <div className="text-xs sm:text-sm text-slate-400 truncate leading-tight mt-0.5 flex items-center gap-1.5 flex-wrap">
              <span className={isOnCourt ? 'text-emerald-400 font-semibold' : 'text-slate-400'}>
                {isOnCourt ? 'Na parkiecie' : 'Na ławce'}
              </span>
              {trackedPlayer.position ? <span>· {trackedPlayer.position}</span> : null}
              <span>· Faule: {stats.fouls}/5</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <div
            className="flex items-center gap-1.5 px-2.5 py-1.5 min-h-[36px] rounded-xl bg-slate-950 border border-slate-800 text-sky-300 font-mono tabular-nums font-black text-sm sm:text-base"
            title="Czas przebywania zawodnika na parkiecie"
          >
            <Clock className="w-3.5 h-3.5 text-sky-400 shrink-0" />
            <span>{formatSecondsToMMSS(stats.secondsPlayed)}</span>
          </div>

          <button
            type="button"
            onClick={() => {
              playClickSound();
              setShowPicker(true);
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 min-h-[36px] rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs sm:text-sm font-bold transition active:scale-95 whitespace-nowrap shrink-0"
            title="Wybierz innego zawodnika do śledzenia"
          >
            <ArrowLeftRight className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span>Zmień</span>
          </button>
        </div>
      </div>

      {/* Headline Metrics Row: PKT / EVAL / +/- */}
      <div className="grid grid-cols-3 divide-x divide-slate-800 py-2">
        <div className="flex flex-col items-center justify-center px-1">
          <span className="text-sm sm:text-base font-bold text-slate-400 uppercase tracking-wider">
            Punkty
          </span>
          <span className="font-mono tabular-nums font-black text-3xl sm:text-4xl text-amber-300 leading-none mt-1">
            {stats.pts}
          </span>
        </div>

        <div className="flex flex-col items-center justify-center px-1">
          <span className="text-sm sm:text-base font-bold text-slate-400 uppercase tracking-wider">
            EVAL
          </span>
          <span
            className={`font-mono tabular-nums font-black text-3xl sm:text-4xl leading-none mt-1 ${
              stats.eval > 0
                ? 'text-emerald-400'
                : stats.eval < 0
                  ? 'text-rose-400'
                  : 'text-slate-200'
            }`}
          >
            {stats.eval}
          </span>
        </div>

        <div className="flex flex-col items-center justify-center px-1">
          <span className="text-sm sm:text-base font-bold text-slate-400 uppercase tracking-wider">
            +/-
          </span>
          <span
            className={`font-mono tabular-nums font-black text-3xl sm:text-4xl leading-none mt-1 ${
              stats.plusMinus > 0
                ? 'text-emerald-400'
                : stats.plusMinus < 0
                  ? 'text-rose-400'
                  : 'text-slate-200'
            }`}
          >
            {plusMinusFormatted}
          </span>
        </div>
      </div>

      {/* Enlarged (2x) Compact Box Score Grid Table */}
      <div className="border-t border-slate-800 pt-2">
        <div className="grid grid-cols-5 md:grid-cols-10 gap-y-2 text-center font-mono tabular-nums">
          {[
            { label: '2P', value: `${stats.fg2m}/${stats.fg2a}`, cls: 'text-slate-100' },
            { label: '3P', value: `${stats.fg3m}/${stats.fg3a}`, cls: 'text-slate-100' },
            { label: 'FT', value: `${stats.ftm}/${stats.fta}`, cls: 'text-slate-100' },
            { label: 'FG%', value: `${stats.fgPct}%`, cls: 'text-amber-300' },
            {
              label: 'ZB',
              value: `${stats.totReb}`,
              cls: 'text-slate-100',
              title: `Atak: ${stats.offReb} / Obrona: ${stats.defReb}`,
            },
            { label: 'AS', value: `${stats.ast}`, cls: 'text-slate-100' },
            { label: 'PRZ', value: `${stats.stl}`, cls: 'text-slate-100' },
            { label: 'BLK', value: `${stats.blk}`, cls: 'text-slate-100' },
            { label: 'STR', value: `${stats.tov}`, cls: 'text-rose-300' },
            {
              label: 'PF',
              value: `${stats.fouls}`,
              cls: stats.fouls >= 4 ? 'text-rose-400' : 'text-slate-100',
            },
          ].map((cell) => (
            <div
              key={cell.label}
              title={cell.title}
              className="flex flex-col items-center justify-center px-1 border-r border-slate-800/70 last:border-r-0 [&:nth-child(5)]:border-r-0 md:[&:nth-child(5)]:border-r"
            >
              <span className="text-sm sm:text-base font-bold text-slate-400 leading-tight">
                {cell.label}
              </span>
              <span className={`text-xl sm:text-2xl font-black leading-tight mt-0.5 whitespace-nowrap ${cell.cls}`}>
                {cell.value}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

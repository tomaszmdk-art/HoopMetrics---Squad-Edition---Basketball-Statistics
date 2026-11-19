import React, { useMemo, useState } from 'react';
import { Match, Player } from '../types/basketball';
import { calculatePlayerStats } from '../services/statsCalculator';
import { getPlayerFullName } from '../services/playerDisplay';
import { playClickSound, triggerHaptic } from '../services/tts';
import { UserCheck, ArrowLeftRight } from 'lucide-react';

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
    <div className="w-full max-w-3xl mx-auto bg-slate-900 border border-slate-800 rounded-2xl p-2.5 sm:p-3 shadow-lg text-slate-100">
      {/* Compact Header Row: Player identity + status + Switch player */}
      <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-800">
        <div className="flex items-center gap-2 min-w-0">
          {trackedPlayer.photo ? (
            <img
              src={trackedPlayer.photo}
              alt={formatDisplayName(trackedPlayer)}
              className="w-8 h-8 rounded-lg object-cover border border-slate-700 shrink-0"
            />
          ) : (
            <div className="w-8 h-8 rounded-lg bg-amber-500/15 border border-amber-500/40 flex items-center justify-center font-mono tabular-nums font-black text-xs text-amber-400 shrink-0">
              #{trackedPlayer.number}
            </div>
          )}

          <div className="min-w-0">
            <div className="text-xs sm:text-sm font-black text-white truncate leading-tight">
              {formatDisplayName(trackedPlayer)}
            </div>
            <div className="text-[11px] text-slate-400 truncate leading-tight mt-0.5">
              <span className={isOnCourt ? 'text-emerald-400 font-semibold' : 'text-slate-400'}>
                {isOnCourt ? 'Na parkiecie' : 'Na ławce'}
              </span>
              {trackedPlayer.position ? ` · ${trackedPlayer.position}` : ''}
              {` · Faule: ${stats.fouls}/5`}
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={() => {
            playClickSound();
            setShowPicker(true);
          }}
          className="flex items-center gap-1.5 px-2.5 py-1.5 min-h-[36px] rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-bold transition active:scale-95 whitespace-nowrap shrink-0"
          title="Wybierz innego zawodnika do śledzenia"
        >
          <ArrowLeftRight className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          <span>Zmień</span>
        </button>
      </div>

      {/* Headline Metrics Row: PKT / EVAL / +/- */}
      <div className="grid grid-cols-3 divide-x divide-slate-800 py-2">
        <div className="flex flex-col items-center justify-center px-1">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
            Punkty
          </span>
          <span className="font-mono tabular-nums font-black text-xl sm:text-2xl text-amber-300 leading-tight mt-0.5">
            {stats.pts}
          </span>
        </div>

        <div className="flex flex-col items-center justify-center px-1">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
            EVAL
          </span>
          <span
            className={`font-mono tabular-nums font-black text-xl sm:text-2xl leading-tight mt-0.5 ${
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
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
            +/-
          </span>
          <span
            className={`font-mono tabular-nums font-black text-xl sm:text-2xl leading-tight mt-0.5 ${
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

      {/* Compact Box Score Line Table */}
      <div className="border-t border-slate-800 pt-2 overflow-x-auto scrollbar-none">
        <table className="w-full text-center font-mono tabular-nums border-collapse text-[11px]">
          <thead>
            <tr className="text-[10px] text-slate-400 font-semibold">
              <th className="px-1.5 py-0.5 font-semibold">2P</th>
              <th className="px-1.5 py-0.5 font-semibold">3P</th>
              <th className="px-1.5 py-0.5 font-semibold">FT</th>
              <th className="px-1.5 py-0.5 font-semibold">FG%</th>
              <th className="px-1.5 py-0.5 font-semibold">ZB</th>
              <th className="px-1.5 py-0.5 font-semibold">AS</th>
              <th className="px-1.5 py-0.5 font-semibold">PRZ</th>
              <th className="px-1.5 py-0.5 font-semibold">BLK</th>
              <th className="px-1.5 py-0.5 font-semibold">STR</th>
              <th className="px-1.5 py-0.5 font-semibold">PF</th>
            </tr>
          </thead>
          <tbody>
            <tr className="text-slate-100 font-bold">
              <td className="px-1.5 py-0.5 whitespace-nowrap">
                {stats.fg2m}/{stats.fg2a}
              </td>
              <td className="px-1.5 py-0.5 whitespace-nowrap">
                {stats.fg3m}/{stats.fg3a}
              </td>
              <td className="px-1.5 py-0.5 whitespace-nowrap">
                {stats.ftm}/{stats.fta}
              </td>
              <td className="px-1.5 py-0.5 whitespace-nowrap text-amber-300">
                {stats.fgPct}%
              </td>
              <td className="px-1.5 py-0.5 whitespace-nowrap" title={`Atak: ${stats.offReb} / Obrona: ${stats.defReb}`}>
                {stats.totReb}
              </td>
              <td className="px-1.5 py-0.5 whitespace-nowrap">{stats.ast}</td>
              <td className="px-1.5 py-0.5 whitespace-nowrap">{stats.stl}</td>
              <td className="px-1.5 py-0.5 whitespace-nowrap">{stats.blk}</td>
              <td className="px-1.5 py-0.5 whitespace-nowrap text-rose-300">{stats.tov}</td>
              <td className={`px-1.5 py-0.5 whitespace-nowrap ${stats.fouls >= 4 ? 'text-rose-400' : ''}`}>
                {stats.fouls}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
};

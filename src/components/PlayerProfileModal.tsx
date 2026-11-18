import React from 'react';
import { Player, Match } from '../types/basketball';
import { calculatePlayerStats } from '../services/statsCalculator';
import { X, Trophy, Flame, Target, Shield, Award, Calendar } from 'lucide-react';
import { playClickSound, triggerHaptic } from '../services/tts';
import { getPlayerFullName } from '../services/playerDisplay';

interface PlayerProfileModalProps {
  player: Player | null;
  matches: Match[];
  onClose: () => void;
}

export const PlayerProfileModal: React.FC<PlayerProfileModalProps> = ({
  player,
  matches,
  onClose,
}) => {
  if (!player) return null;

  // All matches in the active single-team workspace
  const categoryMatches = matches;

  // Calculate per-match stats for this player
  const playerGameLogs = categoryMatches
    .map((m) => {
      const isRostered = m.rosterPlayerIds?.includes(player.id);
      const hasEvents = m.events.some((e) => e.playerId === player.id);
      if (!isRostered && !hasEvents && m.events.length > 0) return null;

      const stats = calculatePlayerStats(player, m.events, m);
      return {
        match: m,
        stats,
      };
    })
    .filter((entry): entry is { match: Match; stats: ReturnType<typeof calculatePlayerStats> } => entry !== null);

  const gamesPlayed = playerGameLogs.length;
  const totalPoints = playerGameLogs.reduce((acc, g) => acc + g.stats.pts, 0);
  const totalPlusMinus = playerGameLogs.reduce((acc, g) => acc + g.stats.plusMinus, 0);
  const totalRebounds = playerGameLogs.reduce((acc, g) => acc + g.stats.totReb, 0);
  const totalAssists = playerGameLogs.reduce((acc, g) => acc + g.stats.ast, 0);
  const totalSteals = playerGameLogs.reduce((acc, g) => acc + g.stats.stl, 0);
  const totalBlocks = playerGameLogs.reduce((acc, g) => acc + g.stats.blk, 0);
  const totalEval = playerGameLogs.reduce((acc, g) => acc + g.stats.eval, 0);
  const highScore = playerGameLogs.reduce((max, g) => Math.max(max, g.stats.pts), 0);

  const ppg = gamesPlayed > 0 ? (totalPoints / gamesPlayed).toFixed(1) : '0.0';
  const plusMinusAvg = gamesPlayed > 0 ? (totalPlusMinus / gamesPlayed).toFixed(1) : '0.0';
  const rpg = gamesPlayed > 0 ? (totalRebounds / gamesPlayed).toFixed(1) : '0.0';
  const apg = gamesPlayed > 0 ? (totalAssists / gamesPlayed).toFixed(1) : '0.0';
  const evalAvg = gamesPlayed > 0 ? (totalEval / gamesPlayed).toFixed(1) : '0.0';

  const totalFgm = playerGameLogs.reduce((acc, g) => acc + g.stats.fgm, 0);
  const totalFga = playerGameLogs.reduce((acc, g) => acc + g.stats.fga, 0);
  const totalFtm = playerGameLogs.reduce((acc, g) => acc + g.stats.ftm, 0);
  const totalFta = playerGameLogs.reduce((acc, g) => acc + g.stats.fta, 0);

  const fgPct = totalFga > 0 ? Math.round((totalFgm / totalFga) * 100) : 0;
  const ftPct = totalFta > 0 ? Math.round((totalFtm / totalFta) * 100) : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/90 overflow-y-auto">
      <div className="w-full max-w-2xl max-h-[92vh] flex flex-col rounded-3xl bg-slate-900 border border-slate-800 shadow-2xl text-slate-100 overflow-hidden my-auto animate-in fade-in zoom-in-95 duration-150">
        {/* Header with Jersey & Name */}
        <div className="relative p-5 sm:p-6 bg-gradient-to-r from-slate-950 via-slate-900 to-amber-950/40 border-b border-slate-800 flex items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            {player.photo ? (
              <div className="relative w-16 h-16 sm:w-20 sm:h-20 rounded-2xl overflow-hidden shrink-0 border-2 border-amber-500/60 shadow-xl shadow-amber-950/40 bg-slate-950">
                <img
                  src={player.photo}
                  alt={getPlayerFullName(player)}
                  className="w-full h-full object-cover"
                />
                <span className="absolute bottom-0 right-0 bg-slate-950/90 text-amber-400 font-mono font-black text-xs px-1.5 py-0.5 rounded-tl-lg border-t border-l border-amber-500/40">
                  #{player.number}
                </span>
              </div>
            ) : (
              <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-slate-950 border-2 border-amber-500/50 flex flex-col items-center justify-center shadow-xl shadow-amber-950/40 shrink-0">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">NR</span>
                <span className="font-mono font-black text-2xl sm:text-3xl text-amber-400 leading-none">
                  {player.number}
                </span>
              </div>
            )}
            <div>
              <div className="flex items-center gap-2 mb-1">
                {player.teamCategory && player.teamCategory !== 'TEAM' && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-500/20 text-amber-400 border border-amber-500/40">
                    {player.teamCategory}
                  </span>
                )}
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-800 text-slate-300">
                  {player.position || 'ZAWODNIK'}
                </span>
              </div>
              <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">
                {getPlayerFullName(player)}
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Karta Zawodnika{player.teamCategory && player.teamCategory !== 'TEAM' ? ` • ${player.teamCategory}` : ''} • Sezon 2026/2027
              </p>
            </div>
          </div>

          <button
            onClick={() => {
              playClickSound();
              triggerHaptic(20);
              onClose();
            }}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body: Stats & Game Log */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">
          {/* Top Metric Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <div className="p-3 rounded-2xl bg-slate-950 border border-slate-800 text-center">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Średnia Punktów
              </span>
              <div className="text-2xl font-black font-mono text-amber-400 mt-0.5">{ppg}</div>
              <span className="text-[10px] text-slate-500">{totalPoints} pkt łącznie</span>
            </div>

            <div className="p-3 rounded-2xl bg-slate-950 border border-slate-800 text-center">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Średni Eval (FIBA)
              </span>
              <div className="text-2xl font-black font-mono text-emerald-400 mt-0.5">{evalAvg}</div>
              <span className="text-[10px] text-slate-500">{totalEval} łączny Eval</span>
            </div>

            <div className="p-3 rounded-2xl bg-slate-950 border border-slate-800 text-center">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Średnia Zbiórek
              </span>
              <div className="text-2xl font-black font-mono text-sky-400 mt-0.5">{rpg}</div>
              <span className="text-[10px] text-slate-500">{totalRebounds} zbiórek</span>
            </div>

            <div className="p-3 rounded-2xl bg-slate-950 border border-slate-800 text-center">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Mecze / Rekord
              </span>
              <div className="text-2xl font-black font-mono text-violet-400 mt-0.5">
                {gamesPlayed} <span className="text-xs font-normal text-slate-400">({highScore} max)</span>
              </div>
              <span className="text-[10px] text-slate-500">rozegranych spotkań</span>
            </div>
          </div>

          {/* Secondary stats row */}
          <div className="p-4 rounded-2xl bg-slate-950/70 border border-slate-800/80">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3 flex items-center gap-1.5">
              <Target className="w-3.5 h-3.5 text-amber-400" />
              <span>Skuteczność i elementy gry</span>
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-xs">
              <div>
                <span className="text-slate-400">Rzuty z gry:</span>
                <div className="font-bold text-white mt-0.5">
                  {fgPct}% <span className="text-[10px] text-slate-500 font-mono">({totalFgm}/{totalFga})</span>
                </div>
              </div>
              <div>
                <span className="text-slate-400">Rzuty wolne:</span>
                <div className="font-bold text-white mt-0.5">
                  {ftPct}% <span className="text-[10px] text-slate-500 font-mono">({totalFtm}/{totalFta})</span>
                </div>
              </div>
              <div>
                <span className="text-slate-400">Bilans +/- zespołu:</span>
                <div className={`font-bold mt-0.5 ${totalPlusMinus > 0 ? 'text-emerald-400' : totalPlusMinus < 0 ? 'text-rose-400' : 'text-slate-300'}`}>
                  {totalPlusMinus > 0 ? `+${totalPlusMinus}` : totalPlusMinus} <span className="text-[10px] text-slate-500 font-mono">({plusMinusAvg}/m)</span>
                </div>
              </div>
              <div>
                <span className="text-slate-400">Asysty / mecz:</span>
                <div className="font-bold text-white mt-0.5">
                  {apg} <span className="text-[10px] text-slate-500 font-mono">({totalAssists})</span>
                </div>
              </div>
              <div>
                <span className="text-slate-400">Przechwyty / Bloki:</span>
                <div className="font-bold text-white mt-0.5">
                  {totalSteals} / {totalBlocks}
                </div>
              </div>
            </div>
          </div>

          {/* Game Log Table */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2 flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-amber-400" />
              <span>Występy meczowe w sezonie ({playerGameLogs.length})</span>
            </h3>

            {playerGameLogs.length === 0 ? (
              <div className="p-6 text-center text-slate-500 bg-slate-950/40 rounded-2xl border border-slate-800">
                Brak zarejestrowanych meczów dla tego zawodnika.
              </div>
            ) : (
              <div className="overflow-x-auto rounded-2xl border border-slate-800">
                <table className="w-full text-left text-xs text-slate-300">
                  <thead className="bg-slate-950 text-[10px] uppercase font-bold text-slate-400 border-b border-slate-800">
                    <tr>
                      <th className="py-2.5 px-3">Mecz / Rywal</th>
                      <th className="py-2.5 px-2 text-center text-amber-400 font-bold">PTS</th>
                      <th className="py-2.5 px-2 text-center text-slate-300 font-bold">+/-</th>
                      <th className="py-2.5 px-2 text-center text-emerald-400 font-bold">EVAL</th>
                      <th className="py-2.5 px-2 text-center">REB</th>
                      <th className="py-2.5 px-2 text-center">AST</th>
                      <th className="py-2.5 px-2 text-center">STL</th>
                      <th className="py-2.5 px-2 text-center">FAULE</th>
                      <th className="py-2.5 px-2 text-center">WYNIK</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 bg-slate-900/50 font-mono">
                    {playerGameLogs.map(({ match, stats }) => (
                      <tr key={match.id} className="hover:bg-slate-800/40 transition">
                        <td className="py-2.5 px-3 font-sans">
                          <div className="font-bold text-white truncate max-w-[130px]">
                            vs {match.opponent}
                          </div>
                          <div className="text-[10px] text-slate-400 font-mono">{match.date}</div>
                        </td>
                        <td className="py-2.5 px-2 text-center font-black text-amber-300 text-sm">
                          {stats.pts}
                        </td>
                        <td
                          className={`py-2.5 px-2 text-center font-bold ${
                            stats.plusMinus > 0
                              ? 'text-emerald-400'
                              : stats.plusMinus < 0
                              ? 'text-rose-400'
                              : 'text-slate-400'
                          }`}
                        >
                          {stats.plusMinus > 0 ? `+${stats.plusMinus}` : stats.plusMinus}
                        </td>
                        <td className="py-2.5 px-2 text-center font-bold text-emerald-400">
                          {stats.eval}
                        </td>
                        <td className="py-2.5 px-2 text-center">{stats.totReb}</td>
                        <td className="py-2.5 px-2 text-center">{stats.ast}</td>
                        <td className="py-2.5 px-2 text-center">{stats.stl}</td>
                        <td className="py-2.5 px-2 text-center">{stats.fouls}</td>
                        <td className="py-2.5 px-2 text-center font-sans">
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                              match.ourScore > match.opponentScore
                                ? 'bg-emerald-500/20 text-emerald-300'
                                : 'bg-rose-500/20 text-rose-300'
                            }`}
                          >
                            {match.ourScore}:{match.opponentScore}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-3 sm:p-4 bg-slate-950 border-t border-slate-800 text-center">
          <button
            onClick={onClose}
            className="w-full py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs transition"
          >
            Zamknij podgląd karty zawodnika
          </button>
        </div>
      </div>
    </div>
  );
};

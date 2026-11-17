import React, { useState } from 'react';
import { Match, MatchEvent } from '../types/basketball';
import { X, Trash2, Download, AlertCircle, Clock, FileText, Loader2 } from 'lucide-react';
import { exportPlayByPlayCsv } from '../services/exportCsv';
import { exportPlayByPlayPdf } from '../services/exportPdf';
import { playClickSound, triggerHaptic } from '../services/tts';

interface PlayByPlayModalProps {
  isOpen: boolean;
  onClose: () => void;
  match: Match;
  onDeleteEvent?: (eventId: string) => void;
}

const ACTION_DESCRIPTIONS: Record<string, { label: string; badge: string }> = {
  '2PT_MADE': { label: 'Celny rzut za 2 punkty (+2)', badge: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40' },
  '2PT_MISS': { label: 'Niecelny rzut za 2 punkty', badge: 'bg-slate-800 text-slate-400 border-slate-700' },
  '3PT_MADE': { label: 'Celny rzut za 3 punkty (+3)', badge: 'bg-amber-500/20 text-amber-400 border-amber-500/40' },
  '3PT_MISS': { label: 'Niecelny rzut za 3 punkty', badge: 'bg-slate-800 text-slate-400 border-slate-700' },
  'FT_MADE': { label: 'Celny rzut wolny (+1)', badge: 'bg-teal-500/20 text-teal-400 border-teal-500/40' },
  'FT_MISS': { label: 'Niecelny rzut wolny', badge: 'bg-slate-800 text-slate-400 border-slate-700' },
  'OFF_REB': { label: 'Zbiórka ofensywna (w ataku)', badge: 'bg-blue-500/20 text-blue-400 border-blue-500/40' },
  'DEF_REB': { label: 'Zbiórka defensywna (w obronie)', badge: 'bg-indigo-500/20 text-indigo-400 border-indigo-500/40' },
  'ASSIST': { label: 'Asysta', badge: 'bg-sky-500/20 text-sky-400 border-sky-500/40' },
  'STEAL': { label: 'Przechwyt', badge: 'bg-violet-500/20 text-violet-400 border-violet-500/40' },
  'BLOCK': { label: 'Blok', badge: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/40' },
  'TURNOVER': { label: 'Strata piłki', badge: 'bg-amber-500/20 text-amber-400 border-amber-500/40' },
  'FOUL': { label: 'Faul osobisty', badge: 'bg-rose-500/20 text-rose-400 border-rose-500/40' },
  'OPP_1PT': { label: 'Punkt dla przeciwnika (+1)', badge: 'bg-orange-500/20 text-orange-400 border-orange-500/40' },
  'OPP_2PT': { label: 'Kosz dla przeciwnika (+2)', badge: 'bg-orange-500/20 text-orange-400 border-orange-500/40' },
  'OPP_3PT': { label: 'Trójka dla przeciwnika (+3)', badge: 'bg-orange-500/20 text-orange-400 border-orange-500/40' },
  'OPP_MINUS_1': { label: 'Korekta punktów przeciwnika (-1)', badge: 'bg-slate-800 text-slate-400 border-slate-700' },
  'OPP_FOUL': { label: 'Faul przeciwnika', badge: 'bg-rose-500/20 text-rose-400 border-rose-500/40' },
  'MANUAL_OUR_PLUS_1': { label: 'Ręczna korekta UKS (+1)', badge: 'bg-amber-500/20 text-amber-400 border-amber-500/40' },
  'MANUAL_OUR_PLUS_2': { label: 'Ręczna korekta UKS (+2)', badge: 'bg-amber-500/20 text-amber-400 border-amber-500/40' },
  'MANUAL_OUR_PLUS_3': { label: 'Ręczna korekta UKS (+3)', badge: 'bg-amber-500/20 text-amber-400 border-amber-500/40' },
  'MANUAL_OUR_MINUS_1': { label: 'Ręczna korekta UKS (-1)', badge: 'bg-slate-800 text-slate-400 border-slate-700' },
};

export const PlayByPlayModal: React.FC<PlayByPlayModalProps> = ({
  isOpen,
  onClose,
  match,
  onDeleteEvent,
}) => {
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [selectedPlayerId, setSelectedPlayerId] = useState<string>('all');
  const [selectedQuarter, setSelectedQuarter] = useState<number | 'all'>('all');

  // Extract all unique players who have recorded events
  const playersWithEvents = React.useMemo(() => {
    if (!match?.events) return [];
    const map = new Map<string, { id: string; name: string; number?: number; count: number }>();
    match.events.forEach((e) => {
      if (e.playerId && e.playerName) {
        const existing = map.get(e.playerId);
        if (existing) {
          existing.count += 1;
        } else {
          map.set(e.playerId, {
            id: e.playerId,
            name: e.playerName,
            number: e.playerNumber,
            count: 1,
          });
        }
      }
    });
    return Array.from(map.values()).sort((a, b) => (a.number ?? 99) - (b.number ?? 99));
  }, [match?.events]);

  const filteredEvents = React.useMemo(() => {
    if (!match?.events) return [];
    return [...match.events]
      .reverse()
      .filter((e) => {
        if (selectedQuarter !== 'all' && e.quarter !== selectedQuarter) return false;
        if (selectedPlayerId !== 'all' && e.playerId !== selectedPlayerId) return false;
        return true;
      });
  }, [match?.events, selectedQuarter, selectedPlayerId]);

  const handleDelete = (id: string) => {
    playClickSound();
    triggerHaptic(30);
    if (onDeleteEvent) {
      onDeleteEvent(id);
    }
  };

  const handleExportPdf = async () => {
    if (!match) return;
    setIsExportingPdf(true);
    playClickSound();
    triggerHaptic(30);
    try {
      await exportPlayByPlayPdf(match);
    } catch (err) {
      console.error('Błąd eksportu Play-by-Play PDF:', err);
    } finally {
      setIsExportingPdf(false);
    }
  };

  if (!isOpen || !match) return null;

  const quarters = [1, 2, 3, 4, 5];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/90">
      <div className="w-full max-w-2xl max-h-[90vh] flex flex-col rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl text-slate-100 overflow-hidden">
        {/* Modal Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-800 bg-slate-950/60">
          <div>
            <h3 className="text-base sm:text-lg font-bold text-white">
              Protokół zdarzeń (Play-by-Play)
            </h3>
            <p className="text-xs text-slate-400">
              {filteredEvents.length === match.events.length
                ? `Pełna lista: ${match.events.length} akcji w meczu`
                : `Wyświetlono ${filteredEvents.length} z ${match.events.length} akcji (przefiltrowane)`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleExportPdf}
              disabled={isExportingPdf || match.events.length === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-black transition active:scale-95 disabled:opacity-50 shadow-sm"
              title="Eksportuj protokół Play-by-Play do PDF"
            >
              {isExportingPdf ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <FileText className="w-3.5 h-3.5 stroke-[2.5]" />
              )}
              <span>PDF</span>
            </button>
            <button
              onClick={() => exportPlayByPlayCsv(match)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition"
              title="Eksportuj protokół do CSV"
            >
              <Download className="w-3.5 h-3.5 text-slate-400" />
              <span>CSV</span>
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Filters Bar: Select Player and Quarter */}
        <div className="p-3 bg-slate-950/80 border-b border-slate-800/80 flex items-center justify-between gap-2.5 flex-wrap">
          {/* Player Selector */}
          <div className="flex-1 min-w-[200px]">
            <select
              value={selectedPlayerId}
              onChange={(e) => setSelectedPlayerId(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 text-slate-200 text-xs font-semibold rounded-xl px-2.5 py-1.5 focus:outline-none focus:border-amber-400"
            >
              <option value="all">Wszyscy zawodnicy ({match.events.length} akcji)</option>
              {playersWithEvents.map((p) => (
                <option key={p.id} value={p.id}>
                  #{p.number} {p.name} (pełna lista: {p.count} akcji)
                </option>
              ))}
            </select>
          </div>

          {/* Quarter Pills */}
          <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-xl border border-slate-800 shrink-0">
            <button
              onClick={() => setSelectedQuarter('all')}
              className={`px-2 py-0.5 rounded-lg text-[10px] font-bold transition ${
                selectedQuarter === 'all'
                  ? 'bg-amber-500 text-slate-950 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Wszystkie
            </button>
            {quarters.map((q) => (
              <button
                key={q}
                onClick={() => setSelectedQuarter(q)}
                className={`px-2 py-0.5 rounded-lg text-[10px] font-bold transition ${
                  selectedQuarter === q
                    ? 'bg-amber-500 text-slate-950 shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {q === 5 ? 'OT' : `Q${q}`}
              </button>
            ))}
          </div>
        </div>

        {/* Events List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {filteredEvents.length === 0 ? (
            <div className="py-12 text-center text-slate-500">
              <Clock className="w-10 h-10 mx-auto mb-2 opacity-30" />
              <p className="text-sm font-semibold">Brak zarejestrowanych akcji w tym meczu.</p>
              <p className="text-xs text-slate-600 mt-1">
                Wybierz gracza i zarejestruj rzut, zbiórkę lub faul.
              </p>
            </div>
          ) : (
            filteredEvents.map((e, idx) => {
              const meta = ACTION_DESCRIPTIONS[e.type] || {
                label: e.type,
                badge: 'bg-slate-800 text-slate-300 border-slate-700',
              };

              return (
                <div
                  key={e.id}
                  className="flex items-center justify-between gap-3 p-2.5 rounded-xl bg-slate-950/70 border border-slate-800/80 hover:border-slate-700 transition"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    {/* Quarter & Time tag */}
                    <div className="flex flex-col items-center justify-center bg-slate-900 px-2 py-1 rounded-lg border border-slate-800 shrink-0 font-mono text-center">
                      <span className="text-[10px] text-amber-400 font-bold leading-none">
                        Q{e.quarter}
                      </span>
                      <span className="text-xs text-slate-300 font-semibold leading-none mt-0.5">
                        {e.gameClock}
                      </span>
                    </div>

                    {/* Action & Player info */}
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        {e.playerNumber !== undefined ? (
                          <span className="font-mono font-bold text-amber-400 text-xs">
                            #{e.playerNumber} {e.playerName}
                          </span>
                        ) : (
                          <span className="text-xs font-semibold text-slate-400">
                            {e.type.startsWith('OPP_') ? 'Przeciwnik' : 'Drużyna'}
                          </span>
                        )}

                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${meta.badge}`}
                        >
                          {meta.label}
                        </span>

                        {e.subType && (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-amber-500/15 text-amber-300 border border-amber-500/30 flex items-center gap-1">
                            <span>↳</span>
                            <span>{e.subType}</span>
                          </span>
                        )}
                      </div>

                      {e.assistedByPlayerName && (
                        <div className="text-[10px] text-sky-400 font-medium mt-0.5">
                          ↳ Asysta: {e.assistedByPlayerName}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Score after action and delete button */}
                  <div className="flex items-center gap-3 shrink-0">
                    <div className="font-mono text-xs font-bold text-slate-300 bg-slate-900 px-2 py-1 rounded-lg border border-slate-800">
                      {e.ourScoreAfter} : {e.oppScoreAfter}
                    </div>

                    {onDeleteEvent && (
                      <button
                        onClick={() => handleDelete(e.id)}
                        className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition"
                        title="Usuń to zdarzenie (przelicz wynik)"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-3 border-t border-slate-800 bg-slate-950/60 flex items-center justify-between text-xs text-slate-400">
          <span>
            {onDeleteEvent
              ? 'Usunięcie akcji natychmiast przelicza wynik i statystyki meczu.'
              : 'Protokół meczowy na żywo (Tylko do odczytu).'}
          </span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-semibold transition"
          >
            Zamknij
          </button>
        </div>
      </div>
    </div>
  );
};

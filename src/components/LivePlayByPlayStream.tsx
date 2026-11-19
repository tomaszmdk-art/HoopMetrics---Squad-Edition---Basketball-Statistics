import React, { useState, useMemo } from 'react';
import { ClubProfile, Match, Player } from '../types/basketball';
import {
  FileText,
  Download,
  Clock,
  ListOrdered,
  Loader2,
  Shield,
  UserCheck,
  Menu,
  X,
  RotateCcw,
} from 'lucide-react';
import { exportPlayByPlayPdf } from '../services/exportPdf';
import { exportPlayByPlayCsv } from '../services/exportCsv';
import { playClickSound, triggerHaptic } from '../services/tts';
import {
  findPlayerForEvent,
  getPlayerFullName,
  hasAnyPersonalData,
  resolveEventAssistLabel,
  resolveEventPlayerLabel,
} from '../services/playerDisplay';

interface LivePlayByPlayStreamProps {
  match: Match;
  clubProfile?: ClubProfile;
  rosterPlayers?: Player[];
  readOnly?: boolean;
}

const ACTION_DESCRIPTIONS: Record<
  string,
  {
    label: string;
    badge: string;
    category: 'score' | 'rebound' | 'foul' | 'turnover' | 'defense' | 'assist';
  }
> = {
  '2PT_MADE': {
    label: 'Celny rzut za 2 punkty (+2)',
    badge: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40',
    category: 'score',
  },
  '2PT_MISS': {
    label: 'Niecelny rzut za 2 punkty',
    badge: 'bg-slate-800 text-slate-400 border-slate-700',
    category: 'score',
  },
  '3PT_MADE': {
    label: 'Celny rzut za 3 punkty (+3)',
    badge: 'bg-amber-500/20 text-amber-400 border-amber-500/40',
    category: 'score',
  },
  '3PT_MISS': {
    label: 'Niecelny rzut za 3 punkty',
    badge: 'bg-slate-800 text-slate-400 border-slate-700',
    category: 'score',
  },
  'FT_MADE': {
    label: 'Celny rzut wolny (+1)',
    badge: 'bg-teal-500/20 text-teal-400 border-teal-500/40',
    category: 'score',
  },
  'FT_MISS': {
    label: 'Niecelny rzut wolny',
    badge: 'bg-slate-800 text-slate-400 border-slate-700',
    category: 'score',
  },
  'OFF_REB': {
    label: 'Zbiórka w ataku (ofensywna)',
    badge: 'bg-blue-500/20 text-blue-400 border-blue-500/40',
    category: 'rebound',
  },
  'DEF_REB': {
    label: 'Zbiórka w obronie (defensywna)',
    badge: 'bg-indigo-500/20 text-indigo-400 border-indigo-500/40',
    category: 'rebound',
  },
  'ASSIST': {
    label: 'Asysta',
    badge: 'bg-sky-500/20 text-sky-400 border-sky-500/40',
    category: 'assist',
  },
  'STEAL': {
    label: 'Przechwyt piłki',
    badge: 'bg-violet-500/20 text-violet-400 border-violet-500/40',
    category: 'defense',
  },
  'BLOCK': {
    label: 'Blok rzutu',
    badge: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/40',
    category: 'defense',
  },
  'TURNOVER': {
    label: 'Strata piłki',
    badge: 'bg-amber-500/20 text-amber-400 border-amber-500/40',
    category: 'turnover',
  },
  'FOUL': {
    label: 'Faul osobisty',
    badge: 'bg-rose-500/20 text-rose-400 border-rose-500/40',
    category: 'foul',
  },
  'OPP_1PT': {
    label: 'Punkt przeciwnika (+1)',
    badge: 'bg-orange-500/20 text-orange-400 border-orange-500/40',
    category: 'score',
  },
  'OPP_2PT': {
    label: 'Kosz przeciwnika (+2)',
    badge: 'bg-orange-500/20 text-orange-400 border-orange-500/40',
    category: 'score',
  },
  'OPP_3PT': {
    label: 'Trójka przeciwnika (+3)',
    badge: 'bg-orange-500/20 text-orange-400 border-orange-500/40',
    category: 'score',
  },
  'OPP_MINUS_1': {
    label: 'Korekta punktów przeciwnika (-1)',
    badge: 'bg-slate-800 text-slate-400 border-slate-700',
    category: 'score',
  },
  'OPP_FOUL': {
    label: 'Faul przeciwnika',
    badge: 'bg-rose-500/20 text-rose-400 border-rose-500/40',
    category: 'foul',
  },
  'MANUAL_OUR_PLUS_1': {
    label: 'Korekta punktowa (+1)',
    badge: 'bg-amber-500/20 text-amber-400 border-amber-500/40',
    category: 'score',
  },
  'MANUAL_OUR_PLUS_2': {
    label: 'Korekta punktowa (+2)',
    badge: 'bg-amber-500/20 text-amber-400 border-amber-500/40',
    category: 'score',
  },
  'MANUAL_OUR_PLUS_3': {
    label: 'Korekta punktowa (+3)',
    badge: 'bg-amber-500/20 text-amber-400 border-amber-500/40',
    category: 'score',
  },
  'MANUAL_OUR_MINUS_1': {
    label: 'Korekta punktowa (-1)',
    badge: 'bg-slate-800 text-slate-400 border-slate-700',
    category: 'score',
  },
};

export const LivePlayByPlayStream: React.FC<LivePlayByPlayStreamProps> = ({
  match,
  clubProfile,
  rosterPlayers = [],
}) => {
  const [selectedQuarter, setSelectedQuarter] = useState<number | 'all'>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedPlayerId, setSelectedPlayerId] = useState<string>('all');
  const [isFiltersMenuOpen, setIsFiltersMenuOpen] = useState<boolean>(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [includePersonalData, setIncludePersonalData] = useState(false);
  const hasPii = hasAnyPersonalData(rosterPlayers);

  const clubName = clubProfile?.shortName || clubProfile?.name || 'Nasz Zespół';
  const oppName = match.opponent || 'Rywal';

  // Available quarters in the match
  const quartersInMatch = useMemo(() => {
    const quarters = new Set<number>();
    match.events.forEach((e) => quarters.add(e.quarter));
    quarters.add(match.currentQuarter);
    return Array.from(quarters).sort((a, b) => a - b);
  }, [match.events, match.currentQuarter]);

  // Players present in events for optional player filter inside hamburger menu
  const playersWithEvents = useMemo(() => {
    const map = new Map<string, { id: string; label: string; number?: number; count: number }>();
    match.events.forEach((e) => {
      if (e.team === 'our' && (e.playerId || e.playerNumber !== undefined)) {
        const key = e.playerId || `num-${e.playerNumber}`;
        const existing = map.get(key);
        if (existing) {
          existing.count += 1;
        } else {
          const matched = findPlayerForEvent(e, rosterPlayers);
          const fullName = matched ? getPlayerFullName(matched) : undefined;
          const num = matched?.number ?? e.playerNumber;
          const label =
            fullName && !fullName.startsWith('Zawodnik #') && num !== undefined
              ? `#${num} ${fullName}`
              : fullName || (num !== undefined ? `Zawodnik #${num}` : 'Zawodnik');
          map.set(key, { id: key, label, number: num, count: 1 });
        }
      }
    });
    return Array.from(map.values()).sort((a, b) => (a.number ?? 99) - (b.number ?? 99));
  }, [match.events, rosterPlayers]);

  // Filtered events
  const filteredEvents = useMemo(() => {
    return [...match.events]
      .reverse()
      .filter((e) => {
        if (selectedQuarter !== 'all' && e.quarter !== selectedQuarter) return false;
        if (selectedPlayerId !== 'all') {
          if (selectedPlayerId.startsWith('num-')) {
            const num = Number(selectedPlayerId.slice(4));
            if (e.playerNumber !== num || e.team !== 'our') return false;
          } else if (e.playerId !== selectedPlayerId) {
            return false;
          }
        }
        if (selectedCategory !== 'all') {
          const meta = ACTION_DESCRIPTIONS[e.type];
          if (!meta || meta.category !== selectedCategory) return false;
        }
        return true;
      });
  }, [match.events, selectedQuarter, selectedCategory, selectedPlayerId]);

  // Quick stats by quarter
  const quarterBreakdown = useMemo(() => {
    const res: Record<number, { eventsCount: number; ourPoints: number; oppPoints: number }> = {};
    for (const q of quartersInMatch) {
      res[q] = { eventsCount: 0, ourPoints: 0, oppPoints: 0 };
    }
    for (const e of match.events) {
      if (!res[e.quarter]) {
        res[e.quarter] = { eventsCount: 0, ourPoints: 0, oppPoints: 0 };
      }
      res[e.quarter].eventsCount++;
      if (e.team === 'our') {
        res[e.quarter].ourPoints += e.points;
      } else {
        res[e.quarter].oppPoints += e.points;
      }
    }
    return res;
  }, [match.events, quartersInMatch]);

  const activeFilterCount =
    (selectedQuarter !== 'all' ? 1 : 0) +
    (selectedCategory !== 'all' ? 1 : 0) +
    (selectedPlayerId !== 'all' ? 1 : 0);

  const handleResetFilters = () => {
    playClickSound();
    setSelectedQuarter('all');
    setSelectedCategory('all');
    setSelectedPlayerId('all');
  };

  const handleExportPdf = async () => {
    setIsExportingPdf(true);
    playClickSound();
    triggerHaptic(30);
    try {
      await exportPlayByPlayPdf(match, rosterPlayers, { includePersonalData });
    } catch (err) {
      console.error('Błąd eksportu PDF:', err);
    } finally {
      setIsExportingPdf(false);
    }
  };

  const handleExportCsv = () => {
    playClickSound();
    triggerHaptic(25);
    exportPlayByPlayCsv(match, rosterPlayers, includePersonalData);
  };

  return (
    <div className="bg-slate-900/80 rounded-2xl border border-slate-800 shadow-2xl p-3 sm:p-4 text-slate-100 space-y-3">
      {/* Compact Header Strip with Hamburger Filter Trigger */}
      <div className="flex items-center justify-between gap-3 pb-3 border-b border-slate-800">
        <div className="min-w-0">
          <h3 className="text-sm sm:text-base font-black text-white tracking-tight flex items-center gap-2 truncate">
            <ListOrdered className="w-4 h-4 text-amber-400 shrink-0" />
            <span className="truncate">Protokół Meczowy na Żywo</span>
          </h3>
          <p className="text-[11px] text-slate-400 mt-0.5 tabular-nums truncate">
            {match.status === 'finished' ? 'Mecz zakończony' : 'Relacja live'} ·{' '}
            {activeFilterCount > 0
              ? `Wyświetlono ${filteredEvents.length} z ${match.events.length} akcji`
              : `${match.events.length} akcji`}
          </p>
        </div>

        {/* Hamburger Menu Button for All Filters */}
        <button
          type="button"
          onClick={() => {
            playClickSound();
            setIsFiltersMenuOpen((prev) => !prev);
          }}
          aria-expanded={isFiltersMenuOpen}
          className={`flex items-center gap-1.5 px-3 py-2 min-h-[40px] rounded-xl text-xs font-bold border transition active:scale-95 whitespace-nowrap shrink-0 ${
            isFiltersMenuOpen || activeFilterCount > 0
              ? 'bg-amber-500/20 text-amber-300 border-amber-500/50'
              : 'bg-slate-950 hover:bg-slate-800 text-slate-200 border-slate-700'
          }`}
          title="Otwórz menu filtrowania akcji meczu"
        >
          {isFiltersMenuOpen ? (
            <X className="w-4 h-4 shrink-0" />
          ) : (
            <Menu className="w-4 h-4 shrink-0" />
          )}
          <span>Filtry{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}</span>
        </button>
      </div>

      {/* Collapsible Hamburger Filters Menu */}
      {isFiltersMenuOpen && (
        <div className="p-3 sm:p-4 rounded-xl bg-slate-950/90 border border-slate-800 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-bold text-slate-200">
              Filtrowanie protokołu akcji
            </span>
            {activeFilterCount > 0 && (
              <button
                type="button"
                onClick={handleResetFilters}
                className="flex items-center gap-1 text-[11px] font-bold text-amber-400 hover:text-amber-300 transition whitespace-nowrap"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Wyczyść filtry</span>
              </button>
            )}
          </div>

          {/* Filter 1: Quarters */}
          <div className="space-y-1.5">
            <span className="text-[11px] font-semibold text-slate-400 block">
              Kwarta:
            </span>
            <div className="flex items-center gap-1.5 flex-wrap">
              <button
                type="button"
                onClick={() => {
                  playClickSound();
                  setSelectedQuarter('all');
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition whitespace-nowrap shrink-0 border ${
                  selectedQuarter === 'all'
                    ? 'bg-amber-500 text-slate-950 border-amber-400'
                    : 'bg-slate-900 text-slate-400 hover:text-white border-slate-800'
                }`}
              >
                Wszystkie ({match.events.length})
              </button>

              {quartersInMatch.map((q) => {
                const label = q > 4 ? 'OT' : `Q${q}`;
                const stats = quarterBreakdown[q];
                const isSelected = selectedQuarter === q;
                return (
                  <button
                    type="button"
                    key={q}
                    onClick={() => {
                      playClickSound();
                      setSelectedQuarter(q);
                    }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition whitespace-nowrap shrink-0 border font-mono tabular-nums ${
                      isSelected
                        ? 'bg-amber-500 text-slate-950 border-amber-400'
                        : 'bg-slate-900 text-slate-300 hover:text-white border-slate-800'
                    }`}
                  >
                    {label} ({stats?.eventsCount || 0})
                  </button>
                );
              })}
            </div>
          </div>

          {/* Filter 2: Action Category */}
          <div className="space-y-1.5">
            <span className="text-[11px] font-semibold text-slate-400 block">
              Rodzaj akcji:
            </span>
            <div className="flex items-center gap-1.5 flex-wrap">
              {[
                { id: 'all', label: 'Wszystkie' },
                { id: 'score', label: 'Kosze & Punkty' },
                { id: 'foul', label: 'Faule' },
                { id: 'turnover', label: 'Straty' },
                { id: 'assist', label: 'Asysty' },
                { id: 'rebound', label: 'Zbiórki' },
                { id: 'defense', label: 'Obrona' },
              ].map((cat) => (
                <button
                  type="button"
                  key={cat.id}
                  onClick={() => {
                    playClickSound();
                    setSelectedCategory(cat.id);
                  }}
                  className={`px-2.5 py-1.5 rounded-lg font-semibold text-xs whitespace-nowrap shrink-0 transition border ${
                    selectedCategory === cat.id
                      ? 'bg-amber-500 text-slate-950 border-amber-400 font-bold'
                      : 'bg-slate-900 text-slate-300 hover:text-white border-slate-800'
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>
          </div>

          {/* Filter 3: Player */}
          {playersWithEvents.length > 0 && (
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold text-slate-400 block">
                Zawodnik:
              </label>
              <select
                value={selectedPlayerId}
                onChange={(e) => {
                  playClickSound();
                  setSelectedPlayerId(e.target.value);
                }}
                className="w-full sm:w-auto min-w-[220px] bg-slate-900 border border-slate-700 text-slate-200 text-xs font-semibold rounded-xl px-3 py-2 focus:outline-none focus:border-amber-400"
              >
                <option value="all">Wszyscy zawodnicy ({match.events.length} akcji)</option>
                {playersWithEvents.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label} ({p.count} akcji)
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      )}

      {/* Events List Stream */}
      <div className="space-y-2">
        {filteredEvents.length === 0 ? (
          <div className="py-12 text-center text-slate-500 rounded-xl bg-slate-950/40 border border-slate-800/60 p-4">
            <Clock className="w-9 h-9 mx-auto mb-2 opacity-30 text-amber-400" />
            <p className="text-sm font-bold text-slate-300">
              {match.events.length === 0
                ? 'Oczekiwanie na pierwsze akcje z parkietu...'
                : 'Brak zarejestrowanych akcji spełniających wybrane kryteria filtrów.'}
            </p>
            <p className="text-xs text-slate-500 mt-1">
              Gdy trener zarejestruje zdarzenie na boisku, natychmiast pojawi się w tym protokole na żywo.
            </p>
          </div>
        ) : (
          <div className="space-y-2 max-h-[600px] overflow-y-auto pr-1">
            {filteredEvents.map((e, index) => {
              const meta = ACTION_DESCRIPTIONS[e.type] || {
                label: e.type.replace('_', ' '),
                badge: 'bg-slate-800 text-slate-300 border-slate-700',
                category: 'score',
              };
              const isScoreAction = e.points > 0;
              const isRecent = index === 0;

              return (
                <div
                  key={e.id}
                  className={`p-3 rounded-xl border transition flex items-center justify-between gap-3 ${
                    isRecent
                      ? 'bg-slate-950/95 border-amber-500/50 ring-1 ring-amber-500/30 shadow-md'
                      : 'bg-slate-950/70 border-slate-800/80 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    {/* Quarter & Game Clock */}
                    <div className="flex flex-col items-center justify-center bg-slate-900 px-2 py-1 rounded-lg border border-slate-800 shrink-0 font-mono tabular-nums text-center min-w-[46px]">
                      <span className="text-[10px] text-amber-400 font-bold leading-none">
                        {e.quarter > 4 ? 'OT' : `Q${e.quarter}`}
                      </span>
                      <span className="text-xs text-slate-300 font-semibold leading-none mt-1">
                        {e.gameClock}
                      </span>
                    </div>

                    {/* Action & Player Details */}
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        {e.playerId || e.playerNumber !== undefined ? (
                          <span className="font-mono font-black text-amber-400 text-xs sm:text-sm">
                            {resolveEventPlayerLabel(e, rosterPlayers, true)}
                          </span>
                        ) : (
                          <span className="text-xs font-bold text-slate-300">
                            {e.team === 'our' ? clubName : oppName}
                          </span>
                        )}

                        <span
                          className={`text-[10px] sm:text-[11px] font-bold px-2 py-0.5 rounded-md border ${meta.badge}`}
                        >
                          {meta.label}
                        </span>

                        {e.subType && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-300 border border-amber-500/35">
                            {e.subType}
                          </span>
                        )}

                        {isRecent && (
                          <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wide">
                            · Najnowsze
                          </span>
                        )}
                      </div>

                      {(() => {
                        const assistLabel = resolveEventAssistLabel(e, rosterPlayers, true);
                        if (!assistLabel) return null;
                        return (
                          <div className="text-[11px] text-sky-400 font-medium">
                            Asysta: <strong className="text-sky-300">{assistLabel}</strong>
                          </div>
                        );
                      })()}
                    </div>
                  </div>

                  {/* Score after event */}
                  <div className="flex items-center gap-2 shrink-0">
                    <div className="text-right">
                      <div className="font-mono tabular-nums text-xs sm:text-sm font-black text-white bg-slate-900 px-2.5 py-1 rounded-lg border border-slate-800 shadow-inner flex items-center gap-1.5">
                        <span className="text-amber-400">{e.ourScoreAfter}</span>
                        <span className="text-slate-600">:</span>
                        <span className="text-slate-200">{e.oppScoreAfter}</span>
                      </div>
                      {isScoreAction && (
                        <span className="text-[9px] font-bold text-emerald-400 font-mono tabular-nums block mt-0.5">
                          +{e.points} pkt
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Bottom Export Bar (Moved to bottom of protocol panel) */}
      <div className="pt-3 border-t border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex flex-col items-start gap-1">
          <div className="inline-flex items-center gap-1 p-0.5 rounded-xl bg-slate-950 border border-slate-800">
            <button
              type="button"
              onClick={() => setIncludePersonalData(false)}
              className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition whitespace-nowrap shrink-0 ${
                !includePersonalData
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                  : 'text-slate-400 hover:text-slate-200 border border-transparent'
              }`}
            >
              <Shield className="w-3 h-3 shrink-0" />
              <span>Zanonimizowany (nr)</span>
            </button>
            <button
              type="button"
              onClick={() => setIncludePersonalData(true)}
              className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition whitespace-nowrap shrink-0 ${
                includePersonalData
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                  : 'text-slate-400 hover:text-slate-200 border border-transparent'
              }`}
            >
              <UserCheck className="w-3 h-3 shrink-0" />
              <span>Pełny (nazwiska)</span>
            </button>
          </div>
          {includePersonalData && !hasPii && (
            <span className="text-[10px] text-amber-300/90">
              Brak lokalnych nazwisk — uzupełnij skład w zakładce Kadra.
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={handleExportPdf}
            disabled={isExportingPdf || match.events.length === 0}
            className="flex items-center gap-1.5 px-4 py-2 min-h-[40px] rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs transition active:scale-95 shadow-md shadow-amber-950/30 disabled:opacity-50 cursor-pointer whitespace-nowrap shrink-0"
            title="Pobierz oficjalny protokół meczu w formacie PDF"
          >
            {isExportingPdf ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
            ) : (
              <FileText className="w-3.5 h-3.5 shrink-0" />
            )}
            <span>Pobierz PDF</span>
          </button>

          <button
            type="button"
            onClick={handleExportCsv}
            disabled={match.events.length === 0}
            className="flex items-center gap-1.5 px-4 py-2 min-h-[40px] rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-bold text-xs transition active:scale-95 disabled:opacity-50 cursor-pointer whitespace-nowrap shrink-0"
            title="Eksportuj protokół do pliku Excel / CSV"
          >
            <Download className="w-3.5 h-3.5 text-sky-400 shrink-0" />
            <span>CSV</span>
          </button>
        </div>
      </div>

      {/* Protocol Footer Note */}
      <div className="pt-2 border-t border-slate-800/60 flex items-center justify-between text-[11px] text-slate-500 flex-wrap gap-2">
        <span>Oficjalny protokół generowany w czasie rzeczywistym</span>
        <span className="font-mono">BasketStats Pro</span>
      </div>
    </div>
  );
};

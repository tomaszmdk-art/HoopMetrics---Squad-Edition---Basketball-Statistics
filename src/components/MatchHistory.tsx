import React, { useState, useMemo } from 'react';
import { ClubProfile, Match, Player, TeamCategory, DEFAULT_SEASONS, getMatchSeason } from '../types/basketball';
import { calculateSeasonAverages } from '../services/statsCalculator';
import { exportSeasonStatsCsv, exportMatchBoxScoreCsv } from '../services/exportCsv';
import { exportMatchPdf } from '../services/exportPdf';
import { BoxScoreTable } from './BoxScoreTable';
import { PlayByPlayModal } from './PlayByPlayModal';
import {
  Trophy,
  Calendar,
  Users,
  Download,
  Trash2,
  Eye,
  BarChart2,
  GitCompare,
  TrendingUp,
  X,
  PlayCircle,
  AlertTriangle,
  RefreshCw,
  Smartphone,
  CloudDownload,
  FileText,
  ArrowUpDown,
  Edit3,
  Mail,
  Filter,
  CheckCircle2,
  Layers,
} from 'lucide-react';
import { playClickSound, triggerHaptic } from '../services/tts';
import { useLanguage } from '../i18n/LanguageContext';
import { ResumeMatchConfirmModal } from './ResumeMatchConfirmModal';

interface MatchHistoryProps {
  matches: Match[];
  players: Player[];
  activeCategory?: TeamCategory;
  onSelectCategory?: (cat: TeamCategory) => void;
  clubProfile?: ClubProfile;
  onResumeMatch?: (match: Match) => void;
  onDeleteMatch?: (id: string) => Promise<void>;
  readOnly?: boolean;
  onGoToLive?: () => void;
  onOpenTransferModal?: () => void;
  onOpenTeamExport?: () => void;
}

export const MatchHistory: React.FC<MatchHistoryProps> = ({
  matches,
  players,
  clubProfile,
  onResumeMatch,
  onDeleteMatch,
  readOnly = false,
  onGoToLive,
  onOpenTransferModal,
  onOpenTeamExport,
}) => {
  const { t } = useLanguage();
  const [activeTab, setActiveTab] = useState<'matches' | 'averages' | 'compare'>('matches');
  const [viewingMatch, setViewingMatch] = useState<Match | null>(null);
  const [viewingPlayByPlay, setViewingPlayByPlay] = useState<Match | null>(null);
  const [matchToResumeConfirm, setMatchToResumeConfirm] = useState<Match | null>(null);

  // Season filter & Match sorting state
  const [selectedSeason, setSelectedSeason] = useState<string>('all');
  type MatchSortOption = 'date-desc' | 'date-asc' | 'diff-desc' | 'pts-desc' | 'opp-asc';
  const [matchSortOption, setMatchSortOption] = useState<MatchSortOption>('date-desc');

  // Player comparison state
  const [comparePlayer1Id, setComparePlayer1Id] = useState<string>('');
  const [comparePlayer2Id, setComparePlayer2Id] = useState<string>('');

  const teamMatches = matches;
  const teamPlayers = players;

  // Extract all unique seasons present in matches + DEFAULT_SEASONS
  const availableSeasons = useMemo(() => {
    const seasonsSet = new Set<string>();
    teamMatches.forEach((m) => {
      seasonsSet.add(getMatchSeason(m, clubProfile?.season));
    });
    DEFAULT_SEASONS.forEach((s) => seasonsSet.add(s));
    if (clubProfile?.season) seasonsSet.add(clubProfile.season);
    return Array.from(seasonsSet).sort((a, b) => b.localeCompare(a));
  }, [teamMatches, clubProfile?.season]);

  // Filter matches by selected season
  const seasonFilteredMatches = useMemo(() => {
    if (selectedSeason === 'all') return teamMatches;
    return teamMatches.filter((m) => getMatchSeason(m, clubProfile?.season) === selectedSeason);
  }, [teamMatches, selectedSeason, clubProfile?.season]);

  // Sort filtered matches
  const sortedMatches = useMemo(() => {
    return [...seasonFilteredMatches].sort((a, b) => {
      switch (matchSortOption) {
        case 'date-asc':
          return a.date.localeCompare(b.date);
        case 'diff-desc':
          return (b.ourScore - b.opponentScore) - (a.ourScore - a.opponentScore);
        case 'pts-desc':
          return b.ourScore - a.ourScore;
        case 'opp-asc':
          return a.opponent.localeCompare(b.opponent);
        case 'date-desc':
        default:
          return b.date.localeCompare(a.date) || (b.updatedAt || 0) - (a.updatedAt || 0);
      }
    });
  }, [seasonFilteredMatches, matchSortOption]);

  // Season summary stats
  const finishedSeasonMatches = useMemo(() => seasonFilteredMatches.filter((m) => m.status === 'finished'), [seasonFilteredMatches]);
  const seasonWins = finishedSeasonMatches.filter((m) => m.ourScore > m.opponentScore).length;
  const seasonLosses = finishedSeasonMatches.filter((m) => m.ourScore < m.opponentScore).length;
  const seasonTies = finishedSeasonMatches.filter((m) => m.ourScore === m.opponentScore).length;
  const totalOurPts = finishedSeasonMatches.reduce((acc, m) => acc + m.ourScore, 0);
  const totalOppPts = finishedSeasonMatches.reduce((acc, m) => acc + m.opponentScore, 0);
  const ppgScored = finishedSeasonMatches.length > 0 ? (totalOurPts / finishedSeasonMatches.length).toFixed(1) : '0.0';
  const ppgConceded = finishedSeasonMatches.length > 0 ? (totalOppPts / finishedSeasonMatches.length).toFixed(1) : '0.0';
  const winRate = finishedSeasonMatches.length > 0 ? Math.round((seasonWins / finishedSeasonMatches.length) * 100) : 0;

  // Calculate averages per chosen season or all seasons
  const seasonAverages = useMemo(() => {
    return calculateSeasonAverages(teamPlayers, seasonFilteredMatches);
  }, [teamPlayers, seasonFilteredMatches]);

  // Season averages sorting state
  type SeasonSortKey =
    | 'playerNumber'
    | 'playerName'
    | 'gamesPlayed'
    | 'ppg'
    | 'totalPts'
    | 'rpg'
    | 'totalReb'
    | 'apg'
    | 'totalAst'
    | 'spg'
    | 'bpg'
    | 'fgPct'
    | 'ftPct'
    | 'evalAvg'
    | 'highScore';

  const [seasonSortKey, setSeasonSortKey] = useState<SeasonSortKey>('evalAvg');
  const [seasonSortAsc, setSeasonSortAsc] = useState<boolean>(false);

  const handleSeasonSort = (key: SeasonSortKey) => {
    playClickSound();
    triggerHaptic(20);
    if (seasonSortKey === key) {
      setSeasonSortAsc(!seasonSortAsc);
    } else {
      setSeasonSortKey(key);
      setSeasonSortAsc(key === 'playerNumber' || key === 'playerName');
    }
  };

  const sortedSeasonAverages = [...seasonAverages].sort((a, b) => {
    const valA = a[seasonSortKey];
    const valB = b[seasonSortKey];
    if (typeof valA === 'string' && typeof valB === 'string') {
      return seasonSortAsc ? valA.localeCompare(valB) : valB.localeCompare(valA);
    }
    const numA = Number(valA) || 0;
    const numB = Number(valB) || 0;
    return seasonSortAsc ? numA - numB : numB - numA;
  });

  // Match deletion state
  const [matchToDelete, setMatchToDelete] = useState<{ id: string; opponent: string; score: string } | null>(null);

  const handleDeleteClick = (e: React.MouseEvent, id: string, opp: string, score: string) => {
    e.stopPropagation();
    playClickSound();
    triggerHaptic(25);
    setMatchToDelete({ id, opponent: opp, score });
  };

  const handleConfirmDeleteMatch = async () => {
    if (!matchToDelete) return;
    playClickSound();
    triggerHaptic(40);
    const id = matchToDelete.id;
    setMatchToDelete(null);
    try {
      if (onDeleteMatch) {
        await onDeleteMatch(id);
      }
      if (viewingMatch?.id === id) setViewingMatch(null);
    } catch (err) {
      console.error('Błąd usuwania meczu:', err);
    }
  };

  const player1Stats = seasonAverages.find((p) => p.playerId === comparePlayer1Id);
  const player2Stats = seasonAverages.find((p) => p.playerId === comparePlayer2Id);

  return (
    <div className="w-full max-w-5xl mx-auto space-y-5 text-slate-100">
      {/* Header bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 shadow-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
            <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight">
              {t('history.title')}
            </h1>
          </div>
          <p className="text-xs sm:text-sm text-slate-400">
            {t('history.subtitle')}
          </p>
        </div>

        <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-xs font-mono text-slate-300 shrink-0">
          <Trophy className="w-4 h-4 text-amber-400" />
          <span>Mecze: <strong className="text-white">{teamMatches.length}</strong></span>
        </div>
      </div>

      {/* Sub Navigation: Matches list vs Averages vs Compare */}
      <div className="flex items-center justify-between gap-2 border-b border-slate-800 pb-2 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setActiveTab('matches')}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition ${
              activeTab === 'matches'
                ? 'bg-amber-500 text-slate-950 shadow-md'
                : 'bg-slate-900 text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            <Calendar className="w-4 h-4" />
            <span>{t('history.title')} ({teamMatches.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('averages')}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition ${
              activeTab === 'averages'
                ? 'bg-amber-500 text-slate-950 shadow-md'
                : 'bg-slate-900 text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            <BarChart2 className="w-4 h-4" />
            <span>{t('profile.seasonStats')}</span>
          </button>

          <button
            onClick={() => setActiveTab('compare')}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition ${
              activeTab === 'compare'
                ? 'bg-amber-500 text-slate-950 shadow-md'
                : 'bg-slate-900 text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            <GitCompare className="w-4 h-4" />
            <span>{t('history.compare', 'Porównaj zawodników')}</span>
          </button>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {onOpenTeamExport && (
            <button
              type="button"
              onClick={onOpenTeamExport}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-emerald-400 border border-emerald-500/40 text-xs font-bold transition active:scale-95 shadow-sm"
              title="Eksportuj mecze i całą drużynę do JSON lub wyślij na e-mail"
            >
              <Mail className="w-3.5 h-3.5 text-emerald-400" />
              <span>Eksport (E-mail / JSON)</span>
            </button>
          )}

          {onOpenTransferModal && (
            <button
              type="button"
              onClick={onOpenTransferModal}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-sky-400 border border-sky-500/30 text-xs font-bold transition active:scale-95 shadow-sm"
              title="Przenieś mecze z telefonu na komputer (Chmura lub JSON)"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Transfer z telefonu / Chmura</span>
            </button>
          )}
        </div>
      </div>

      {/* TAB 1: LISTA MECZÓW */}
      {activeTab === 'matches' && (
        <div className="space-y-4">
          {/* Season & Sorting Filter Bar */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3 sm:p-4 space-y-3 shadow-lg">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
              {/* Seasons Selector Pills */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none flex-wrap">
                <span className="text-xs font-black uppercase tracking-wider text-slate-400 mr-1 flex items-center gap-1 shrink-0">
                  <Layers className="w-3.5 h-3.5 text-amber-400" />
                  Sezon:
                </span>
                <button
                  type="button"
                  onClick={() => {
                    playClickSound();
                    triggerHaptic(20);
                    setSelectedSeason('all');
                  }}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
                    selectedSeason === 'all'
                      ? 'bg-amber-500 text-slate-950 font-black shadow-md'
                      : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <span>Wszystkie sezony</span>
                  <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-black/20 font-mono">
                    {teamMatches.length}
                  </span>
                </button>

                {availableSeasons.map((s) => {
                  const count = teamMatches.filter((m) => getMatchSeason(m, clubProfile?.season) === s).length;
                  return (
                    <button
                      key={s}
                      type="button"
                      onClick={() => {
                        playClickSound();
                        triggerHaptic(20);
                        setSelectedSeason(s);
                      }}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
                        selectedSeason === s
                          ? 'bg-amber-500 text-slate-950 font-black shadow-md'
                          : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      <span>{s}</span>
                      <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-black/20 font-mono">
                        {count}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Sorting Dropdown */}
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-xs font-bold text-slate-400 flex items-center gap-1">
                  <ArrowUpDown className="w-3.5 h-3.5 text-amber-400" />
                  Sortuj:
                </span>
                <select
                  value={matchSortOption}
                  onChange={(e) => {
                    playClickSound();
                    setMatchSortOption(e.target.value as MatchSortOption);
                  }}
                  className="bg-slate-950 border border-slate-700 rounded-xl px-2.5 py-1.5 text-xs font-semibold text-white focus:outline-none focus:border-amber-500 cursor-pointer"
                >
                  <option value="date-desc">📅 Najnowsze (Data ↓)</option>
                  <option value="date-asc">📅 Najstarsze (Data ↑)</option>
                  <option value="diff-desc">🔥 Różnica punktów (+/-)</option>
                  <option value="pts-desc">🎯 Punkty zdobyte (max)</option>
                  <option value="opp-asc">🔤 Przeciwnik (A–Z)</option>
                </select>
              </div>
            </div>

            {/* Season Summary Statistics Card */}
            {seasonFilteredMatches.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-slate-800/80">
                <div className="bg-slate-950/70 p-2.5 rounded-xl border border-slate-800/60">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Rozegrane mecze
                  </div>
                  <div className="text-sm sm:text-base font-black text-white mt-0.5 font-mono">
                    {finishedSeasonMatches.length}{' '}
                    <span className="text-xs font-normal text-slate-400">
                      ({seasonFilteredMatches.length} w sumie)
                    </span>
                  </div>
                </div>

                <div className="bg-slate-950/70 p-2.5 rounded-xl border border-slate-800/60">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Bilans Z – P (% wygranych)
                  </div>
                  <div className="text-sm sm:text-base font-black text-emerald-400 mt-0.5 font-mono flex items-center gap-1.5 flex-wrap">
                    <span>{seasonWins}W – {seasonLosses}L</span>
                    {seasonTies > 0 && <span className="text-slate-400">({seasonTies}R)</span>}
                    <span className="text-xs px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300 font-sans font-bold">
                      {winRate}%
                    </span>
                  </div>
                </div>

                <div className="bg-slate-950/70 p-2.5 rounded-xl border border-slate-800/60">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Średnia punktów (PPG)
                  </div>
                  <div className="text-sm sm:text-base font-black text-amber-400 mt-0.5 font-mono">
                    {ppgScored}{' '}
                    <span className="text-xs font-normal text-slate-400">
                      (stracone: {ppgConceded})
                    </span>
                  </div>
                </div>

                <div className="bg-slate-950/70 p-2.5 rounded-xl border border-slate-800/60">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Bilans koszy (+/-)
                  </div>
                  <div className={`text-sm sm:text-base font-black mt-0.5 font-mono ${
                    totalOurPts - totalOppPts >= 0 ? 'text-emerald-400' : 'text-rose-400'
                  }`}>
                    {totalOurPts - totalOppPts > 0 ? `+${totalOurPts - totalOppPts}` : totalOurPts - totalOppPts}{' '}
                    <span className="text-xs font-normal text-slate-400 font-sans">
                      ({totalOurPts}:{totalOppPts})
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {sortedMatches.length === 0 ? (
            <div className="py-10 px-4 text-center bg-slate-900/60 rounded-3xl border border-slate-800 space-y-4">
              <Trophy className="w-12 h-12 mx-auto text-amber-500/40" />
              <div>
                <p className="text-base font-bold text-white">
                  {selectedSeason === 'all'
                    ? 'Brak zapisanych meczów dla tej drużyny na tym urządzeniu.'
                    : `Brak zapisanych meczów w sezonie ${selectedSeason}.`}
                </p>
                <p className="text-xs text-slate-400 max-w-md mx-auto mt-1 leading-relaxed">
                  Prowadziłeś statystyki na telefonie? Przeglądarka na telefonie przechowuje mecze w lokalnej bazie offline. Możesz je teraz łatwo przenieść na ten komputer!
                </p>
              </div>

              {onOpenTransferModal && (
                <div className="pt-2 flex justify-center">
                  <button
                    type="button"
                    onClick={onOpenTransferModal}
                    className="px-5 py-2.5 rounded-2xl bg-gradient-to-r from-sky-500 to-amber-500 hover:from-sky-400 hover:to-amber-400 text-slate-950 font-black text-xs flex items-center gap-2 shadow-lg shadow-sky-950/40 transition active:scale-95"
                  >
                    <Smartphone className="w-4 h-4" />
                    <span>Prześlij / Pobierz mecz z telefonu</span>
                    <CloudDownload className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          ) : (
            sortedMatches.map((match) => {
              const isWon = match.ourScore > match.opponentScore;
              const isLive = match.status === 'live';

              return (
                <div
                  key={match.id}
                  onClick={() => setViewingMatch(match)}
                  className="bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-2xl p-4 sm:p-5 transition shadow-lg flex flex-col sm:flex-row sm:items-center justify-between gap-4 cursor-pointer group"
                >
                  {/* Left: Info & Result */}
                  <div className="flex items-center gap-4">
                    {/* Outcome Badge */}
                    <div
                      className={`w-14 h-14 rounded-2xl flex flex-col items-center justify-center shrink-0 font-black tracking-wider text-xs border ${
                        isLive
                          ? 'bg-amber-500/20 text-amber-400 border-amber-500/40'
                          : isWon
                          ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
                          : 'bg-rose-500/20 text-rose-400 border-rose-500/40'
                      }`}
                    >
                      <span className="text-base font-black">
                        {isLive ? 'LIVE' : isWon ? 'WYG' : 'PRZ'}
                      </span>
                      <span className="text-[9px] uppercase font-semibold">
                        {isLive ? 'Trwa' : isWon ? 'Wygrana' : 'Porażka'}
                      </span>
                    </div>

                    <div>
                      <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                        <span className="text-[10px] px-2 py-0.5 rounded-md font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                          {getMatchSeason(match, clubProfile?.season)}
                        </span>
                        <span className="text-xs font-semibold text-slate-400">
                          {match.date} • {match.location === 'Dom' ? '🏠 Dom' : '🚌 Wyjazd'}
                        </span>
                        <span className="text-[10px] px-2 py-0.2 rounded-full font-mono bg-slate-800 text-slate-300">
                          {match.events.length} akcji
                        </span>
                      </div>

                      <h3 className="text-base sm:text-lg font-black text-white group-hover:text-amber-300 transition flex items-center gap-1.5 flex-wrap">
                        <span className="text-amber-400">{clubProfile?.shortName || clubProfile?.name || 'Nasz Zespół'}:</span>
                        <span className="text-white font-mono font-black">{match.ourScore} – {match.opponentScore}</span>
                        <span className="text-slate-300 font-bold">{match.opponent}</span>
                      </h3>

                      {/* Quarters breakdown */}
                      <div className="text-xs font-mono text-slate-400 mt-1 flex items-center gap-2 flex-wrap">
                        <span>Q1: {match.quarterScores.q1.our}-{match.quarterScores.q1.opp}</span>
                        <span>Q2: {match.quarterScores.q2.our}-{match.quarterScores.q2.opp}</span>
                        <span>Q3: {match.quarterScores.q3.our}-{match.quarterScores.q3.opp}</span>
                        <span>Q4: {match.quarterScores.q4.our}-{match.quarterScores.q4.opp}</span>
                        {match.quarterScores.ot && (
                          <span className="text-amber-400">OT: {match.quarterScores.ot.our}-{match.quarterScores.ot.opp}</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Right: Big Score & Quick buttons */}
                  <div className="flex items-center justify-between sm:justify-end gap-3 pt-2 sm:pt-0 border-t sm:border-0 border-slate-800">
                    <div className="text-right">
                      <div className="text-2xl sm:text-3xl font-black font-mono text-white tracking-tight">
                        <span className="text-amber-400">{match.ourScore}</span>
                        <span className="text-slate-500 mx-1">:</span>
                        <span>{match.opponentScore}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                      {isLive ? (
                        readOnly ? (
                          <button
                            onClick={() => onGoToLive ? onGoToLive() : setViewingMatch(match)}
                            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs transition active:scale-95 shadow-md shadow-amber-950/40"
                            title="Otwórz relację na żywo"
                          >
                            <PlayCircle className="w-4 h-4" />
                            <span>Mecz na żywo</span>
                          </button>
                        ) : (
                          <button
                            onClick={() => onResumeMatch && onResumeMatch(match)}
                            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs transition active:scale-95 shadow-md shadow-amber-950/40"
                            title="Wznów ten mecz na żywo"
                          >
                            <PlayCircle className="w-4 h-4" />
                            <span>{t('parent.startMatch')}</span>
                          </button>
                        )
                      ) : (
                        <>
                          <button
                            onClick={() => setViewingMatch(match)}
                            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 transition"
                            title={t('history.viewBoxScore')}
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          {!readOnly && onResumeMatch && (
                            <button
                              type="button"
                              onClick={() => {
                                playClickSound();
                                triggerHaptic(20);
                                setMatchToResumeConfirm(match);
                              }}
                              className="p-2 rounded-xl bg-slate-800 hover:bg-amber-500/20 text-slate-300 hover:text-amber-400 border border-transparent hover:border-amber-500/30 transition active:scale-95"
                              title="Edytuj mecz (po zatwierdzeniu)"
                            >
                              <Edit3 className="w-4 h-4 text-amber-400" />
                            </button>
                          )}
                        </>
                      )}

                      <button
                        onClick={() => {
                          const roster =
                            match.rosterPlayerIds && match.rosterPlayerIds.length > 0
                              ? players.filter((p) => match.rosterPlayerIds.includes(p.id))
                              : players;
                          exportMatchPdf(match, roster, {
                            includeBoxScore: true,
                            includePlayByPlay: true,
                            includePlayerPages: true,
                          });
                        }}
                        className="p-2 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 transition active:scale-95"
                        title={t('history.exportAllPdf')}
                      >
                        <FileText className="w-4 h-4 text-amber-400" />
                      </button>

                      <button
                        onClick={() => exportMatchBoxScoreCsv(match, players.filter((p) => match.rosterPlayerIds.includes(p.id)))}
                        className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 transition"
                        title={t('box.exportCsvBtn')}
                      >
                        <Download className="w-4 h-4 text-amber-400" />
                      </button>

                      {!readOnly && (
                        <button
                          type="button"
                          onClick={(e) => handleDeleteClick(e, match.id, match.opponent, `${match.ourScore}:${match.opponentScore}`)}
                          className="p-2 rounded-xl bg-slate-800 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 transition active:scale-90 cursor-pointer"
                          title={t('history.deleteMatch')}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* TAB 2: ŚREDNIE SEZONU */}
      {activeTab === 'averages' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-2 bg-slate-900/60 p-3 rounded-xl border border-slate-800">
            <span className="text-xs font-semibold text-slate-300">
              Podsumowanie występów drużyny ({seasonFilteredMatches.length} meczów)
            </span>
            <button
              onClick={() => exportSeasonStatsCsv('', seasonAverages, seasonFilteredMatches.length, clubProfile?.name)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold transition active:scale-95 shadow-sm"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Eksportuj średnie CSV</span>
            </button>
          </div>

          {/* Quick Sort Bar for Season Averages */}
          <div className="flex items-center justify-between gap-2 bg-slate-950/90 p-2.5 rounded-xl border border-slate-800 flex-wrap">
            <div className="flex items-center gap-1.5 text-xs text-slate-400">
              <ArrowUpDown className="w-3.5 h-3.5 text-amber-400" />
              <span className="font-bold text-slate-300">Sortuj średnie:</span>
            </div>

            <div className="flex items-center gap-1 overflow-x-auto pb-0.5 scrollbar-none flex-wrap">
              <button
                onClick={() => handleSeasonSort('evalAvg')}
                className={`px-2.5 py-1 rounded-lg text-xs font-black transition ${
                  seasonSortKey === 'evalAvg'
                    ? 'bg-emerald-500 text-slate-950 shadow-md'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
              >
                ⭐ Śr. EVAL {seasonSortKey === 'evalAvg' && (seasonSortAsc ? '▲' : '▼')}
              </button>

              <button
                onClick={() => handleSeasonSort('ppg')}
                className={`px-2.5 py-1 rounded-lg text-xs font-black transition ${
                  seasonSortKey === 'ppg'
                    ? 'bg-amber-500 text-slate-950 shadow-md'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
              >
                🏀 PPG (Pkt) {seasonSortKey === 'ppg' && (seasonSortAsc ? '▲' : '▼')}
              </button>

              <button
                onClick={() => handleSeasonSort('rpg')}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition ${
                  seasonSortKey === 'rpg'
                    ? 'bg-blue-500 text-white shadow-md'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
              >
                🛡️ RPG (Zbiórki) {seasonSortKey === 'rpg' && (seasonSortAsc ? '▲' : '▼')}
              </button>

              <button
                onClick={() => handleSeasonSort('apg')}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition ${
                  seasonSortKey === 'apg'
                    ? 'bg-sky-500 text-slate-950 shadow-md'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
              >
                🎯 APG (Asysty) {seasonSortKey === 'apg' && (seasonSortAsc ? '▲' : '▼')}
              </button>

              <button
                onClick={() => handleSeasonSort('highScore')}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition ${
                  seasonSortKey === 'highScore'
                    ? 'bg-amber-600 text-white shadow-md'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
              >
                🔥 Rekord {seasonSortKey === 'highScore' && (seasonSortAsc ? '▲' : '▼')}
              </button>

              <button
                onClick={() => handleSeasonSort('playerNumber')}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition ${
                  seasonSortKey === 'playerNumber'
                    ? 'bg-slate-200 text-slate-950 shadow-md'
                    : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                }`}
              >
                🔢 Nr {seasonSortKey === 'playerNumber' && (seasonSortAsc ? '▲' : '▼')}
              </button>
            </div>
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-950/90 shadow-inner">
            <table className="w-full text-left text-xs whitespace-nowrap">
              <thead className="bg-slate-900 text-slate-400 uppercase font-mono text-[11px] border-b border-slate-800 select-none">
                <tr>
                  <th
                    onClick={() => handleSeasonSort('playerNumber')}
                    className="py-2.5 px-3 text-amber-400 font-bold cursor-pointer hover:bg-slate-800 transition"
                  >
                    Nr {seasonSortKey === 'playerNumber' && (seasonSortAsc ? '▲' : '▼')}
                  </th>
                  <th
                    onClick={() => handleSeasonSort('playerName')}
                    className="py-2.5 px-3 text-white font-bold cursor-pointer hover:bg-slate-800 transition"
                  >
                    Zawodnik {seasonSortKey === 'playerName' && (seasonSortAsc ? '▲' : '▼')}
                  </th>
                  <th
                    onClick={() => handleSeasonSort('gamesPlayed')}
                    className="py-2.5 px-2 text-center cursor-pointer hover:bg-slate-800 transition"
                  >
                    Mecze {seasonSortKey === 'gamesPlayed' && (seasonSortAsc ? '▲' : '▼')}
                  </th>
                  <th
                    onClick={() => handleSeasonSort('ppg')}
                    className={`py-2.5 px-2 text-center font-bold cursor-pointer hover:bg-amber-500/20 transition ${
                      seasonSortKey === 'ppg' ? 'text-amber-300 bg-amber-500/20' : 'text-amber-300 bg-amber-500/10'
                    }`}
                  >
                    PPG (Śr. Pkt) {seasonSortKey === 'ppg' && (seasonSortAsc ? '▲' : '▼')}
                  </th>
                  <th
                    onClick={() => handleSeasonSort('totalPts')}
                    className="py-2.5 px-2 text-center cursor-pointer hover:bg-slate-800 transition"
                  >
                    Suma PTS {seasonSortKey === 'totalPts' && (seasonSortAsc ? '▲' : '▼')}
                  </th>
                  <th
                    onClick={() => handleSeasonSort('rpg')}
                    className={`py-2.5 px-2 text-center font-bold cursor-pointer hover:bg-blue-500/20 transition ${
                      seasonSortKey === 'rpg' ? 'text-blue-300 bg-blue-500/20' : 'text-blue-300'
                    }`}
                  >
                    RPG (Śr. Zb) {seasonSortKey === 'rpg' && (seasonSortAsc ? '▲' : '▼')}
                  </th>
                  <th
                    onClick={() => handleSeasonSort('totalReb')}
                    className="py-2.5 px-2 text-center cursor-pointer hover:bg-slate-800 transition"
                  >
                    Suma ZB {seasonSortKey === 'totalReb' && (seasonSortAsc ? '▲' : '▼')}
                  </th>
                  <th
                    onClick={() => handleSeasonSort('apg')}
                    className={`py-2.5 px-2 text-center font-bold cursor-pointer hover:bg-sky-500/20 transition ${
                      seasonSortKey === 'apg' ? 'text-sky-300 bg-sky-500/20' : 'text-sky-300'
                    }`}
                  >
                    APG (Śr. Ast) {seasonSortKey === 'apg' && (seasonSortAsc ? '▲' : '▼')}
                  </th>
                  <th
                    onClick={() => handleSeasonSort('totalAst')}
                    className="py-2.5 px-2 text-center cursor-pointer hover:bg-slate-800 transition"
                  >
                    Suma AST {seasonSortKey === 'totalAst' && (seasonSortAsc ? '▲' : '▼')}
                  </th>
                  <th
                    onClick={() => handleSeasonSort('spg')}
                    className="py-2.5 px-2 text-center text-violet-300 cursor-pointer hover:bg-slate-800 transition"
                  >
                    SPG (Przechwyty) {seasonSortKey === 'spg' && (seasonSortAsc ? '▲' : '▼')}
                  </th>
                  <th
                    onClick={() => handleSeasonSort('bpg')}
                    className="py-2.5 px-2 text-center text-cyan-300 cursor-pointer hover:bg-slate-800 transition"
                  >
                    BPG (Bloki) {seasonSortKey === 'bpg' && (seasonSortAsc ? '▲' : '▼')}
                  </th>
                  <th
                    onClick={() => handleSeasonSort('fgPct')}
                    className="py-2.5 px-2 text-center cursor-pointer hover:bg-slate-800 transition"
                  >
                    FG % {seasonSortKey === 'fgPct' && (seasonSortAsc ? '▲' : '▼')}
                  </th>
                  <th
                    onClick={() => handleSeasonSort('ftPct')}
                    className="py-2.5 px-2 text-center text-teal-300 cursor-pointer hover:bg-slate-800 transition"
                  >
                    FT % {seasonSortKey === 'ftPct' && (seasonSortAsc ? '▲' : '▼')}
                  </th>
                  <th
                    onClick={() => handleSeasonSort('evalAvg')}
                    className={`py-2.5 px-2 text-center font-black cursor-pointer hover:bg-emerald-500/20 transition ${
                      seasonSortKey === 'evalAvg'
                        ? 'text-emerald-300 bg-emerald-500/25 ring-1 ring-emerald-500/40'
                        : 'text-emerald-400 bg-emerald-500/10'
                    }`}
                  >
                    Śr. EVAL {seasonSortKey === 'evalAvg' && (seasonSortAsc ? '▲' : '▼')}
                  </th>
                  <th
                    onClick={() => handleSeasonSort('highScore')}
                    className="py-2.5 px-3 text-center text-amber-400 font-bold cursor-pointer hover:bg-slate-800 transition"
                  >
                    Rekord Meczowy {seasonSortKey === 'highScore' && (seasonSortAsc ? '▲' : '▼')}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono">
                {sortedSeasonAverages.map((p) => (
                  <tr key={p.playerId} className="hover:bg-slate-900/60 transition">
                    <td className="py-2.5 px-3 font-bold text-amber-400">#{p.playerNumber}</td>
                    <td className="py-2.5 px-3 font-sans font-semibold text-slate-200">{p.playerName}</td>
                    <td className="py-2.5 px-2 text-center text-slate-300">{p.gamesPlayed}</td>
                    <td className="py-2.5 px-2 text-center font-black text-amber-300 bg-amber-500/5">{p.ppg}</td>
                    <td className="py-2.5 px-2 text-center text-slate-400">{p.totalPts}</td>
                    <td className="py-2.5 px-2 text-center font-bold text-blue-300">{p.rpg}</td>
                    <td className="py-2.5 px-2 text-center text-slate-400">{p.totalReb}</td>
                    <td className="py-2.5 px-2 text-center font-bold text-sky-300">{p.apg}</td>
                    <td className="py-2.5 px-2 text-center text-slate-400">{p.totalAst}</td>
                    <td className="py-2.5 px-2 text-center text-violet-300">{p.spg}</td>
                    <td className="py-2.5 px-2 text-center text-cyan-300">{p.bpg}</td>
                    <td className="py-2.5 px-2 text-center text-slate-300">{p.fgPct}%</td>
                    <td className="py-2.5 px-2 text-center text-teal-300">{p.ftPct}%</td>
                    <td className="py-2.5 px-2 text-center font-black text-emerald-400 bg-emerald-500/5">{p.evalAvg}</td>
                    <td className="py-2.5 px-3 text-center font-bold text-amber-400">{p.highScore} pkt</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: PORÓWNAJ ZAWODNIKÓW */}
      {activeTab === 'compare' && (
        <div className="space-y-5 bg-slate-900 rounded-2xl border border-slate-800 p-5 shadow-xl">
          <div className="text-center max-w-md mx-auto mb-4">
            <h3 className="text-base font-bold text-white">Porównanie Zawodników Head-to-Head</h3>
            <p className="text-xs text-slate-400 mt-1">
              Wybierz dwóch graczy z kadry drużyny, aby porównać ich średnie statystyki na mecz.
            </p>
          </div>

          {/* Selectors */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-xl mx-auto">
            <div>
              <label className="block text-xs font-bold text-amber-400 mb-1">Zawodnik 1:</label>
              <select
                value={comparePlayer1Id}
                onChange={(e) => setComparePlayer1Id(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs font-semibold text-white focus:outline-none focus:border-amber-500"
              >
                <option value="">-- Wybierz zawodnika 1 --</option>
                {teamPlayers.map((p) => (
                  <option key={p.id} value={p.id}>
                    #{p.number} {p.firstName} {p.lastName}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-sky-400 mb-1">Zawodnik 2:</label>
              <select
                value={comparePlayer2Id}
                onChange={(e) => setComparePlayer2Id(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs font-semibold text-white focus:outline-none focus:border-sky-500"
              >
                <option value="">-- Wybierz zawodnika 2 --</option>
                {teamPlayers.map((p) => (
                  <option key={p.id} value={p.id}>
                    #{p.number} {p.firstName} {p.lastName}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Comparison Arena */}
          {player1Stats && player2Stats ? (
            <div className="max-w-xl mx-auto mt-6 space-y-4">
              <div className="grid grid-cols-3 items-center text-center pb-3 border-b border-slate-800">
                <div className="text-amber-400 font-bold text-sm">
                  #{player1Stats.playerNumber} {player1Stats.playerName}
                </div>
                <div className="text-[10px] font-mono uppercase text-slate-500 font-bold">
                  PORÓWNANIE
                </div>
                <div className="text-sky-400 font-bold text-sm">
                  #{player2Stats.playerNumber} {player2Stats.playerName}
                </div>
              </div>

              {/* Stat rows with comparison bars */}
              {[
                { label: 'Średnia punktów (PPG)', val1: player1Stats.ppg, val2: player2Stats.ppg, unit: 'pkt' },
                { label: 'Średnia zbiórek (RPG)', val1: player1Stats.rpg, val2: player2Stats.rpg, unit: 'zb' },
                { label: 'Średnia asyst (APG)', val1: player1Stats.apg, val2: player2Stats.apg, unit: 'ast' },
                { label: 'Średnia przechwytów (SPG)', val1: player1Stats.spg, val2: player2Stats.spg, unit: 'prz' },
                { label: 'Średnia bloków (BPG)', val1: player1Stats.bpg, val2: player2Stats.bpg, unit: 'blk' },
                { label: 'Skuteczność z gry (FG %)', val1: player1Stats.fgPct, val2: player2Stats.fgPct, unit: '%' },
                { label: 'Rzuty wolne (FT %)', val1: player1Stats.ftPct, val2: player2Stats.ftPct, unit: '%' },
                { label: 'Wskaźnik EVAL (Śr.)', val1: player1Stats.evalAvg, val2: player2Stats.evalAvg, unit: '' },
                { label: 'Rekord punktowy w meczu', val1: player1Stats.highScore, val2: player2Stats.highScore, unit: 'pkt' },
              ].map((row, idx) => {
                const isP1Higher = row.val1 > row.val2;
                const isP2Higher = row.val2 > row.val1;

                return (
                  <div key={idx} className="bg-slate-950/70 p-3 rounded-xl border border-slate-800/80">
                    <div className="flex items-center justify-between text-xs font-mono font-bold mb-1.5">
                      <span className={isP1Higher ? 'text-amber-400 font-black' : 'text-slate-300'}>
                        {row.val1} {row.unit}
                      </span>
                      <span className="text-[10px] uppercase font-sans font-bold text-slate-400">
                        {row.label}
                      </span>
                      <span className={isP2Higher ? 'text-sky-400 font-black' : 'text-slate-300'}>
                        {row.val2} {row.unit}
                      </span>
                    </div>

                    {/* Visual Comparison Bar */}
                    <div className="h-2 w-full bg-slate-900 rounded-full flex overflow-hidden">
                      <div
                        className="bg-amber-500 h-full transition-all"
                        style={{
                          width: `${
                            row.val1 + row.val2 > 0
                              ? Math.round((row.val1 / (row.val1 + row.val2)) * 100)
                              : 50
                          }%`,
                        }}
                      />
                      <div
                        className="bg-sky-500 h-full transition-all"
                        style={{
                          width: `${
                            row.val1 + row.val2 > 0
                              ? Math.round((row.val2 / (row.val1 + row.val2)) * 100)
                              : 50
                          }%`,
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="py-8 text-center text-slate-500 text-xs">
              Wybierz dwóch zawodników powyżej, aby zobaczyć szczegółowe porównanie.
            </div>
          )}
        </div>
      )}

      {/* Full Box Score Modal for historical match */}
      {viewingMatch && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-950/90 overflow-y-auto">
          <div className="w-full max-w-4xl max-h-[92vh] flex flex-col rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl text-slate-100 overflow-hidden my-auto">
            <div className="flex items-center justify-between p-3 sm:p-4 border-b border-slate-800 bg-slate-950">
              <span className="text-sm font-bold text-white">
                Szczegółowy Raport Meczowy: {clubProfile?.shortName || clubProfile?.name || 'Nasz Zespół'} vs {viewingMatch.opponent}
              </span>
              <div className="flex items-center gap-2">
                {!readOnly && onResumeMatch && (
                  <button
                    onClick={() => {
                      playClickSound();
                      triggerHaptic(20);
                      setMatchToResumeConfirm(viewingMatch);
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-black transition active:scale-95 shadow-md shadow-amber-950/30"
                    title="Odblokuj i wznów edycję tego zakończonego meczu"
                  >
                    <Edit3 className="w-3.5 h-3.5 text-slate-950" />
                    <span>Edytuj mecz</span>
                  </button>
                )}
                <button
                  onClick={() => setViewingPlayByPlay(viewingMatch)}
                  className="px-3 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-amber-400 border border-slate-700"
                >
                  Zobacz Play-by-Play
                </button>
                <button
                  onClick={() => setViewingMatch(null)}
                  className="p-1 rounded-lg text-slate-400 hover:text-white"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-3 sm:p-5">
              <BoxScoreTable
                match={viewingMatch}
                rosterPlayers={players.filter((p) =>
                  viewingMatch.rosterPlayerIds?.includes(p.id) ||
                  viewingMatch.events.some((e) => e.playerId === p.id)
                )}
                isMatchActive={false}
                clubProfile={clubProfile}
              />
            </div>
          </div>
        </div>
      )}

      {/* Play by Play Modal */}
      {viewingPlayByPlay && (
        <PlayByPlayModal
          isOpen={true}
          onClose={() => setViewingPlayByPlay(null)}
          match={viewingPlayByPlay}
          onDeleteEvent={readOnly ? undefined : () => {}}
        />
      )}

      {/* Match Deletion Confirmation Modal */}
      {matchToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 animate-in fade-in duration-150">
          <div className="w-full max-w-sm rounded-2xl bg-slate-900 border border-slate-800 p-5 shadow-2xl text-slate-100 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center text-rose-400 shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">{t('history.deleteMatch')}</h3>
                <p className="text-xs text-slate-400">{t('history.deleteConfirm')}</p>
              </div>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed bg-slate-950 p-3 rounded-xl border border-slate-800/80">
              {t('history.deleteConfirm')} <span className="font-bold text-amber-400">{matchToDelete.opponent}</span> ({matchToDelete.score})?
            </p>

            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={() => setMatchToDelete(null)}
                className="flex-1 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs transition active:scale-95 cursor-pointer"
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteMatch}
                className="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs transition shadow-lg shadow-rose-950/50 active:scale-95 cursor-pointer flex items-center justify-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{t('common.delete')}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal to Edit Finished Match */}
      <ResumeMatchConfirmModal
        isOpen={!!matchToResumeConfirm}
        match={matchToResumeConfirm}
        onClose={() => setMatchToResumeConfirm(null)}
        onConfirm={(matchToResume) => {
          setMatchToResumeConfirm(null);
          setViewingMatch(null);
          if (onResumeMatch) {
            onResumeMatch(matchToResume);
          }
        }}
      />
    </div>
  );
};

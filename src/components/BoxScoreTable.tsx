import React, { useState, useEffect } from 'react';
import { ClubProfile, Match, Player, PlayerMatchStats } from '../types/basketball';
import { calculatePlayerStats, calculateTeamStats } from '../services/statsCalculator';
import { exportMatchBoxScoreCsv } from '../services/exportCsv';
import { exportMatchPdf, exportBoxScorePdf } from '../services/exportPdf';
import {
  Download,
  Sparkles,
  Volume2,
  Loader2,
  StopCircle,
  FileText,
  ArrowUpDown,
  Shield,
  UserCheck,
} from 'lucide-react';
import { announcePlay, stopSpeaking, playClickSound, triggerHaptic } from '../services/tts';
import { hasAnyPersonalData } from '../services/playerDisplay';

interface BoxScoreTableProps {
  match: Match;
  rosterPlayers: Player[];
  onFinishMatch?: () => void;
  isMatchActive?: boolean;
  clubProfile?: ClubProfile;
  defaultIncludePersonalData?: boolean;
  onChangeIncludePersonalData?: (val: boolean) => void;
}

type SortKey =
  | 'eval'
  | 'pts'
  | 'plusMinus'
  | 'ftm'
  | 'ftPct'
  | 'fg2m'
  | 'fg2Pct'
  | 'fg3m'
  | 'fg3Pct'
  | 'fgm'
  | 'fgPct'
  | 'offReb'
  | 'defReb'
  | 'totReb'
  | 'ast'
  | 'stl'
  | 'blk'
  | 'tov'
  | 'fouls'
  | 'playerNumber'
  | 'playerName';

export const BoxScoreTable: React.FC<BoxScoreTableProps> = ({
  match,
  rosterPlayers,
  onFinishMatch,
  isMatchActive = false,
  clubProfile,
  defaultIncludePersonalData = false,
  onChangeIncludePersonalData,
}) => {
  const teamDisplayName = clubProfile?.shortName || clubProfile?.name || 'Nasz Zespół';
  const teamFullClubName = clubProfile?.name || 'Nasz zespół';
  const [isGeneratingRecap, setIsGeneratingRecap] = useState(false);
  const [aiRecap, setAiRecap] = useState<string>(match.aiCoachRecap || '');
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [includePersonalData, setIncludePersonalData] = useState(defaultIncludePersonalData);
  const [sortKey, setSortKey] = useState<SortKey>('eval');
  const [sortAsc, setSortAsc] = useState<boolean>(false);
  const hasPii = hasAnyPersonalData(rosterPlayers);

  useEffect(() => {
    setIncludePersonalData(defaultIncludePersonalData);
  }, [defaultIncludePersonalData]);

  const handleSetIncludePersonalData = (val: boolean) => {
    setIncludePersonalData(val);
    onChangeIncludePersonalData?.(val);
  };

  // Calculate box score
  const playerStatsList: PlayerMatchStats[] = rosterPlayers.map((player) =>
    calculatePlayerStats(player, match.events, match)
  );

  const teamTotals = calculateTeamStats(playerStatsList);

  // Top performers
  const topScorers = [...playerStatsList].sort((a, b) => b.pts - a.pts).slice(0, 3);
  const topRebounders = [...playerStatsList].sort((a, b) => b.totReb - a.totReb).slice(0, 3);
  const topPassers = [...playerStatsList].sort((a, b) => b.ast - a.ast).slice(0, 3);
  const topEval = [...playerStatsList].sort((a, b) => b.eval - a.eval).slice(0, 3);

  // Handle Sort
  const handleSort = (key: SortKey) => {
    playClickSound();
    triggerHaptic(20);
    if (sortKey === key) {
      setSortAsc(!sortAsc);
    } else {
      setSortKey(key);
      setSortAsc(key === 'playerNumber' || key === 'playerName');
    }
  };

  // Sorted player stats
  const sortedPlayerStatsList = [...playerStatsList].sort((a, b) => {
    const valA = a[sortKey];
    const valB = b[sortKey];
    if (typeof valA === 'string' && typeof valB === 'string') {
      return sortAsc ? valA.localeCompare(valB) : valB.localeCompare(valA);
    }
    const numA = Number(valA) || 0;
    const numB = Number(valB) || 0;
    return sortAsc ? numA - numB : numB - numA;
  });

  const handleExportFullPdf = async () => {
    setIsExportingPdf(true);
    playClickSound();
    triggerHaptic(30);
    try {
      await exportMatchPdf(match, rosterPlayers, {
        includeBoxScore: true,
        includePlayByPlay: true,
        includePlayerPages: true,
        includePersonalData,
      });
    } catch (err) {
      console.error('Błąd eksportu raportu PDF:', err);
    } finally {
      setIsExportingPdf(false);
    }
  };

  const handleExportBoxScorePdfOnly = async () => {
    setIsExportingPdf(true);
    playClickSound();
    triggerHaptic(30);
    try {
      await exportBoxScorePdf(match, rosterPlayers, { includePersonalData });
    } catch (err) {
      console.error('Błąd eksportu Box Score PDF:', err);
    } finally {
      setIsExportingPdf(false);
    }
  };

  const handleGenerateCoachRecap = async () => {
    setIsGeneratingRecap(true);
    try {
      const response = await fetch('/api/ai-recap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          matchData: {
            clubName: clubProfile?.name || 'Nasz Zespół',
            teamCategory: match.teamCategory,
            opponent: match.opponent,
            location: match.location,
            date: match.date,
            ourScore: match.ourScore,
            opponentScore: match.opponentScore,
            isWon: match.ourScore > match.opponentScore,
            quarters: match.quarterScores,
            teamTotals: teamTotals,
            topPerformers: topEval.map((p) => ({
              player: `#${p.playerNumber}`,
              pts: p.pts,
              reb: p.totReb,
              ast: p.ast,
              eval: p.eval,
            })),
          },
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setAiRecap(data.recap);
      }
    } catch (e) {
      console.warn('Błąd AI Recap:', e);
    } finally {
      setIsGeneratingRecap(false);
    }
  };

  const handleSpeakRecap = () => {
    if (isPlayingAudio) {
      stopSpeaking();
      setIsPlayingAudio(false);
      return;
    }

    const textToSpeak =
      aiRecap ||
      `Mecz zakończony. Wynik: ${teamFullClubName} ${match.ourScore}, ${match.opponent} ${match.opponentScore}. Gratulacje dla drużyny!`;

    announcePlay(textToSpeak, {
      style: 'Enthusiastic and motivating Polish basketball coach',
      onStart: () => setIsPlayingAudio(true),
      onEnd: () => setIsPlayingAudio(false),
    });
  };

  const renderSortIndicator = (key: SortKey) => {
    if (sortKey !== key) {
      return <span className="opacity-25 text-[9px] ml-0.5">↕</span>;
    }
    return (
      <span className="text-amber-400 font-black text-[10px] ml-0.5 inline-block">
        {sortAsc ? '▲' : '▼'}
      </span>
    );
  };

  return (
    <div className="w-full bg-slate-900 rounded-2xl border border-slate-800 p-4 sm:p-5 text-slate-100 shadow-xl space-y-5">
      {/* Header bar: Match outcome, score & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2 mb-1">
            {match.teamCategory && match.teamCategory !== 'TEAM' && (
              <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-amber-500/20 text-amber-400 border border-amber-500/40">
                {match.teamCategory}
              </span>
            )}
            <span className="text-xs font-semibold text-slate-400">
              {match.date} • {match.location}
            </span>
          </div>
          <h2 className="text-xl sm:text-2xl font-black tracking-tight text-white flex items-center gap-2 flex-wrap">
            <span className="text-amber-400">{teamDisplayName}:</span>
            <span className="text-white font-mono font-black">
              {match.ourScore} – {match.opponentScore}
            </span>
            <span className="text-slate-300">{match.opponent}</span>
          </h2>
        </div>

        {/* Action buttons: PDF & CSV Exports */}
        <div className="flex flex-col items-start sm:items-end gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            {/* Main PDF Export Button (Complete Report) */}
            <button
              onClick={handleExportFullPdf}
              disabled={isExportingPdf}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-black transition active:scale-95 shadow-md shadow-amber-950/40 disabled:opacity-50"
              title="Eksportuj pełny protokół meczowy ze statystykami i kroniką akcji do PDF"
            >
              {isExportingPdf ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <FileText className="w-4 h-4 stroke-[2.5]" />
              )}
              <span>Raport PDF (Całość)</span>
            </button>

            {/* Box Score Only PDF */}
            <button
              onClick={handleExportBoxScorePdfOnly}
              disabled={isExportingPdf}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-300 text-xs font-bold border border-amber-500/30 transition active:scale-95 disabled:opacity-50"
              title="Pobierz PDF tylko ze statystykami zawodników"
            >
              <Download className="w-3.5 h-3.5 text-amber-400" />
              <span>Tylko Box Score PDF</span>
            </button>

            {/* CSV Export */}
            <button
              onClick={() => exportMatchBoxScoreCsv(match, rosterPlayers, clubProfile?.name, includePersonalData)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold border border-slate-700 transition active:scale-95"
              title="Pobierz statystyki meczowe w formacie arkusza CSV"
            >
              <Download className="w-3.5 h-3.5 text-slate-400" />
              <span>CSV</span>
            </button>

            {isMatchActive && onFinishMatch && (
              <button
                onClick={onFinishMatch}
                className="px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-slate-950 font-black text-xs transition active:scale-95 shadow-md shadow-emerald-950/40"
              >
                Zakończ mecz
              </button>
            )}
          </div>

          <div className="flex flex-col items-start sm:items-end gap-1">
            <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-slate-950 border border-slate-800">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 px-1.5 hidden sm:inline">
                Raport:
              </span>
              <button
                type="button"
                onClick={() => handleSetIncludePersonalData(false)}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold transition ${
                  !includePersonalData
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                    : 'text-slate-400 hover:text-slate-200 border border-transparent'
                }`}
              >
                <Shield className="w-3 h-3" />
                <span>Zanonimizowany (nr)</span>
              </button>
              <button
                type="button"
                onClick={() => handleSetIncludePersonalData(true)}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold transition ${
                  includePersonalData
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                    : 'text-slate-400 hover:text-slate-200 border border-transparent'
                }`}
              >
                <UserCheck className="w-3 h-3" />
                <span>Pełny (nazwiska/zdjęcia)</span>
              </button>
            </div>
            {includePersonalData && !hasPii && (
              <span className="text-[10px] text-amber-300/90">
                Brak lokalnych nazwisk/zdjęć — uzupełnij w zakładce Kadra, aby pojawiły się w pełnym raporcie.
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Quarter breakdown pills */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 bg-slate-950/80 p-3 rounded-xl border border-slate-800 text-center font-mono text-xs">
        <div className="p-1">
          <span className="text-slate-500 text-[10px] block">KWARTA 1</span>
          <span className="font-bold text-white text-sm">
            {match.quarterScores.q1.our} : {match.quarterScores.q1.opp}
          </span>
        </div>
        <div className="p-1">
          <span className="text-slate-500 text-[10px] block">KWARTA 2</span>
          <span className="font-bold text-white text-sm">
            {match.quarterScores.q2.our} : {match.quarterScores.q2.opp}
          </span>
        </div>
        <div className="p-1">
          <span className="text-slate-500 text-[10px] block">KWARTA 3</span>
          <span className="font-bold text-white text-sm">
            {match.quarterScores.q3.our} : {match.quarterScores.q3.opp}
          </span>
        </div>
        <div className="p-1">
          <span className="text-slate-500 text-[10px] block">KWARTA 4</span>
          <span className="font-bold text-white text-sm">
            {match.quarterScores.q4.our} : {match.quarterScores.q4.opp}
          </span>
        </div>
        {match.quarterScores.ot && (
          <div className="p-1">
            <span className="text-amber-500 text-[10px] block">DOGRYWKA</span>
            <span className="font-bold text-amber-400 text-sm">
              {match.quarterScores.ot.our} : {match.quarterScores.ot.opp}
            </span>
          </div>
        )}
      </div>

      {/* Leaders Spotlight Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <div className="bg-slate-950/70 p-3 rounded-xl border border-slate-800/80">
          <span className="text-[10px] uppercase font-bold text-amber-400">Najwięcej punktów</span>
          <div className="mt-1">
            <span className="text-lg font-black font-mono text-white">
              {topScorers[0]?.pts || 0} pkt
            </span>
            <div className="text-xs text-slate-300 font-semibold truncate">
              {topScorers[0]?.playerName || '-'}
            </div>
          </div>
        </div>

        <div className="bg-slate-950/70 p-3 rounded-xl border border-slate-800/80">
          <span className="text-[10px] uppercase font-bold text-blue-400">Najwięcej zbiórek</span>
          <div className="mt-1">
            <span className="text-lg font-black font-mono text-white">
              {topRebounders[0]?.totReb || 0} zb
            </span>
            <div className="text-xs text-slate-300 font-semibold truncate">
              {topRebounders[0]?.playerName || '-'}
            </div>
          </div>
        </div>

        <div className="bg-slate-950/70 p-3 rounded-xl border border-slate-800/80">
          <span className="text-[10px] uppercase font-bold text-sky-400">Najwięcej asyst</span>
          <div className="mt-1">
            <span className="text-lg font-black font-mono text-white">
              {topPassers[0]?.ast || 0} ast
            </span>
            <div className="text-xs text-slate-300 font-semibold truncate">
              {topPassers[0]?.playerName || '-'}
            </div>
          </div>
        </div>

        <div className="bg-slate-950/70 p-3 rounded-xl border border-slate-800/80">
          <span className="text-[10px] uppercase font-bold text-emerald-400">Lider EVAL (FIBA)</span>
          <div className="mt-1">
            <span className="text-lg font-black font-mono text-white">
              {topEval[0]?.eval || 0}
            </span>
            <div className="text-xs text-slate-300 font-semibold truncate">
              {topEval[0]?.playerName || '-'}
            </div>
          </div>
        </div>
      </div>

      {/* QUICK SORT BAR */}
      <div className="flex items-center justify-between gap-2 bg-slate-950/95 p-2.5 rounded-xl border border-slate-800 flex-wrap">
        <div className="flex items-center gap-1.5 text-xs text-slate-400">
          <ArrowUpDown className="w-3.5 h-3.5 text-amber-400" />
          <span className="font-bold text-slate-300">Sortuj tabelę wg:</span>
        </div>

        <div className="flex items-center gap-1 overflow-x-auto pb-0.5 scrollbar-none flex-wrap">
          <button
            onClick={() => handleSort('eval')}
            className={`px-2.5 py-1 rounded-lg text-xs font-black transition ${
              sortKey === 'eval'
                ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-950/40'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            ⭐ EVAL {sortKey === 'eval' && (sortAsc ? '▲' : '▼')}
          </button>

          <button
            onClick={() => handleSort('pts')}
            className={`px-2.5 py-1 rounded-lg text-xs font-black transition ${
              sortKey === 'pts'
                ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-950/40'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            🏀 Punkty (PTS) {sortKey === 'pts' && (sortAsc ? '▲' : '▼')}
          </button>

          <button
            onClick={() => handleSort('plusMinus')}
            className={`px-2.5 py-1 rounded-lg text-xs font-black transition ${
              sortKey === 'plusMinus'
                ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-950/40'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
            title="Sortuj po bilansie punktowym drużyny podczas gry zawodnika (+/-)"
          >
            ⚖️ +/- Bilans {sortKey === 'plusMinus' && (sortAsc ? '▲' : '▼')}
          </button>

          <button
            onClick={() => handleSort('ftm')}
            className={`px-2.5 py-1 rounded-lg text-xs font-bold transition ${
              sortKey === 'ftm'
                ? 'bg-teal-500 text-slate-950 shadow-md'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            🎯 Rzuty wolne (FT) {sortKey === 'ftm' && (sortAsc ? '▲' : '▼')}
          </button>

          <button
            onClick={() => handleSort('totReb')}
            className={`px-2.5 py-1 rounded-lg text-xs font-bold transition ${
              sortKey === 'totReb'
                ? 'bg-blue-500 text-white shadow-md'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            🛡️ Zbiórki {sortKey === 'totReb' && (sortAsc ? '▲' : '▼')}
          </button>

          <button
            onClick={() => handleSort('ast')}
            className={`px-2.5 py-1 rounded-lg text-xs font-bold transition ${
              sortKey === 'ast'
                ? 'bg-sky-500 text-slate-950 shadow-md'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            🎯 Asysty {sortKey === 'ast' && (sortAsc ? '▲' : '▼')}
          </button>

          <button
            onClick={() => handleSort('playerNumber')}
            className={`px-2.5 py-1 rounded-lg text-xs font-bold transition ${
              sortKey === 'playerNumber'
                ? 'bg-slate-200 text-slate-950 shadow-md'
                : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
            }`}
          >
            🔢 Nr {sortKey === 'playerNumber' && (sortAsc ? '▲' : '▼')}
          </button>
        </div>
      </div>

      {/* Main FIBA Box Score Table with Sortable Columns */}
      <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-950/90 shadow-inner">
        <table className="w-full text-left text-xs whitespace-nowrap">
          <thead className="bg-slate-900/90 text-slate-400 uppercase font-mono text-[11px] border-b border-slate-800 select-none">
            <tr>
              <th
                onClick={() => handleSort('playerNumber')}
                className={`py-2.5 px-3 font-bold cursor-pointer transition hover:bg-slate-800 ${
                  sortKey === 'playerNumber' ? 'text-amber-300 bg-amber-500/15' : 'text-amber-400'
                }`}
                title="Sortuj po numerze zawodnika"
              >
                Nr {renderSortIndicator('playerNumber')}
              </th>
              <th
                onClick={() => handleSort('playerName')}
                className={`py-2.5 px-3 font-bold cursor-pointer transition hover:bg-slate-800 ${
                  sortKey === 'playerName' ? 'text-amber-300 bg-amber-500/15' : 'text-white'
                }`}
                title="Sortuj alfabetycznie po nazwisku"
              >
                Zawodnik {renderSortIndicator('playerName')}
              </th>
              <th
                onClick={() => handleSort('pts')}
                className={`py-2.5 px-2 text-center font-black cursor-pointer transition hover:bg-amber-500/20 ${
                  sortKey === 'pts'
                    ? 'text-amber-300 bg-amber-500/25 ring-1 ring-amber-500/40'
                    : 'text-amber-300 bg-amber-500/10'
                }`}
                title="Sortuj po zdobytych punktach (PTS)"
              >
                PTS {renderSortIndicator('pts')}
              </th>
              <th
                onClick={() => handleSort('plusMinus')}
                className={`py-2.5 px-2 text-center font-black cursor-pointer transition hover:bg-slate-800 ${
                  sortKey === 'plusMinus'
                    ? 'text-amber-300 bg-amber-500/25 ring-1 ring-amber-500/40'
                    : 'text-slate-300'
                }`}
                title="Sortuj po wskaźniku +/- (bilans punktowy zespołu podczas obecności zawodnika na parkiecie)"
              >
                +/- {renderSortIndicator('plusMinus')}
              </th>
              <th
                onClick={() => handleSort('fg2m')}
                className={`py-2.5 px-2 text-center cursor-pointer transition hover:bg-slate-800 ${
                  sortKey === 'fg2m' ? 'text-amber-300 bg-slate-800' : ''
                }`}
                title="Sortuj po rzutach za 2 punkty"
              >
                2PT {renderSortIndicator('fg2m')}
              </th>
              <th
                onClick={() => handleSort('fg2Pct')}
                className={`py-2.5 px-2 text-center cursor-pointer transition hover:bg-slate-800 ${
                  sortKey === 'fg2Pct' ? 'text-amber-300 bg-slate-800' : ''
                }`}
                title="Sortuj po skuteczności za 2 punkty (2P%)"
              >
                2P% {renderSortIndicator('fg2Pct')}
              </th>
              <th
                onClick={() => handleSort('fg3m')}
                className={`py-2.5 px-2 text-center cursor-pointer transition hover:bg-slate-800 ${
                  sortKey === 'fg3m' ? 'text-amber-300 bg-slate-800' : ''
                }`}
                title="Sortuj po rzutach za 3 punkty"
              >
                3PT {renderSortIndicator('fg3m')}
              </th>
              <th
                onClick={() => handleSort('fg3Pct')}
                className={`py-2.5 px-2 text-center cursor-pointer transition hover:bg-slate-800 ${
                  sortKey === 'fg3Pct' ? 'text-amber-300 bg-slate-800' : ''
                }`}
                title="Sortuj po skuteczności za 3 punkty (3P%)"
              >
                3P% {renderSortIndicator('fg3Pct')}
              </th>
              <th
                onClick={() => handleSort('fgm')}
                className={`py-2.5 px-2 text-center cursor-pointer transition hover:bg-slate-800 ${
                  sortKey === 'fgm' ? 'text-amber-300 bg-slate-800' : ''
                }`}
                title="Sortuj po rzutach z gry (FG)"
              >
                FG (Z gry) {renderSortIndicator('fgm')}
              </th>
              <th
                onClick={() => handleSort('fgPct')}
                className={`py-2.5 px-2 text-center cursor-pointer transition hover:bg-slate-800 ${
                  sortKey === 'fgPct' ? 'text-amber-300 bg-slate-800' : ''
                }`}
                title="Sortuj po skuteczności z gry (FG%)"
              >
                FG% {renderSortIndicator('fgPct')}
              </th>
              <th
                onClick={() => handleSort('ftm')}
                className={`py-2.5 px-2 text-center cursor-pointer transition hover:bg-slate-800 ${
                  sortKey === 'ftm' ? 'text-teal-300 bg-teal-500/20' : ''
                }`}
                title="Sortuj po rzutach wolnych / osobistych (FT)"
              >
                FT (Wolne) {renderSortIndicator('ftm')}
              </th>
              <th
                onClick={() => handleSort('ftPct')}
                className={`py-2.5 px-2 text-center cursor-pointer transition hover:bg-slate-800 ${
                  sortKey === 'ftPct' ? 'text-teal-300 bg-slate-800' : ''
                }`}
                title="Sortuj po skuteczności wolnych (FT%)"
              >
                FT% {renderSortIndicator('ftPct')}
              </th>
              <th
                onClick={() => handleSort('offReb')}
                className={`py-2.5 px-2 text-center cursor-pointer transition hover:bg-slate-800 ${
                  sortKey === 'offReb' ? 'text-blue-300 bg-slate-800' : ''
                }`}
                title="Sortuj po zbiórkach w ataku"
              >
                ZB Atak {renderSortIndicator('offReb')}
              </th>
              <th
                onClick={() => handleSort('defReb')}
                className={`py-2.5 px-2 text-center cursor-pointer transition hover:bg-slate-800 ${
                  sortKey === 'defReb' ? 'text-indigo-300 bg-slate-800' : ''
                }`}
                title="Sortuj po zbiórkach w obronie"
              >
                ZB Obr {renderSortIndicator('defReb')}
              </th>
              <th
                onClick={() => handleSort('totReb')}
                className={`py-2.5 px-2 text-center font-bold cursor-pointer transition hover:bg-slate-800 ${
                  sortKey === 'totReb' ? 'text-blue-300 bg-blue-500/20' : 'text-blue-300'
                }`}
                title="Sortuj po sumie zbiórek (REB)"
              >
                ZB Suma {renderSortIndicator('totReb')}
              </th>
              <th
                onClick={() => handleSort('ast')}
                className={`py-2.5 px-2 text-center font-bold cursor-pointer transition hover:bg-slate-800 ${
                  sortKey === 'ast' ? 'text-sky-300 bg-sky-500/20' : 'text-sky-300'
                }`}
                title="Sortuj po asystach (AST)"
              >
                AST {renderSortIndicator('ast')}
              </th>
              <th
                onClick={() => handleSort('stl')}
                className={`py-2.5 px-2 text-center cursor-pointer transition hover:bg-slate-800 ${
                  sortKey === 'stl' ? 'text-violet-300 bg-violet-500/20' : 'text-violet-300'
                }`}
                title="Sortuj po przechwytach (PRZ)"
              >
                PRZ {renderSortIndicator('stl')}
              </th>
              <th
                onClick={() => handleSort('blk')}
                className={`py-2.5 px-2 text-center cursor-pointer transition hover:bg-slate-800 ${
                  sortKey === 'blk' ? 'text-cyan-300 bg-cyan-500/20' : 'text-cyan-300'
                }`}
                title="Sortuj po blokach (BLK)"
              >
                BLK {renderSortIndicator('blk')}
              </th>
              <th
                onClick={() => handleSort('tov')}
                className={`py-2.5 px-2 text-center cursor-pointer transition hover:bg-slate-800 ${
                  sortKey === 'tov' ? 'text-amber-300 bg-amber-500/20' : 'text-amber-400'
                }`}
                title="Sortuj po stratach (STR)"
              >
                STR {renderSortIndicator('tov')}
              </th>
              <th
                onClick={() => handleSort('fouls')}
                className={`py-2.5 px-2 text-center cursor-pointer transition hover:bg-slate-800 ${
                  sortKey === 'fouls' ? 'text-rose-300 bg-rose-500/20' : 'text-rose-400'
                }`}
                title="Sortuj po faulach osobistych"
              >
                FAULE {renderSortIndicator('fouls')}
              </th>
              <th
                onClick={() => handleSort('eval')}
                className={`py-2.5 px-3 text-center font-black cursor-pointer transition hover:bg-emerald-500/20 ${
                  sortKey === 'eval'
                    ? 'text-emerald-300 bg-emerald-500/25 ring-1 ring-emerald-500/40'
                    : 'text-emerald-400 bg-emerald-500/10'
                }`}
                title="Sortuj po wskaźniku efektywności EVAL (FIBA)"
              >
                EVAL {renderSortIndicator('eval')}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60 font-mono">
            {sortedPlayerStatsList.map((s) => (
              <tr key={s.playerId} className="hover:bg-slate-900/60 transition">
                <td className="py-2.5 px-3 font-bold text-amber-400">#{s.playerNumber}</td>
                <td className="py-2.5 px-3 font-sans font-semibold text-slate-200">{s.playerName}</td>
                <td
                  className={`py-2.5 px-2 text-center font-black ${
                    sortKey === 'pts' ? 'text-amber-200 bg-amber-500/15' : 'text-amber-300 bg-amber-500/5'
                  }`}
                >
                  {s.pts}
                </td>
                <td
                  className={`py-2.5 px-2 text-center font-bold ${
                    s.plusMinus > 0
                      ? 'text-emerald-400'
                      : s.plusMinus < 0
                      ? 'text-rose-400'
                      : 'text-slate-400'
                  } ${sortKey === 'plusMinus' ? 'bg-amber-500/10' : ''}`}
                >
                  {s.plusMinus > 0 ? `+${s.plusMinus}` : s.plusMinus}
                </td>
                <td className="py-2.5 px-2 text-center text-slate-300">
                  {s.fg2m}/{s.fg2a}
                </td>
                <td className="py-2.5 px-2 text-center text-slate-400">{s.fg2Pct}%</td>
                <td className="py-2.5 px-2 text-center text-slate-300">
                  {s.fg3m}/{s.fg3a}
                </td>
                <td className="py-2.5 px-2 text-center text-slate-400">{s.fg3Pct}%</td>
                <td className="py-2.5 px-2 text-center text-slate-200 font-semibold">
                  {s.fgm}/{s.fga}
                </td>
                <td className="py-2.5 px-2 text-center text-slate-400">{s.fgPct}%</td>
                <td
                  className={`py-2.5 px-2 text-center ${
                    sortKey === 'ftm' ? 'text-teal-200 font-bold bg-teal-500/15' : 'text-teal-300'
                  }`}
                >
                  {s.ftm}/{s.fta}
                </td>
                <td className="py-2.5 px-2 text-center text-slate-400">{s.ftPct}%</td>
                <td className="py-2.5 px-2 text-center text-blue-300/80">{s.offReb}</td>
                <td className="py-2.5 px-2 text-center text-indigo-300/80">{s.defReb}</td>
                <td
                  className={`py-2.5 px-2 text-center font-bold ${
                    sortKey === 'totReb' ? 'text-blue-200 bg-blue-500/15' : 'text-blue-300'
                  }`}
                >
                  {s.totReb}
                </td>
                <td
                  className={`py-2.5 px-2 text-center font-bold ${
                    sortKey === 'ast' ? 'text-sky-200 bg-sky-500/15' : 'text-sky-300'
                  }`}
                >
                  {s.ast}
                </td>
                <td className="py-2.5 px-2 text-center text-violet-300">{s.stl}</td>
                <td className="py-2.5 px-2 text-center text-cyan-300">{s.blk}</td>
                <td className="py-2.5 px-2 text-center text-amber-400">{s.tov}</td>
                <td className="py-2.5 px-2 text-center font-bold text-rose-400">{s.fouls}</td>
                <td
                  className={`py-2.5 px-3 text-center font-black ${
                    sortKey === 'eval'
                      ? 'text-emerald-300 bg-emerald-500/20 text-sm ring-1 ring-emerald-500/30'
                      : 'text-emerald-400 bg-emerald-500/5'
                  }`}
                >
                  {s.eval}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-slate-900 border-t-2 border-slate-700 font-mono font-bold text-white text-xs">
            <tr>
              <td className="py-2.5 px-3 text-amber-400">-</td>
              <td className="py-2.5 px-3 font-sans font-black tracking-wider text-amber-400">
                RAZEM DRUŻYNA
              </td>
              <td className="py-2.5 px-2 text-center font-black text-amber-300 bg-amber-500/10 text-sm">
                {teamTotals.pts}
              </td>
              {(() => {
                const teamDiff = match.ourScore - match.opponentScore;
                return (
                  <td
                    className={`py-2.5 px-2 text-center font-black ${
                      teamDiff > 0
                        ? 'text-emerald-400'
                        : teamDiff < 0
                        ? 'text-rose-400'
                        : 'text-slate-300'
                    }`}
                  >
                    {teamDiff > 0 ? `+${teamDiff}` : teamDiff}
                  </td>
                );
              })()}
              <td className="py-2.5 px-2 text-center">
                {teamTotals.fg2m}/{teamTotals.fg2a}
              </td>
              <td className="py-2.5 px-2 text-center">{teamTotals.fg2Pct}%</td>
              <td className="py-2.5 px-2 text-center">
                {teamTotals.fg3m}/{teamTotals.fg3a}
              </td>
              <td className="py-2.5 px-2 text-center">{teamTotals.fg3Pct}%</td>
              <td className="py-2.5 px-2 text-center">
                {teamTotals.fgm}/{teamTotals.fga}
              </td>
              <td className="py-2.5 px-2 text-center">{teamTotals.fgPct}%</td>
              <td className="py-2.5 px-2 text-center">
                {teamTotals.ftm}/{teamTotals.fta}
              </td>
              <td className="py-2.5 px-2 text-center">{teamTotals.ftPct}%</td>
              <td className="py-2.5 px-2 text-center">{teamTotals.offReb}</td>
              <td className="py-2.5 px-2 text-center">{teamTotals.defReb}</td>
              <td className="py-2.5 px-2 text-center text-blue-300 font-black">
                {teamTotals.totReb}
              </td>
              <td className="py-2.5 px-2 text-center text-sky-300 font-black">{teamTotals.ast}</td>
              <td className="py-2.5 px-2 text-center text-violet-300 font-black">
                {teamTotals.stl}
              </td>
              <td className="py-2.5 px-2 text-center text-cyan-300 font-black">{teamTotals.blk}</td>
              <td className="py-2.5 px-2 text-center text-amber-400 font-black">
                {teamTotals.tov}
              </td>
              <td className="py-2.5 px-2 text-center text-rose-400 font-black">
                {teamTotals.fouls}
              </td>
              <td className="py-2.5 px-3 text-center font-black text-emerald-400 bg-emerald-500/10 text-sm">
                {teamTotals.eval}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* AI Coach Analysis & Audio Speech */}
      <div className="bg-gradient-to-br from-slate-950 to-slate-900 rounded-xl p-4 border border-amber-500/30">
        <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-amber-400" />
            <h4 className="text-sm font-bold text-white">
              Analiza pomeczowa trenera & Komentarz głosowy
            </h4>
          </div>

          <div className="flex items-center gap-2">
            {!aiRecap && (
              <button
                onClick={handleGenerateCoachRecap}
                disabled={isGeneratingRecap}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold transition active:scale-95 disabled:opacity-50"
              >
                {isGeneratingRecap ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Analizowanie...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Generuj analizę AI</span>
                  </>
                )}
              </button>
            )}

            <button
              onClick={handleSpeakRecap}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition active:scale-95 border ${
                isPlayingAudio
                  ? 'bg-rose-500 hover:bg-rose-400 text-white border-rose-400'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
              }`}
            >
              {isPlayingAudio ? (
                <>
                  <StopCircle className="w-3.5 h-3.5" />
                  <span>Zatrzymaj głos</span>
                </>
              ) : (
                <>
                  <Volume2 className="w-3.5 h-3.5 text-amber-400" />
                  <span>Odsłuchaj lektora (TTS)</span>
                </>
              )}
            </button>
          </div>
        </div>

        {aiRecap ? (
          <p className="text-xs sm:text-sm text-slate-300 leading-relaxed whitespace-pre-line mt-2 p-3 bg-slate-950/70 rounded-lg border border-slate-800">
            {aiRecap}
          </p>
        ) : (
          <p className="text-xs text-slate-400 mt-1 italic">
            Kliknij „Generuj analizę AI”, aby otrzymać trenerskie podsumowanie meczu z mocnymi
            stronami, elementami do poprawy i liderami spotkania w naszym zespole.
          </p>
        )}
      </div>
    </div>
  );
};

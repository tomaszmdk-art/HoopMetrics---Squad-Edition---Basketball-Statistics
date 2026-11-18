import React, { useState, useMemo } from 'react';
import { ClubProfile, Match, Player, TeamCategory, DEFAULT_SEASONS, getMatchSeason } from '../types/basketball';
import {
  Trophy,
  Users,
  Flame,
  PlusCircle,
  PlayCircle,
  Calendar,
  Sparkles,
  ArrowRight,
  ShieldCheck,
  BarChart3,
  TrendingUp,
  Activity,
  Award,
  ExternalLink,
  RefreshCw,
  Clock,
  ChevronRight,
  Share2,
  Eye,
  Heart,
  Edit3,
  X,
  FileText,
  Download,
  Mail,
  Layers,
  Upload,
  Shield,
  UserCheck,
} from 'lucide-react';
import { playClickSound, triggerHaptic } from '../services/tts';
import { useLanguage } from '../i18n/LanguageContext';
import { BoxScoreTable } from './BoxScoreTable';
import { PlayByPlayModal } from './PlayByPlayModal';
import { ResumeMatchConfirmModal } from './ResumeMatchConfirmModal';
import { exportMatchPdf } from '../services/exportPdf';
import { getPlayerFullName, resolveEventPlayerLabel } from '../services/playerDisplay';

interface HomePageProps {
  activeCategory?: TeamCategory;
  onSelectCategory?: (cat: TeamCategory) => void;
  activeMatch: Match | undefined;
  matches: Match[];
  players: Player[];
  clubProfile?: ClubProfile;
  onOpenClubProfile?: () => void;
  onOpenLegalModal?: () => void;
  onOpenNewMatch?: () => void;
  onResumeMatch?: (match: Match) => void;
  onGoToLive: () => void;
  onGoToRoster: () => void;
  onGoToHistory: () => void;
  onGoToParent?: () => void;
  onSyncLZKoszRoster?: () => Promise<void>;
  readOnly?: boolean;
  onOpenShareModal?: () => void;
  onOpenTransferModal?: () => void;
  onOpenTeamExport?: () => void;
  onOpenTeamImport?: () => void;
}

export const HomePage: React.FC<HomePageProps> = ({
  activeMatch,
  matches,
  players,
  clubProfile,
  onOpenClubProfile,
  onOpenLegalModal,
  onOpenNewMatch,
  onResumeMatch,
  onGoToLive,
  onGoToRoster,
  onGoToHistory,
  onGoToParent,
  readOnly = false,
  onOpenShareModal,
  onOpenTransferModal,
  onOpenTeamExport,
  onOpenTeamImport,
}) => {
  const { t } = useLanguage();
  const [viewingMatch, setViewingMatch] = useState<Match | null>(null);
  const [viewingPlayByPlay, setViewingPlayByPlay] = useState<Match | null>(null);
  const [matchToResumeConfirm, setMatchToResumeConfirm] = useState<Match | null>(null);
  const [selectedSeason, setSelectedSeason] = useState<string>('all');
  const [includePersonalData, setIncludePersonalData] = useState<boolean>(false);

  const getRosterForMatch = (match: Match): Player[] => {
    const matched = players.filter(
      (p) =>
        match.rosterPlayerIds?.includes(p.id) ||
        match.events?.some((e) => e.playerId === p.id)
    );
    return matched.length > 0 ? matched : players;
  };

  const clubName = clubProfile?.name || 'Moja Drużyna Koszykarska';
  const city = clubProfile?.city || 'Polska';
  const season = clubProfile?.season || '2026/2027';
  const league = clubProfile?.leagueName || 'Rozgrywki Koszykarskie';

  const teamMatches = matches;
  const teamPlayers = players;

  // Extract available seasons
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

  const finishedMatches = useMemo(() => seasonFilteredMatches.filter((m) => m.status === 'finished'), [seasonFilteredMatches]);

  const wins = finishedMatches.filter((m) => m.ourScore > m.opponentScore).length;
  const losses = finishedMatches.filter((m) => m.ourScore < m.opponentScore).length;
  const ties = finishedMatches.filter((m) => m.ourScore === m.opponentScore).length;

  const totalPointsScored = finishedMatches.reduce((acc, m) => acc + m.ourScore, 0);
  const avgPoints = finishedMatches.length > 0 ? (totalPointsScored / finishedMatches.length).toFixed(1) : '0.0';

  return (
    <div className="w-full max-w-6xl mx-auto px-3 sm:px-6 py-4 sm:py-6 space-y-6">
      {/* 0. PROMINENT LIVE MATCH CARD (Always at the very top for spectators & coach) */}
      {activeMatch && (
        <div
          onClick={onGoToLive}
          className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-slate-950 via-slate-900 to-amber-950/50 border-2 border-rose-500/60 p-4 sm:p-6 shadow-2xl shadow-rose-950/30 cursor-pointer group transition-all hover:border-rose-400 hover:shadow-rose-900/50"
        >
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-2">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-500 text-white text-xs font-black tracking-wider uppercase shadow-md shadow-rose-950/50">
                  <span className="w-2 h-2 rounded-full bg-white" />
                  Mecz na żywo • LIVE
                </span>
                {activeMatch.teamCategory && activeMatch.teamCategory !== 'TEAM' && (
                  <span className="px-2.5 py-1 rounded-full bg-amber-500/20 text-amber-300 text-xs font-black border border-amber-500/40">
                    {activeMatch.teamCategory}
                  </span>
                )}
                <span className="px-2.5 py-1 rounded-full bg-slate-800 text-slate-300 text-xs font-bold border border-slate-700">
                  Kwarta {activeMatch.currentQuarter} • {String(Math.floor(activeMatch.clockSeconds / 60)).padStart(2, '0')}:{String(activeMatch.clockSeconds % 60).padStart(2, '0')}
                </span>
                <span className="text-xs text-slate-400 font-medium">
                  {activeMatch.location === 'Dom' ? '🏠 Mecz u siebie' : '🚗 Wyjazd'}
                </span>
              </div>

              {/* Big Scoreboard Banner */}
              <div className="flex items-center gap-3 sm:gap-6 pt-1 flex-wrap min-w-0">
                <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                  <span className="text-lg sm:text-2xl font-black text-white tracking-tight truncate max-w-[130px] sm:max-w-none">
                    {clubProfile?.shortName || clubName}
                  </span>
                  <span className="text-3xl sm:text-4xl lg:text-5xl font-black text-amber-400 font-mono">
                    {activeMatch.ourScore}
                  </span>
                </div>

                <span className="text-xl sm:text-3xl font-black text-slate-500 font-mono">:</span>

                <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                  <span className="text-3xl sm:text-4xl lg:text-5xl font-black text-slate-100 font-mono">
                    {activeMatch.opponentScore}
                  </span>
                  <span className="text-lg sm:text-2xl font-black text-slate-300 tracking-tight truncate max-w-[130px] sm:max-w-none">
                    {activeMatch.opponent}
                  </span>
                </div>
              </div>

              {/* Last action ticker */}
              {activeMatch.events.length > 0 && (() => {
                const lastEvt = activeMatch.events[activeMatch.events.length - 1];
                const actorLabel =
                  lastEvt.team === 'our'
                    ? lastEvt.playerId || lastEvt.playerNumber !== undefined
                      ? resolveEventPlayerLabel(lastEvt, players, true)
                      : clubProfile?.shortName || clubName
                    : activeMatch.opponent;
                return (
                  <div className="text-xs text-slate-400 flex items-center gap-2 pt-1 font-mono">
                    <span className="text-amber-400 font-bold">Ostatnia akcja:</span>
                    <span className="text-slate-200 truncate max-w-md">
                      {actorLabel}
                      {' • '}
                      {lastEvt.subType || lastEvt.type}
                    </span>
                  </div>
                );
              })()}
            </div>

            <div className="shrink-0 flex items-center">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onGoToLive();
                }}
                className="w-full sm:w-auto py-3.5 px-6 rounded-2xl bg-gradient-to-r from-rose-500 to-amber-500 hover:from-rose-400 hover:to-amber-400 text-white font-black text-sm shadow-xl shadow-rose-950/40 transition active:scale-95 flex items-center justify-center gap-2"
              >
                <Flame className="w-4 h-4" />
                <span>Otwórz protokół meczowy na żywo</span>
                <ChevronRight className="w-4 h-4 ml-1" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 1. Hero Banner: Club Identity & League Badge */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900 via-slate-900 to-amber-950/40 border border-slate-800 p-5 sm:p-8 shadow-2xl">
        <div
          className="absolute top-0 right-0 -mr-16 -mt-16 w-64 h-64 rounded-full pointer-events-none"
          style={{ background: 'radial-gradient(circle, rgba(245, 158, 11, 0.14) 0%, transparent 70%)' }}
        />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-400 text-xs font-black tracking-wide">
                <ShieldCheck className="w-3.5 h-3.5" />
                {t('home.systemBadge')}
              </span>
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-500/20 text-amber-300 text-xs font-black border border-amber-500/40">
                {t('home.seasonBadge')} {season}
              </span>
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-slate-800 text-slate-300 text-xs font-bold border border-slate-700">
                {league}
              </span>
            </div>

            <div className="flex items-center gap-3">
              <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center text-3xl shadow-xl shadow-orange-950/50 border border-amber-300/40 shrink-0 overflow-hidden">
                {clubProfile?.badgeLogoUrl ? (
                  <img src={clubProfile.badgeLogoUrl} alt="Logo" className="w-full h-full object-contain" />
                ) : (
                  clubProfile?.badgeEmoji || '🏀'
                )}
              </div>
              <div>
                <h1 className="text-2xl sm:text-3xl lg:text-4xl font-black text-white tracking-tight">
                  {clubName}
                </h1>
                <p className="text-xs sm:text-sm text-slate-400 font-medium">
                  {city}{clubProfile?.headCoach ? ` • ${t('home.coachLabel')} ${clubProfile.headCoach}` : ''}
                </p>
              </div>
            </div>

            <p className="text-xs sm:text-sm text-slate-300 max-w-2xl leading-relaxed">
              {readOnly ? t('home.spectatorDesc') : t('home.coachDesc')}
            </p>
          </div>

          {/* Quick Actions in Hero */}
          <div className="flex flex-col sm:flex-row md:flex-col gap-2.5 shrink-0 min-w-[200px]">
            {activeMatch ? (
              <button
                onClick={onGoToLive}
                className="w-full py-3.5 px-5 rounded-2xl bg-gradient-to-r from-rose-500 to-orange-500 hover:from-rose-400 hover:to-orange-400 text-white font-black text-sm shadow-xl shadow-rose-950/50 transition transform active:scale-95 flex items-center justify-center gap-2"
              >
                <Flame className="w-4 h-4" />
                <span>{t('home.liveMatchActive')} ({activeMatch.ourScore} : {activeMatch.opponentScore})</span>
              </button>
            ) : !readOnly && onOpenNewMatch ? (
              <button
                onClick={onOpenNewMatch}
                className="w-full py-3.5 px-5 rounded-2xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 font-black text-sm shadow-xl shadow-orange-950/50 transition transform active:scale-95 flex items-center justify-center gap-2"
              >
                <PlusCircle className="w-4 h-4" />
                <span>{t('home.newMatchBtn')}</span>
              </button>
            ) : (
              <button
                onClick={onGoToRoster}
                className="w-full py-3.5 px-5 rounded-2xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 font-black text-sm shadow-xl shadow-orange-950/50 transition transform active:scale-95 flex items-center justify-center gap-2"
              >
                <Users className="w-4 h-4" />
                <span>{t('home.viewRoster')}</span>
              </button>
            )}

            {!readOnly && onOpenClubProfile && (
              <button
                type="button"
                onClick={onOpenClubProfile}
                className="py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-400 border border-amber-500/40 font-bold text-xs transition flex items-center justify-center gap-2 shadow-md shadow-amber-950/20 active:scale-95"
                title="Wprowadź dane swojego klubu lub zaimportuj skład"
              >
                <ShieldCheck className="w-3.5 h-3.5 text-amber-400" />
                <span>Konfiguruj Klub & Składy</span>
              </button>
            )}

            {!readOnly && onOpenTeamExport && (
              <button
                type="button"
                onClick={onOpenTeamExport}
                className="py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-emerald-400 border border-emerald-500/40 font-bold text-xs transition flex items-center justify-center gap-2 shadow-sm active:scale-95"
                title="Eksportuj drużynę (dane klubu, zdjęcia zawodników, mecze) do JSON lub wyślij na e-mail"
              >
                <Mail className="w-3.5 h-3.5 text-emerald-400" />
                <span>Eksport Drużyny (E-mail)</span>
              </button>
            )}

            {!readOnly && onOpenLegalModal && (
              <button
                onClick={onOpenLegalModal}
                className="py-2.5 px-4 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-indigo-300 border border-indigo-500/30 font-bold text-xs transition flex items-center justify-center gap-2 shadow-sm active:scale-95"
                title="Publikacja w sklepie Google Play, licencje i RODO"
              >
                <Award className="w-3.5 h-3.5 text-indigo-400" />
                <span>Google Play & Licencje</span>
              </button>
            )}

            {!readOnly && onOpenShareModal && (
              <button
                onClick={onOpenShareModal}
                className="py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 font-bold text-xs transition flex items-center justify-center gap-2 shadow-sm active:scale-95"
                title="Skopiuj i wyślij link do podglądu rodzicom"
              >
                <Share2 className="w-3.5 h-3.5 text-amber-400" />
                <span>Udostępnij link kibicom</span>
              </button>
            )}

            {readOnly && onOpenTeamImport && (
              <button
                type="button"
                onClick={onOpenTeamImport}
                className="py-2.5 px-4 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/40 font-bold text-xs transition flex items-center justify-center gap-2 active:scale-95"
                title="Wczytaj plik JSON ze składem i zdjęciami od trenera (zapis lokalny)"
              >
                <Upload className="w-3.5 h-3.5 text-emerald-400" />
                <span>Importuj skład (lokalnie)</span>
              </button>
            )}

            {readOnly && (
              <button
                onClick={onGoToHistory}
                className="py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 font-bold text-xs transition flex items-center justify-center gap-2"
              >
                <Trophy className="w-3.5 h-3.5 text-amber-400" />
                <span>Historia spotkań</span>
              </button>
            )}
          </div>
        </div>

        {/* Season Switcher Pill inside Hero */}
        <div className="mt-6 pt-5 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-400 flex items-center gap-1">
                <Layers className="w-3.5 h-3.5 text-amber-400" />
                Sezon:
              </span>
              <div className="inline-flex rounded-xl bg-slate-950 p-1 border border-slate-800 overflow-x-auto scrollbar-none max-w-full">
                <button
                  type="button"
                  onClick={() => {
                    playClickSound();
                    setSelectedSeason('all');
                  }}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition whitespace-nowrap ${
                    selectedSeason === 'all'
                      ? 'bg-amber-500 text-slate-950 font-black shadow-md'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Wszystkie
                </button>
                {availableSeasons.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => {
                      playClickSound();
                      setSelectedSeason(s);
                    }}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition whitespace-nowrap ${
                      selectedSeason === s
                        ? 'bg-amber-500 text-slate-950 font-black shadow-md'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4 text-xs font-mono text-slate-400">
            <span>{t('roster.title')} <strong className="text-white">{teamPlayers.length}</strong></span>
            <span>{t('home.matchesPlayed')}: <strong className="text-white">{finishedMatches.length}</strong></span>
          </div>
        </div>
      </div>

      {/* 2. Key Stats Summary Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 shadow-lg">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-xs font-bold">{t('home.seasonOverview')}</span>
            <Trophy className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-2xl sm:text-3xl font-black text-white">
            {wins} - {losses}
            {ties > 0 && <span className="text-xs text-slate-400 ml-1">({ties} R)</span>}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            {t('home.wins')} / {t('home.losses')}
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 shadow-lg">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-xs font-bold">{t('home.avgPts')}</span>
            <Activity className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl sm:text-3xl font-black text-white">
            {avgPoints}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            {t('home.ptsScored')}: {totalPointsScored} {t('selector.pts')}
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 shadow-lg">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-xs font-bold">{t('nav.roster')}</span>
            <Users className="w-4 h-4 text-sky-400" />
          </div>
          <div className="text-2xl sm:text-3xl font-black text-white">
            {teamPlayers.length}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            {league}
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 shadow-lg">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-xs font-bold">{t('nav.liveMatch')}</span>
            <Flame className="w-4 h-4 text-orange-400" />
          </div>
          <div className="text-lg sm:text-xl font-black text-white truncate">
            {activeMatch ? t('home.liveMatchActive') : (readOnly ? t('nav.spectator') : t('home.startNewMatch', 'Gotowy do meczu'))}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            {activeMatch ? `vs ${activeMatch.opponent} (Q${activeMatch.currentQuarter})` : t('home.noMatchesSub', 'Brak aktywnego meczu')}
          </div>
        </div>
      </div>

      {/* PARENT MODE SPOTLIGHT CARD */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-rose-950/40 via-slate-900 to-amber-950/30 border border-rose-500/30 p-5 sm:p-6 shadow-xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start sm:items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-rose-500/20 border border-rose-500/40 text-2xl flex items-center justify-center text-rose-400 shrink-0 shadow-lg">
              👨‍👩‍👧
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-black text-rose-400 uppercase tracking-wider flex items-center gap-1">
                  <Heart className="w-3.5 h-3.5 fill-rose-500 text-rose-500" />
                  <span>{t('home.parentShortcut')}</span>
                </span>
              </div>
              <h3 className="text-base sm:text-lg font-black text-white mt-1">
                {t('parent.title')}
              </h3>
              <p className="text-xs text-slate-300 mt-0.5 max-w-2xl leading-relaxed">
                {t('home.parentShortcutDesc')}
              </p>
            </div>
          </div>

          {onGoToParent && (
            <button
              onClick={() => {
                playClickSound();
                triggerHaptic(30);
                onGoToParent();
              }}
              className="flex items-center justify-center gap-2 px-5 py-3 rounded-2xl bg-gradient-to-r from-rose-500 to-orange-500 hover:from-rose-400 hover:to-orange-400 text-white font-black text-xs shadow-lg shadow-rose-950/50 transition active:scale-95 shrink-0 self-start md:self-center"
            >
              <Heart className="w-4 h-4 fill-current" />
              <span>{t('nav.parentMode')}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* 3. Main 2-column layout: Left (Active/Recent Matches) & Right (Roster from LZKosz) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Matches Section (2 cols) */}
        <div className="lg:col-span-2 space-y-4">
          {/* Active Live Match Spotlight (if any) */}
          {activeMatch && (
            <div className="p-5 rounded-2xl bg-gradient-to-r from-amber-500/10 via-orange-500/10 to-transparent border-2 border-amber-500/50 shadow-xl">
              <div className="flex items-center justify-between mb-3">
                <span className="flex items-center gap-2 text-xs font-black text-amber-400 uppercase tracking-wider">
                  <span className="w-2.5 h-2.5 rounded-full bg-rose-500" />
                  {t('home.liveMatchActive')} • {t('match.quarter')} {activeMatch.currentQuarter}
                </span>
                <span className="text-xs font-mono text-slate-400">
                  {t('match.clock')}: {activeMatch.clockSeconds > 0 ? `${Math.floor(activeMatch.clockSeconds / 60)}:${(activeMatch.clockSeconds % 60).toString().padStart(2, '0')}` : '00:00'}
                </span>
              </div>

              <div className="flex items-center justify-between py-2">
                <div className="text-left">
                  <div className="text-xs text-slate-400 font-bold uppercase">{clubName}</div>
                  <div className="text-3xl sm:text-4xl font-black text-amber-400">{activeMatch.ourScore}</div>
                </div>
                <div className="text-xl font-black text-slate-600">:</div>
                <div className="text-right">
                  <div className="text-xs text-slate-400 font-bold uppercase truncate max-w-[140px] sm:max-w-none">
                    {activeMatch.opponent}
                  </div>
                  <div className="text-3xl sm:text-4xl font-black text-white">{activeMatch.opponentScore}</div>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-800 flex items-center justify-between gap-3">
                <span className="text-xs text-slate-400">
                  {activeMatch.events.length} {t('live.actionLog')}
                </span>
                <button
                  onClick={onGoToLive}
                  className="py-2 px-4 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs transition flex items-center gap-1.5 shadow-md shadow-amber-950/40"
                >
                  <span>{t('live.backToMatch')}</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}

          {/* Recent Matches List */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Trophy className="w-4 h-4 text-amber-400" />
                <h2 className="text-base font-bold text-white">
                  {t('home.recentMatches')}
                </h2>
              </div>
              <button
                onClick={onGoToHistory}
                className="text-xs font-bold text-amber-400 hover:text-amber-300 flex items-center gap-1"
              >
                <span>{t('home.fullHistory')}</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {seasonFilteredMatches.length === 0 ? (
              <div className="text-center py-8 text-slate-500 text-xs space-y-3">
                <p>
                  {selectedSeason === 'all'
                    ? t('home.noMatches')
                    : `Brak meczów w sezonie ${selectedSeason}`}
                </p>
                {onOpenTransferModal && (
                  <button
                    type="button"
                    onClick={onOpenTransferModal}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-sky-400 border border-sky-500/30 font-bold text-xs transition active:scale-95 shadow-sm"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>{t('transfer.title')}</span>
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-2.5">
                {seasonFilteredMatches.slice(0, 4).map((m) => {
                  const isWin = m.ourScore > m.opponentScore;
                  const isLoss = m.ourScore < m.opponentScore;
                  return (
                    <div
                      key={m.id}
                      onClick={() => {
                        playClickSound();
                        triggerHaptic(20);
                        if (m.status === 'live') {
                          onGoToLive();
                        } else {
                          setViewingMatch(m);
                        }
                      }}
                      className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800/80 hover:border-slate-700 flex items-center justify-between gap-3 cursor-pointer transition group"
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-2 h-10 rounded-full ${
                            m.status === 'live'
                              ? 'bg-rose-500'
                              : isWin
                              ? 'bg-emerald-500'
                              : isLoss
                              ? 'bg-rose-500'
                              : 'bg-amber-500'
                          }`}
                        />
                        <div>
                          <div className="text-xs sm:text-sm font-bold text-white group-hover:text-amber-400 transition flex items-center gap-2">
                            <span>vs {m.opponent}</span>
                            {m.status === 'live' && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-400 font-bold border border-rose-500/30">
                                LIVE
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-slate-400 font-mono flex items-center gap-2 mt-0.5 flex-wrap">
                            <span className="text-[10px] px-1.5 py-0.2 rounded font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 font-sans">
                              {getMatchSeason(m, clubProfile?.season)}
                            </span>
                            <span className="flex items-center gap-1">
                              <Calendar className="w-3 h-3 text-slate-500" />
                              {m.date}
                            </span>
                            <span>•</span>
                            <span>{m.location || 'Hala Zatoka Sportu'}</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <div className="text-sm sm:text-base font-black font-mono">
                            <span className={isWin ? 'text-emerald-400' : 'text-white'}>
                              {m.ourScore}
                            </span>
                            <span className="text-slate-500 mx-1">:</span>
                            <span className={isLoss ? 'text-rose-400' : 'text-slate-300'}>
                              {m.opponentScore}
                            </span>
                          </div>
                          <div className="text-[10px] text-slate-500">
                            {m.events.length} {t('live.actionLog')}
                          </div>
                        </div>

                        {/* Quick action buttons on card */}
                        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                          <button
                            type="button"
                            onClick={() => {
                              playClickSound();
                              triggerHaptic(20);
                              if (m.status === 'live') {
                                onGoToLive();
                              } else {
                                setViewingMatch(m);
                              }
                            }}
                            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
                            title={m.status === 'live' ? 'Otwórz relację live' : 'Zobacz raport meczu'}
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>

                          {!readOnly && onResumeMatch && m.status !== 'live' && (
                            <button
                              type="button"
                              onClick={() => {
                                playClickSound();
                                triggerHaptic(20);
                                setMatchToResumeConfirm(m);
                              }}
                              className="p-1.5 rounded-lg bg-slate-800 hover:bg-amber-500/20 text-slate-300 hover:text-amber-400 border border-transparent hover:border-amber-500/30 transition active:scale-95"
                              title="Edytuj mecz (po zatwierdzeniu)"
                            >
                              <Edit3 className="w-3.5 h-3.5 text-amber-400" />
                            </button>
                          )}
                        </div>

                        <ChevronRight className="w-4 h-4 text-slate-600 group-hover:text-amber-400 transition" />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Roster Preview (1 col) */}
        <div className="space-y-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-amber-400" />
                <h2 className="text-base font-bold text-white">
                  {t('roster.title')}
                </h2>
              </div>
              <button
                onClick={onGoToRoster}
                className="text-xs font-bold text-amber-400 hover:text-amber-300 flex items-center gap-1"
              >
                <span>{t('home.manageRoster')}</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <p className="text-[11px] text-slate-400 mb-3">
              {t('roster.subtitleCoach')}:
            </p>

            <div className="space-y-1.5 max-h-[360px] overflow-y-auto pr-1">
              {teamPlayers.length === 0 ? (
                <div className="text-center py-6 text-xs text-slate-500">
                  Brak zawodników w składzie drużyny.
                </div>
              ) : (
                teamPlayers.map((player) => (
                  <div
                    key={player.id}
                    className="flex items-center justify-between p-2 rounded-xl bg-slate-950/60 border border-slate-800/80 text-xs"
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="w-6 h-6 rounded-lg bg-amber-500/20 text-amber-400 font-mono font-black flex items-center justify-center text-[11px] border border-amber-500/30">
                        {player.number}
                      </span>
                      <span className="font-bold text-slate-200">
                        {getPlayerFullName(player)}
                      </span>
                    </div>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 font-semibold uppercase">
                      {player.position || t('box.player')}
                    </span>
                  </div>
                ))
              )}
            </div>

            <div className="mt-4 pt-3 border-t border-slate-800 flex items-center justify-end">
              <button
                onClick={onGoToRoster}
                className="text-xs font-bold text-amber-400 hover:text-amber-300"
              >
                {readOnly
                  ? 'Uzupełnij imiona drużyny (lokalnie) →'
                  : `+ ${t('roster.addPlayer')}`}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Full Box Score Modal for finished match clicked from Home */}
      {viewingMatch && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-950/90 overflow-y-auto">
          <div className="w-full max-w-4xl max-h-[92vh] flex flex-col rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl text-slate-100 overflow-hidden my-auto">
            <div className="flex items-center justify-between p-3 sm:p-4 border-b border-slate-800 bg-slate-950 flex-wrap gap-2">
              <span className="text-sm font-bold text-white">
                Raport Meczowy: {clubProfile?.shortName || clubName} vs {viewingMatch.opponent} ({viewingMatch.ourScore}:{viewingMatch.opponentScore})
              </span>
              <div className="flex items-center gap-2 flex-wrap">
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
                <div className="inline-flex items-center gap-0.5 p-0.5 rounded-lg bg-slate-900 border border-slate-800">
                  <button
                    type="button"
                    onClick={() => setIncludePersonalData(false)}
                    className={`flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-bold transition ${
                      !includePersonalData
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                        : 'text-slate-400 hover:text-slate-200 border border-transparent'
                    }`}
                  >
                    <Shield className="w-3 h-3" />
                    <span>Zanonimizowany</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setIncludePersonalData(true)}
                    className={`flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-bold transition ${
                      includePersonalData
                        ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                        : 'text-slate-400 hover:text-slate-200 border border-transparent'
                    }`}
                  >
                    <UserCheck className="w-3 h-3" />
                    <span>Pełny</span>
                  </button>
                </div>
                <button
                  onClick={() => {
                    exportMatchPdf(viewingMatch, getRosterForMatch(viewingMatch), {
                      includeBoxScore: true,
                      includePlayByPlay: true,
                      includePlayerPages: true,
                      includePersonalData,
                    });
                  }}
                  className="px-2.5 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 text-xs font-bold transition flex items-center gap-1"
                  title="Pobierz raport meczowy PDF"
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span>PDF</span>
                </button>
                <button
                  onClick={() => setViewingPlayByPlay(viewingMatch)}
                  className="px-3 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-amber-400 border border-slate-700"
                >
                  Play-by-Play
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
                rosterPlayers={getRosterForMatch(viewingMatch)}
                isMatchActive={false}
                clubProfile={clubProfile}
                defaultIncludePersonalData={includePersonalData}
                onChangeIncludePersonalData={setIncludePersonalData}
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
          rosterPlayers={players}
          onDeleteEvent={readOnly ? undefined : () => {}}
          defaultIncludePersonalData={includePersonalData}
          onChangeIncludePersonalData={setIncludePersonalData}
        />
      )}

      {/* Confirmation Modal to Edit Finished Match */}
      <ResumeMatchConfirmModal
        isOpen={!!matchToResumeConfirm}
        match={matchToResumeConfirm}
        clubName={clubProfile?.shortName || clubName}
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

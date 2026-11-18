import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ActionType, ClubProfile, Match, MatchEvent, Player } from '../types/basketball';
import { ScoreBoard } from './ScoreBoard';
import { SubstitutionModal } from './SubstitutionModal';
import { PlayerSelector } from './PlayerSelector';
import { ActionKeypad } from './ActionKeypad';
import { BoxScoreTable } from './BoxScoreTable';
import { PlayByPlayModal } from './PlayByPlayModal';
import { calculatePlayerStats, getEventPoints, recalculateMatchScores } from '../services/statsCalculator';
import { announcePlay, triggerHaptic, playClickSound, playScoreSound } from '../services/tts';
import { BarChart3, ListOrdered, CheckCircle2, Sparkles, FileText } from 'lucide-react';
import { VoiceStatsAssistant } from './VoiceStatsAssistant';
import { ParsedVoiceAction } from '../services/voiceRecognitionService';
import { LivePlayByPlayStream } from './LivePlayByPlayStream';
import { LiveSpectatorActionPopup } from './LiveSpectatorActionPopup';
import { LiveMatchTheme } from '../types/liveMatchTheme';
import { getStoredLiveMatchTheme, THEME_CHANGE_EVENT } from '../services/liveMatchThemeService';

interface LiveMatchProps {
  match: Match;
  players: Player[];
  clubProfile?: ClubProfile;
  onUpdateMatch?: (updatedOrUpdater: Match | ((prevMatch: Match) => Match)) => void;
  onFinishMatch?: () => void;
  soundEnabled?: boolean;
  onToggleSound?: () => void;
  handMode?: 'right' | 'left';
  readOnly?: boolean;
}

export const LiveMatch: React.FC<LiveMatchProps> = ({
  match,
  players,
  clubProfile,
  onUpdateMatch,
  onFinishMatch,
  soundEnabled = false,
  onToggleSound = () => {},
  handMode = 'right',
  readOnly = false,
}) => {
  const clubName = clubProfile?.shortName || clubProfile?.name || 'Nasz Zespół';

  const ACTION_VOICE_TEMPLATES: Record<string, string> = {
    '2PT_MADE': 'Celny rzut za 2 punkty {player}!',
    '2PT_MISS': 'Niecelny rzut za 2 punkty {player}.',
    '3PT_MADE': 'Trójka! Celny rzut za 3 punkty {player}!',
    '3PT_MISS': 'Niecelna trójka {player}.',
    'FT_MADE': 'Celny rzut wolny {player}!',
    'FT_MISS': 'Niecelny rzut wolny {player}.',
    'OFF_REB': 'Zbiórka w ataku {player}.',
    'DEF_REB': 'Zbiórka w obronie {player}.',
    'ASSIST': 'Asysta {player}!',
    'STEAL': 'Przechwyt {player}!',
    'BLOCK': 'Blok {player}!',
    'TURNOVER': 'Strata {player}.',
    'FOUL': 'Faul osobisty {player}.',
    'OPP_1PT': 'Punkt dla przeciwnika.',
    'OPP_2PT': 'Kosz dla przeciwnika za 2 punkty.',
    'OPP_3PT': 'Trójka dla przeciwnika.',
    'OPP_MINUS_1': 'Korekta punktu przeciwnika.',
    'OPP_FOUL': 'Faul przeciwnika.',
    'MANUAL_OUR_PLUS_1': `Dodano punkt dla drużyny ${clubName}.`,
    'MANUAL_OUR_PLUS_2': `Dodano 2 punkty dla drużyny ${clubName}.`,
    'MANUAL_OUR_PLUS_3': `Dodano 3 punkty dla drużyny ${clubName}.`,
    'MANUAL_OUR_MINUS_1': `Odjęto punkt dla drużyny ${clubName}.`,
  };
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(
    match.onCourtPlayerIds[0] || null
  );
  const [isSubModalOpen, setIsSubModalOpen] = useState(false);
  const [showBoxScore, setShowBoxScore] = useState(false);
  const [showPlayByPlay, setShowPlayByPlay] = useState(false);
  const [spectatorTab, setSpectatorTab] = useState<'boxscore' | 'plays'>('boxscore');

  // Spectator mode: 3-second self-dismissing large popup on new match action
  const [liveActionPopupEvent, setLiveActionPopupEvent] = useState<MatchEvent | null>(null);
  const previousEventsCountRef = useRef<number>(match.events.length);
  const lastProcessedEventIdRef = useRef<string | undefined>(
    match.events.length > 0 ? match.events[match.events.length - 1].id : undefined
  );
  const initialMountRef = useRef<boolean>(true);

  const handleCloseLiveActionPopup = useCallback(() => {
    setLiveActionPopupEvent(null);
  }, []);

  useEffect(() => {
    // On initial mount or match ID switch, align refs without triggering popup for old events
    if (initialMountRef.current) {
      initialMountRef.current = false;
      previousEventsCountRef.current = match.events.length;
      lastProcessedEventIdRef.current = match.events.length > 0 ? match.events[match.events.length - 1].id : undefined;
      return;
    }

    const currentCount = match.events.length;
    const currentLastEvent = currentCount > 0 ? match.events[currentCount - 1] : undefined;

    // In spectator mode (readOnly), trigger popup whenever a new action is recorded by statistician
    if (
      readOnly &&
      currentLastEvent &&
      currentLastEvent.id !== lastProcessedEventIdRef.current &&
      currentCount > previousEventsCountRef.current
    ) {
      lastProcessedEventIdRef.current = currentLastEvent.id;
      setLiveActionPopupEvent(currentLastEvent);
      if (soundEnabled) {
        if (currentLastEvent.points > 0) {
          playScoreSound(currentLastEvent.points);
        } else {
          playClickSound();
        }
      }
    }

    previousEventsCountRef.current = currentCount;
    if (currentLastEvent) {
      lastProcessedEventIdRef.current = currentLastEvent.id;
    }
  }, [match.events, match.id, readOnly, soundEnabled]);

  // Stats mode: Basic (1-click fast recording) vs. Extended (opens subtype options modal)
  const [statsMode, setStatsMode] = useState<'basic' | 'extended'>(() => {
    try {
      const stored = localStorage.getItem('basketstats_stats_mode');
      if (stored === 'basic' || stored === 'extended') return stored;
    } catch {
      // ignore
    }
    return 'basic'; // Default is basic
  });

  // Customized Live Match Theme (colors, font sizes, heights, etc.)
  const [liveTheme, setLiveTheme] = useState<LiveMatchTheme>(getStoredLiveMatchTheme);

  useEffect(() => {
    const handleThemeChange = (e: any) => {
      if (e.detail) {
        setLiveTheme(e.detail);
      } else {
        setLiveTheme(getStoredLiveMatchTheme());
      }
    };
    window.addEventListener(THEME_CHANGE_EVENT, handleThemeChange);
    window.addEventListener('storage', handleThemeChange);
    return () => {
      window.removeEventListener(THEME_CHANGE_EVENT, handleThemeChange);
      window.removeEventListener('storage', handleThemeChange);
    };
  }, []);

  const toggleStatsMode = () => {
    playClickSound();
    triggerHaptic(25);
    setStatsMode((prev) => {
      const next = prev === 'basic' ? 'extended' : 'basic';
      try {
        localStorage.setItem('basketstats_stats_mode', next);
      } catch {
        // ignore
      }
      return next;
    });
  };

  // View mode: 'auto' (detect screen width: < 768px is mobile, >= 768px is tablet), or force 'mobile' / 'tablet'
  const [viewMode, setViewMode] = useState<'auto' | 'mobile' | 'tablet'>(() => {
    try {
      const stored = localStorage.getItem('basketstats_view_mode');
      if (stored === 'mobile' || stored === 'tablet') return stored;
    } catch {
      // ignore
    }
    return 'auto';
  });

  const [isScreenTablet, setIsScreenTablet] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return window.innerWidth >= 768;
    }
    return false;
  });

  useEffect(() => {
    const handleResize = () => {
      setIsScreenTablet(window.innerWidth >= 768);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handleSelectViewMode = (mode: 'auto' | 'mobile' | 'tablet') => {
    setViewMode(mode);
    try {
      localStorage.setItem('basketstats_view_mode', mode);
    } catch {
      // ignore
    }
  };

  const isTablet = viewMode === 'tablet' || (viewMode === 'auto' && isScreenTablet);

  // Roster players for this match
  const rosterPlayers = players.filter((p) =>
    match.rosterPlayerIds?.includes(p.id)
  );

  const selectedPlayer = players.find((p) => p.id === selectedPlayerId) || null;
  const selectedPlayerStats = selectedPlayer ? calculatePlayerStats(selectedPlayer, match.events, match) : null;
  const selectedPlayerPoints = selectedPlayerStats ? selectedPlayerStats.pts : 0;
  const selectedPlayerEval = selectedPlayerStats ? selectedPlayerStats.eval : 0;

  // Last event for undo label
  const lastEvent = match.events.length > 0 ? match.events[match.events.length - 1] : undefined;

  // Format current clock MM:SS
  const clockMin = Math.floor(match.clockSeconds / 60);
  const clockSec = match.clockSeconds % 60;
  const gameClockFormatted = `${String(clockMin).padStart(2, '0')}:${String(clockSec).padStart(2, '0')}`;

  const handleRecordAction = (type: ActionType, subType?: string) => {
    if (!onUpdateMatch) return;
    const { ourPts, oppPts } = getEventPoints({ type });
    const isOurTeam = ourPts !== 0 || !type.startsWith('OPP_');
    const pointsScored = isOurTeam ? ourPts : oppPts;

    let finalOurScore = match.ourScore;
    let finalOppScore = match.opponentScore;

    onUpdateMatch((currentMatch) => {
      const currentClockMin = Math.floor(currentMatch.clockSeconds / 60);
      const currentClockSec = currentMatch.clockSeconds % 60;
      const formattedClock = `${String(currentClockMin).padStart(2, '0')}:${String(currentClockSec).padStart(2, '0')}`;

      const newEvent: MatchEvent = {
        id: `evt-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
        matchId: currentMatch.id,
        timestamp: Date.now(),
        quarter: currentMatch.currentQuarter,
        gameClock: formattedClock,
        clockSeconds: currentMatch.clockSeconds,
        type: type,
        team: isOurTeam ? 'our' : 'opp',
        points: pointsScored,
        playerId: isOurTeam && selectedPlayer ? selectedPlayer.id : undefined,
        playerNumber: isOurTeam && selectedPlayer ? selectedPlayer.number : undefined,
        subType: subType,
        onCourtPlayerIds: [...(currentMatch.onCourtPlayerIds || [])],
        ourScoreAfter: currentMatch.ourScore + ourPts,
        oppScoreAfter: currentMatch.opponentScore + oppPts,
      };

      const newEvents = [...currentMatch.events, newEvent];
      const recalculated = recalculateMatchScores(newEvents);

      finalOurScore = recalculated.ourScore;
      finalOppScore = recalculated.oppScore;

      return {
        ...currentMatch,
        ourScore: recalculated.ourScore,
        opponentScore: recalculated.oppScore,
        quarterScores: recalculated.quarterScores,
        events: recalculated.updatedEvents,
        updatedAt: Date.now(),
      };
    });

    // Audio announcement via Gemini TTS or browser speech
    if (soundEnabled) {
      let tpl = ACTION_VOICE_TEMPLATES[type] || type;
      if (selectedPlayer && isOurTeam) {
        const playerLabel = subType
          ? `numer ${selectedPlayer.number}, ${subType}`
          : `numer ${selectedPlayer.number}`;
        tpl = tpl.replace('{player}', playerLabel);
      } else {
        tpl = tpl.replace('{player}', '');
      }

      // Add score mention on scoring actions
      if (ourPts > 0 || oppPts > 0) {
        tpl += ` Wynik: ${finalOurScore} do ${finalOppScore}.`;
      }

      announcePlay(tpl);
    }
  };

  const handleRecordBatchActions = (actions: ParsedVoiceAction[]) => {
    if (!onUpdateMatch || actions.length === 0) return;

    onUpdateMatch((currentMatch) => {
      const updatedEvents = [...currentMatch.events];

      for (const action of actions) {
        const { ourPts, oppPts } = getEventPoints({ type: action.actionType });
        const isOurTeam = action.team === 'our' || (ourPts !== 0 || !action.actionType.startsWith('OPP_'));
        const pointsScored = isOurTeam ? ourPts : oppPts;

        // Determine player: match by playerId or playerNumber or selectedPlayer
        let ply: Player | undefined;
        if (isOurTeam) {
          if (action.playerId) {
            ply = players.find((p) => p.id === action.playerId);
          }
          if (!ply && action.playerNumber !== undefined) {
            ply =
              players.find(
                (p) =>
                  p.number === action.playerNumber &&
                  (!currentMatch.rosterPlayerIds?.length || currentMatch.rosterPlayerIds.includes(p.id))
              ) || players.find((p) => p.number === action.playerNumber);
          }
          if (!ply && selectedPlayer) {
            ply = selectedPlayer;
          }
        }

        const currentClockMin = Math.floor(currentMatch.clockSeconds / 60);
        const currentClockSec = currentMatch.clockSeconds % 60;
        const formattedClock = `${String(currentClockMin).padStart(2, '0')}:${String(currentClockSec).padStart(2, '0')}`;

        const newEvent: MatchEvent = {
          id: `evt-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
          matchId: currentMatch.id,
          timestamp: Date.now(),
          quarter: currentMatch.currentQuarter,
          gameClock: formattedClock,
          clockSeconds: currentMatch.clockSeconds,
          type: action.actionType,
          team: isOurTeam ? 'our' : 'opp',
          points: pointsScored,
          playerId: isOurTeam && ply ? ply.id : undefined,
          playerNumber: isOurTeam && ply ? ply.number : undefined,
          onCourtPlayerIds: [...(currentMatch.onCourtPlayerIds || [])],
          ourScoreAfter: currentMatch.ourScore, // will be properly updated by recalculateMatchScores
          oppScoreAfter: currentMatch.opponentScore,
        };

        updatedEvents.push(newEvent);
      }

      const recalculated = recalculateMatchScores(updatedEvents);

      return {
        ...currentMatch,
        ourScore: recalculated.ourScore,
        opponentScore: recalculated.oppScore,
        quarterScores: recalculated.quarterScores,
        events: recalculated.updatedEvents,
        updatedAt: Date.now(),
      };
    });

    // Automatically update selectedPlayerId if a specific player was referenced
    const lastWithPlayer = [...actions].reverse().find((a) => a.playerId);
    if (lastWithPlayer?.playerId) {
      setSelectedPlayerId(lastWithPlayer.playerId);
    } else {
      const lastWithNum = [...actions].reverse().find((a) => a.playerNumber !== undefined);
      if (lastWithNum?.playerNumber !== undefined) {
        const found =
          players.find(
            (p) =>
              p.number === lastWithNum.playerNumber &&
              (!match.rosterPlayerIds?.length || match.rosterPlayerIds.includes(p.id))
          ) || players.find((p) => p.number === lastWithNum.playerNumber);
        if (found) {
          setSelectedPlayerId(found.id);
        }
      }
    }
  };

  const handleUndo = () => {
    if (!onUpdateMatch) return;
    playClickSound();
    triggerHaptic(30);

    onUpdateMatch((currentMatch) => {
      if (currentMatch.events.length === 0) return currentMatch;
      const newEvents = currentMatch.events.slice(0, -1);
      const recalculated = recalculateMatchScores(newEvents);

      return {
        ...currentMatch,
        ourScore: recalculated.ourScore,
        opponentScore: recalculated.oppScore,
        quarterScores: recalculated.quarterScores,
        events: recalculated.updatedEvents,
        updatedAt: Date.now(),
      };
    });
  };

  const handleDeleteEvent = (eventId: string) => {
    if (!onUpdateMatch) return;
    onUpdateMatch((currentMatch) => {
      const newEvents = currentMatch.events.filter((e) => e.id !== eventId);
      const recalculated = recalculateMatchScores(newEvents);

      return {
        ...currentMatch,
        ourScore: recalculated.ourScore,
        opponentScore: recalculated.oppScore,
        quarterScores: recalculated.quarterScores,
        events: recalculated.updatedEvents,
        updatedAt: Date.now(),
      };
    });
  };

  return (
    <div className="w-full flex-1 flex flex-col bg-slate-950 text-slate-100 min-h-full">
      {/* 1. Scoreboard (Quarter, Clock, Official Headline Score, Opponent & Team Adjustments) */}
      <ScoreBoard
        match={match}
        clubProfile={clubProfile}
        onUpdateMatch={onUpdateMatch}
        onRecordAction={handleRecordAction}
        onToggleSound={onToggleSound}
        soundEnabled={soundEnabled}
        readOnly={readOnly}
        liveTheme={liveTheme}
        onOpenBoxScore={() => setShowBoxScore(true)}
        onOpenPlayByPlay={() => setShowPlayByPlay(true)}
        onFinishMatch={onFinishMatch}
        statsMode={statsMode}
        onToggleStatsMode={toggleStatsMode}
        layoutMode={isTablet ? 'tablet' : 'mobile'}
        viewMode={viewMode}
        onSelectViewMode={handleSelectViewMode}
      />

      {/* READ-ONLY SPECTATOR VIEW */}
      {readOnly ? (
        <div className="flex-1 flex flex-col p-3 sm:p-5 max-w-5xl mx-auto w-full space-y-4">
          {/* Spectator live status bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 rounded-2xl bg-slate-900 border border-slate-800 shadow-md">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
              <span className="text-xs font-black tracking-wide text-white uppercase">
                PODGLĄD MECZU NA ŻYWO
              </span>
              <span className="text-[10px] text-emerald-400 font-bold px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30">
                Tylko do odczytu
              </span>
            </div>
            <div className="text-[11px] text-slate-400 flex items-center gap-2 sm:gap-3 flex-wrap">
              <span>Wyniki i statystyki live</span>
              <span className="font-mono font-bold text-amber-400 bg-slate-950 px-2 py-0.5 rounded-md border border-slate-800">
                {match.events.length} akcji
              </span>
              <button
                onClick={() => {
                  const ev =
                    match.events.length > 0
                      ? match.events[match.events.length - 1]
                      : {
                          id: 'sample-preview-evt',
                          matchId: match.id,
                          timestamp: Date.now(),
                          quarter: match.currentQuarter,
                          gameClock: gameClockFormatted,
                          clockSeconds: match.clockSeconds,
                          type: '2PT_MADE' as ActionType,
                          team: 'our' as const,
                          points: 2,
                          playerId: rosterPlayers[0]?.id,
                          playerNumber: rosterPlayers[0]?.number ?? 10,
                          subType: 'Wjazd pod kosz (Layup)',
                          ourScoreAfter: match.ourScore,
                          oppScoreAfter: match.opponentScore,
                        };
                  setLiveActionPopupEvent(ev);
                  if (soundEnabled) playScoreSound(ev.points || 2);
                  else playClickSound();
                }}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-400 border border-slate-700 text-xs font-bold transition active:scale-95 shadow-sm"
                title="Przetestuj okienko nowej akcji meczowej (3-sekundowe samoznikające okno widza)"
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                <span>Podgląd okienka akcji</span>
              </button>
              <button
                onClick={() => setShowPlayByPlay(true)}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-slate-800 hover:bg-slate-700 text-sky-400 border border-slate-700 text-xs font-bold transition active:scale-95 shadow-sm"
                title="Otwórz oficjalny protokół meczu w oknie z opcją pobrania PDF"
              >
                <FileText className="w-3.5 h-3.5" />
                <span>Otwórz protokół PDF</span>
              </button>
            </div>
          </div>

          {/* Spectator Sub-Tabs */}
          <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
            <button
              onClick={() => setSpectatorTab('boxscore')}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition ${
                spectatorTab === 'boxscore'
                  ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-950/40'
                  : 'bg-slate-900 text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <BarChart3 className="w-4 h-4" />
              <span>Statystyki Zawodników (Box Score & Eval)</span>
            </button>

            <button
              onClick={() => setSpectatorTab('plays')}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition ${
                spectatorTab === 'plays'
                  ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-950/40'
                  : 'bg-slate-900 text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <ListOrdered className="w-4 h-4" />
              <span>📋 Protokół meczowy na żywo ({match.events.length})</span>
            </button>
          </div>

          {/* Tab 1: Live Box Score Table */}
          {spectatorTab === 'boxscore' && (
            <div className="bg-slate-900/60 rounded-2xl border border-slate-800 p-3 sm:p-4 shadow-xl">
              <BoxScoreTable
                match={match}
                rosterPlayers={rosterPlayers}
                isMatchActive={true}
                clubProfile={clubProfile}
              />
            </div>
          )}

          {/* Tab 2: Live Play-by-Play Match Protocol */}
          {spectatorTab === 'plays' && (
            <LivePlayByPlayStream
              match={match}
              clubProfile={clubProfile}
              rosterPlayers={rosterPlayers}
              readOnly={true}
            />
          )}
        </div>
      ) : (
        /* COACH / INTERACTIVE MATCH MODE */
        <>
          {/* Voice Stats Assistant: Prowadzenie statystyk głosem i hands-free */}
          <VoiceStatsAssistant
            match={match}
            rosterPlayers={rosterPlayers}
            selectedPlayerId={selectedPlayerId}
            onRecordBatchActions={handleRecordBatchActions}
            onUndoLastAction={handleUndo}
            onSelectPlayer={setSelectedPlayerId}
            soundEnabled={soundEnabled}
          />

          {isTablet ? (
            /* TABLET / DESKTOP VIEW (Preserves previous layout with full PlayerSelector & 4-row ActionKeypad) */
            <div className="flex-1 flex flex-col min-h-0 space-y-2 p-1 sm:p-2">
              {/* Primary Player Selector with photos, names, points, +/-, eval, fouls & bench */}
              <PlayerSelector
                match={match}
                rosterPlayers={rosterPlayers}
                selectedPlayerId={selectedPlayerId}
                onSelectPlayer={setSelectedPlayerId}
                onUpdateMatch={onUpdateMatch!}
                liveTheme={liveTheme}
              />

              {/* Tablet 4-Row Action Keypad styled with liveTheme */}
              <div className="flex-1 flex flex-col min-h-0">
                <ActionKeypad
                  layoutMode="tablet"
                  onCourtPlayers={rosterPlayers.filter((p) => match.onCourtPlayerIds.includes(p.id))}
                  selectedPlayerId={selectedPlayerId}
                  onSelectPlayer={setSelectedPlayerId}
                  onOpenSubModal={() => setIsSubModalOpen(true)}
                  selectedPlayer={selectedPlayer}
                  selectedPlayerPoints={selectedPlayerPoints}
                  selectedPlayerEval={selectedPlayerEval}
                  lastEvent={lastEvent}
                  onRecordAction={handleRecordAction}
                  onUndoLastAction={handleUndo}
                  canUndo={match.events.length > 0}
                  handMode={handMode}
                  statsMode={statsMode}
                  onToggleStatsMode={toggleStatsMode}
                  liveTheme={liveTheme}
                />
              </div>
            </div>
          ) : (
            /* MOBILE VIEW (Strictly matches obraz_e70c8a86.png with 5 player tiles having only number on left) */
            <>
              <div className="flex-1 flex flex-col min-h-0">
                <ActionKeypad
                  layoutMode="mobile"
                  onCourtPlayers={rosterPlayers.filter((p) => match.onCourtPlayerIds.includes(p.id))}
                  selectedPlayerId={selectedPlayerId}
                  onSelectPlayer={setSelectedPlayerId}
                  onOpenSubModal={() => setIsSubModalOpen(true)}
                  selectedPlayer={selectedPlayer}
                  selectedPlayerPoints={selectedPlayerPoints}
                  selectedPlayerEval={selectedPlayerEval}
                  lastEvent={lastEvent}
                  onRecordAction={handleRecordAction}
                  onUndoLastAction={handleUndo}
                  canUndo={match.events.length > 0}
                  handMode={handMode}
                  statsMode={statsMode}
                  onToggleStatsMode={toggleStatsMode}
                  liveTheme={liveTheme}
                />
              </div>

              {/* Mobile Multi-Player Substitutions Modal */}
              <SubstitutionModal
                isOpen={isSubModalOpen}
                onClose={() => setIsSubModalOpen(false)}
                match={match}
                rosterPlayers={rosterPlayers}
                selectedPlayerId={selectedPlayerId}
                onSelectPlayer={setSelectedPlayerId}
                onUpdateMatch={onUpdateMatch!}
              />
            </>
          )}
        </>
      )}

      {/* Box Score Full Table Modal */}
      {showBoxScore && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-950/85 overflow-y-auto">
          <div className="w-full max-w-4xl max-h-[92vh] flex flex-col rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl overflow-hidden my-auto">
            <div className="flex items-center justify-between p-3 border-b border-slate-800 bg-slate-950">
              <span className="text-sm font-bold text-white">Statystyki Meczowe na Żywo</span>
              <button
                onClick={() => setShowBoxScore(false)}
                className="px-3 py-1 rounded-lg bg-slate-800 text-xs font-semibold text-slate-300 hover:text-white"
              >
                Powrót do meczu
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-3 sm:p-5">
              <BoxScoreTable
                match={match}
                rosterPlayers={rosterPlayers}
                isMatchActive={true}
                clubProfile={clubProfile}
                onFinishMatch={
                  onFinishMatch
                    ? () => {
                        setShowBoxScore(false);
                        onFinishMatch();
                      }
                    : undefined
                }
              />
            </div>
          </div>
        </div>
      )}

      {/* Play by Play Modal */}
      <PlayByPlayModal
        isOpen={showPlayByPlay}
        onClose={() => setShowPlayByPlay(false)}
        match={match}
        rosterPlayers={rosterPlayers.length > 0 ? rosterPlayers : players}
        onDeleteEvent={!readOnly ? handleDeleteEvent : undefined}
      />

      {/* 3-Second Self-Dismissing Large Action Popup for Spectators */}
      {readOnly && (
        <LiveSpectatorActionPopup
          event={liveActionPopupEvent}
          match={match}
          players={players}
          clubProfile={clubProfile}
          onClose={handleCloseLiveActionPopup}
          durationMs={3000}
        />
      )}
    </div>
  );
};

import React, { useState, useEffect, useRef } from 'react';
import {
  Play,
  Pause,
  RotateCcw,
  Volume2,
  VolumeX,
  Plus,
  Minus,
  Clock,
  ShieldAlert,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  SlidersHorizontal,
  ChevronDown,
  ChevronUp,
  BarChart3,
  ListOrdered,
  Sparkles,
  Smartphone,
  Tablet,
} from 'lucide-react';
import { ActionType, ClubProfile, Match } from '../types/basketball';
import { playBuzzerSound, playClickSound, triggerHaptic, announcePlay } from '../services/tts';
import { useLanguage } from '../i18n/LanguageContext';
import { LiveMatchTheme } from '../types/liveMatchTheme';

interface ScoreBoardProps {
  match: Match;
  clubProfile?: ClubProfile;
  onUpdateMatch?: (updatedOrUpdater: Match | ((prevMatch: Match) => Match)) => void;
  onRecordAction?: (actionType: ActionType) => void;
  onToggleSound?: () => void;
  soundEnabled?: boolean;
  readOnly?: boolean;
  liveTheme?: LiveMatchTheme;
  onOpenBoxScore?: () => void;
  onOpenPlayByPlay?: () => void;
  onFinishMatch?: () => void;
  statsMode?: 'basic' | 'extended';
  onToggleStatsMode?: () => void;
  layoutMode?: 'mobile' | 'tablet';
  viewMode?: 'auto' | 'mobile' | 'tablet';
  onSelectViewMode?: (mode: 'auto' | 'mobile' | 'tablet') => void;
}

export const ScoreBoard: React.FC<ScoreBoardProps> = ({
  match,
  clubProfile,
  onUpdateMatch,
  onRecordAction,
  onToggleSound,
  soundEnabled = false,
  readOnly = false,
  liveTheme,
  onOpenBoxScore,
  onOpenPlayByPlay,
  onFinishMatch,
  statsMode,
  onToggleStatsMode,
  layoutMode = 'mobile',
  viewMode = 'auto',
  onSelectViewMode,
}) => {
  const { language, t } = useLanguage();
  const [isEditingClock, setIsEditingClock] = useState(false);
  const [editMinutes, setEditMinutes] = useState(0);
  const [editSeconds, setEditSeconds] = useState(0);

  // Expandable dropdown menu for secondary match controls
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  // 3-second long press on clock state & timers (holding 3s opens time settings modal)
  const [longPressProgress, setLongPressProgress] = useState(0); // 0 to 100%
  const [isHoldingClock, setIsHoldingClock] = useState(false);
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const progressIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const isLongPressTriggeredRef = useRef(false);
  const pressStartTimeRef = useRef<number>(0);
  const touchHandledRef = useRef(false);

  // Accelerating hold implementation for time adjustment (+1s and -1s)
  const holdTimerRef = useRef<{
    timeout: NodeJS.Timeout | null;
    interval: NodeJS.Timeout | null;
    startTime: number;
    direction: 1 | -1;
  }>({
    timeout: null,
    interval: null,
    startTime: 0,
    direction: 1,
  });

  const clearHoldTimers = () => {
    if (holdTimerRef.current.timeout) {
      clearTimeout(holdTimerRef.current.timeout);
      holdTimerRef.current.timeout = null;
    }
    if (holdTimerRef.current.interval) {
      clearInterval(holdTimerRef.current.interval);
      holdTimerRef.current.interval = null;
    }
  };

  const handleClockAdjustPressStart = (direction: 1 | -1, e?: React.SyntheticEvent) => {
    if (readOnly || !onUpdateMatch) return;
    if (e && e.cancelable) {
      e.preventDefault();
    }

    clearHoldTimers();

    // 1. Single tap / initial unit step (+1 or -1 sec)
    adjustClock(direction * 1);
    playClickSound();
    triggerHaptic(20);

    const startTime = Date.now();
    holdTimerRef.current.startTime = startTime;
    holdTimerRef.current.direction = direction;

    // 2. Start hold detection timeout (300ms)
    holdTimerRef.current.timeout = setTimeout(() => {
      // Dynamic acceleration step that scrolls faster and faster in escalating tempo
      const stepAccelerating = () => {
        const elapsed = Date.now() - startTime;
        let stepSeconds = 1;
        let nextIntervalMs = 180;

        if (elapsed < 1000) {
          stepSeconds = 1;
          nextIntervalMs = 180;
        } else if (elapsed < 2500) {
          stepSeconds = 2;
          nextIntervalMs = 120;
        } else if (elapsed < 4500) {
          stepSeconds = 5;
          nextIntervalMs = 80;
        } else {
          stepSeconds = 10;
          nextIntervalMs = 50;
        }

        adjustClock(direction * stepSeconds);
        triggerHaptic(10);

        holdTimerRef.current.timeout = setTimeout(stepAccelerating, nextIntervalMs);
      };

      stepAccelerating();
    }, 300);
  };

  const handleClockAdjustPressEnd = () => {
    clearHoldTimers();
  };

  // Clean up long press timers on unmount
  useEffect(() => {
    return () => {
      if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
      if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
      clearHoldTimers();
    };
  }, []);

  const startClockPress = (isTouch: boolean = false) => {
    if (readOnly || !onUpdateMatch) return;
    if (isTouch) {
      touchHandledRef.current = true;
    } else if (touchHandledRef.current) {
      return;
    }

    isLongPressTriggeredRef.current = false;
    pressStartTimeRef.current = Date.now();
    setIsHoldingClock(true);
    setLongPressProgress(0);

    if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
    if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);

    // Progress updates smoothly every 30ms -> 3000ms total
    progressIntervalRef.current = setInterval(() => {
      const elapsed = Date.now() - pressStartTimeRef.current;
      const pct = Math.min(100, (elapsed / 3000) * 100);
      setLongPressProgress(pct);
    }, 30);

    longPressTimerRef.current = setTimeout(() => {
      isLongPressTriggeredRef.current = true;
      setIsHoldingClock(false);
      setLongPressProgress(0);
      if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);

      playClickSound();
      triggerHaptic(75);

      // Open time setting modal after holding for 3 seconds!
      setEditMinutes(Math.floor(match.clockSeconds / 60));
      setEditSeconds(match.clockSeconds % 60);
      setIsEditingClock(true);
    }, 3000);
  };

  const cancelClockPress = () => {
    if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
    if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
    setIsHoldingClock(false);
    setLongPressProgress(0);
  };

  const endClockPress = (isTouch: boolean = false) => {
    if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
    if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
    setIsHoldingClock(false);
    setLongPressProgress(0);

    if (isTouch) {
      setTimeout(() => {
        touchHandledRef.current = false;
      }, 500);
    } else if (touchHandledRef.current) {
      return;
    }

    // If held 3s+, long press already opened the modal! Do not trigger clock toggle
    if (isLongPressTriggeredRef.current) {
      isLongPressTriggeredRef.current = false;
      return;
    }

    // Normal click/tap: "Kliknięcie na czas włącza/wyłacza zegar"
    if (readOnly || !onUpdateMatch) return;

    toggleClock();
  };

  // Quarter rollback warning modal state (when trying to go back to previous quarter)
  const [rollbackTargetQuarter, setRollbackTargetQuarter] = useState<number | null>(null);

  // Quarter completion notification state
  const [quarterEndedNotice, setQuarterEndedNotice] = useState<{
    endedQuarter: number;
    nextQuarter: number;
  } | null>(null);

  // Timer interval: uses functional update to never overwrite concurrent actions or events
  useEffect(() => {
    if (readOnly || !onUpdateMatch) return;
    let interval: NodeJS.Timeout | null = null;
    if (match.isClockRunning) {
      interval = setInterval(() => {
        onUpdateMatch((prev) => {
          if (!prev.isClockRunning) return prev;
          const nextSecondsPlayed: Record<string, number> = {
            ...(prev.playerSecondsPlayed || {}),
          };
          for (const pid of prev.onCourtPlayerIds || []) {
            nextSecondsPlayed[pid] = (nextSecondsPlayed[pid] || 0) + 1;
          }

          if (prev.clockSeconds > 1) {
            return {
              ...prev,
              clockSeconds: prev.clockSeconds - 1,
              playerSecondsPlayed: nextSecondsPlayed,
            };
          } else {
            // Clock hit 0:00! Quarter completed!
            playBuzzerSound();
            triggerHaptic(100);

            const endedQ = prev.currentQuarter;
            let nextQ = endedQ;

            // Automatically advance to next quarter: Q1->Q2, Q2->Q3, Q3->Q4, or OT if tied
            if (endedQ < 4) {
              nextQ = endedQ + 1;
            } else if (endedQ >= 4 && prev.ourScore === prev.opponentScore) {
              nextQ = 5; // OT / Dogrywka if tied
            }

            const endedLabel = endedQ > 4 ? 'Dogrywka' : `Kwarta ${endedQ}`;
            const nextLabel = nextQ > 4 ? 'Dogrywka' : `Kwarta ${nextQ}`;

            // Show friendly quarter end modal notification
            setQuarterEndedNotice({
              endedQuarter: endedQ,
              nextQuarter: nextQ,
            });

            if (soundEnabled) {
              announcePlay(`Koniec ${endedLabel}! Automatycznie aktywowano: ${nextLabel}.`);
            }

            return {
              ...prev,
              isClockRunning: false,
              currentQuarter: nextQ,
              clockSeconds: nextQ === 5 ? 5 * 60 : prev.quarterMinutes * 60,
              playerSecondsPlayed: nextSecondsPlayed,
            };
          }
        });
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [match.isClockRunning, onUpdateMatch, readOnly, soundEnabled]);

  const toggleClock = () => {
    if (!onUpdateMatch) return;
    playClickSound();
    triggerHaptic(25);
    onUpdateMatch((prev) => ({
      ...prev,
      isClockRunning: !prev.isClockRunning,
    }));
  };

  const adjustClock = (deltaSeconds: number) => {
    if (!onUpdateMatch) return;
    onUpdateMatch((prev) => {
      const newSeconds = Math.max(0, Math.min(prev.quarterMinutes * 60, prev.clockSeconds + deltaSeconds));
      return {
        ...prev,
        clockSeconds: newSeconds,
      };
    });
  };

  // Helper to apply quarter change
  const applySetQuarter = (q: number) => {
    if (!onUpdateMatch) return;
    playClickSound();
    triggerHaptic(30);
    onUpdateMatch((prev) => ({
      ...prev,
      currentQuarter: q,
      isClockRunning: false,
      clockSeconds: q === 5 ? 5 * 60 : prev.quarterMinutes * 60,
    }));
    setRollbackTargetQuarter(null);
  };

  // Switch quarter with safety check: if target is a previous quarter, show confirmation modal
  const handleSetQuarter = (q: number) => {
    if (!onUpdateMatch) return;
    if (q === match.currentQuarter) return;

    if (q < match.currentQuarter) {
      // Trying to go back to a previous quarter: open confirmation modal!
      playClickSound();
      setRollbackTargetQuarter(q);
      return;
    }

    // Moving forward: switch directly
    applySetQuarter(q);
  };

  // Calculate team fouls in current quarter
  const currentQuarterFouls = match.events.filter(
    (e) => e.quarter === match.currentQuarter && e.type === 'FOUL'
  ).length;

  const currentQuarterOppFouls = match.events.filter(
    (e) => e.quarter === match.currentQuarter && e.type === 'OPP_FOUL'
  ).length;

  const minutes = Math.floor(match.clockSeconds / 60);
  const seconds = match.clockSeconds % 60;
  const formattedTime = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

  const quarters = [1, 2, 3, 4, 5];

  return (
    <div className="w-full bg-slate-900 border-b border-slate-800 p-1.5 sm:p-3 text-slate-100 shadow-xl select-none">
      {/* 1. TOP HEADER BAR: Tablet mode displays direct quarters & tools; Mobile mode displays compact bar with expandable Opcje */}
      {layoutMode === 'tablet' ? (
        /* TABLET TOP BAR */
        <div className="flex flex-col gap-2 mb-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            {/* Left: Venue & Quarter switcher right here on the bar! */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="px-2.5 py-1 rounded-xl text-xs font-black tracking-wider bg-amber-500/20 text-amber-400 border border-amber-500/40 shrink-0">
                {match.currentQuarter > 4 ? 'Dogrywka (OT)' : `Kwarta ${match.currentQuarter}`}
              </span>
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
                {match.teamCategory && match.teamCategory !== 'TEAM' ? `${match.teamCategory} • ` : ''}
                {match.location === 'Dom' ? '🏠 Dom' : '🚌 Wyjazd'}
              </span>

              {/* Quarters Switcher Buttons directly on bar */}
              <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800">
                {quarters.map((q) => {
                  const isOT = q === 5;
                  const label = isOT ? 'OT' : `Q${q}`;
                  const isActive = match.currentQuarter === q;
                  return (
                    <button
                      key={q}
                      disabled={readOnly}
                      onClick={() => !readOnly && handleSetQuarter(q)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-black transition ${
                        isActive
                          ? 'bg-amber-500 text-slate-950 shadow-sm'
                          : 'text-slate-400 hover:text-white hover:bg-slate-800'
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>

              {/* Quarters Score Summary Strip */}
              <div className="hidden lg:flex items-center gap-2 px-2.5 py-1 rounded-xl bg-slate-950 border border-slate-800 text-xs font-mono text-slate-300">
                <span>Q1: <strong className="text-white">{match.quarterScores.q1.our}-{match.quarterScores.q1.opp}</strong></span>
                <span className="text-slate-600">•</span>
                <span>Q2: <strong className="text-white">{match.quarterScores.q2.our}-{match.quarterScores.q2.opp}</strong></span>
                <span className="text-slate-600">•</span>
                <span>Q3: <strong className="text-white">{match.quarterScores.q3.our}-{match.quarterScores.q3.opp}</strong></span>
                <span className="text-slate-600">•</span>
                <span>Q4: <strong className="text-white">{match.quarterScores.q4.our}-{match.quarterScores.q4.opp}</strong></span>
                {match.quarterScores.ot && (
                  <>
                    <span className="text-slate-600">•</span>
                    <span>OT: <strong className="text-amber-400">{match.quarterScores.ot.our}-{match.quarterScores.ot.opp}</strong></span>
                  </>
                )}
              </div>
            </div>

            {/* Right: Tools & Actions */}
            <div className="flex items-center gap-1.5 flex-wrap">
              {/* Layout Switcher (Tablet <-> Mobile) */}
              {onSelectViewMode && (
                <button
                  onClick={() => onSelectViewMode(viewMode === 'mobile' ? 'tablet' : 'mobile')}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-300 border border-slate-700 text-xs font-bold transition active:scale-95"
                  title="Przełącz układ: Telefon / Tablet"
                >
                  <Tablet className="w-3.5 h-3.5 text-amber-400" />
                  <span>Układ: Tablet</span>
                </button>
              )}

              {/* Sound toggle */}
              {onToggleSound && (
                <button
                  onClick={onToggleSound}
                  className={`p-1.5 rounded-xl border transition active:scale-95 ${
                    soundEnabled
                      ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400'
                      : 'bg-slate-800 border-slate-700 text-slate-500 hover:text-slate-300'
                  }`}
                  title={soundEnabled ? 'Dźwięki meczu WŁĄCZONE' : 'Dźwięki WYŁĄCZONE'}
                >
                  {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
                </button>
              )}

              {/* Stats mode toggle */}
              {onToggleStatsMode && (
                <button
                  onClick={onToggleStatsMode}
                  className="px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-bold flex items-center gap-1 transition active:scale-95"
                >
                  <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                  <span>{statsMode === 'extended' ? 'Rozszerzony' : 'Podstawowy'}</span>
                </button>
              )}

              {/* Box score */}
              {onOpenBoxScore && (
                <button
                  onClick={onOpenBoxScore}
                  className="px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-bold flex items-center gap-1 transition active:scale-95"
                >
                  <BarChart3 className="w-3.5 h-3.5 text-amber-400" />
                  <span>Statystyki</span>
                </button>
              )}

              {/* Play by play */}
              {onOpenPlayByPlay && (
                <button
                  onClick={onOpenPlayByPlay}
                  className="px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-bold flex items-center gap-1 transition active:scale-95"
                >
                  <ListOrdered className="w-3.5 h-3.5 text-sky-400" />
                  <span>Protokół ({match.events.length})</span>
                </button>
              )}

              {/* Finish Match */}
              {onFinishMatch && (
                <button
                  onClick={onFinishMatch}
                  className="px-3 py-1.5 rounded-xl bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/40 text-emerald-300 text-xs font-black flex items-center gap-1 transition active:scale-95"
                >
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span>Zakończ</span>
                </button>
              )}
            </div>
          </div>
        </div>
      ) : (
        /* MOBILE TOP BAR: Quarter pill, venue, quick sound, layout switcher, and Expandable Menu Toggle */
        <div className="flex items-center justify-between gap-1.5 mb-1.5 sm:mb-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="px-2 py-0.5 rounded-full text-[11px] sm:text-xs font-black tracking-wider bg-amber-500/20 text-amber-400 border border-amber-500/40 shrink-0">
              {match.currentQuarter > 4 ? 'Dogrywka (OT)' : `Kwarta ${match.currentQuarter}`}
            </span>
            <span className="text-[10px] sm:text-xs font-semibold text-slate-400 uppercase tracking-wide truncate">
              {match.teamCategory && match.teamCategory !== 'TEAM' ? `${match.teamCategory} • ` : ''}
              {match.location === 'Dom' ? '🏠 Dom' : '🚌 Wyjazd'}
            </span>
          </div>

          {/* Action icons: Layout Switcher, Sound & Expandable Menu Toggle */}
          <div className="flex items-center gap-1.5 shrink-0">
            {onSelectViewMode && (
              <button
                onClick={() => onSelectViewMode(viewMode === 'tablet' ? 'mobile' : 'tablet')}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-gradient-to-b from-slate-800 to-slate-900 hover:from-slate-700 hover:to-slate-800 text-amber-300 border-2 border-slate-700/80 shadow-md shadow-black/40 text-[11px] font-bold transition active:scale-95"
                title="Przełącz na układ tabletowy"
              >
                <Smartphone className="w-3.5 h-3.5 text-amber-400" />
                <span className="hidden xs:inline">Telefon</span>
              </button>
            )}

            {onToggleSound && (
              <button
                onClick={onToggleSound}
                className={`p-1.5 rounded-xl border-2 transition active:scale-95 shadow-md shadow-black/40 ${
                  soundEnabled
                    ? 'bg-gradient-to-b from-emerald-950/60 to-emerald-900/60 border-emerald-500/50 text-emerald-400 shadow-emerald-950/30'
                    : 'bg-gradient-to-b from-slate-800 to-slate-900 border-slate-700/80 text-slate-500 hover:text-slate-300'
                }`}
                title={soundEnabled ? 'Dźwięki meczu WŁĄCZONE' : 'Dźwięki WYŁĄCZONE'}
              >
                {soundEnabled ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
              </button>
            )}

            {/* Expandable Options Menu Button */}
            <button
              onClick={() => {
                playClickSound();
                setIsMenuOpen(!isMenuOpen);
              }}
              className={`flex items-center gap-1 px-2.5 py-1.5 rounded-xl border-2 text-xs font-bold transition active:scale-95 ${
                isMenuOpen
                  ? 'bg-gradient-to-b from-amber-400 via-amber-500 to-amber-600 text-slate-950 border-amber-300 shadow-lg shadow-amber-950/50 font-black'
                  : 'bg-gradient-to-b from-slate-800 to-slate-900 hover:from-slate-700 hover:to-slate-800 text-slate-200 border-slate-700/80 shadow-md shadow-black/40'
              }`}
              title="Rozwiń dodatkowe opcje meczu (kwarty, czas, protokół, statystyki)"
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              <span className="font-extrabold text-[11px] sm:text-xs">Opcje</span>
              {isMenuOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
          </div>
        </div>
      )}

      {/* 2. Expandable Collapsible Menu (for Mobile Mode) */}
      {layoutMode === 'mobile' && isMenuOpen && (
        <div className="mb-2 p-2.5 sm:p-3 rounded-2xl bg-slate-950 border border-amber-500/40 shadow-lg space-y-2.5 w-full max-w-full overflow-hidden">
          {/* Quarters Pills Switcher */}
          <div>
            <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-1 flex items-center justify-between">
              <span>Zmień aktywną kwartę:</span>
              <span className="text-amber-400 font-normal">Aktualnie: {match.currentQuarter > 4 ? 'OT' : `Q${match.currentQuarter}`}</span>
            </div>
            <div className="grid grid-cols-5 gap-1 sm:gap-1.5">
              {quarters.map((q) => {
                const isOT = q === 5;
                const label = isOT ? 'OT' : `Q${q}`;
                const isActive = match.currentQuarter === q;
                return (
                  <button
                    key={q}
                    disabled={readOnly}
                    onClick={() => !readOnly && handleSetQuarter(q)}
                    className={`py-1.5 px-1 rounded-xl text-xs font-bold transition flex items-center justify-center border-2 active:scale-95 min-w-0 ${
                      isActive
                        ? 'bg-gradient-to-b from-amber-400 via-amber-500 to-amber-600 text-slate-950 font-black border-amber-300 shadow-md'
                        : 'bg-gradient-to-b from-slate-800 to-slate-900 text-slate-300 hover:from-slate-700 hover:to-slate-800 hover:text-white border-slate-700/80 shadow-sm'
                    } ${readOnly ? 'cursor-default' : 'cursor-pointer'}`}
                    title={isOT ? 'Dogrywka (OT)' : `Kwarta ${q}`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Quarters Score Summary Strip */}
          <div className="p-2 rounded-xl bg-gradient-to-b from-slate-900 to-slate-950 border-2 border-slate-800/80 text-[11px] font-mono text-slate-300 flex items-center justify-around flex-wrap gap-1">
            <span>Q1: <strong className="text-white font-bold">{match.quarterScores.q1.our}-{match.quarterScores.q1.opp}</strong></span>
            <span className="text-slate-600">•</span>
            <span>Q2: <strong className="text-white font-bold">{match.quarterScores.q2.our}-{match.quarterScores.q2.opp}</strong></span>
            <span className="text-slate-600">•</span>
            <span>Q3: <strong className="text-white font-bold">{match.quarterScores.q3.our}-{match.quarterScores.q3.opp}</strong></span>
            <span className="text-slate-600">•</span>
            <span>Q4: <strong className="text-white font-bold">{match.quarterScores.q4.our}-{match.quarterScores.q4.opp}</strong></span>
            {match.quarterScores.ot && (
              <>
                <span className="text-slate-600">•</span>
                <span>OT: <strong className="text-amber-400 font-bold">{match.quarterScores.ot.our}-{match.quarterScores.ot.opp}</strong></span>
              </>
            )}
          </div>

          {/* Quick Tools Grid in Menu */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 pt-1 border-t border-slate-800/80">
            {/* View Mode Switcher in Menu */}
            {onSelectViewMode && (
              <button
                onClick={() => {
                  onSelectViewMode(viewMode === 'tablet' ? 'mobile' : 'tablet');
                  setIsMenuOpen(false);
                }}
                className="p-2 rounded-xl bg-gradient-to-b from-slate-800 to-slate-900 hover:from-slate-700 hover:to-slate-800 border-2 border-slate-700/80 text-amber-300 text-xs font-bold flex items-center gap-1.5 transition active:scale-95 shadow-sm min-w-0"
              >
                <Tablet className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <span className="truncate">Widok: {viewMode === 'tablet' ? 'Tablet' : 'Telefon'}</span>
              </button>
            )}

            {/* Manual Clock Edit Trigger */}
            <button
              onClick={() => {
                setEditMinutes(Math.floor(match.clockSeconds / 60));
                setEditSeconds(match.clockSeconds % 60);
                setIsEditingClock(true);
                setIsMenuOpen(false);
              }}
              className="p-2 rounded-xl bg-gradient-to-b from-slate-800 to-slate-900 hover:from-slate-700 hover:to-slate-800 border-2 border-slate-700/80 text-slate-200 text-xs font-bold flex items-center gap-1.5 transition active:scale-95 shadow-sm min-w-0"
            >
              <Clock className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span className="truncate">Ustaw czas kwarty</span>
            </button>

            {/* Stats Mode Switcher */}
            {onToggleStatsMode && (
              <button
                onClick={onToggleStatsMode}
                className="p-2 rounded-xl bg-gradient-to-b from-slate-800 to-slate-900 hover:from-slate-700 hover:to-slate-800 border-2 border-slate-700/80 text-slate-200 text-xs font-bold flex items-center gap-1.5 transition active:scale-95 shadow-sm min-w-0"
              >
                <Sparkles className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                <span className="truncate">Tryb: {statsMode === 'extended' ? 'Rozszerzony' : 'Podstawowy'}</span>
              </button>
            )}

            {/* Box Score Trigger */}
            {onOpenBoxScore && (
              <button
                onClick={() => {
                  onOpenBoxScore();
                  setIsMenuOpen(false);
                }}
                className="p-2 rounded-xl bg-gradient-to-b from-slate-800 to-slate-900 hover:from-slate-700 hover:to-slate-800 border-2 border-slate-700/80 text-slate-200 text-xs font-bold flex items-center gap-1.5 transition active:scale-95 shadow-sm min-w-0"
              >
                <BarChart3 className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <span className="truncate">Statystyki (Box Score)</span>
              </button>
            )}

            {/* Play-by-play protocol Trigger */}
            {onOpenPlayByPlay && (
              <button
                onClick={() => {
                  onOpenPlayByPlay();
                  setIsMenuOpen(false);
                }}
                className="p-2 rounded-xl bg-gradient-to-b from-slate-800 to-slate-900 hover:from-slate-700 hover:to-slate-800 border-2 border-slate-700/80 text-slate-200 text-xs font-bold flex items-center gap-1.5 transition active:scale-95 shadow-sm min-w-0"
              >
                <ListOrdered className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                <span className="truncate">Protokół ({match.events.length})</span>
              </button>
            )}

            {/* Finish match Trigger */}
            {onFinishMatch && (
              <button
                onClick={() => {
                  onFinishMatch();
                  setIsMenuOpen(false);
                }}
                className="p-2 col-span-2 sm:col-span-4 rounded-xl bg-gradient-to-b from-emerald-600/30 to-emerald-700/30 hover:from-emerald-600/40 hover:to-emerald-700/40 border-2 border-emerald-500/50 text-emerald-300 text-xs font-black flex items-center justify-center gap-1.5 transition active:scale-95 shadow-sm"
              >
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Zakończ i zatwierdź mecz</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* 3. MAIN SCOREBOARD BODY */}
      {layoutMode === 'tablet' ? (
        /* TABLET MAIN SCOREBOARD (Generous horizontal layout with spaced Start/Pause) */
        <div
          style={
            liveTheme
              ? {
                  background: liveTheme.scoreboard.bgStyle,
                  borderColor: liveTheme.scoreboard.borderColor,
                }
              : undefined
          }
          className={`grid grid-cols-12 items-center gap-3 bg-slate-950/85 p-3 sm:p-4 border border-slate-800/80 ${
            liveTheme ? liveTheme.scoreboard.borderRadius : 'rounded-2xl'
          }`}
        >
          {/* LEFT: OUR TEAM (Col 4) */}
          <div className="col-span-4 flex flex-col items-center justify-center text-center">
            <h2 className="text-xs sm:text-sm font-black uppercase text-amber-400 truncate max-w-full tracking-wider mb-1">
              {clubProfile?.shortName || clubProfile?.name || 'NASZ ZESPÓŁ'}
            </h2>

            <div className="flex items-center justify-center gap-2 sm:gap-4 my-1">
              {!readOnly && onRecordAction && (
                <button
                  onClick={() => onRecordAction('MANUAL_OUR_MINUS_1')}
                  className="w-10 h-10 rounded-xl bg-slate-900 hover:bg-slate-800 active:bg-rose-500/25 text-rose-300 font-mono font-black text-lg border border-slate-700/80 active:scale-95 transition flex items-center justify-center"
                  title="Odejmij 1 punkt (-1)"
                >
                  -1
                </button>
              )}

              <div
                style={
                  liveTheme
                    ? {
                        color: liveTheme.scoreboard.scoreColorOur,
                        fontSize: `${liveTheme.scoreboard.scoreFontSize}px`,
                      }
                    : undefined
                }
                className="text-5xl sm:text-6xl md:text-7xl font-black font-mono tracking-tighter text-amber-300 drop-shadow select-none leading-none"
              >
                {match.ourScore}
              </div>

              {!readOnly && onRecordAction && (
                <button
                  onClick={() => onRecordAction('MANUAL_OUR_PLUS_1')}
                  className="w-10 h-10 rounded-xl bg-slate-900 hover:bg-slate-800 active:bg-emerald-500/25 text-emerald-300 font-mono font-black text-lg border border-slate-700/80 active:scale-95 transition flex items-center justify-center"
                  title="Dodaj 1 punkt (+1)"
                >
                  +1
                </button>
              )}
            </div>

            <div className="text-[11px] font-semibold text-slate-400">
              Faule:{' '}
              <span
                className={`px-1.5 py-0.5 rounded font-bold ${
                  currentQuarterFouls >= 5
                    ? 'bg-rose-500/20 text-rose-400 border border-rose-500/40'
                    : 'text-slate-300'
                }`}
              >
                {currentQuarterFouls}
                {currentQuarterFouls >= 5 && ' (BONUS)'}
              </span>
            </div>
          </div>

          {/* CENTER: GAME CLOCK (Col 4) */}
          <div className="col-span-4 flex flex-col items-center justify-center border-x border-slate-800/80 px-3">
            <span className="text-xs font-bold uppercase tracking-wider text-amber-400/90 mb-1">
              {match.currentQuarter > 4 ? 'Dogrywka (OT)' : `Kwarta ${match.currentQuarter}`}
            </span>

            {/* Digits Display: Tap toggle, hold 3s edit */}
            <div
              onMouseDown={() => startClockPress(false)}
              onMouseUp={() => endClockPress(false)}
              onMouseLeave={cancelClockPress}
              onTouchStart={() => startClockPress(true)}
              onTouchEnd={() => endClockPress(true)}
              onTouchCancel={cancelClockPress}
              onContextMenu={(e) => e.preventDefault()}
              className={`relative px-4 py-1.5 rounded-2xl border transition-all cursor-pointer select-none overflow-hidden touch-none my-1 shadow-lg ${
                isHoldingClock
                  ? 'border-amber-400 bg-amber-500/15 ring-2 ring-amber-400/50 scale-[1.03]'
                  : match.isClockRunning
                    ? 'border-emerald-500/70 bg-slate-900/95 ring-1 ring-emerald-500/40 hover:border-emerald-400 active:scale-95 shadow-emerald-950/40'
                    : 'border-amber-500/40 bg-slate-900/95 ring-1 ring-amber-500/20 hover:border-amber-400 active:scale-95 shadow-amber-950/20'
              }`}
              title="Kliknij zegar: Włącz/Wyłącz (Start/Pauza) • Przytrzymaj 3s: Ustaw czas"
            >
              {isHoldingClock && (
                <div
                  className="absolute inset-0 bg-gradient-to-r from-amber-500/25 via-orange-500/35 to-amber-500/45 transition-all pointer-events-none"
                  style={{ width: `${longPressProgress}%` }}
                />
              )}

              <div
                style={
                  liveTheme
                    ? {
                        color: liveTheme.scoreboard.clockColor,
                        fontSize: `${liveTheme.scoreboard.clockFontSize}px`,
                      }
                    : undefined
                }
                className="relative z-10 flex items-center justify-center text-3xl sm:text-4xl md:text-5xl font-mono font-black tracking-tight leading-none text-white drop-shadow"
              >
                <span>{formattedTime}</span>
              </div>
            </div>

            {/* Controls Spaced Out: -1s / Big Start-Pause / +1s / Edit */}
            {!readOnly && (
              <div className="flex items-center gap-2 mt-2">
                <button
                  type="button"
                  onMouseDown={(e) => handleClockAdjustPressStart(-1, e)}
                  onMouseUp={handleClockAdjustPressEnd}
                  onMouseLeave={handleClockAdjustPressEnd}
                  onTouchStart={(e) => handleClockAdjustPressStart(-1, e)}
                  onTouchEnd={handleClockAdjustPressEnd}
                  onTouchCancel={handleClockAdjustPressEnd}
                  onContextMenu={(e) => e.preventDefault()}
                  className="w-9 h-9 rounded-xl bg-slate-900 hover:bg-slate-800 text-rose-300 font-mono font-bold text-sm border border-slate-700 active:scale-95 transition flex items-center justify-center select-none"
                  title="Odejmij 1s (przytrzymaj: przewijaj szybciej)"
                >
                  -1s
                </button>

                {/* Big Start / Pause Button Spaced Apart (User request 1) */}
                <button
                  onClick={toggleClock}
                  className={`px-4 py-2 rounded-xl text-xs font-black flex items-center gap-1.5 transition active:scale-95 shadow-md ${
                    match.isClockRunning
                      ? 'bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40 shadow-rose-950/30'
                      : 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-emerald-950/30'
                  }`}
                  title="Start / Pauza zegara gry"
                >
                  {match.isClockRunning ? (
                    <>
                      <Pause className="w-3.5 h-3.5 fill-current" />
                      <span>PAUZA</span>
                    </>
                  ) : (
                    <>
                      <Play className="w-3.5 h-3.5 fill-current" />
                      <span>START</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onMouseDown={(e) => handleClockAdjustPressStart(1, e)}
                  onMouseUp={handleClockAdjustPressEnd}
                  onMouseLeave={handleClockAdjustPressEnd}
                  onTouchStart={(e) => handleClockAdjustPressStart(1, e)}
                  onTouchEnd={handleClockAdjustPressEnd}
                  onTouchCancel={handleClockAdjustPressEnd}
                  onContextMenu={(e) => e.preventDefault()}
                  className="w-9 h-9 rounded-xl bg-slate-900 hover:bg-slate-800 text-emerald-300 font-mono font-bold text-sm border border-slate-700 active:scale-95 transition flex items-center justify-center select-none"
                  title="Dodaj 1s (przytrzymaj: przewijaj szybciej)"
                >
                  +1s
                </button>

                <button
                  onClick={() => {
                    setEditMinutes(Math.floor(match.clockSeconds / 60));
                    setEditSeconds(match.clockSeconds % 60);
                    setIsEditingClock(true);
                  }}
                  className="p-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-amber-400 border border-slate-700 active:scale-95 transition"
                  title="Ustaw dokładny czas kwarty"
                >
                  <Clock className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>

          {/* RIGHT: OPPONENT TEAM (Col 4) */}
          <div className="col-span-4 flex flex-col items-center justify-center text-center">
            <h2 className="text-xs sm:text-sm font-black uppercase text-slate-300 truncate max-w-full tracking-wider mb-1">
              {match.opponent || 'RYWAL'}
            </h2>

            <div className="flex items-center justify-center gap-2 sm:gap-4 my-1">
              {!readOnly && onRecordAction && (
                <button
                  onClick={() => onRecordAction('OPP_MINUS_1')}
                  className="w-10 h-10 rounded-xl bg-slate-900 hover:bg-slate-800 active:bg-rose-500/25 text-rose-300 font-mono font-black text-lg border border-slate-700/80 active:scale-95 transition flex items-center justify-center"
                  title="Odejmij 1 punkt przeciwnikowi (-1)"
                >
                  -1
                </button>
              )}

              <div
                style={
                  liveTheme
                    ? {
                        color: liveTheme.scoreboard.scoreColorOpp,
                        fontSize: `${liveTheme.scoreboard.scoreFontSize}px`,
                      }
                    : undefined
                }
                className="text-5xl sm:text-6xl md:text-7xl font-black font-mono tracking-tighter text-white drop-shadow select-none leading-none"
              >
                {match.opponentScore}
              </div>

              {!readOnly && onRecordAction && (
                <button
                  onClick={() => onRecordAction('OPP_1PT')}
                  className="w-10 h-10 rounded-xl bg-slate-900 hover:bg-slate-800 active:bg-orange-500/25 text-orange-400 font-mono font-black text-lg border border-slate-700/80 active:scale-95 transition flex items-center justify-center"
                  title="Dodaj 1 punkt przeciwnikowi (+1)"
                >
                  +1
                </button>
              )}
            </div>

            <div className="text-[11px] font-semibold text-slate-400">
              Faule:{' '}
              <span
                className={`px-1.5 py-0.5 rounded font-bold ${
                  currentQuarterOppFouls >= 5
                    ? 'bg-rose-500/20 text-rose-400 border border-rose-500/40'
                    : 'text-slate-300'
                }`}
              >
                {currentQuarterOppFouls}
                {currentQuarterOppFouls >= 5 && ' (BONUS)'}
              </span>
            </div>
          </div>
        </div>
      ) : (
        /* MOBILE MAIN SCOREBOARD: 3 columns (-1 / Value / +1) matching obraz_e70c8a86.png */
        <div
          style={
            liveTheme
              ? {
                  background: liveTheme.scoreboard.bgStyle,
                  borderColor: liveTheme.scoreboard.borderColor,
                }
              : undefined
          }
          className={`grid grid-cols-3 items-center gap-2 sm:gap-3 bg-slate-950/85 p-2 sm:p-3 border border-slate-800/80 ${
            liveTheme ? liveTheme.scoreboard.borderRadius : 'rounded-2xl'
          }`}
        >
          {/* COLUMN 1: OUR TEAM (-1 / SCORE / +1) */}
          <div className="flex flex-col items-center justify-between gap-1 w-full">
            {/* -1 Button */}
            {!readOnly && onRecordAction ? (
              <button
                onClick={() => onRecordAction('MANUAL_OUR_MINUS_1')}
                className="w-full max-w-[110px] h-9 xs:h-10 sm:h-11 rounded-xl bg-gradient-to-b from-slate-800 to-slate-900 hover:from-slate-700 hover:to-slate-800 active:from-rose-950 active:to-slate-900 text-rose-300 hover:text-white font-mono font-black text-lg xs:text-xl border-2 border-slate-700/80 shadow-md shadow-black/50 active:scale-95 transition flex items-center justify-center select-none"
                title="Odejmij 1 punkt naszej drużynie (-1)"
              >
                <span>-1</span>
              </button>
            ) : (
              <div className="h-9 xs:h-10 sm:h-11" />
            )}

            {/* Team Info & Big Score */}
            <div className="flex flex-col items-center text-center my-0.5 min-w-0 w-full select-none">
              <h2 className="text-[10px] sm:text-xs font-black tracking-tight text-amber-400 truncate max-w-full uppercase mb-0.5">
                {clubProfile?.shortName || clubProfile?.name || 'NASZ ZESPÓŁ'}
              </h2>

              <div
                style={
                  liveTheme
                    ? {
                        color: liveTheme.scoreboard.scoreColorOur,
                        fontSize: `${liveTheme.scoreboard.scoreFontSize}px`,
                      }
                    : undefined
                }
                className="text-4xl xs:text-5xl sm:text-6xl md:text-7xl font-black font-mono tracking-tighter text-amber-300 my-0.5 leading-none"
              >
                {match.ourScore}
              </div>

              <div className="text-[8px] sm:text-[10px] font-semibold text-slate-400 whitespace-nowrap">
                Faule:{' '}
                <span
                  className={`px-1 py-0.2 rounded font-bold ${
                    currentQuarterFouls >= 5
                      ? 'bg-rose-500/20 text-rose-400 border border-rose-500/40'
                      : 'text-slate-300'
                  }`}
                >
                  {currentQuarterFouls}
                  {currentQuarterFouls >= 5 && ' (BONUS)'}
                </span>
              </div>
            </div>

            {/* +1 Button */}
            {!readOnly && onRecordAction ? (
              <button
                onClick={() => onRecordAction('MANUAL_OUR_PLUS_1')}
                className="w-full max-w-[110px] h-9 xs:h-10 sm:h-11 rounded-xl bg-gradient-to-b from-slate-800 to-slate-900 hover:from-slate-700 hover:to-slate-800 active:from-emerald-950 active:to-slate-900 text-emerald-300 hover:text-white font-mono font-black text-lg xs:text-xl border-2 border-slate-700/80 shadow-md shadow-black/50 active:scale-95 transition flex items-center justify-center select-none"
                title="Dodaj 1 punkt naszej drużynie (+1)"
              >
                <span>+1</span>
              </button>
            ) : (
              <div className="h-9 xs:h-10 sm:h-11" />
            )}
          </div>

          {/* COLUMN 2: CLOCK (-1 / TIME / +1) */}
          <div className="flex flex-col items-center justify-between gap-1 border-x border-slate-800/80 px-1 w-full">
            {/* -1 Button (with accelerating hold!) */}
            {!readOnly ? (
              <button
                type="button"
                onMouseDown={(e) => handleClockAdjustPressStart(-1, e)}
                onMouseUp={handleClockAdjustPressEnd}
                onMouseLeave={handleClockAdjustPressEnd}
                onTouchStart={(e) => handleClockAdjustPressStart(-1, e)}
                onTouchEnd={handleClockAdjustPressEnd}
                onTouchCancel={handleClockAdjustPressEnd}
                onContextMenu={(e) => e.preventDefault()}
                className="w-full max-w-[125px] h-9 xs:h-10 sm:h-11 rounded-xl bg-gradient-to-b from-slate-800 to-slate-900 hover:from-slate-700 hover:to-slate-800 active:from-rose-950 active:to-slate-900 text-rose-300 hover:text-white font-mono font-black text-lg xs:text-xl border-2 border-slate-700/80 shadow-md shadow-black/50 active:scale-95 transition flex items-center justify-center select-none touch-none"
                title="Kliknij: -1 sekunda • Przytrzymaj: przewijaj czas szybciej w narastającym tempie"
              >
                <span>-1</span>
              </button>
            ) : (
              <div className="h-9 xs:h-10 sm:h-11" />
            )}

            {/* Game Clock Display Box: Click = Toggle Start/Stop; Hold 3s = Set time */}
            <div
              onMouseDown={() => startClockPress(false)}
              onMouseUp={() => endClockPress(false)}
              onMouseLeave={cancelClockPress}
              onTouchStart={() => startClockPress(true)}
              onTouchEnd={() => endClockPress(true)}
              onTouchCancel={cancelClockPress}
              onContextMenu={(e) => e.preventDefault()}
              className={`relative w-full max-w-[145px] flex flex-col items-center justify-center rounded-2xl border-2 transition-colors cursor-pointer select-none overflow-hidden touch-none py-1.5 sm:py-2.5 px-1 shadow-md my-0.5 ${
                isHoldingClock
                  ? 'border-amber-400 bg-gradient-to-b from-amber-500/25 to-slate-950 ring-2 ring-amber-400/60'
                  : match.isClockRunning
                    ? 'border-emerald-500/80 bg-gradient-to-b from-slate-900 to-slate-950 ring-1 ring-emerald-500/40 hover:border-emerald-400 active:scale-95'
                    : 'border-amber-500/50 bg-gradient-to-b from-slate-900 to-slate-950 ring-1 ring-amber-500/20 hover:border-amber-400 active:scale-95'
              }`}
              title="Kliknij zegar, aby włączyć/wyłączyć (Start/Pauza) • Przytrzymaj 3s: Ustaw czas"
            >
              {/* Dynamic 3s Long Press Progress Bar Fill */}
              {isHoldingClock && (
                <div
                  className="absolute inset-0 bg-gradient-to-r from-amber-500/25 via-orange-500/35 to-amber-500/45 pointer-events-none"
                  style={{ width: `${longPressProgress}%` }}
                />
              )}

              {isHoldingClock && (
                <div className="relative z-10 text-[8px] xs:text-[9px] font-black uppercase tracking-wider text-amber-300 mb-0.5">
                  ⏱️ {Math.max(1, Math.ceil((3000 - (longPressProgress / 100) * 3000) / 1000))}s
                </div>
              )}

              {/* Digits Display */}
              <div
                style={
                  liveTheme
                    ? {
                        color: liveTheme.scoreboard.clockColor,
                        fontSize: `${liveTheme.scoreboard.clockFontSize}px`,
                      }
                    : undefined
                }
                className="relative z-10 flex items-center justify-center text-2xl xs:text-3xl sm:text-4xl md:text-5xl font-mono font-black tracking-tight leading-none text-white"
              >
                <span>{formattedTime}</span>
              </div>

              {/* Interactive Status Indicator below clock */}
              <div className="relative z-10 mt-1 flex items-center justify-center">
                {isHoldingClock ? (
                  <span className="text-[8px] xs:text-[9px] font-bold text-amber-300">
                    Ustawienia czasu...
                  </span>
                ) : match.isClockRunning ? (
                  <span className="inline-flex items-center gap-1 text-[8px] xs:text-[9px] font-black text-emerald-400">
                    <Play className="w-2.5 h-2.5 fill-current" />
                    <span>START</span>
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-[8px] xs:text-[9px] font-bold text-rose-400">
                    <Pause className="w-2.5 h-2.5 fill-current" />
                    <span>PAUZA</span>
                  </span>
                )}
              </div>
            </div>

            {/* +1 Button (with accelerating hold!) */}
            {!readOnly ? (
              <button
                type="button"
                onMouseDown={(e) => handleClockAdjustPressStart(1, e)}
                onMouseUp={handleClockAdjustPressEnd}
                onMouseLeave={handleClockAdjustPressEnd}
                onTouchStart={(e) => handleClockAdjustPressStart(1, e)}
                onTouchEnd={handleClockAdjustPressEnd}
                onTouchCancel={handleClockAdjustPressEnd}
                onContextMenu={(e) => e.preventDefault()}
                className="w-full max-w-[125px] h-9 xs:h-10 sm:h-11 rounded-xl bg-gradient-to-b from-slate-800 to-slate-900 hover:from-slate-700 hover:to-slate-800 active:from-emerald-950 active:to-slate-900 text-emerald-300 hover:text-white font-mono font-black text-lg xs:text-xl border-2 border-slate-700/80 shadow-md shadow-black/50 active:scale-95 transition flex items-center justify-center select-none touch-none"
                title="Kliknij: +1 sekunda • Przytrzymaj: przewijaj czas szybciej w narastającym tempie"
              >
                <span>+1</span>
              </button>
            ) : (
              <div className="h-9 xs:h-10 sm:h-11" />
            )}
          </div>

          {/* COLUMN 3: OPPONENT (-1 / SCORE / +1) */}
          <div className="flex flex-col items-center justify-between gap-1 w-full">
            {/* -1 Button */}
            {!readOnly && onRecordAction ? (
              <button
                onClick={() => onRecordAction('OPP_MINUS_1')}
                className="w-full max-w-[110px] h-9 xs:h-10 sm:h-11 rounded-xl bg-gradient-to-b from-slate-800 to-slate-900 hover:from-slate-700 hover:to-slate-800 active:from-rose-950 active:to-slate-900 text-rose-300 hover:text-white font-mono font-black text-lg xs:text-xl border-2 border-slate-700/80 shadow-md shadow-black/50 active:scale-95 transition flex items-center justify-center select-none"
                title="Odejmij 1 punkt przeciwnikowi (-1)"
              >
                <span>-1</span>
              </button>
            ) : (
              <div className="h-9 xs:h-10 sm:h-11" />
            )}

            {/* Opponent Info & Big Score */}
            <div className="flex flex-col items-center text-center my-0.5 min-w-0 w-full select-none">
              <h2 className="text-[10px] sm:text-xs font-black tracking-tight text-slate-300 truncate max-w-full uppercase mb-0.5">
                {match.opponent || 'RYWAL'}
              </h2>

              <div
                style={
                  liveTheme
                    ? {
                        color: liveTheme.scoreboard.scoreColorOpp,
                        fontSize: `${liveTheme.scoreboard.scoreFontSize}px`,
                      }
                    : undefined
                }
                className="text-4xl xs:text-5xl sm:text-6xl md:text-7xl font-black font-mono tracking-tighter text-white my-0.5 leading-none"
              >
                {match.opponentScore}
              </div>

              <div className="text-[8px] sm:text-[10px] font-semibold text-slate-400 whitespace-nowrap">
                Faule:{' '}
                <span
                  className={`px-1 py-0.2 rounded font-bold ${
                    currentQuarterOppFouls >= 5
                      ? 'bg-rose-500/20 text-rose-400 border border-rose-500/40'
                      : 'text-slate-300'
                  }`}
                >
                  {currentQuarterOppFouls}
                  {currentQuarterOppFouls >= 5 && ' (BONUS)'}
                </span>
              </div>
            </div>

            {/* +1 Button */}
            {!readOnly && onRecordAction ? (
              <button
                onClick={() => onRecordAction('OPP_1PT')}
                className="w-full max-w-[110px] h-9 xs:h-10 sm:h-11 rounded-xl bg-gradient-to-b from-slate-800 to-slate-900 hover:from-slate-700 hover:to-slate-800 active:from-orange-950 active:to-slate-900 text-orange-400 hover:text-white font-mono font-black text-lg xs:text-xl border-2 border-slate-700/80 shadow-md shadow-black/50 active:scale-95 transition flex items-center justify-center select-none"
                title="Dodaj 1 punkt przeciwnikowi (+1)"
              >
                <span>+1</span>
              </button>
            ) : (
              <div className="h-9 xs:h-10 sm:h-11" />
            )}
          </div>
        </div>
      )}

      {/* Clock Edit Modal */}
      {isEditingClock && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85">
          <div className="w-full max-w-xs rounded-2xl bg-slate-900 border border-slate-800 p-5 shadow-2xl text-slate-100">
            <div className="flex items-center gap-2 mb-4 font-bold text-base text-amber-400">
              <Clock className="w-5 h-5" />
              <span>Ustaw czas kwarty</span>
            </div>

            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Minuty (0-15)</label>
                <input
                  type="number"
                  min="0"
                  max="15"
                  value={editMinutes}
                  onChange={(e) => setEditMinutes(parseInt(e.target.value, 10) || 0)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-center text-xl font-mono font-bold text-white focus:outline-none focus:border-amber-500"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Sekundy (0-59)</label>
                <input
                  type="number"
                  min="0"
                  max="59"
                  value={editSeconds}
                  onChange={(e) => setEditSeconds(parseInt(e.target.value, 10) || 0)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-center text-xl font-mono font-bold text-white focus:outline-none focus:border-amber-500"
                />
              </div>
            </div>

            {/* Quick adjust buttons inside modal */}
            <div className="mb-4 p-2 rounded-xl bg-slate-950 border border-slate-800">
              <span className="text-[10px] font-bold text-slate-400 block mb-1 uppercase tracking-wider">
                Szybka korekta:
              </span>
              <div className="grid grid-cols-4 gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    const currentTotal = editMinutes * 60 + editSeconds;
                    const next = Math.max(0, currentTotal - 30);
                    setEditMinutes(Math.floor(next / 60));
                    setEditSeconds(next % 60);
                  }}
                  className="py-1.5 rounded-lg bg-rose-500/20 hover:bg-rose-500/35 text-rose-300 border border-rose-500/40 font-mono font-bold text-xs"
                >
                  -30s
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const currentTotal = editMinutes * 60 + editSeconds;
                    const next = Math.max(0, currentTotal - 1);
                    setEditMinutes(Math.floor(next / 60));
                    setEditSeconds(next % 60);
                  }}
                  className="py-1.5 rounded-lg bg-rose-500/20 hover:bg-rose-500/35 text-rose-300 border border-rose-500/40 font-mono font-black text-xs"
                >
                  -1s
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const currentTotal = editMinutes * 60 + editSeconds;
                    const next = Math.min(match.quarterMinutes * 60, currentTotal + 1);
                    setEditMinutes(Math.floor(next / 60));
                    setEditSeconds(next % 60);
                  }}
                  className="py-1.5 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/35 text-emerald-300 border border-emerald-500/40 font-mono font-black text-xs"
                >
                  +1s
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const currentTotal = editMinutes * 60 + editSeconds;
                    const next = Math.min(match.quarterMinutes * 60, currentTotal + 30);
                    setEditMinutes(Math.floor(next / 60));
                    setEditSeconds(next % 60);
                  }}
                  className="py-1.5 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/35 text-emerald-300 border border-emerald-500/40 font-mono font-bold text-xs"
                >
                  +30s
                </button>
              </div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => setIsEditingClock(false)}
                className="flex-1 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs transition"
              >
                Anuluj
              </button>
              <button
                onClick={() => {
                  const total = editMinutes * 60 + editSeconds;
                  if (onUpdateMatch) {
                    onUpdateMatch((prev) => ({
                      ...prev,
                      clockSeconds: total,
                    }));
                  }
                  setIsEditingClock(false);
                }}
                className="flex-1 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs transition"
              >
                Zatwierdź
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Quarter Rollback Confirmation Modal */}
      {rollbackTargetQuarter !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/90">
          <div className="w-full max-w-sm rounded-3xl bg-slate-900 border border-amber-500/40 p-5 sm:p-6 shadow-2xl text-slate-100">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-2xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 shrink-0">
                <AlertTriangle className="w-6 h-6 text-amber-400" />
              </div>
              <div>
                <h3 className="text-base sm:text-lg font-black text-white leading-tight">
                  Cofnąć do kwarty {rollbackTargetQuarter > 4 ? 'OT' : `Q${rollbackTargetQuarter}`}?
                </h3>
                <p className="text-xs text-amber-400 font-semibold">
                  Wymagane potwierdzenie trenera
                </p>
              </div>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed mb-4">
              Jesteś obecnie w <strong className="text-white font-bold">{match.currentQuarter > 4 ? 'Dogrywce' : `Kwarcie ${match.currentQuarter}`}</strong>. 
              Czy na pewno chcesz cofnąć się do <strong className="text-amber-300 font-bold">{rollbackTargetQuarter > 4 ? 'Dogrywki' : `Kwarty ${rollbackTargetQuarter}`}</strong>?
            </p>

            <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-[11px] text-slate-400 space-y-1 mb-5">
              <div className="font-bold text-slate-300">Skutek cofnięcia:</div>
              <div>• Aktywna kwarta meczu zostanie przestawiona wstecz.</div>
              <div>• Zegar gry zostanie zresetowany do <strong className="text-slate-200">{rollbackTargetQuarter > 4 ? '05:00' : `${String(match.quarterMinutes).padStart(2, '0')}:00`}</strong> i zatrzymany.</div>
              <div>• Zapisane już punkty i faule w protokole pozostaną nienaruszone.</div>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => {
                  playClickSound();
                  setRollbackTargetQuarter(null);
                }}
                className="py-2.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs transition"
              >
                Anuluj
              </button>
              <button
                type="button"
                onClick={() => {
                  applySetQuarter(rollbackTargetQuarter);
                }}
                className="py-2.5 px-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs transition shadow-md shadow-amber-950/40"
              >
                Tak, cofnij kwartę
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Quarter Ended & Auto-Advanced Notice Modal */}
      {quarterEndedNotice !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/90">
          <div className="w-full max-w-sm rounded-3xl bg-slate-900 border border-emerald-500/40 p-5 sm:p-6 shadow-2xl text-slate-100 text-center">
            <div className="w-14 h-14 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 mx-auto mb-3">
              <CheckCircle2 className="w-8 h-8" />
            </div>

            <h3 className="text-lg font-black text-white mb-1">
              Koniec {quarterEndedNotice.endedQuarter > 4 ? 'Dogrywki' : `Kwarty ${quarterEndedNotice.endedQuarter}`}!
            </h3>
            
            <p className="text-xs text-emerald-400 font-bold mb-3">
              Automatycznie aktywowano:{' '}
              <span className="text-white underline">
                {quarterEndedNotice.nextQuarter > 4 ? 'Dogrywkę (OT)' : `Kwartę ${quarterEndedNotice.nextQuarter}`}
              </span>
            </p>

            <div className="p-3 rounded-2xl bg-slate-950 border border-slate-800 mb-4">
              <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-1">
                Aktualny wynik meczu:
              </div>
              <div className="text-2xl font-mono font-black text-amber-300">
                {match.ourScore} <span className="text-slate-500">:</span> {match.opponentScore}
              </div>
              <div className="text-[11px] text-slate-400 mt-1">
                Zegar przygotowany na <strong className="text-slate-200">{quarterEndedNotice.nextQuarter > 4 ? '05:00' : `${String(match.quarterMinutes).padStart(2, '0')}:00`}</strong>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  playClickSound();
                  setQuarterEndedNotice(null);
                }}
                className="py-2.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs transition"
              >
                Zamknij
              </button>
              <button
                type="button"
                onClick={() => {
                  playClickSound();
                  triggerHaptic(25);
                  setQuarterEndedNotice(null);
                  if (onUpdateMatch) {
                    onUpdateMatch((prev) => ({
                      ...prev,
                      isClockRunning: true,
                    }));
                  }
                }}
                className="py-2.5 px-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs transition shadow-md shadow-emerald-950/40 flex items-center justify-center gap-1.5"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>START Q{quarterEndedNotice.nextQuarter}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

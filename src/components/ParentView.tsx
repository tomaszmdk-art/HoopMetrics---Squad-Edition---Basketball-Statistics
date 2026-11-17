import React, { useState, useEffect } from 'react';
import {
  ChildMatchEvent,
  ChildMatchRecord,
  ChildProfile,
  TeamCategory,
} from '../types/basketball';
import {
  getParentChildren,
  saveParentChild,
  deleteParentChild,
  getParentChildMatches,
  saveParentChildMatch,
  deleteParentChildMatch,
  getParentActiveChildId,
  setParentActiveChildId,
} from '../services/db';
import { exportChildMatchPdf } from '../services/exportPdf';
import { ChildProfileModal } from './ChildProfileModal';
import {
  Trophy,
  Flame,
  PlusCircle,
  PlayCircle,
  Clock,
  Sparkles,
  ArrowRight,
  ShieldCheck,
  Award,
  ChevronRight,
  Share2,
  Trash2,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  FileDown,
  UserPlus,
  Edit2,
  Calendar,
  MapPin,
  TrendingUp,
  Activity,
  Heart,
  Timer,
  Play,
  Pause,
  X,
  AlertCircle,
  Plus,
  Minus,
} from 'lucide-react';
import { playClickSound, triggerHaptic } from '../services/tts';
import { useLanguage } from '../i18n/LanguageContext';

interface ParentViewProps {
  onBackToHome?: () => void;
  soundEnabled?: boolean;
}

export const ParentView: React.FC<ParentViewProps> = ({ onBackToHome, soundEnabled = true }) => {
  const { language, t } = useLanguage();
  // Children State (Max 3)
  const [children, setChildren] = useState<ChildProfile[]>([]);
  const [selectedChildId, setSelectedChildId] = useState<string>('');
  const [isChildModalOpen, setIsChildModalOpen] = useState(false);
  const [childToEdit, setChildToEdit] = useState<ChildProfile | null>(null);

  // Sub-tabs: 'live' | 'stats' | 'history'
  const [subTab, setSubTab] = useState<'live' | 'stats' | 'history'>('live');

  // Matches for selected child
  const [childMatches, setChildMatches] = useState<ChildMatchRecord[]>([]);

  // Active Live Match for parent
  const [activeMatch, setActiveMatch] = useState<ChildMatchRecord | null>(null);

  // New Match Setup Form modal/view
  const [isNewMatchOpen, setIsNewMatchOpen] = useState(false);
  const [newOpponent, setNewOpponent] = useState('');
  const [newLocation, setNewLocation] = useState<'Dom' | 'Wyjazd'>('Dom');
  const [newDate, setNewDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [newCompetition, setNewCompetition] = useState('Liga Wojewódzka WOZKosz');
  const [newQuarterMinutes, setNewQuarterMinutes] = useState(8);

  // Modals replacing browser confirm()/prompt() to guarantee 100% functionality in iframe
  const [matchToDelete, setMatchToDelete] = useState<ChildMatchRecord | null>(null);
  const [childToDelete, setChildToDelete] = useState<ChildProfile | null>(null);
  const [isFinishModalOpen, setIsFinishModalOpen] = useState(false);
  const [finishOurScore, setFinishOurScore] = useState('');
  const [finishOppScore, setFinishOppScore] = useState('');
  const [finishNotes, setFinishNotes] = useState('');

  // Undo Notification
  const [undoMessage, setUndoMessage] = useState<string | null>(null);

  // Highlight input
  const [customHighlight, setCustomHighlight] = useState('');

  // Playing timer ticker - ONLY TICKS when match is running (isClockRunning === true) AND child is on court (isOnCourt === true)
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    if (activeMatch && activeMatch.isClockRunning && activeMatch.isOnCourt) {
      interval = setInterval(() => {
        setActiveMatch((prev) => {
          if (!prev || !prev.isClockRunning || !prev.isOnCourt) return prev;
          const updated = {
            ...prev,
            secondsPlayed: prev.secondsPlayed + 1,
            updatedAt: Date.now(),
          };
          saveParentChildMatch(updated);
          return updated;
        });
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [activeMatch?.isClockRunning, activeMatch?.isOnCourt]);

  // Load children and matches on mount
  useEffect(() => {
    async function loadInitialData() {
      const loadedChildren = await getParentChildren();
      setChildren(loadedChildren);

      const savedChildId = getParentActiveChildId();
      const initialId =
        loadedChildren.find((c) => c.id === savedChildId)?.id || loadedChildren[0]?.id || '';
      setSelectedChildId(initialId);

      const allMatches = await getParentChildMatches();
      // Check if there is an active live match for this child
      const ongoing = allMatches.find((m) => m.childId === initialId && m.status === 'live');
      if (ongoing) {
        // By default on enter, guarantee clock is paused so it never counts without parent's consent
        setActiveMatch({ ...ongoing, isClockRunning: ongoing.isClockRunning ?? false });
      }
      setChildMatches(allMatches.filter((m) => m.childId === initialId));
    }
    loadInitialData();
  }, []);

  // When selected child changes, load their matches
  const handleSelectChild = async (childId: string) => {
    playClickSound();
    triggerHaptic(20);
    setSelectedChildId(childId);
    setParentActiveChildId(childId);

    const allMatches = await getParentChildMatches();
    const childSpecific = allMatches.filter((m) => m.childId === childId);
    setChildMatches(childSpecific);

    const ongoing = childSpecific.find((m) => m.status === 'live');
    setActiveMatch(ongoing ? { ...ongoing, isClockRunning: ongoing.isClockRunning ?? false } : null);
  };

  const selectedChild = children.find((c) => c.id === selectedChildId) || children[0];

  // Save or Edit child
  const handleSaveChildProfile = async (child: ChildProfile) => {
    const updated = await saveParentChild(child);
    setChildren(updated);
    setSelectedChildId(child.id);
    setParentActiveChildId(child.id);
    setChildToEdit(null);
  };

  const handleConfirmDeleteChild = async () => {
    if (!childToDelete) return;
    if (children.length <= 1) {
      alert('Musisz mieć co najmniej jedno dziecko w profilu rodzica.');
      setChildToDelete(null);
      return;
    }
    const updated = await deleteParentChild(childToDelete.id);
    setChildren(updated);
    const nextId = updated[0]?.id || '';
    setSelectedChildId(nextId);
    setParentActiveChildId(nextId);
    const matches = await getParentChildMatches(nextId);
    setChildMatches(matches);
    setChildToDelete(null);
  };

  // Start a new match for selected child - MANDATORY MANUAL START (starts PAUSED with isClockRunning: false)
  const handleStartNewMatch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedChild) return;
    if (!newOpponent.trim()) {
      alert('Podaj nazwę rywala / przeciwnika.');
      return;
    }

    playClickSound();
    triggerHaptic(50);

    const newMatchRecord: ChildMatchRecord = {
      id: `child-match-${Date.now()}`,
      childId: selectedChild.id,
      childName: selectedChild.name,
      childNumber: selectedChild.number,
      childClub: selectedChild.clubName,
      childCategory: selectedChild.category,
      opponent: newOpponent.trim(),
      location: newLocation,
      date: newDate,
      competition: newCompetition.trim(),
      quarterMinutes: newQuarterMinutes,
      status: 'live',
      currentQuarter: 1,
      isOnCourt: true, // starts on court
      isClockRunning: false, // PAUSED! Must be manually started by parent
      secondsPlayed: 0,
      lastSubTimestamp: Date.now(),
      pts: 0,
      fg2m: 0,
      fg2a: 0,
      fg3m: 0,
      fg3a: 0,
      ftm: 0,
      fta: 0,
      offReb: 0,
      defReb: 0,
      totReb: 0,
      ast: 0,
      stl: 0,
      blk: 0,
      tov: 0,
      fouls: 0,
      plusMinus: 0,
      eval: 0,
      events: [
        {
          id: `ev-${Date.now()}`,
          timestamp: Date.now(),
          quarter: 1,
          timeFormatted: 'Q1 Start',
          type: 'SUB_IN',
          label: 'Mecz przygotowany (czeka na gwizdek sędziego)',
          pointsDelta: 0,
        },
      ],
      quarterScores: {
        q1: { pts: 0, reb: 0, ast: 0 },
        q2: { pts: 0, reb: 0, ast: 0 },
        q3: { pts: 0, reb: 0, ast: 0 },
        q4: { pts: 0, reb: 0, ast: 0 },
      },
      highlights: [],
      updatedAt: Date.now(),
    };

    await saveParentChildMatch(newMatchRecord);
    setActiveMatch(newMatchRecord);
    const updatedList = await getParentChildMatches(selectedChild.id);
    setChildMatches(updatedList);
    setIsNewMatchOpen(false);
    setNewOpponent('');
    setSubTab('live');
  };

  // Helper to re-evaluate FIBA Eval
  const calculateEval = (m: ChildMatchRecord) => {
    const fga = m.fg2a + m.fg3a;
    const fgm = m.fg2m + m.fg3m;
    const positive = m.pts + m.totReb + m.ast + m.stl + m.blk;
    const negative = fga - fgm + (m.fta - m.ftm) + m.tov + m.fouls;
    return positive - negative;
  };

  // Toggle Pause / Resume Match Clock WITHOUT taking the child off the court
  const handleToggleClock = async () => {
    if (!activeMatch) return;
    playClickSound();
    triggerHaptic(40);

    const nextClockState = !activeMatch.isClockRunning;
    const eventType = nextClockState ? 'CLOCK_START' : 'CLOCK_PAUSE';
    const label = nextClockState ? 'Zegar meczu uruchomiony ▶️' : 'Pauza meczu (czas zatrzymany) ⏸️';

    const newEvent: ChildMatchEvent = {
      id: `ev-${Date.now()}`,
      timestamp: Date.now(),
      quarter: activeMatch.currentQuarter,
      timeFormatted: `Q${activeMatch.currentQuarter}`,
      type: eventType,
      label,
      pointsDelta: 0,
    };

    const updated: ChildMatchRecord = {
      ...activeMatch,
      isClockRunning: nextClockState,
      events: [newEvent, ...activeMatch.events],
      updatedAt: Date.now(),
    };

    setActiveMatch(updated);
    await saveParentChildMatch(updated);

    setUndoMessage(nextClockState ? '▶️ Zegar ruszył! Gra trwa.' : '⏸️ Zegar meczu zapauzowany.');
    setTimeout(() => setUndoMessage(null), 2500);
  };

  // Fine tune playing time by +/- 30 seconds
  const handleAdjustTime = async (secondsDelta: number) => {
    if (!activeMatch) return;
    playClickSound();
    triggerHaptic(20);

    const nextSeconds = Math.max(0, activeMatch.secondsPlayed + secondsDelta);
    const updated: ChildMatchRecord = {
      ...activeMatch,
      secondsPlayed: nextSeconds,
      updatedAt: Date.now(),
    };

    setActiveMatch(updated);
    await saveParentChildMatch(updated);
  };

  // Record an action for child
  const handleAction = async (type: ChildMatchEvent['type'], label: string, pointsDelta = 0) => {
    if (!activeMatch) return;

    playClickSound();
    triggerHaptic(type.includes('MADE') ? 60 : 30);

    const currentQuarter = activeMatch.currentQuarter;
    const minutes = Math.floor(activeMatch.secondsPlayed / 60);
    const secs = activeMatch.secondsPlayed % 60;
    const timeFormatted = `Q${currentQuarter} ${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

    const newEvent: ChildMatchEvent = {
      id: `ev-${Date.now()}`,
      timestamp: Date.now(),
      quarter: currentQuarter,
      timeFormatted,
      type,
      label,
      pointsDelta,
    };

    const updated: ChildMatchRecord = {
      ...activeMatch,
      pts: activeMatch.pts + pointsDelta,
      updatedAt: Date.now(),
      events: [newEvent, ...activeMatch.events],
    };

    switch (type) {
      case '2PT_MADE':
        updated.fg2m += 1;
        updated.fg2a += 1;
        break;
      case '2PT_MISS':
        updated.fg2a += 1;
        break;
      case '3PT_MADE':
        updated.fg3m += 1;
        updated.fg3a += 1;
        break;
      case '3PT_MISS':
        updated.fg3a += 1;
        break;
      case 'FT_MADE':
        updated.ftm += 1;
        updated.fta += 1;
        break;
      case 'FT_MISS':
        updated.fta += 1;
        break;
      case 'DEF_REB':
        updated.defReb += 1;
        updated.totReb += 1;
        break;
      case 'OFF_REB':
        updated.offReb += 1;
        updated.totReb += 1;
        break;
      case 'ASSIST':
        updated.ast += 1;
        break;
      case 'STEAL':
        updated.stl += 1;
        break;
      case 'BLOCK':
        updated.blk += 1;
        break;
      case 'TURNOVER':
        updated.tov += 1;
        break;
      case 'FOUL':
        updated.fouls += 1;
        break;
      case 'PLUS_OUR':
        updated.plusMinus += 2;
        break;
      case 'MINUS_OPP':
        updated.plusMinus -= 2;
        break;
      default:
        break;
    }

    updated.eval = calculateEval(updated);

    setActiveMatch(updated);
    await saveParentChildMatch(updated);
  };

  // Toggle On-Court vs Bench (Sub in / Sub out)
  const handleToggleSub = async () => {
    if (!activeMatch) return;
    playClickSound();
    triggerHaptic(40);

    const nextIsOnCourt = !activeMatch.isOnCourt;
    const eventType = nextIsOnCourt ? 'SUB_IN' : 'SUB_OUT';
    const label = nextIsOnCourt ? 'Wejście na parkiet 🟢' : 'Zejście na ławkę 🟡';

    const newEvent: ChildMatchEvent = {
      id: `ev-${Date.now()}`,
      timestamp: Date.now(),
      quarter: activeMatch.currentQuarter,
      timeFormatted: `Q${activeMatch.currentQuarter}`,
      type: eventType,
      label,
      pointsDelta: 0,
    };

    const updated: ChildMatchRecord = {
      ...activeMatch,
      isOnCourt: nextIsOnCourt,
      events: [newEvent, ...activeMatch.events],
      updatedAt: Date.now(),
    };

    setActiveMatch(updated);
    await saveParentChildMatch(updated);
  };

  // Switch Quarter
  const handleSetQuarter = async (q: number) => {
    if (!activeMatch) return;
    playClickSound();
    triggerHaptic(30);

    const updated: ChildMatchRecord = {
      ...activeMatch,
      currentQuarter: q,
      updatedAt: Date.now(),
    };
    setActiveMatch(updated);
    await saveParentChildMatch(updated);
  };

  // Add a highlight/sticker
  const handleAddHighlight = async (text: string) => {
    if (!activeMatch || !text.trim()) return;
    playClickSound();
    triggerHaptic(30);

    const updatedHighlights = [...activeMatch.highlights, text.trim()];
    const newEvent: ChildMatchEvent = {
      id: `ev-${Date.now()}`,
      timestamp: Date.now(),
      quarter: activeMatch.currentQuarter,
      timeFormatted: `Q${activeMatch.currentQuarter}`,
      type: 'HIGHLIGHT',
      label: `Wyróżnienie: ${text.trim()}`,
      pointsDelta: 0,
      highlightNote: text.trim(),
    };

    const updated: ChildMatchRecord = {
      ...activeMatch,
      highlights: updatedHighlights,
      events: [newEvent, ...activeMatch.events],
      updatedAt: Date.now(),
    };
    setActiveMatch(updated);
    await saveParentChildMatch(updated);
    setCustomHighlight('');
  };

  // Undo last action
  const handleUndo = async () => {
    if (!activeMatch || activeMatch.events.length === 0) return;
    playClickSound();
    triggerHaptic(50);

    const lastEvent = activeMatch.events[0];
    const remainingEvents = activeMatch.events.slice(1);

    const updated: ChildMatchRecord = {
      ...activeMatch,
      pts: activeMatch.pts - lastEvent.pointsDelta,
      events: remainingEvents,
      updatedAt: Date.now(),
    };

    switch (lastEvent.type) {
      case '2PT_MADE':
        updated.fg2m = Math.max(0, updated.fg2m - 1);
        updated.fg2a = Math.max(0, updated.fg2a - 1);
        break;
      case '2PT_MISS':
        updated.fg2a = Math.max(0, updated.fg2a - 1);
        break;
      case '3PT_MADE':
        updated.fg3m = Math.max(0, updated.fg3m - 1);
        updated.fg3a = Math.max(0, updated.fg3a - 1);
        break;
      case '3PT_MISS':
        updated.fg3a = Math.max(0, updated.fg3a - 1);
        break;
      case 'FT_MADE':
        updated.ftm = Math.max(0, updated.ftm - 1);
        updated.fta = Math.max(0, updated.fta - 1);
        break;
      case 'FT_MISS':
        updated.fta = Math.max(0, updated.fta - 1);
        break;
      case 'DEF_REB':
        updated.defReb = Math.max(0, updated.defReb - 1);
        updated.totReb = Math.max(0, updated.totReb - 1);
        break;
      case 'OFF_REB':
        updated.offReb = Math.max(0, updated.offReb - 1);
        updated.totReb = Math.max(0, updated.totReb - 1);
        break;
      case 'ASSIST':
        updated.ast = Math.max(0, updated.ast - 1);
        break;
      case 'STEAL':
        updated.stl = Math.max(0, updated.stl - 1);
        break;
      case 'BLOCK':
        updated.blk = Math.max(0, updated.blk - 1);
        break;
      case 'TURNOVER':
        updated.tov = Math.max(0, updated.tov - 1);
        break;
      case 'FOUL':
        updated.fouls = Math.max(0, updated.fouls - 1);
        break;
      case 'PLUS_OUR':
        updated.plusMinus -= 2;
        break;
      case 'MINUS_OPP':
        updated.plusMinus += 2;
        break;
      case 'HIGHLIGHT':
        if (lastEvent.highlightNote) {
          updated.highlights = updated.highlights.filter((h) => h !== lastEvent.highlightNote);
        }
        break;
      default:
        break;
    }

    updated.eval = calculateEval(updated);

    setActiveMatch(updated);
    await saveParentChildMatch(updated);

    setUndoMessage(`Cofnięto: ${lastEvent.label}`);
    setTimeout(() => setUndoMessage(null), 2500);
  };

  // Open Finish Match Modal
  const handleOpenFinishModal = () => {
    if (!activeMatch) return;
    playClickSound();
    setFinishOurScore(activeMatch.finalTeamScoreOur ? String(activeMatch.finalTeamScoreOur) : '');
    setFinishOppScore(activeMatch.finalTeamScoreOpp ? String(activeMatch.finalTeamScoreOpp) : '');
    setFinishNotes(activeMatch.notes || '');
    setIsFinishModalOpen(true);
  };

  // Confirm Finish Match
  const handleConfirmFinishMatch = async () => {
    if (!activeMatch) return;
    playClickSound();
    triggerHaptic(50);

    const finished: ChildMatchRecord = {
      ...activeMatch,
      status: 'finished',
      isOnCourt: false,
      isClockRunning: false,
      finalTeamScoreOur: finishOurScore.trim() ? Number(finishOurScore) : undefined,
      finalTeamScoreOpp: finishOppScore.trim() ? Number(finishOppScore) : undefined,
      notes: finishNotes.trim() || undefined,
      updatedAt: Date.now(),
    };

    await saveParentChildMatch(finished);
    setActiveMatch(null);
    setIsFinishModalOpen(false);

    // Refresh matches list
    const updatedList = await getParentChildMatches(selectedChild?.id);
    setChildMatches(updatedList);
    setSubTab('history');
  };

  // Delete past or active match - guaranteed to work via modal
  const handleConfirmDeleteMatch = async () => {
    if (!matchToDelete) return;
    playClickSound();
    triggerHaptic(50);

    const targetId = matchToDelete.id;
    const isDeletingActive = activeMatch?.id === targetId;

    await deleteParentChildMatch(targetId);

    if (isDeletingActive) {
      setActiveMatch(null);
    }

    const updated = await getParentChildMatches(selectedChild?.id);
    setChildMatches(updated);
    setMatchToDelete(null);

    setUndoMessage('Mecz został pomyślnie usunięty.');
    setTimeout(() => setUndoMessage(null), 2500);
  };

  // Export PDF card for child match
  const handleExportPdf = async (record: ChildMatchRecord) => {
    if (!selectedChild) return;
    playClickSound();
    triggerHaptic(30);
    await exportChildMatchPdf(record, selectedChild);
  };

  // Career Statistics Calculation
  const finishedList = childMatches.filter((m) => m.status === 'finished');
  const totalMatchesCount = finishedList.length;
  const totalPoints = finishedList.reduce((acc, m) => acc + m.pts, 0);
  const ppg = totalMatchesCount > 0 ? (totalPoints / totalMatchesCount).toFixed(1) : '0.0';
  const totalRebounds = finishedList.reduce((acc, m) => acc + m.totReb, 0);
  const rpg = totalMatchesCount > 0 ? (totalRebounds / totalMatchesCount).toFixed(1) : '0.0';
  const totalAssists = finishedList.reduce((acc, m) => acc + m.ast, 0);
  const apg = totalMatchesCount > 0 ? (totalAssists / totalMatchesCount).toFixed(1) : '0.0';
  const totalSteals = finishedList.reduce((acc, m) => acc + m.stl, 0);
  const spg = totalMatchesCount > 0 ? (totalSteals / totalMatchesCount).toFixed(1) : '0.0';
  const totalBlocks = finishedList.reduce((acc, m) => acc + m.blk, 0);
  const bpg = totalMatchesCount > 0 ? (totalBlocks / totalMatchesCount).toFixed(1) : '0.0';

  const totalFgm = finishedList.reduce((acc, m) => acc + m.fg2m + m.fg3m, 0);
  const totalFga = finishedList.reduce((acc, m) => acc + m.fg2a + m.fg3a, 0);
  const careerFgPct = totalFga > 0 ? Math.round((totalFgm / totalFga) * 100) : 0;

  const totalFtm = finishedList.reduce((acc, m) => acc + m.ftm, 0);
  const totalFta = finishedList.reduce((acc, m) => acc + m.fta, 0);
  const careerFtPct = totalFta > 0 ? Math.round((totalFtm / totalFta) * 100) : 0;

  const careerHigh = finishedList.reduce((max, m) => (m.pts > max ? m.pts : max), 0);
  const avgEval =
    totalMatchesCount > 0
      ? (finishedList.reduce((acc, m) => acc + m.eval, 0) / totalMatchesCount).toFixed(1)
      : '0.0';

  const childAccentColor = selectedChild?.color || '#f97316';

  return (
    <div className="w-full max-w-6xl mx-auto px-3 sm:px-6 py-4 sm:py-6 space-y-6">
      {/* 1. Header & Children Tabs */}
      <div className="rounded-3xl bg-slate-900 border border-slate-800 p-4 sm:p-6 shadow-xl relative overflow-hidden">
        <div
          className="absolute -right-16 -top-16 w-56 h-56 rounded-full opacity-20 pointer-events-none"
          style={{ background: `radial-gradient(circle, ${childAccentColor} 0%, transparent 70%)` }}
        />

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-500/15 border border-rose-500/30 text-rose-400 text-xs font-black tracking-wide">
                <Heart className="w-3.5 h-3.5 fill-rose-500 text-rose-500" />
                <span>KĄCIK RODZICA • MOJE DZIECI</span>
              </span>
              <span className="text-[11px] font-bold text-slate-400 px-2 py-0.5 rounded bg-slate-800 border border-slate-700">
                {children.length} / 3 zawodników
              </span>
            </div>
            <h1 className="text-xl sm:text-2xl lg:text-3xl font-black text-white tracking-tight flex items-center gap-2">
              <span>Statystyki Własnego Dziecka</span>
            </h1>
            <p className="text-xs sm:text-sm text-slate-400 mt-1 max-w-xl">
              Śledź mecze tylko swojego dziecka z trybun na telefonie bez zbędnego chaosu całego protokołu.
              Obsługuj do 3 dzieci grających w różnych klubach i kategoriach wiekowych!
            </p>
          </div>

          {/* Quick Action: Add Child if < 3 */}
          <div className="flex items-center gap-2 shrink-0">
            {children.length < 3 ? (
              <button
                onClick={() => {
                  setChildToEdit(null);
                  setIsChildModalOpen(true);
                }}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 font-black text-xs shadow-md transition active:scale-95"
              >
                <UserPlus className="w-4 h-4" />
                <span>Dodaj Dziecko ({children.length}/3)</span>
              </button>
            ) : (
              <span className="text-[11px] text-amber-400/80 font-bold px-3 py-1.5 rounded-xl bg-amber-500/10 border border-amber-500/20">
                Maks. 3 dzieci osiągnięte
              </span>
            )}
          </div>
        </div>

        {/* 2. Switcher for Children (Tabs) */}
        <div className="mt-5 pt-4 border-t border-slate-800/80 flex flex-wrap items-center gap-2">
          {children.map((child) => {
            const isSelected = child.id === selectedChildId;
            return (
              <button
                key={child.id}
                onClick={() => handleSelectChild(child.id)}
                className={`flex items-center gap-2.5 px-3.5 py-2 rounded-2xl transition border active:scale-98 ${
                  isSelected
                    ? 'text-white shadow-lg'
                    : 'bg-slate-950/60 hover:bg-slate-800/80 text-slate-400 border-slate-800'
                }`}
                style={{
                  backgroundColor: isSelected ? `${child.color}22` : undefined,
                  borderColor: isSelected ? child.color : undefined,
                }}
              >
                <div
                  className="w-8 h-8 rounded-xl flex items-center justify-center text-lg font-black shadow-inner"
                  style={{ backgroundColor: isSelected ? child.color : '#334155' }}
                >
                  {child.avatarEmoji || '🏀'}
                </div>
                <div className="text-left leading-tight">
                  <div className="text-xs font-black flex items-center gap-1">
                    <span>#{child.number}</span>
                    <span>{child.name}</span>
                  </div>
                  <div className="text-[10px] text-slate-400 font-medium">
                    {child.clubName} • {child.category}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* 3. Selected Child Profile Bar */}
      {selectedChild && (
        <div
          className="rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-white shadow-lg transition-colors border"
          style={{
            background: `linear-gradient(135deg, ${childAccentColor}18 0%, rgba(15,23,42,0.95) 100%)`,
            borderColor: `${childAccentColor}55`,
          }}
        >
          <div className="flex items-center gap-3 min-w-0">
            <div
              className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl shadow-xl border border-white/20 shrink-0"
              style={{ backgroundColor: childAccentColor }}
            >
              {selectedChild.avatarEmoji || '⚡'}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-base sm:text-lg font-black tracking-tight truncate">
                  #{selectedChild.number} {selectedChild.name}
                </span>
                <span
                  className="text-[10px] font-black px-2 py-0.5 rounded-full uppercase"
                  style={{ backgroundColor: `${childAccentColor}33`, color: childAccentColor }}
                >
                  {selectedChild.category}
                </span>
                {selectedChild.birthYear && (
                  <span className="text-[10px] font-bold text-slate-400 px-1.5 py-0.5 rounded bg-slate-800">
                    Rocznik {selectedChild.birthYear}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-300 font-medium truncate">
                Klub: <span className="font-bold text-white">{selectedChild.clubName}</span>
                {selectedChild.position ? ` • ${selectedChild.position}` : ''}
              </p>
              {selectedChild.notes && (
                <p className="text-[11px] text-slate-400 italic mt-0.5 truncate">{selectedChild.notes}</p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
            <button
              onClick={() => {
                setChildToEdit(selectedChild);
                setIsChildModalOpen(true);
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800/90 hover:bg-slate-700 text-slate-200 text-xs font-bold transition border border-slate-700"
            >
              <Edit2 className="w-3.5 h-3.5" />
              <span>Edytuj</span>
            </button>

            {children.length > 1 && (
              <button
                onClick={() => setChildToDelete(selectedChild)}
                className="p-2 rounded-xl bg-slate-800/90 hover:bg-rose-900/60 text-slate-400 hover:text-rose-400 text-xs font-bold transition border border-slate-700"
                title="Usuń profil tego dziecka"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* 4. Sub-Navigation Tabs */}
      <div className="flex items-center gap-1.5 border-b border-slate-800 pb-2">
        <button
          onClick={() => {
            playClickSound();
            setSubTab('live');
          }}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-xs transition ${
            subTab === 'live'
              ? 'bg-amber-500 text-slate-950 font-black shadow-md'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
          }`}
        >
          <Flame className={`w-4 h-4 ${activeMatch ? 'text-rose-600' : ''}`} />
          <span>Mecz na żywo</span>
          {activeMatch && (
            <span
              className={`w-2 h-2 rounded-full ${
                activeMatch.isClockRunning ? 'bg-emerald-500' : 'bg-amber-400'
              } ml-0.5`}
            />
          )}
        </button>

        <button
          onClick={() => {
            playClickSound();
            setSubTab('stats');
          }}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-xs transition ${
            subTab === 'stats'
              ? 'bg-amber-500 text-slate-950 font-black shadow-md'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
          }`}
        >
          <TrendingUp className="w-4 h-4" />
          <span>Statystyki & Rekordy</span>
        </button>

        <button
          onClick={() => {
            playClickSound();
            setSubTab('history');
          }}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-xs transition ${
            subTab === 'history'
              ? 'bg-amber-500 text-slate-950 font-black shadow-md'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
          }`}
        >
          <Trophy className="w-4 h-4" />
          <span>Historia Spotkań ({childMatches.length})</span>
        </button>
      </div>

      {/* ======================================================== */}
      {/* SUB-VIEW 1: LIVE MATCH TRACKER                           */}
      {/* ======================================================== */}
      {subTab === 'live' && (
        <div className="space-y-4">
          {/* A. If No Match Is Currently Live: Start New Match Card */}
          {!activeMatch ? (
            <div className="p-6 sm:p-10 rounded-3xl bg-slate-900 border border-slate-800 text-center max-w-lg mx-auto shadow-2xl">
              <div
                className="w-20 h-20 rounded-3xl mx-auto flex items-center justify-center text-4xl shadow-2xl mb-4 border"
                style={{
                  backgroundColor: `${childAccentColor}22`,
                  borderColor: `${childAccentColor}66`,
                }}
              >
                {selectedChild?.avatarEmoji || '🏀'}
              </div>

              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-300 text-xs font-bold mb-3">
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>
                  {selectedChild?.name} • {selectedChild?.clubName} ({selectedChild?.category})
                </span>
              </div>

              <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">
                Zaczynamy kolejny mecz?
              </h2>
              <p className="text-xs sm:text-sm text-slate-400 mt-2 leading-relaxed">
                Prowadź statystyki tylko dla <strong>{selectedChild?.name}</strong>. Wygodne duże
                przyciski do klikania jedną ręką podczas kibicowania na trybunach. Mecz uruchamiasz
                ręcznie, gdy sędzia rozpocznie grę!
              </p>

              <button
                onClick={() => setIsNewMatchOpen(true)}
                className="w-full mt-6 py-4 px-6 rounded-2xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 font-black text-sm shadow-xl shadow-orange-950/50 transition transform active:scale-98 flex items-center justify-center gap-2"
              >
                <PlayCircle className="w-5 h-5" />
                <span>Rozpocznij Mecz ({selectedChild?.name})</span>
              </button>
            </div>
          ) : (
            /* B. LIVE MATCH IN PROGRESS: BIG TOUCH KEYPAD FOR PARENT */
            <div className="space-y-4">
              {/* Undo / Status Toast Notification */}
              {undoMessage && (
                <div className="p-3 rounded-2xl bg-amber-500 text-slate-950 font-black text-xs flex items-center justify-between shadow-lg animate-fade-in">
                  <span>{undoMessage}</span>
                  <CheckCircle2 className="w-4 h-4" />
                </div>
              )}

              {/* MANUAL START / PAUSE STATUS NOTICE - When Match is in PAUSED state */}
              {!activeMatch.isClockRunning && (
                <div className="p-3.5 sm:p-4 rounded-2xl bg-amber-500/15 border-2 border-amber-500/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-amber-200 shadow-lg">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-300 shrink-0">
                      <Pause className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="text-sm font-black text-white">
                        Mecz zapauzowany (zegar zatrzymany)
                      </div>
                      <div className="text-xs text-amber-300/90 font-medium">
                        Czas gry nie odlicza się. Kliknij przycisk poniżej, gdy sędzia wznowi grę!
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={handleToggleClock}
                    className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-black text-xs sm:text-sm shadow-md transition active:scale-95 shrink-0"
                  >
                    <Play className="w-4 h-4 fill-slate-950" />
                    <span>Wystartuj / Wznów mecz</span>
                  </button>
                </div>
              )}

              {/* Match Header Bar: Clock Controls, Opponent, Court Status, Finish */}
              <div className="rounded-3xl bg-slate-900 border border-slate-800 p-4 sm:p-5 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div
                    className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl font-black shadow-md border shrink-0"
                    style={{ backgroundColor: `${childAccentColor}33`, borderColor: childAccentColor }}
                  >
                    {selectedChild?.avatarEmoji || '⚡'}
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-base sm:text-lg font-black text-white">
                        vs {activeMatch.opponent}
                      </span>
                      <span className="text-[10px] font-black px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                        {activeMatch.location}
                      </span>
                      <span className="text-[10px] font-black px-2 py-0.5 rounded bg-amber-500/20 text-amber-400 border border-amber-500/30">
                        {activeMatch.childCategory}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 font-medium mt-0.5">
                      {activeMatch.competition || 'Mecz ligowy'} • {activeMatch.date}
                    </p>
                  </div>
                </div>

                {/* PAUSE / RESUME CLOCK & COURT CONTROLS */}
                <div className="flex items-center gap-2 flex-wrap">
                  {/* 1. Dedicated Pause/Resume Match Clock Button (WITHOUT subbing off) */}
                  <button
                    onClick={handleToggleClock}
                    className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl font-black text-xs transition border active:scale-95 shadow-md ${
                      activeMatch.isClockRunning
                        ? 'bg-amber-500 hover:bg-amber-400 text-slate-950 border-amber-400 shadow-amber-950/40 ring-2 ring-amber-400/20'
                        : 'bg-emerald-600 hover:bg-emerald-500 text-white border-emerald-400 ring-2 ring-emerald-400/30'
                    }`}
                    title={
                      activeMatch.isClockRunning
                        ? 'Zatrzymaj zegar meczu (np. gwizdek sędziego, czas dla trenera, rzuty wolne)'
                        : 'Wznów zegar meczu (rozpocznij odliczanie)'
                    }
                  >
                    {activeMatch.isClockRunning ? (
                      <>
                        <Pause className="w-4 h-4 fill-slate-950" />
                        <span>Zapauzuj mecz</span>
                      </>
                    ) : (
                      <>
                        <Play className="w-4 h-4 fill-white" />
                        <span>Wznów mecz ▶</span>
                      </>
                    )}
                  </button>

                  {/* 2. On-Court vs Bench Sub Toggle */}
                  <button
                    onClick={handleToggleSub}
                    className={`flex items-center gap-1.5 px-3.5 py-2.5 rounded-2xl font-black text-xs transition border active:scale-95 shadow-md ${
                      activeMatch.isOnCourt
                        ? 'bg-emerald-950/80 text-emerald-300 border-emerald-700/60 hover:bg-emerald-900'
                        : 'bg-slate-800 text-slate-400 border-slate-700 hover:bg-slate-700'
                    }`}
                    title="Przełącz czy dziecko jest na boisku czy na ławce rezerwowych"
                  >
                    <span>{activeMatch.isOnCourt ? '🟢 Na boisku' : '🟡 Na ławce'}</span>
                    <span className="font-mono text-[11px] text-white">
                      ({Math.floor(activeMatch.secondsPlayed / 60)}:
                      {String(activeMatch.secondsPlayed % 60).padStart(2, '0')})
                    </span>
                  </button>

                  {/* Time adjustments (+/- 30s) */}
                  <div className="flex items-center bg-slate-950 rounded-xl border border-slate-800 p-0.5">
                    <button
                      onClick={() => handleAdjustTime(-30)}
                      className="px-2 py-1.5 text-[10px] font-bold text-slate-400 hover:text-white"
                      title="Odejmij 30 sekund czasu gry"
                    >
                      -30s
                    </button>
                    <span className="text-slate-700">|</span>
                    <button
                      onClick={() => handleAdjustTime(30)}
                      className="px-2 py-1.5 text-[10px] font-bold text-slate-400 hover:text-white"
                      title="Dodaj 30 sekund czasu gry"
                    >
                      +30s
                    </button>
                  </div>

                  {/* 3. Finish Match button */}
                  <button
                    onClick={handleOpenFinishModal}
                    className="px-3 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-400 font-bold text-xs transition border border-amber-500/30 active:scale-95"
                    title="Zakończ spotkanie i zapisz w historii"
                  >
                    🏁 Zakończ
                  </button>

                  {/* 4. Cancel / Delete current live match if created by mistake */}
                  <button
                    onClick={() => setMatchToDelete(activeMatch)}
                    className="p-2.5 rounded-xl bg-slate-800/80 hover:bg-rose-950/80 text-slate-400 hover:text-rose-400 text-xs transition border border-slate-700"
                    title="Anuluj i skasuj ten mecz"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Quarter Switcher */}
              <div className="flex items-center justify-between gap-1 overflow-x-auto bg-slate-900/90 border border-slate-800 rounded-2xl p-1.5">
                {[1, 2, 3, 4, 5].map((q) => (
                  <button
                    key={q}
                    onClick={() => handleSetQuarter(q)}
                    className={`flex-1 py-2 px-3 rounded-xl font-black text-xs transition ${
                      activeMatch.currentQuarter === q
                        ? 'bg-amber-500 text-slate-950 shadow-md'
                        : 'text-slate-400 hover:text-white hover:bg-slate-800'
                    }`}
                  >
                    {q <= 4 ? `Kwarta ${q}` : 'Dogrywka'}
                  </button>
                ))}
              </div>

              {/* ================================================================ */}
              {/* REQUESTED: HERO STAT ROW (POINTS, EVAL, +/- RATING IN ONE ROW)   */}
              {/* WITH MUCH LARGER NUMBERS AND DESCRIPTIONS                        */}
              {/* ================================================================ */}
              <div className="grid grid-cols-3 gap-2.5 sm:gap-4">
                {/* 1. PUNKTY */}
                <div className="p-3.5 sm:p-5 rounded-3xl bg-gradient-to-b from-amber-500/15 via-slate-900 to-slate-950 border-2 border-amber-500/40 text-center shadow-xl relative overflow-hidden">
                  <div className="text-xs sm:text-sm font-black text-amber-300 uppercase tracking-wider flex items-center justify-center gap-1">
                    <span>🏀 PUNKTY (PTS)</span>
                  </div>
                  <div className="text-3xl sm:text-5xl lg:text-6xl font-black text-amber-400 mt-1 sm:mt-1.5 tracking-tight font-mono">
                    {activeMatch.pts}
                  </div>
                  <div className="text-[11px] sm:text-xs text-amber-200/90 font-bold mt-1 sm:mt-2 truncate">
                    2PT: {activeMatch.fg2m}/{activeMatch.fg2a} • 3PT: {activeMatch.fg3m}/{activeMatch.fg3a} • FT: {activeMatch.ftm}/{activeMatch.fta}
                  </div>
                </div>

                {/* 2. FIBA EVAL */}
                <div className="p-3.5 sm:p-5 rounded-3xl bg-gradient-to-b from-emerald-500/15 via-slate-900 to-slate-950 border-2 border-emerald-500/40 text-center shadow-xl relative overflow-hidden">
                  <div className="text-xs sm:text-sm font-black text-emerald-300 uppercase tracking-wider flex items-center justify-center gap-1">
                    <span>⭐ FIBA EVAL</span>
                  </div>
                  <div
                    className={`text-3xl sm:text-5xl lg:text-6xl font-black mt-1 sm:mt-1.5 tracking-tight font-mono ${
                      activeMatch.eval >= 15
                        ? 'text-emerald-400'
                        : activeMatch.eval >= 5
                        ? 'text-sky-400'
                        : 'text-slate-200'
                    }`}
                  >
                    {activeMatch.eval}
                  </div>
                  <div className="text-[11px] sm:text-xs text-emerald-200/90 font-bold mt-1 sm:mt-2 truncate">
                    {activeMatch.eval >= 18
                      ? '🔥 Występ MVP!'
                      : activeMatch.eval >= 10
                      ? 'Świetny mecz'
                      : 'Wskaźnik efektywności'}
                  </div>
                </div>

                {/* 3. +/- RATING */}
                <div className="p-3.5 sm:p-5 rounded-3xl bg-gradient-to-b from-sky-500/15 via-slate-900 to-slate-950 border-2 border-sky-500/40 text-center shadow-xl relative overflow-hidden">
                  <div className="text-xs sm:text-sm font-black text-sky-300 uppercase tracking-wider flex items-center justify-center gap-1">
                    <span>⚖️ RATING +/-</span>
                  </div>
                  <div
                    className={`text-3xl sm:text-5xl lg:text-6xl font-black mt-1 sm:mt-1.5 tracking-tight font-mono ${
                      activeMatch.plusMinus > 0
                        ? 'text-emerald-400'
                        : activeMatch.plusMinus < 0
                        ? 'text-rose-400'
                        : 'text-slate-300'
                    }`}
                  >
                    {activeMatch.plusMinus > 0 ? `+${activeMatch.plusMinus}` : activeMatch.plusMinus}
                  </div>
                  <div className="text-[11px] sm:text-xs text-sky-200/90 font-bold mt-1 sm:mt-2 truncate">
                    {activeMatch.plusMinus > 0
                      ? 'Drużyna zyskuje na parkiecie'
                      : activeMatch.plusMinus < 0
                      ? 'Przewaga rywala na parkiecie'
                      : 'Stan wyrównany'}
                  </div>
                </div>
              </div>

              {/* SECONDARY ROW: REMAINING STATS TILES (REBOUNDS, ASSISTS, STEALS, BLOCKS, FOULS, TURNOVERS) */}
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                <div className="p-2.5 sm:p-3 rounded-2xl bg-slate-900 border border-slate-800 text-center">
                  <div className="text-[11px] sm:text-xs font-bold text-slate-400 uppercase">Zbiórki</div>
                  <div className="text-xl sm:text-2xl font-black text-blue-400 mt-0.5 font-mono">
                    {activeMatch.totReb}
                  </div>
                  <div className="text-[9px] text-slate-500">
                    O:{activeMatch.offReb} | D:{activeMatch.defReb}
                  </div>
                </div>

                <div className="p-2.5 sm:p-3 rounded-2xl bg-slate-900 border border-slate-800 text-center">
                  <div className="text-[11px] sm:text-xs font-bold text-slate-400 uppercase">Asysty</div>
                  <div className="text-xl sm:text-2xl font-black text-purple-400 mt-0.5 font-mono">
                    {activeMatch.ast}
                  </div>
                  <div className="text-[9px] text-slate-500">Podania punktowe</div>
                </div>

                <div className="p-2.5 sm:p-3 rounded-2xl bg-slate-900 border border-slate-800 text-center">
                  <div className="text-[11px] sm:text-xs font-bold text-slate-400 uppercase">Przechwyty</div>
                  <div className="text-xl sm:text-2xl font-black text-pink-400 mt-0.5 font-mono">
                    {activeMatch.stl}
                  </div>
                  <div className="text-[9px] text-slate-500">Odzyskane piłki</div>
                </div>

                <div className="p-2.5 sm:p-3 rounded-2xl bg-slate-900 border border-slate-800 text-center">
                  <div className="text-[11px] sm:text-xs font-bold text-slate-400 uppercase">Bloki</div>
                  <div className="text-xl sm:text-2xl font-black text-teal-400 mt-0.5 font-mono">
                    {activeMatch.blk}
                  </div>
                  <div className="text-[9px] text-slate-500">Zablokowane rzuty</div>
                </div>

                <div className="p-2.5 sm:p-3 rounded-2xl bg-slate-900 border border-slate-800 text-center">
                  <div className="text-[11px] sm:text-xs font-bold text-slate-400 uppercase">Faule</div>
                  <div
                    className={`text-xl sm:text-2xl font-black mt-0.5 font-mono ${
                      activeMatch.fouls >= 4 ? 'text-rose-500 font-black' : 'text-slate-300'
                    }`}
                  >
                    {activeMatch.fouls}/5
                  </div>
                  <div className="text-[9px] text-slate-500">
                    {activeMatch.fouls >= 5 ? 'WYKLUCZENIE' : activeMatch.fouls === 4 ? 'UWAGA 4 FAUŚ' : 'Osobiste'}
                  </div>
                </div>

                <div className="p-2.5 sm:p-3 rounded-2xl bg-slate-900 border border-slate-800 text-center">
                  <div className="text-[11px] sm:text-xs font-bold text-slate-400 uppercase">Straty</div>
                  <div className="text-xl sm:text-2xl font-black text-rose-400 mt-0.5 font-mono">
                    {activeMatch.tov}
                  </div>
                  <div className="text-[9px] text-slate-500">Straty piłki</div>
                </div>
              </div>

              {/* BIG TOUCH ACTION KEYPAD */}
              <div className="rounded-3xl bg-slate-900 border border-slate-800 p-4 sm:p-6 shadow-xl space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs sm:text-sm font-black uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                    <span>Rejestracja Akcji Dziecka (Duże Przyciski)</span>
                  </h3>
                  <button
                    onClick={handleUndo}
                    disabled={activeMatch.events.length === 0}
                    className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-30 text-amber-400 text-xs font-bold transition active:scale-95"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Cofnij</span>
                  </button>
                </div>

                {/* 1. SCORING BUTTONS (BIG) - Górny rząd: +2, +3, +1 | Dolny rząd: rzuty niecelne */}
                <div className="space-y-2.5">
                  {/* GÓRNY RZĄD: RZUTY CELNE (+2, +3, +1) */}
                  <div>
                    <div className="text-[10px] sm:text-[11px] font-black uppercase tracking-wider text-emerald-400 mb-1.5 flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-emerald-400" />
                      <span>Rzuty celne (+2, +3, +1)</span>
                    </div>
                    <div className="grid grid-cols-3 gap-2 sm:gap-2.5">
                      {/* +2 PKT MADE */}
                      <button
                        onClick={() => handleAction('2PT_MADE', '2 PKT Celny (+2)', 2)}
                        className="p-3.5 sm:p-4 rounded-2xl bg-gradient-to-br from-emerald-600 to-emerald-700 hover:from-emerald-500 hover:to-emerald-600 text-white font-black text-center shadow-lg shadow-emerald-950/40 transition active:scale-95 border border-emerald-400/40"
                      >
                        <div className="text-2xl sm:text-3xl font-mono">+2 PKT</div>
                        <div className="text-[10px] sm:text-[11px] font-bold text-emerald-100 uppercase mt-0.5 truncate">
                          Z gry (Celny)
                        </div>
                      </button>

                      {/* +3 PKT MADE */}
                      <button
                        onClick={() => handleAction('3PT_MADE', '3 PKT Celny (+3)', 3)}
                        className="p-3.5 sm:p-4 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-slate-950 font-black text-center shadow-lg shadow-orange-950/50 transition active:scale-95 border border-amber-300/40"
                      >
                        <div className="text-2xl sm:text-3xl font-mono">+3 PKT 🔥</div>
                        <div className="text-[10px] sm:text-[11px] font-black text-slate-950 uppercase mt-0.5 truncate">
                          Trójka (Celny)
                        </div>
                      </button>

                      {/* +1 FT MADE */}
                      <button
                        onClick={() => handleAction('FT_MADE', 'Wolny Celny (+1)', 1)}
                        className="p-3.5 sm:p-4 rounded-2xl bg-gradient-to-br from-teal-600 to-emerald-700 hover:from-teal-500 hover:to-emerald-600 text-white font-black text-center shadow-lg shadow-teal-950/40 transition active:scale-95 border border-teal-400/40"
                      >
                        <div className="text-2xl sm:text-3xl font-mono">+1 PKT 🎯</div>
                        <div className="text-[10px] sm:text-[11px] font-bold text-teal-100 uppercase mt-0.5 truncate">
                          Wolny (Celny)
                        </div>
                      </button>
                    </div>
                  </div>

                  {/* DOLNY RZĄD: RZUTY NIECELNE */}
                  <div>
                    <div className="text-[10px] sm:text-[11px] font-black uppercase tracking-wider text-rose-400 mb-1.5 flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-rose-400" />
                      <span>Rzuty niecelne (Pudła)</span>
                    </div>
                    <div className="grid grid-cols-3 gap-2 sm:gap-2.5">
                      {/* 2PT MISS */}
                      <button
                        onClick={() => handleAction('2PT_MISS', '2 PKT Niecelny (Pudło)', 0)}
                        className="p-3 sm:p-3.5 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-black text-center transition active:scale-95 border border-slate-700 hover:border-rose-500/40"
                      >
                        <div className="text-xl sm:text-2xl text-rose-400 font-mono">2 PKT ❌</div>
                        <div className="text-[10px] font-bold text-slate-400 uppercase mt-0.5 truncate">
                          Niecelny z gry
                        </div>
                      </button>

                      {/* 3PT MISS */}
                      <button
                        onClick={() => handleAction('3PT_MISS', '3 PKT Niecelny (Pudło)', 0)}
                        className="p-3 sm:p-3.5 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-center transition active:scale-95 border border-slate-700 hover:border-rose-500/40"
                      >
                        <div className="text-xl sm:text-2xl text-rose-400 font-mono">3 PKT ❌</div>
                        <div className="text-[10px] font-bold text-slate-400 uppercase mt-0.5 truncate">
                          Niecelna trójka
                        </div>
                      </button>

                      {/* FT MISS */}
                      <button
                        onClick={() => handleAction('FT_MISS', 'Wolny Niecelny', 0)}
                        className="p-3 sm:p-3.5 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-center transition active:scale-95 border border-slate-700 hover:border-rose-500/40"
                      >
                        <div className="text-xl sm:text-2xl text-rose-400 font-mono">WOLNY ❌</div>
                        <div className="text-[10px] font-bold text-slate-400 uppercase mt-0.5 truncate">
                          Niecelny wolny
                        </div>
                      </button>
                    </div>
                  </div>
                </div>

                {/* 2. REBOUNDS, DEFENSE & PLAYS */}
                <div className="pt-2 border-t border-slate-800 grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <button
                    onClick={() => handleAction('DEF_REB', 'Zbiórka w obronie (DREB)')}
                    className="p-3 rounded-xl bg-blue-950/60 hover:bg-blue-900/80 text-blue-300 font-bold text-xs transition active:scale-95 border border-blue-800/40 text-center"
                  >
                    <div className="text-base font-black">🏀 Zbiórka Obrona</div>
                    <div className="text-[9px] text-blue-400/80 mt-0.5">D-REB ({activeMatch.defReb})</div>
                  </button>

                  <button
                    onClick={() => handleAction('OFF_REB', 'Zbiórka w ataku (OREB)')}
                    className="p-3 rounded-xl bg-indigo-950/60 hover:bg-indigo-900/80 text-indigo-300 font-bold text-xs transition active:scale-95 border border-indigo-800/40 text-center"
                  >
                    <div className="text-base font-black">🏀 Zbiórka Atak</div>
                    <div className="text-[9px] text-indigo-400/80 mt-0.5">O-REB ({activeMatch.offReb})</div>
                  </button>

                  <button
                    onClick={() => handleAction('ASSIST', 'Asysta (AST)')}
                    className="p-3 rounded-xl bg-purple-950/60 hover:bg-purple-900/80 text-purple-300 font-bold text-xs transition active:scale-95 border border-purple-800/40 text-center"
                  >
                    <div className="text-base font-black">🎯 Asysta</div>
                    <div className="text-[9px] text-purple-400/80 mt-0.5">Podanie ({activeMatch.ast})</div>
                  </button>

                  <button
                    onClick={() => handleAction('STEAL', 'Przechwyt (STL)')}
                    className="p-3 rounded-xl bg-pink-950/60 hover:bg-pink-900/80 text-pink-300 font-bold text-xs transition active:scale-95 border border-pink-800/40 text-center"
                  >
                    <div className="text-base font-black">⚡ Przechwyt</div>
                    <div className="text-[9px] text-pink-400/80 mt-0.5">W obronie ({activeMatch.stl})</div>
                  </button>

                  <button
                    onClick={() => handleAction('BLOCK', 'Blok (BLK)')}
                    className="p-3 rounded-xl bg-teal-950/60 hover:bg-teal-900/80 text-teal-300 font-bold text-xs transition active:scale-95 border border-teal-800/40 text-center"
                  >
                    <div className="text-base font-black">🛡️ Blok</div>
                    <div className="text-[9px] text-teal-400/80 mt-0.5">Zablokowany rzut ({activeMatch.blk})</div>
                  </button>

                  <button
                    onClick={() => handleAction('TURNOVER', 'Strata (TOV)')}
                    className="p-3 rounded-xl bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 font-bold text-xs transition active:scale-95 border border-rose-800/30 text-center"
                  >
                    <div className="text-base font-black">❌ Strata</div>
                    <div className="text-[9px] text-rose-400/80 mt-0.5">Utrata piłki ({activeMatch.tov})</div>
                  </button>

                  <button
                    onClick={() => handleAction('FOUL', 'Faul osobisty (FOUL)')}
                    className="p-3 rounded-xl bg-amber-950/40 hover:bg-amber-900/60 text-amber-300 font-bold text-xs transition active:scale-95 border border-amber-800/40 text-center"
                  >
                    <div className="text-base font-black">⚠️ Faul ({activeMatch.fouls}/5)</div>
                    <div className="text-[9px] text-amber-400/80 mt-0.5">
                      {activeMatch.fouls >= 4 ? 'UWAGA: Limit fauli!' : 'Faul osobisty'}
                    </div>
                  </button>

                  {/* +/- ON COURT QUICK RECORD */}
                  <div className="flex gap-1.5">
                    <button
                      onClick={() => handleAction('PLUS_OUR', 'Kosz dla nas (+/-)')}
                      className="flex-1 p-2 rounded-xl bg-emerald-950/60 hover:bg-emerald-900/80 text-emerald-300 font-bold text-xs transition active:scale-95 border border-emerald-800/40"
                      title="Gdy dziecko było na boisku i zdobyliśmy punkty"
                    >
                      <div className="font-black text-sm">+/- Nasz</div>
                      <div className="text-[8px] text-emerald-400">+2</div>
                    </button>
                    <button
                      onClick={() => handleAction('MINUS_OPP', 'Kosz dla rywala (+/-)')}
                      className="flex-1 p-2 rounded-xl bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 font-bold text-xs transition active:scale-95 border border-rose-800/30"
                      title="Gdy dziecko było na boisku i rywal zdobył punkty"
                    >
                      <div className="font-black text-sm">+/- Rywal</div>
                      <div className="text-[8px] text-rose-400">-2</div>
                    </button>
                  </div>
                </div>

                {/* 3. HIGHLIGHTS & STICKERS */}
                <div className="pt-2 border-t border-slate-800 space-y-2">
                  <div className="text-[11px] font-bold text-slate-400">
                    Szybkie wyróżnienia / Notatka rodzica:
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {[
                      '🔥 Rzut życia!',
                      '🛡️ Super obrona!',
                      '👏 Asysta meczu!',
                      '💪 Walka o bezpańską piłkę!',
                      '⚡ Szybki atak!',
                    ].map((sticker) => (
                      <button
                        key={sticker}
                        onClick={() => handleAddHighlight(sticker)}
                        className="px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition active:scale-95 border border-slate-700"
                      >
                        {sticker}
                      </button>
                    ))}
                  </div>

                  <div className="flex gap-2 mt-2">
                    <input
                      type="text"
                      placeholder="Wpisz własną notatkę z meczu..."
                      value={customHighlight}
                      onChange={(e) => setCustomHighlight(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleAddHighlight(customHighlight);
                      }}
                      className="flex-1 px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-700 text-xs text-white focus:outline-none focus:border-amber-500"
                    />
                    <button
                      onClick={() => handleAddHighlight(customHighlight)}
                      disabled={!customHighlight.trim()}
                      className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-slate-950 font-black text-xs transition active:scale-95"
                    >
                      Dodaj
                    </button>
                  </div>
                </div>
              </div>

              {/* Match Play-by-Play Log */}
              {activeMatch.events.length > 0 && (
                <div className="rounded-3xl bg-slate-900 border border-slate-800 p-4 shadow-xl">
                  <h4 className="text-xs font-black uppercase tracking-wider text-slate-400 mb-2">
                    Ostatnie zdarzenia w meczu ({activeMatch.events.length})
                  </h4>
                  <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                    {activeMatch.events.slice(0, 15).map((ev) => (
                      <div
                        key={ev.id}
                        className="p-2 rounded-xl bg-slate-950/70 border border-slate-800/80 flex items-center justify-between text-xs"
                      >
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-[10px] text-slate-500 font-bold">
                            {ev.timeFormatted}
                          </span>
                          <span className="font-bold text-white">{ev.label}</span>
                        </div>
                        {ev.pointsDelta > 0 && (
                          <span className="font-black text-emerald-400 font-mono">
                            +{ev.pointsDelta} pkt
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ======================================================== */}
      {/* SUB-VIEW 2: CAREER STATS & RECORDS                       */}
      {/* ======================================================== */}
      {subTab === 'stats' && (
        <div className="space-y-6">
          {/* KPI Dashboard */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-4 rounded-3xl bg-slate-900 border border-slate-800 shadow-xl">
              <div className="text-xs font-bold text-slate-400">Rozegrane Mecze</div>
              <div className="text-3xl font-black text-white mt-1">{totalMatchesCount}</div>
              <div className="text-[10px] text-slate-500 mt-1">Zakończone spotkania</div>
            </div>

            <div className="p-4 rounded-3xl bg-slate-900 border border-slate-800 shadow-xl">
              <div className="text-xs font-bold text-slate-400">Średnia Punktów (PPG)</div>
              <div className="text-3xl font-black text-amber-400 mt-1">{ppg}</div>
              <div className="text-[10px] text-slate-500 mt-1">
                Rekord: <strong className="text-white">{careerHigh} pkt</strong>
              </div>
            </div>

            <div className="p-4 rounded-3xl bg-slate-900 border border-slate-800 shadow-xl">
              <div className="text-xs font-bold text-slate-400">Średnia Zbiórek (RPG)</div>
              <div className="text-3xl font-black text-blue-400 mt-1">{rpg}</div>
              <div className="text-[10px] text-slate-500 mt-1">{totalRebounds} zbiórek łącznie</div>
            </div>

            <div className="p-4 rounded-3xl bg-slate-900 border border-slate-800 shadow-xl">
              <div className="text-xs font-bold text-slate-400">Średnia Asyst (APG)</div>
              <div className="text-3xl font-black text-purple-400 mt-1">{apg}</div>
              <div className="text-[10px] text-slate-500 mt-1">{totalAssists} asyst łącznie</div>
            </div>
          </div>

          {/* Secondary Stats Summary */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-4 rounded-3xl bg-slate-900 border border-slate-800 shadow-xl">
              <div className="text-xs font-bold text-slate-400">Średni FIBA Eval</div>
              <div className="text-2xl font-black text-emerald-400 mt-1">{avgEval}</div>
              <div className="text-[10px] text-slate-500 mt-1">Efektywność na mecz</div>
            </div>

            <div className="p-4 rounded-3xl bg-slate-900 border border-slate-800 shadow-xl">
              <div className="text-xs font-bold text-slate-400">Skuteczność z Gry (FG%)</div>
              <div className="text-2xl font-black text-white mt-1">{careerFgPct}%</div>
              <div className="text-[10px] text-slate-500 mt-1">
                {totalFgm} / {totalFga} rzutów
              </div>
            </div>

            <div className="p-4 rounded-3xl bg-slate-900 border border-slate-800 shadow-xl">
              <div className="text-xs font-bold text-slate-400">Wolne (FT%)</div>
              <div className="text-2xl font-black text-white mt-1">{careerFtPct}%</div>
              <div className="text-[10px] text-slate-500 mt-1">
                {totalFtm} / {totalFta} osobistych
              </div>
            </div>

            <div className="p-4 rounded-3xl bg-slate-900 border border-slate-800 shadow-xl">
              <div className="text-xs font-bold text-slate-400">Obrona (SPG / BPG)</div>
              <div className="text-2xl font-black text-pink-400 mt-1">
                {spg} / {bpg}
              </div>
              <div className="text-[10px] text-slate-500 mt-1">Przechwyty / Bloki na mecz</div>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* SUB-VIEW 3: MATCH HISTORY (ZAKOŃCZONE SPOTKANIA)          */}
      {/* ======================================================== */}
      {subTab === 'history' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base sm:text-lg font-black text-white">
              Zapisane Mecze ({childMatches.length})
            </h3>
            <button
              onClick={() => setIsNewMatchOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs transition active:scale-95 shadow-md"
            >
              <PlusCircle className="w-3.5 h-3.5" />
              <span>Nowy Mecz</span>
            </button>
          </div>

          {childMatches.length === 0 ? (
            <div className="p-8 sm:p-12 rounded-3xl bg-slate-900 border border-slate-800 text-center">
              <Trophy className="w-12 h-12 text-slate-600 mx-auto mb-3" />
              <h4 className="text-base font-black text-white">Brak zapisanych meczów</h4>
              <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                Nie zarejestrowano jeszcze meczu dla zawodnika {selectedChild?.name}. Kliknij &quot;Nowy
                Mecz&quot;, aby rozpocząć prowadzenie statystyk.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {childMatches.map((m) => {
                const fga = m.fg2a + m.fg3a;
                const fgm = m.fg2m + m.fg3m;
                const fgPct = fga > 0 ? Math.round((fgm / fga) * 100) : 0;
                const minutes = Math.round(m.secondsPlayed / 60);

                return (
                  <div
                    key={m.id}
                    className="rounded-3xl bg-slate-900 border border-slate-800 p-4 sm:p-5 shadow-lg space-y-3"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-3">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-base font-black text-white">vs {m.opponent}</span>
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                            {m.location}
                          </span>
                          <span
                            className={`text-[10px] font-black px-2 py-0.5 rounded ${
                              m.status === 'live'
                                ? 'bg-rose-500/20 text-rose-400'
                                : 'bg-emerald-500/20 text-emerald-400'
                            }`}
                          >
                            {m.status === 'live' ? '🔴 W TRAKCIE' : 'ZAKOŃCZONY'}
                          </span>
                        </div>
                        <div className="text-xs text-slate-400 mt-0.5">
                          {m.date} • {m.competition || 'Mecz ligowy'} • Czas gry: {minutes} min
                          {m.finalTeamScoreOur !== undefined && m.finalTeamScoreOpp !== undefined && (
                            <span className="ml-2 font-bold text-white">
                              (Wynik: {m.finalTeamScoreOur} : {m.finalTeamScoreOpp})
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {/* Download PDF Card */}
                        <button
                          onClick={() => handleExportPdf(m)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 font-black text-xs shadow-md transition active:scale-95"
                          title="Pobierz oficjalną kartę występu zawodnika (PDF)"
                        >
                          <FileDown className="w-3.5 h-3.5" />
                          <span>Pobierz Raport PDF</span>
                        </button>

                        {/* DELETE MATCH BUTTON - Opens custom in-app confirmation modal (works 100% in iframe) */}
                        <button
                          onClick={() => setMatchToDelete(m)}
                          className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-rose-950 text-slate-400 hover:text-rose-400 border border-slate-700 hover:border-rose-800/60 text-xs transition active:scale-95"
                          title="Skasuj ten zakończony mecz"
                        >
                          <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                          <span className="text-rose-400 font-bold">Skasuj</span>
                        </button>
                      </div>
                    </div>

                    {/* Stats summary row */}
                    <div className="grid grid-cols-4 sm:grid-cols-8 gap-2 text-center">
                      <div className="p-2 rounded-xl bg-slate-950">
                        <div className="text-[10px] text-slate-500 font-bold">PTS</div>
                        <div className="text-base font-black text-amber-400">{m.pts}</div>
                      </div>
                      <div className="p-2 rounded-xl bg-slate-950">
                        <div className="text-[10px] text-slate-500 font-bold">EVAL</div>
                        <div className="text-base font-black text-emerald-400">{m.eval}</div>
                      </div>
                      <div className="p-2 rounded-xl bg-slate-950">
                        <div className="text-[10px] text-slate-500 font-bold">REB</div>
                        <div className="text-base font-black text-blue-400">{m.totReb}</div>
                      </div>
                      <div className="p-2 rounded-xl bg-slate-950">
                        <div className="text-[10px] text-slate-500 font-bold">AST</div>
                        <div className="text-base font-black text-purple-400">{m.ast}</div>
                      </div>
                      <div className="p-2 rounded-xl bg-slate-950">
                        <div className="text-[10px] text-slate-500 font-bold">STL</div>
                        <div className="text-base font-black text-pink-400">{m.stl}</div>
                      </div>
                      <div className="p-2 rounded-xl bg-slate-950">
                        <div className="text-[10px] text-slate-500 font-bold">BLK</div>
                        <div className="text-base font-black text-teal-400">{m.blk}</div>
                      </div>
                      <div className="p-2 rounded-xl bg-slate-950">
                        <div className="text-[10px] text-slate-500 font-bold">FG%</div>
                        <div className="text-base font-black text-white">{fgPct}%</div>
                      </div>
                      <div className="p-2 rounded-xl bg-slate-950">
                        <div className="text-[10px] text-slate-500 font-bold">+/-</div>
                        <div className="text-base font-black text-amber-300">
                          {m.plusMinus > 0 ? `+${m.plusMinus}` : m.plusMinus}
                        </div>
                      </div>
                    </div>

                    {/* Highlights / Notes if present */}
                    {m.highlights && m.highlights.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {m.highlights.map((h, i) => (
                          <span
                            key={i}
                            className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-300 border border-amber-500/20"
                          >
                            ⭐ {h}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* MODAL 1: Child Profile Modal (Create / Edit) */}
      <ChildProfileModal
        isOpen={isChildModalOpen}
        onClose={() => {
          setIsChildModalOpen(false);
          setChildToEdit(null);
        }}
        childToEdit={childToEdit}
        onSaveChild={handleSaveChildProfile}
        totalChildrenCount={children.length}
      />

      {/* MODAL 2: Start New Match Modal */}
      {isNewMatchOpen && selectedChild && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/90 overflow-y-auto">
          <div className="relative w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div
                className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl shadow-lg border border-white/20"
                style={{ backgroundColor: childAccentColor }}
              >
                {selectedChild.avatarEmoji || '⚡'}
              </div>
              <div>
                <h3 className="text-lg font-black text-white">Nowy Mecz dla {selectedChild.name}</h3>
                <p className="text-xs text-slate-400">
                  {selectedChild.clubName} • #{selectedChild.number} ({selectedChild.category})
                </p>
              </div>
            </div>

            <form onSubmit={handleStartNewMatch} className="space-y-3">
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                  Przeciwnik / Rywal *
                </label>
                <input
                  type="text"
                  required
                  placeholder="np. ŁKS Łódź, MKS Dąbrowa Górnicza, Legia"
                  value={newOpponent}
                  onChange={(e) => setNewOpponent(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white font-bold text-sm focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                    Gdzie gramy?
                  </label>
                  <div className="grid grid-cols-2 gap-1.5">
                    {(['Dom', 'Wyjazd'] as const).map((loc) => (
                      <button
                        type="button"
                        key={loc}
                        onClick={() => setNewLocation(loc)}
                        className={`py-2 rounded-xl text-xs font-bold transition ${
                          newLocation === loc
                            ? 'bg-amber-500 text-slate-950 font-black'
                            : 'bg-slate-950 text-slate-400 border border-slate-800'
                        }`}
                      >
                        {loc}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                    Data meczu
                  </label>
                  <input
                    type="date"
                    value={newDate}
                    onChange={(e) => setNewDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white text-xs font-mono focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                  Rozgrywki / Ranga meczu
                </label>
                <input
                  type="text"
                  placeholder="np. Liga Wojewódzka WOZKosz, Turniej Ogólnopolski, Sparing"
                  value={newCompetition}
                  onChange={(e) => setNewCompetition(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white text-xs focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-[11px] text-amber-300">
                💡 Po otwarciu meczu zegar będzie zatrzymany. Uruchomisz go ręcznie przyciskiem Start, gdy sędzia rozpocznie grę!
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsNewMatchOpen(false)}
                  className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs transition"
                >
                  Anuluj
                </button>
                <button
                  type="submit"
                  className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 font-black text-xs transition shadow-lg active:scale-95"
                >
                  Utwórz Mecz
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: IN-APP DELETE MATCH CONFIRMATION (Guarantees working in iframe) */}
      {matchToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/90">
          <div className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-rose-400">
              <div className="w-12 h-12 rounded-2xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center shrink-0">
                <Trash2 className="w-6 h-6 text-rose-500" />
              </div>
              <div>
                <h3 className="text-base font-black text-white">Skasować ten mecz?</h3>
                <p className="text-xs text-rose-400 font-medium">Operacja jest nieodwracalna</p>
              </div>
            </div>

            <div className="p-3 rounded-2xl bg-slate-950 border border-slate-800 text-xs space-y-1">
              <div className="font-bold text-white">vs {matchToDelete.opponent}</div>
              <div className="text-slate-400">
                {matchToDelete.date} • {matchToDelete.location} • {matchToDelete.competition || 'Mecz ligowy'}
              </div>
              <div className="text-amber-400 font-bold pt-1">
                Punkty: {matchToDelete.pts} | FIBA Eval: {matchToDelete.eval} | +/-: {matchToDelete.plusMinus}
              </div>
            </div>

            <p className="text-xs text-slate-400">
              Mecz zostanie trwale usunięty ze statystyk dziecka <strong>{matchToDelete.childName}</strong>.
            </p>

            <div className="pt-2 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setMatchToDelete(null)}
                className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs transition"
              >
                Anuluj
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteMatch}
                className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-black text-xs transition shadow-lg active:scale-95 flex items-center gap-1.5"
              >
                <Trash2 className="w-4 h-4" />
                <span>Tak, skasuj mecz</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 4: IN-APP DELETE CHILD CONFIRMATION */}
      {childToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/90">
          <div className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-rose-400">
              <div className="w-12 h-12 rounded-2xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center shrink-0 text-2xl">
                {childToDelete.avatarEmoji || '👦'}
              </div>
              <div>
                <h3 className="text-base font-black text-white">Usunąć profil dziecka?</h3>
                <p className="text-xs text-rose-400 font-medium">#{childToDelete.number} {childToDelete.name}</p>
              </div>
            </div>

            <p className="text-xs text-slate-300">
              Czy na pewno chcesz usunąć to dziecko z profilu rodzica?
            </p>

            <div className="pt-2 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setChildToDelete(null)}
                className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs transition"
              >
                Anuluj
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteChild}
                className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-black text-xs transition shadow-lg active:scale-95 flex items-center gap-1.5"
              >
                <Trash2 className="w-4 h-4" />
                <span>Usuń profil</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 5: IN-APP FINISH MATCH DIALOG (Replaces window.prompt) */}
      {isFinishModalOpen && activeMatch && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/90">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0 text-2xl">
                🏁
              </div>
              <div>
                <h3 className="text-base sm:text-lg font-black text-white">Zakończenie meczu</h3>
                <p className="text-xs text-slate-400">vs {activeMatch.opponent} ({activeMatch.date})</p>
              </div>
            </div>

            <div className="space-y-3">
              <div className="text-xs font-bold text-slate-300">
                Wpisz końcowy wynik drużyn (opcjonalnie):
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                    Drużyna {selectedChild?.name}
                  </label>
                  <input
                    type="number"
                    placeholder="np. 64"
                    value={finishOurScore}
                    onChange={(e) => setFinishOurScore(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white font-black text-lg focus:outline-none focus:border-amber-500 text-center"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                    Rywal ({activeMatch.opponent})
                  </label>
                  <input
                    type="number"
                    placeholder="np. 58"
                    value={finishOppScore}
                    onChange={(e) => setFinishOppScore(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white font-black text-lg focus:outline-none focus:border-amber-500 text-center"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                  Krótka notatka / Podsumowanie rodzica (opcjonalnie)
                </label>
                <textarea
                  rows={2}
                  placeholder="np. Wspaniały mecz, świetna obrona w 4. kwarcie!"
                  value={finishNotes}
                  onChange={(e) => setFinishNotes(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white text-xs focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="p-3 rounded-2xl bg-slate-950 border border-slate-800 text-xs flex justify-between items-center text-slate-300">
                <span>Statystyki {selectedChild?.name}:</span>
                <span className="font-bold text-amber-400">
                  {activeMatch.pts} pkt • Eval {activeMatch.eval} • {activeMatch.totReb} zb • {activeMatch.ast} as
                </span>
              </div>
            </div>

            <div className="pt-2 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsFinishModalOpen(false)}
                className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs transition"
              >
                Wróć do meczu
              </button>
              <button
                type="button"
                onClick={handleConfirmFinishMatch}
                className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 font-black text-xs transition shadow-lg active:scale-95"
              >
                Zapisz i Zakończ Mecz
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

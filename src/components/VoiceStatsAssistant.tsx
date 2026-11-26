import React, { useState, useEffect, useRef } from 'react';
import {
  Mic,
  MicOff,
  Volume2,
  Sparkles,
  HelpCircle,
  X,
  RotateCcw,
  Check,
  Send,
  Radio,
  Sliders,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { ActionType, Match, Player } from '../types/basketball';
import {
  isSpeechRecognitionSupported,
  parseBasketballVoiceCommand,
  parseWithGeminiFallback,
  ParsedVoiceAction,
} from '../services/voiceRecognitionService';
import { playClickSound, playScoreSound, triggerHaptic, announcePlay } from '../services/tts';
import { useBackHandler } from '../services/navigationHistory';

// Polyfill SpeechRecognition type for browser
type IWindow = typeof window & {
  SpeechRecognition?: any;
  webkitSpeechRecognition?: any;
};

interface VoiceStatsAssistantProps {
  match: Match;
  rosterPlayers: Player[];
  selectedPlayerId: string | null;
  onRecordBatchActions: (actions: ParsedVoiceAction[]) => void;
  onUndoLastAction: () => void;
  onSelectPlayer: (playerId: string) => void;
  soundEnabled?: boolean;
}

export const VoiceStatsAssistant: React.FC<VoiceStatsAssistantProps> = ({
  match,
  rosterPlayers,
  selectedPlayerId,
  onRecordBatchActions,
  onUndoLastAction,
  onSelectPlayer,
  soundEnabled = true,
}) => {
  const [isListening, setIsListening] = useState(false);
  const [continuousMode, setContinuousMode] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [lastExecutedActions, setLastExecutedActions] = useState<ParsedVoiceAction[]>([]);
  const [statusMessage, setStatusMessage] = useState<string>('Dotknij mikrofonu, aby dyktować statystyki');
  const [isExpanded, setIsExpanded] = useState(false);
  const [showHelpModal, setShowHelpModal] = useState(false);
  useBackHandler(showHelpModal, () => setShowHelpModal(false), 'voice-help');
  const [manualText, setManualText] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [hasMicPermissionError, setHasMicPermissionError] = useState(false);
  const manualInputRef = useRef<HTMLInputElement>(null);

  const recognitionRef = useRef<any>(null);
  const isContinuousRef = useRef(continuousMode);
  isContinuousRef.current = continuousMode;

  const supported = isSpeechRecognitionSupported();

  // Process recognised speech text
  const handleProcessCommand = async (spokenText: string) => {
    if (!spokenText.trim() || isProcessing) return;
    setIsProcessing(true);
    setStatusMessage(`Przetwarzanie: "${spokenText}"...`);

    // 1. First run high-speed local Polish rule parser (0ms latency)
    const localResult = parseBasketballVoiceCommand(
      spokenText,
      rosterPlayers,
      selectedPlayerId
    );

    let actionsToExecute: ParsedVoiceAction[] = localResult.actions;

    // 2. If local rule parser found nothing, try intelligent Gemini fallback
    if (actionsToExecute.length === 0 && navigator.onLine) {
      try {
        const geminiActions = await parseWithGeminiFallback(spokenText, rosterPlayers);
        if (geminiActions.length > 0) {
          actionsToExecute = geminiActions;
        }
      } catch (err) {
        console.warn('Fallback error:', err);
      }
    }

    if (actionsToExecute.length > 0) {
      // Check for UNDO command
      const hasUndo = actionsToExecute.some((a) => a.isUndo);
      if (hasUndo) {
        onUndoLastAction();
        setStatusMessage('Cofnięto ostatnią akcję.');
        triggerHaptic(40);
        if (soundEnabled) {
          announcePlay('Cofnięto ostatnią akcję');
        }
        setLastExecutedActions([]);
        setIsProcessing(false);
        return;
      }

      // Check for select player only
      const onlySelect = actionsToExecute.filter((a) => a.isSelectPlayerOnly);
      if (onlySelect.length === actionsToExecute.length && onlySelect[0]?.playerId) {
        onSelectPlayer(onlySelect[0].playerId);
        setStatusMessage(`Wybrano zawodnika #${onlySelect[0].playerNumber}`);
        triggerHaptic(20);
        setIsProcessing(false);
        return;
      }

      // Filter executable match actions
      const matchActions = actionsToExecute.filter((a) => !a.isSelectPlayerOnly && !a.isUndo);

      if (matchActions.length > 0) {
        onRecordBatchActions(matchActions);
        setLastExecutedActions(matchActions);
        setStatusMessage(`Zarejestrowano: ${matchActions.map((a) => a.label).join(' + ')}`);
        playScoreSound(2);
        triggerHaptic(50);

        if (soundEnabled) {
          const spokenConfirm = matchActions.map((a) => a.label).join(', ');
          announcePlay(spokenConfirm);
        }
      }
    } else {
      setStatusMessage(`Nie rozpoznano akcji w: "${spokenText}"`);
      triggerHaptic(20);
    }

    setIsProcessing(false);
  };

  // Initialize SpeechRecognition instance
  useEffect(() => {
    if (!supported) return;

    const win = window as IWindow;
    const SpeechRec = win.SpeechRecognition || win.webkitSpeechRecognition;
    const rec = new SpeechRec();

    rec.lang = 'pl-PL';
    rec.continuous = continuousMode;
    rec.interimResults = true;
    rec.maxAlternatives = 1;

    rec.onstart = () => {
      setIsListening(true);
      setStatusMessage(
        continuousMode
          ? '🎙️ Tryb ciągły aktywny: mów akcje na bieżąco...'
          : '🎙️ Słucham... powiedz np. "dziesiątka zbiórka w ataku, pudło za dwa"'
      );
    };

    rec.onresult = (event: any) => {
      let currentInterim = '';
      let finalTranscript = '';

      for (let i = event.resultIndex; i < event.results.length; ++i) {
        const item = event.results[i];
        if (item.isFinal) {
          finalTranscript += item[0].transcript;
        } else {
          currentInterim += item[0].transcript;
        }
      }

      setInterimTranscript(currentInterim);

      if (finalTranscript) {
        setTranscript(finalTranscript);
        setInterimTranscript('');
        handleProcessCommand(finalTranscript);
      }
    };

    rec.onerror = (event: any) => {
      console.warn('SpeechRecognition error:', event.error);
      if (event.error === 'not-allowed') {
        setHasMicPermissionError(true);
        setStatusMessage('Safari zablokowało mikrofon. Kliknij 🍎 Instrukcja lub użyj dyktowania z klawiatury.');
        setIsListening(false);
      } else if (event.error === 'no-speech') {
        // quiet gym / pause
      } else {
        setStatusMessage(`Błąd mikrofonu (${event.error}). Spróbuj ponownie.`);
      }
    };

    rec.onend = () => {
      // If continuous mode is still enabled by the coach, automatically restart recognition!
      if (isContinuousRef.current) {
        try {
          rec.start();
        } catch {
          // ignore already started
        }
      } else {
        setIsListening(false);
        setInterimTranscript('');
      }
    };

    recognitionRef.current = rec;

    return () => {
      try {
        rec.abort();
      } catch {
        // ignore
      }
    };
  }, [continuousMode, supported]);

  const toggleListening = async () => {
    playClickSound();
    triggerHaptic(30);

    if (!supported) {
      setShowHelpModal(true);
      return;
    }

    if (isListening) {
      isContinuousRef.current = false;
      setContinuousMode(false);
      try {
        recognitionRef.current?.stop();
      } catch {
        // ignore
      }
      setIsListening(false);
      setStatusMessage('Mikrofon zatrzymany.');
    } else {
      setHasMicPermissionError(false);

      // On iOS/iPadOS Safari, explicitly trigger getUserMedia to prompt system dialog
      if (typeof navigator !== 'undefined' && navigator.mediaDevices?.getUserMedia) {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          stream.getTracks().forEach((track) => track.stop());
          setHasMicPermissionError(false);
        } catch (mediaErr: any) {
          console.warn('getUserMedia prompt result on iPad/Safari:', mediaErr);
          if (
            mediaErr?.name === 'NotAllowedError' ||
            mediaErr?.name === 'PermissionDeniedError' ||
            mediaErr?.message?.includes('denied')
          ) {
            setHasMicPermissionError(true);
            setStatusMessage('Brak dostępu do mikrofonu (iPad/Safari). Sprawdź poniższą instrukcję.');
            return;
          }
        }
      }

      try {
        recognitionRef.current?.start();
      } catch (e) {
        console.warn('SpeechRecognition start error:', e);
      }
    }
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualText.trim()) return;
    handleProcessCommand(manualText);
    setManualText('');
  };

  const handleTestExample = (exampleText: string) => {
    playClickSound();
    triggerHaptic(20);
    setTranscript(exampleText);
    handleProcessCommand(exampleText);
  };

  return (
    <div className="w-full bg-slate-900 border border-amber-500/25 rounded-2xl shadow-xl transition-all duration-300">
      {/* Top Banner Row */}
      <div className="p-2 sm:p-2.5 flex items-center justify-between gap-2 max-w-7xl mx-auto">
        {/* Left: Main Mic Button + Live Status */}
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <button
            onClick={toggleListening}
            className={`relative p-2.5 sm:p-3 rounded-2xl flex items-center justify-center transition-all duration-300 shadow-lg ${
              isListening
                ? 'bg-gradient-to-r from-red-600 to-rose-500 text-white shadow-rose-950/60 ring-4 ring-rose-500/30'
                : 'bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 shadow-orange-950/40 active:scale-95'
            }`}
            title={isListening ? 'Zatrzymaj nasłuch' : 'Włącz dyktowanie głosem'}
          >
            {isListening ? (
              <Mic className="w-5 h-5" />
            ) : (
              <Mic className="w-5 h-5" />
            )}
            {isListening && (
              <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-400 rounded-full" />
            )}
          </button>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-black text-amber-400 flex items-center gap-1 uppercase tracking-wider">
                <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                <span>Statystyki Głosem</span>
              </span>

              {isListening && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30">
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
                  {continuousMode ? 'Ciągły nasłuch (Hands-Free)' : 'Nasłuchiwanie...'}
                </span>
              )}

              {continuousMode && !isListening && (
                <span className="text-[10px] text-slate-400 font-semibold">
                  (Hands-free wyciszony)
                </span>
              )}
            </div>

            {/* Transcript or status display */}
            <div className="text-xs text-slate-200 font-medium truncate mt-0.5">
              {interimTranscript ? (
                <span className="text-amber-300 italic">
                  "{interimTranscript}..."
                </span>
              ) : transcript ? (
                <span className="text-slate-100 font-bold">
                  "{transcript}"
                </span>
              ) : (
                <span className="text-slate-400 text-[11px]">
                  {statusMessage}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Right Action Icons: Hands-Free Switch, Examples/Help, Expand */}
        <div className="flex items-center gap-1.5 shrink-0">
          {/* Continuous Listening Toggle Button */}
          <button
            onClick={() => {
              playClickSound();
              setContinuousMode(!continuousMode);
              if (!continuousMode && !isListening) {
                // start listening automatically
                try {
                  recognitionRef.current?.start();
                } catch {
                  // ignore
                }
              }
            }}
            className={`px-2 py-1.5 sm:px-2.5 sm:py-1.5 rounded-xl text-[11px] font-bold border transition flex items-center gap-1.5 ${
              continuousMode
                ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300'
                : 'bg-slate-800/80 border-slate-700 text-slate-400 hover:text-slate-200'
            }`}
            title="Tryb ciągły (Hands-free): mikrofon cały czas aktywny podczas meczu"
          >
            <Radio className={`w-3.5 h-3.5 ${continuousMode ? 'text-emerald-400' : ''}`} />
            <span className="hidden sm:inline">Tryb ciągły</span>
          </button>

          {/* Help & Commands Guide Modal Button */}
          <button
            onClick={() => {
              playClickSound();
              setShowHelpModal(true);
            }}
            className="p-1.5 sm:p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-amber-400 border border-slate-700 transition"
            title="Przykłady komend głosowych"
          >
            <HelpCircle className="w-4 h-4" />
          </button>

          {/* Expand/Collapse Quick Dictation Bar */}
          <button
            onClick={() => {
              playClickSound();
              setIsExpanded(!isExpanded);
            }}
            className="p-1.5 sm:p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition"
            title={isExpanded ? 'Zwiń panel głosowy' : 'Rozwiń panel komend'}
          >
            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Microphone Permission Blocked Notice for iPad / Safari */}
      {hasMicPermissionError && (
        <div className="mx-2 my-2 p-3 rounded-2xl bg-amber-500/15 border border-amber-500/40 text-amber-200 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <div className="flex items-start gap-2">
            <span className="text-base shrink-0">⚠️</span>
            <div>
              <span className="font-bold text-white block">
                Safari na iPadzie nie ma zgody na mikrofon
              </span>
              <span className="text-[11px] text-slate-300">
                W iPadOS Safari nie ma w sekcji „Prywatność”. Uprawnienia są bezpośrednio w pasku adresu (ikona „aA” ➔ Ustawienia witryny ➔ Mikrofon ➔ Pozwól) lub w Ustawienia ➔ Safari ➔ Mikrofon.
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => setShowHelpModal(true)}
              className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs flex items-center gap-1 shadow"
            >
              <HelpCircle className="w-3.5 h-3.5" />
              <span>Instrukcja Safari</span>
            </button>
            <button
              onClick={() => {
                setIsExpanded(true);
                setTimeout(() => manualInputRef.current?.focus(), 100);
              }}
              className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-bold text-xs flex items-center gap-1"
            >
              <span>Dyktuj z klawiatury</span>
            </button>
          </div>
        </div>
      )}

      {/* Executed Actions Badge Strip (shows what was just added!) */}
      {lastExecutedActions.length > 0 && (
        <div className="px-3 pb-2 pt-0 flex items-center justify-between gap-2 border-t border-slate-800/60 bg-slate-950/40">
          <div className="flex items-center gap-1.5 flex-wrap min-w-0">
            <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1">
              <Check className="w-3 h-3 text-emerald-400" />
              <span>Dodano:</span>
            </span>
            {lastExecutedActions.map((action, idx) => (
              <span
                key={idx}
                className="px-2 py-0.5 rounded-lg text-[11px] font-bold bg-amber-500/20 border border-amber-500/40 text-amber-300 flex items-center gap-1"
              >
                <span>{action.label}</span>
              </span>
            ))}
          </div>

          <button
            onClick={() => {
              onUndoLastAction();
              setLastExecutedActions([]);
              triggerHaptic(30);
            }}
            className="text-[11px] font-bold text-slate-400 hover:text-rose-400 flex items-center gap-1 px-2 py-0.5 rounded-md hover:bg-slate-800 transition shrink-0"
            title="Cofnij tę akcję"
          >
            <RotateCcw className="w-3 h-3" />
            <span>Cofnij</span>
          </button>
        </div>
      )}

      {/* Expanded Quick Controls & Examples Tray */}
      {isExpanded && (
        <div className="p-3 bg-slate-950 border-t border-slate-800 space-y-3">
          {/* Quick Example Clickable Chips */}
          <div>
            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 flex items-center justify-between">
              <span>Szybkie przykłady (dotknij, aby przetestować):</span>
              <span className="text-amber-400 text-[10px]">Polski język koszykarski</span>
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              <button
                onClick={() => handleTestExample('dziesiątka zbiórka w ataku, pudło za dwa')}
                className="px-2.5 py-1 rounded-xl bg-slate-900 hover:bg-slate-800 border border-amber-500/30 text-amber-300 text-xs font-medium transition active:scale-95"
              >
                🗣️ "dziesiątka zbiórka w ataku, pudło za dwa"
              </button>
              <button
                onClick={() => handleTestExample('siódemka celny za trzy')}
                className="px-2.5 py-1 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-white text-xs font-medium transition active:scale-95"
              >
                🗣️ "siódemka celny za trzy"
              </button>
              <button
                onClick={() => handleTestExample('piątka asysta, dwunastka kosz za dwa')}
                className="px-2.5 py-1 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-white text-xs font-medium transition active:scale-95"
              >
                🗣️ "piątka asysta, dwunastka kosz za dwa"
              </button>
              <button
                onClick={() => handleTestExample('dziesiątka blok')}
                className="px-2.5 py-1 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-white text-xs font-medium transition active:scale-95"
              >
                🗣️ "dziesiątka blok"
              </button>
              <button
                onClick={() => handleTestExample('rywal za dwa')}
                className="px-2.5 py-1 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-white text-xs font-medium transition active:scale-95"
              >
                🗣️ "rywal za dwa"
              </button>
              <button
                onClick={() => handleTestExample('cofnij')}
                className="px-2.5 py-1 rounded-xl bg-slate-900 hover:bg-rose-950/40 border border-slate-800 hover:border-rose-500/40 text-rose-300 text-xs font-medium transition active:scale-95"
              >
                🗣️ "cofnij"
              </button>
            </div>
          </div>

          {/* Manual text command input (useful in noisy gym or if mic permission denied) */}
          <form onSubmit={handleManualSubmit} className="flex items-center gap-2">
            <input
              ref={manualInputRef}
              type="text"
              value={manualText}
              onChange={(e) => setManualText(e.target.value)}
              placeholder="Wpisz komendę lub dotknij mikrofonu na klawiaturze iPada..."
              className="flex-1 bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
            />
            <button
              type="submit"
              disabled={!manualText.trim()}
              className="px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-slate-950 font-bold text-xs flex items-center gap-1.5 transition active:scale-95 shadow-md shadow-amber-950/40"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Dodaj</span>
            </button>
          </form>
        </div>
      )}

      {/* Help & Voice Cheatsheet Modal */}
      {showHelpModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/90 overflow-y-auto">
          <div className="w-full max-w-xl max-h-[90vh] flex flex-col rounded-3xl bg-slate-900 border border-slate-800 shadow-2xl overflow-hidden my-auto">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-slate-800 bg-slate-950">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400">
                  <Mic className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-white">
                    Prowadzenie statystyk głosem
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Jak mówić, aby system poprawnie rejestrował akcje meczowe
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowHelpModal(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Content */}
            <div className="p-4 overflow-y-auto space-y-4 text-xs text-slate-300">
              {/* Highlight your exact example */}
              <div className="p-3.5 rounded-2xl bg-gradient-to-br from-amber-500/10 to-orange-500/10 border border-amber-500/30">
                <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400 block mb-1">
                  Twój przykład:
                </span>
                <p className="text-sm font-black text-white font-mono">
                  "dziesiątka zbiórka w ataku, pudło za dwa"
                </p>
                <p className="text-[11px] text-slate-300 mt-1">
                  System automatycznie rozpoznaje zawodnika <strong>#10</strong>, dodaje mu <strong>zbiórkę w ataku (OFF REB)</strong> oraz <strong>niecelny rzut za 2 pkt (2PT MISS)</strong> i natychmiast przelicza wskaźnik EVAL i statystyki meczowe!
                </p>
              </div>

              {/* Supported phrases table */}
              <div className="space-y-2">
                <span className="font-bold text-white uppercase tracking-wider text-[11px] block">
                  Dozwolone zwroty i komendy:
                </span>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
                    <span className="font-bold text-amber-400 block">Punkty i rzuty:</span>
                    <ul className="space-y-0.5 text-[11px] text-slate-300">
                      <li>• "celny za dwa", "kosz za dwa"</li>
                      <li>• "pudło za dwa", "niecelny za 2"</li>
                      <li>• "celny za trzy", "trójka", "trzy punkty"</li>
                      <li>• "pudło za trzy", "niecelna trójka"</li>
                      <li>• "celny wolny", "pudło z wolnego"</li>
                    </ul>
                  </div>

                  <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
                    <span className="font-bold text-sky-400 block">Zbiórki i obrona:</span>
                    <ul className="space-y-0.5 text-[11px] text-slate-300">
                      <li>• "zbiórka w ataku", "deska w ataku"</li>
                      <li>• "zbiórka w obronie", "deska w obronie"</li>
                      <li>• "asysta", "dobre podanie"</li>
                      <li>• "przechwyt", "blok"</li>
                      <li>• "strata", "faul", "kroki"</li>
                    </ul>
                  </div>

                  <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
                    <span className="font-bold text-rose-400 block">Akcje przeciwnika:</span>
                    <ul className="space-y-0.5 text-[11px] text-slate-300">
                      <li>• "przeciwnik za dwa", "rywal za 2"</li>
                      <li>• "przeciwnik trójka", "rywal za 3"</li>
                      <li>• "faul przeciwnika", "rywal wolny"</li>
                    </ul>
                  </div>

                  <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
                    <span className="font-bold text-emerald-400 block">Numery i gracze:</span>
                    <ul className="space-y-0.5 text-[11px] text-slate-300">
                      <li>• Słownie: "jedynka", "piątka", "dziesiątka", "dwunastka"...</li>
                      <li>• Liczbowo: "numer 7", "#15", "10"</li>
                      <li>• Po nazwisku: np. "Bujnowski kosz"</li>
                    </ul>
                  </div>
                </div>
              </div>

              {/* Hands-free advice */}
              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex items-start gap-2.5">
                <Radio className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
                <div className="text-[11px] leading-relaxed">
                  <span className="font-bold text-white block">Tryb ciągły (Hands-Free):</span>
                  Włącz "Tryb ciągły", połóż tablet/telefon na stoliku trenerskim lub załóż słuchawkę Bluetooth. Każde wypowiedziane przez Ciebie zdanie od razu trafi do statystyk na żywo, bez dotykania ekranu!
                </div>
              </div>

              {/* iPad / Safari Microphone Instructions Callout */}
              <div className="p-3.5 rounded-2xl bg-gradient-to-br from-sky-500/10 to-indigo-500/10 border border-sky-500/30 space-y-2.5">
                <div className="flex items-center gap-2 text-sky-400 font-bold text-xs">
                  <span>🍎 Dlaczego Safari nie ma w „Prywatność i ochrona”? Jak to włączyć:</span>
                </div>
                <p className="text-[11px] text-slate-300 leading-relaxed">
                  W systemie <strong>iPadOS</strong> Safari jest wbudowaną przeglądarką Apple, dlatego Apple <strong>nie umieszcza jej</strong> na liście aplikacji w <em>Ustawienia ➔ Prywatność ➔ Mikrofon</em>. Zamiast tego uprawnienia stron internetowych konfiguruje się w następujący sposób:
                </p>

                <div className="space-y-2 text-[11px] text-slate-300">
                  <div className="p-2 rounded-xl bg-slate-900/90 border border-slate-800">
                    <span className="font-bold text-amber-400 block mb-0.5">Sposób A (Najszybszy – bezpośrednio w Safari):</span>
                    <span>1. Spójrz na pasek adresu Safari u góry ekranu i dotknij ikony <strong>„aA”</strong> (lub suwaków/kłódki po lewej/prawej stronie adresu).<br />
                    2. Wybierz <strong>„Ustawienia witryny”</strong>.<br />
                    3. W wierszu <strong>„Mikrofon”</strong> zmień z <em>„Odmów”</em> na <strong>„Pozwól”</strong> (lub <em>„Pytaj”</em>).</span>
                  </div>

                  <div className="p-2 rounded-xl bg-slate-900/90 border border-slate-800">
                    <span className="font-bold text-sky-400 block mb-0.5">Sposób B (W Ustawieniach iPada pod Safari):</span>
                    <span>1. Otwórz <strong>Ustawienia</strong> iPada.<br />
                    2. W menu po lewej stronie znajdź i kliknij <strong>Safari</strong>.<br />
                    3. Przewiń po prawej stronie na dół do sekcji <strong>„Ustawienia witryn”</strong>.<br />
                    4. Kliknij <strong>„Mikrofon”</strong> i wybierz <strong>„Pozwól”</strong>.</span>
                  </div>

                  <div className="p-2 rounded-xl bg-slate-900/90 border border-slate-800">
                    <span className="font-bold text-rose-400 block mb-0.5">Sposób C (Sprawdzenie blokady Czasu przed ekranem):</span>
                    <span>Wejdź w <strong>Ustawienia ➔ Czas przed ekranem ➔ Ograniczenia treści i prywatności ➔ Mikrofon</strong> i sprawdź, czy nie jest zaznaczone <em>„Nie pozwalaj na zmiany”</em>. Zmień na <strong>„Pozwalaj na zmiany”</strong>.</span>
                  </div>

                  <div className="p-2 rounded-xl bg-slate-900/90 border border-slate-800">
                    <span className="font-bold text-emerald-400 block mb-0.5">Sposób D (100% niezawodny – Dyktowanie z klawiatury iPada):</span>
                    <span>Możesz też rozwinąć pole tekstowe i dotknąć <strong>ikony mikrofonu bezpośrednio na klawiaturze iPada</strong> (obok spacji). Klawiatura systemowa Apple transkrybuje mowę natychmiast bez żadnych blokad Safari!</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="p-3 border-t border-slate-800 bg-slate-950 flex justify-end">
              <button
                onClick={() => setShowHelpModal(false)}
                className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs transition"
              >
                Rozumiem, zamykam
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

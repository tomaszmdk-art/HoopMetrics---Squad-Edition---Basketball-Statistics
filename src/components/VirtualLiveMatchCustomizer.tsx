import React, { useState, useEffect } from 'react';
import {
  LiveMatchTheme,
  ActionTileKey,
  TileFontFamily,
  TileFontWeight,
  TileCornerRadius,
  ActionTileStyle,
} from '../types/liveMatchTheme';
import {
  getStoredLiveMatchTheme,
  saveLiveMatchTheme,
  resetLiveMatchTheme,
  THEME_PRESETS,
  DEFAULT_CLOCK_APPEARANCE,
  getClockPulseDuration,
  hexToRgba,
} from '../services/liveMatchThemeService';
import {
  X,
  Palette,
  Sparkles,
  Sliders,
  Type,
  Maximize2,
  Check,
  RotateCcw,
  Pencil,
  Eye,
  CheckCircle2,
  Volume2,
  HelpCircle,
  Layers,
  ArrowRight,
  Shield,
  Zap,
  Play,
  Pause,
} from 'lucide-react';
import { playClickSound, playScoreSound, triggerHaptic } from '../services/tts';

interface VirtualLiveMatchCustomizerProps {
  isOpen: boolean;
  onClose: () => void;
  onApplyTheme?: (theme: LiveMatchTheme) => void;
}

type EditTarget =
  | { type: 'scoreboard' }
  | { type: 'playerCards' }
  | { type: 'actionTile'; key: ActionTileKey }
  | null;

// Predefined gradient swatches for fast color picking
const COLOR_PRESETS = [
  {
    name: 'Emerald Green',
    bg: 'linear-gradient(180deg, #10b981 0%, #059669 100%)',
    border: '#34d399',
    text: '#ffffff',
    sub: '#d1fae5',
  },
  {
    name: 'Amber Gold',
    bg: 'linear-gradient(180deg, #f59e0b 0%, #ea580c 100%)',
    border: '#fcd34d',
    text: '#020617',
    sub: '#020617',
  },
  {
    name: 'Złoty Mistrzowski',
    bg: 'linear-gradient(180deg, #eab308 0%, #b45309 100%)',
    border: '#fef08a',
    text: '#090804',
    sub: '#090804',
  },
  {
    name: 'Neon Cyan',
    bg: 'linear-gradient(180deg, #06b6d4 0%, #0284c7 100%)',
    border: '#67e8f9',
    text: '#ffffff',
    sub: '#cffafe',
  },
  {
    name: 'Electric Violet',
    bg: 'linear-gradient(180deg, #8b5cf6 0%, #6d28d9 100%)',
    border: '#c4b5fd',
    text: '#ffffff',
    sub: '#ede9fe',
  },
  {
    name: 'Teal Blue',
    bg: 'linear-gradient(180deg, #0d9488 0%, #0f766e 100%)',
    border: '#2dd4bf',
    text: '#ffffff',
    sub: '#ccfbf1',
  },
  {
    name: 'Ruby Rose',
    bg: 'linear-gradient(180deg, #e11d48 0%, #be123c 100%)',
    border: '#fb7185',
    text: '#ffffff',
    sub: '#ffe4e6',
  },
  {
    name: 'Dark Slate',
    bg: 'linear-gradient(180deg, #1e293b 0%, #0f172a 100%)',
    border: '#475569',
    text: '#f8fafc',
    sub: '#94a3b8',
  },
  {
    name: 'Miss Red Dark',
    bg: 'linear-gradient(180deg, #180d12 0%, #090306 100%)',
    border: '#4c1d29',
    text: '#f87171',
    sub: '#94a3b8',
  },
  {
    name: 'Pure Onyx',
    bg: '#05070c',
    border: '#1e293b',
    text: '#ffffff',
    sub: '#94a3b8',
  },
  {
    name: 'High-Vis Yellow',
    bg: '#ffff00',
    border: '#ffffff',
    text: '#000000',
    sub: '#000000',
  },
];

// Helper to convert font family to CSS font
const getFontFamilyCss = (ff: TileFontFamily) => {
  switch (ff) {
    case 'mono':
      return 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace';
    case 'sans':
      return 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
    case 'display':
      return 'Impact, "Arial Black", "Trebuchet MS", sans-serif';
    case 'serif':
      return 'Georgia, Cambria, "Times New Roman", Times, serif';
  }
};

export const VirtualLiveMatchCustomizer: React.FC<VirtualLiveMatchCustomizerProps> = ({
  isOpen,
  onClose,
  onApplyTheme,
}) => {
  const [theme, setTheme] = useState<LiveMatchTheme>(getStoredLiveMatchTheme);
  const [selectedTarget, setSelectedTarget] = useState<EditTarget>({ type: 'scoreboard' });
  const [activeInspectorTab, setActiveInspectorTab] = useState<'size' | 'color' | 'font'>('color');
  const [saveToast, setSaveToast] = useState(false);
  const [previewTestMsg, setPreviewTestMsg] = useState<string | null>(null);
  const [previewClockRunning, setPreviewClockRunning] = useState(false);

  const updateScoreboard = (patch: Partial<LiveMatchTheme['scoreboard']>) => {
    const updated = { ...theme.scoreboard, ...patch };
    const nextTheme = { ...theme, scoreboard: updated };
    setTheme(nextTheme);
    saveLiveMatchTheme(nextTheme);
    if (onApplyTheme) onApplyTheme(nextTheme);
  };

  // Sync state when opened
  useEffect(() => {
    if (isOpen) {
      setTheme(getStoredLiveMatchTheme());
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSelectPreset = (preset: LiveMatchTheme) => {
    playClickSound();
    triggerHaptic(30);
    setTheme(preset);
    saveLiveMatchTheme(preset);
    if (onApplyTheme) onApplyTheme(preset);
    showNotice(`Zastosowano motyw: ${preset.name}`);
  };

  const handleResetToDefaults = () => {
    playClickSound();
    triggerHaptic(40);
    const def = resetLiveMatchTheme();
    setTheme(def);
    if (onApplyTheme) onApplyTheme(def);
    showNotice('Przywrócono domyślny wygląd kafelków i tablicy!');
  };

  const handleSaveAndApply = () => {
    playClickSound();
    triggerHaptic(50);
    saveLiveMatchTheme(theme);
    if (onApplyTheme) onApplyTheme(theme);
    setSaveToast(true);
    setTimeout(() => setSaveToast(false), 2500);
  };

  const showNotice = (msg: string) => {
    setPreviewTestMsg(msg);
    setTimeout(() => setPreviewTestMsg(null), 2200);
  };

  // Helper for testing buttons in preview
  const handleTestTileClick = (e: React.MouseEvent, title: string, pts: number = 0) => {
    e.stopPropagation();
    if (pts > 0) {
      playScoreSound(pts);
    } else {
      playClickSound();
    }
    triggerHaptic(25);
    showNotice(`Test kliknięcia: ${title}`);
  };

  // Batch update helpers
  const handleApplyToScoringTiles = (sourceKey: ActionTileKey) => {
    const src = theme.actionTiles[sourceKey];
    const scoringKeys: ActionTileKey[] = ['twoPointMade', 'threePointMade', 'ftMade'];
    const updated = { ...theme.actionTiles };
    scoringKeys.forEach((k) => {
      updated[k] = {
        ...updated[k],
        bgGradient: src.bgGradient,
        borderColor: src.borderColor,
        textColor: src.textColor,
        subTextColor: src.subTextColor,
        height: src.height,
        fontFamily: src.fontFamily,
        fontWeight: src.fontWeight,
        borderRadius: src.borderRadius,
      };
    });
    setTheme({ ...theme, actionTiles: updated });
    saveLiveMatchTheme({ ...theme, actionTiles: updated });
    playClickSound();
    triggerHaptic(40);
    showNotice('Zastosowano styl do wszystkich celnych rzutów (+2, +3, +1)');
  };

  const handleApplyToDefenseTiles = (sourceKey: ActionTileKey) => {
    const src = theme.actionTiles[sourceKey];
    const defKeys: ActionTileKey[] = ['offReb', 'defReb', 'assist', 'steal', 'block', 'turnover', 'foul'];
    const updated = { ...theme.actionTiles };
    defKeys.forEach((k) => {
      updated[k] = {
        ...updated[k],
        bgGradient: src.bgGradient,
        borderColor: src.borderColor,
        textColor: src.textColor,
        subTextColor: src.subTextColor,
        height: src.height,
        fontFamily: src.fontFamily,
        fontWeight: src.fontWeight,
        borderRadius: src.borderRadius,
      };
    });
    setTheme({ ...theme, actionTiles: updated });
    saveLiveMatchTheme({ ...theme, actionTiles: updated });
    playClickSound();
    triggerHaptic(40);
    showNotice('Zastosowano styl do wszystkich kafelków obrony i rozgrywania');
  };

  const handleApplyToAllActionTiles = (sourceKey: ActionTileKey) => {
    const src = theme.actionTiles[sourceKey];
    const updated = { ...theme.actionTiles };
    (Object.keys(updated) as ActionTileKey[]).forEach((k) => {
      updated[k] = {
        ...updated[k],
        height: src.height,
        fontFamily: src.fontFamily,
        fontWeight: src.fontWeight,
        borderRadius: src.borderRadius,
      };
    });
    setTheme({ ...theme, actionTiles: updated });
    saveLiveMatchTheme({ ...theme, actionTiles: updated });
    playClickSound();
    triggerHaptic(40);
    showNotice('Zsynchronizowano rozmiar i czcionkę na wszystkich kafelkach akcji');
  };

  // Currently active tile or section being edited
  const currentActionTile =
    selectedTarget?.type === 'actionTile' ? theme.actionTiles[selectedTarget.key] : null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-950 text-slate-100 overflow-hidden">
      {/* Top Bar: Virtual Live Match Customizer Navigation */}
      <header className="bg-slate-900 border-b border-slate-800 p-3 sm:px-6 flex items-center justify-between gap-2 shrink-0 shadow-lg">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-md shadow-orange-950/40 shrink-0">
            <Palette className="w-5 h-5 text-slate-950" />
          </div>
          <div>
            <h2 className="text-sm sm:text-base font-black text-white flex items-center gap-2 truncate">
              <span>Wirtualny Pulpit Live Match</span>
              <span className="hidden xs:inline-block px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                Tryb Edycji Wyglądu
              </span>
            </h2>
            <p className="text-[11px] text-slate-400 hidden sm:block">
              Dotknij dowolnego kafelka lub tablicy wyników, aby zmienić rozmiar, kolor i czcionkę.
            </p>
          </div>
        </div>

        {/* Quick Presets & Action Buttons */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          {/* Preset Picker Dropdown / Bar */}
          <div className="hidden md:flex items-center gap-1 bg-slate-950/80 p-1 rounded-xl border border-slate-800">
            {THEME_PRESETS.map((p) => (
              <button
                key={p.id}
                onClick={() => handleSelectPreset(p)}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition ${
                  theme.id === p.id
                    ? 'bg-amber-500 text-slate-950 shadow-sm'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800'
                }`}
              >
                {p.name}
              </button>
            ))}
          </div>

          <button
            onClick={handleResetToDefaults}
            className="flex items-center gap-1 px-2.5 sm:px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-bold transition border border-slate-700"
            title="Przywróć domyślne kolory i rozmiary"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Domyślne</span>
          </button>

          <button
            onClick={handleSaveAndApply}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 font-black text-xs transition shadow-md shadow-orange-950/30 active:scale-95"
          >
            <Check className="w-4 h-4" />
            <span>Zapisz i zastosuj</span>
          </button>

          <button
            onClick={onClose}
            className="p-1.5 sm:p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition"
            aria-label="Zamknij"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* Save Toast Notification */}
      {saveToast && (
        <div className="fixed top-16 right-4 z-50 flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-500 text-slate-950 font-black text-xs shadow-2xl">
          <CheckCircle2 className="w-4 h-4" />
          <span>Styl został zapisany i jest aktywny w meczu na żywo!</span>
        </div>
      )}

      {/* Click feedback toast */}
      {previewTestMsg && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-4 py-2 rounded-full bg-slate-900 border border-amber-400/50 text-amber-300 font-bold text-xs shadow-2xl animate-fade-in">
          <Zap className="w-3.5 h-3.5 text-amber-400" />
          <span>{previewTestMsg}</span>
        </div>
      )}

      {/* Main Body: Split into Interactive Virtual Dashboard & Customizer Inspector */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        {/* LEFT / CENTER: Virtual Live Match Sandbox */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-3.5 bg-slate-950/90 border-r border-slate-800/80">
          {/* Hint Strip */}
          <div className="flex items-center justify-between p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-semibold">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
              <span>
                Tryb interaktywny: <strong>Kliknij dowolny element poniżej</strong>, aby otworzyć panel edycji.
              </span>
            </div>
            <span className="text-[10px] font-mono uppercase bg-amber-500/20 px-2 py-0.5 rounded text-amber-200">
              Podgląd 1:1
            </span>
          </div>

          {/* 1. VIRTUAL TABLICA WYNIKÓW (SCOREBOARD) */}
          <div
            onClick={() => {
              playClickSound();
              triggerHaptic(20);
              setSelectedTarget({ type: 'scoreboard' });
            }}
            style={{
              background: theme.scoreboard.bgStyle,
              borderColor:
                selectedTarget?.type === 'scoreboard' ? '#f59e0b' : theme.scoreboard.borderColor,
            }}
            className={`relative p-3 sm:p-4 rounded-2xl border-2 transition duration-200 cursor-pointer shadow-xl ${
              theme.scoreboard.borderRadius
            } ${
              selectedTarget?.type === 'scoreboard'
                ? 'ring-4 ring-amber-400/40 shadow-amber-950/50 scale-[1.005]'
                : 'hover:border-slate-600'
            }`}
          >
            {/* Edit Badge Overlay */}
            <div className="absolute top-2.5 right-2.5 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-950/80 border border-amber-400 text-amber-300 text-[10px] font-bold shadow-md">
              <Pencil className="w-3 h-3" />
              <span>{selectedTarget?.type === 'scoreboard' ? 'Edytujesz tablicę' : 'Kliknij, aby edytować tablicę'}</span>
            </div>

            <div className="grid grid-cols-12 gap-2 sm:gap-4 items-center">
              {/* Home Team */}
              <div className="col-span-4 text-center">
                <div className="text-[10px] sm:text-xs font-black uppercase text-amber-400 truncate tracking-wide">
                  MÓJ KLUB KOSZYKARSKI
                </div>
                <div
                  style={{
                    color: theme.scoreboard.scoreColorOur,
                    fontSize: `${theme.scoreboard.scoreFontSize}px`,
                    fontFamily: getFontFamilyCss(theme.scoreboard.fontFamily),
                  }}
                  className="font-black leading-none my-1 select-none drop-shadow"
                >
                  58
                </div>
                <div className="text-[10px] font-semibold text-slate-400">
                  Faule Q3: <span className="text-amber-400 font-bold">3</span>
                </div>
              </div>

              {/* Clock & Quarter */}
              {(() => {
                const sb = theme.scoreboard;
                const activeColor = previewClockRunning
                  ? sb.clockRunningColor || sb.clockColor || DEFAULT_CLOCK_APPEARANCE.clockRunningColor
                  : sb.clockPausedColor || DEFAULT_CLOCK_APPEARANCE.clockPausedColor;
                const activeTint = previewClockRunning
                  ? sb.clockRunningBg || DEFAULT_CLOCK_APPEARANCE.clockRunningBg
                  : sb.clockPausedBg || DEFAULT_CLOCK_APPEARANCE.clockPausedBg;
                const intensity = (sb.clockBgIntensity ?? DEFAULT_CLOCK_APPEARANCE.clockBgIntensity) / 100;
                const glowOn = sb.clockGlowEnabled ?? DEFAULT_CLOCK_APPEARANCE.clockGlowEnabled;
                const pulseOn = previewClockRunning
                  ? sb.clockRunningPulse ?? DEFAULT_CLOCK_APPEARANCE.clockRunningPulse
                  : sb.clockPausedPulse ?? DEFAULT_CLOCK_APPEARANCE.clockPausedPulse;
                const pulseDuration = getClockPulseDuration(sb.clockPulseSpeed);

                return (
                  <div className="col-span-4 flex flex-col items-center justify-center border-x border-slate-800/80 px-2">
                    <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-amber-400/90 mb-1">
                      Kwarta 3
                    </span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedTarget({ type: 'scoreboard' });
                        setPreviewClockRunning((prev) => !prev);
                        playClickSound();
                        triggerHaptic(20);
                      }}
                      title="Kliknij zegar, aby przetestować stan PAUZA / START"
                      style={{
                        backgroundColor: sb.clockBg,
                        borderColor: hexToRgba(activeTint, Math.min(0.85, Math.max(0.28, intensity * 2.2))),
                        boxShadow: glowOn
                          ? `0 0 18px ${hexToRgba(activeTint, Math.min(0.45, intensity * 1.4))}`
                          : undefined,
                      }}
                      className="relative overflow-hidden px-3 py-1.5 rounded-xl border transition-all cursor-pointer flex flex-col items-center justify-center min-w-[110px]"
                    >
                      <span
                        aria-hidden="true"
                        style={{
                          background: `radial-gradient(circle at center, ${hexToRgba(activeTint, intensity * 1.25)} 0%, ${hexToRgba(activeTint, intensity * 0.5)} 70%, transparent 100%)`,
                          animationDuration: pulseDuration,
                        }}
                        className={`pointer-events-none absolute inset-0 ${pulseOn ? 'animate-clock-bg-pulse' : ''}`}
                      />
                      <span
                        style={{
                          color: activeColor,
                          fontSize: `${sb.clockFontSize}px`,
                          fontFamily: getFontFamilyCss(sb.fontFamily),
                          textShadow: glowOn
                            ? `0 0 14px ${hexToRgba(activeColor, 0.55)}`
                            : undefined,
                          animationDuration: pulseDuration,
                        }}
                        className={`relative z-10 font-black font-mono leading-none select-none ${
                          pulseOn ? 'animate-clock-pulse' : ''
                        }`}
                      >
                        06:42
                      </span>
                      <span
                        style={{
                          color: activeColor,
                          backgroundColor: hexToRgba(activeTint, Math.max(0.14, intensity * 0.9)),
                          borderColor: hexToRgba(activeTint, Math.min(0.75, Math.max(0.3, intensity * 1.8))),
                        }}
                        className={`relative z-10 mt-1.5 inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[9px] font-black tracking-wider ${
                          previewClockRunning ? '' : 'uppercase'
                        }`}
                      >
                        {previewClockRunning ? (
                          <>
                            <Play className="w-2.5 h-2.5 fill-current" /> Zegar idzie
                          </>
                        ) : (
                          <>
                            <Pause className="w-2.5 h-2.5 fill-current" /> PAUZA
                          </>
                        )}
                      </span>
                    </button>
                    <span className="mt-1 text-[9px] text-slate-500">Kliknij zegar, aby przetestować</span>
                  </div>
                );
              })()}

              {/* Opponent Team */}
              <div className="col-span-4 text-center">
                <div className="text-[10px] sm:text-xs font-black uppercase text-rose-400 truncate tracking-wide">
                  BASKET WARSZAWA
                </div>
                <div
                  style={{
                    color: theme.scoreboard.scoreColorOpp,
                    fontSize: `${theme.scoreboard.scoreFontSize}px`,
                    fontFamily: getFontFamilyCss(theme.scoreboard.fontFamily),
                  }}
                  className="font-black leading-none my-1 select-none drop-shadow"
                >
                  52
                </div>
                <div className="text-[10px] font-semibold text-slate-400">
                  Faule Q3: <span className="text-rose-400 font-bold">4</span>
                </div>
              </div>
            </div>
          </div>

          {/* 2. VIRTUAL KAFELKI ZAWODNIKÓW (PLAYER CARDS) */}
          <div
            onClick={() => {
              playClickSound();
              triggerHaptic(20);
              setSelectedTarget({ type: 'playerCards' });
            }}
            className={`relative p-3 rounded-2xl border-2 transition duration-200 cursor-pointer ${
              selectedTarget?.type === 'playerCards'
                ? 'border-amber-400 ring-4 ring-amber-400/40 bg-slate-900/90 shadow-xl'
                : 'border-slate-800 bg-slate-900/60 hover:border-slate-700'
            }`}
          >
            {/* Header info */}
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                <span>Piątka na parkiecie (Kliknij, aby dostosować wygląd kafelków)</span>
              </span>
              <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-950/80 border border-amber-400 text-amber-300 text-[10px] font-bold">
                <Pencil className="w-2.5 h-2.5" />
                <span>{selectedTarget?.type === 'playerCards' ? 'Edytujesz kafelki' : 'Edytuj kafelki'}</span>
              </div>
            </div>

            {/* 5 Dummy Player Cards */}
            <div className="grid grid-cols-1 min-[440px]:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2">
              {[
                { id: 'p1', nr: 7, name: 'Kowalski', pts: 18, pm: 12, eval: 24, fouls: 2, selected: true },
                { id: 'p2', nr: 10, name: 'Nowak', pts: 12, pm: 8, eval: 15, fouls: 1, selected: false },
                { id: 'p3', nr: 15, name: 'Wiśniewski', pts: 9, pm: -2, eval: 11, fouls: 3, selected: false },
                { id: 'p4', nr: 23, name: 'Wójcik', pts: 14, pm: 6, eval: 18, fouls: 0, selected: false },
                { id: 'p5', nr: 34, name: 'Lewandowski', pts: 5, pm: 4, eval: 8, fouls: 4, selected: false },
              ].map((p) => {
                const cardStyle = theme.playerCards;
                const isSel = p.selected;
                return (
                  <div
                    key={p.id}
                    style={{
                      background: isSel ? cardStyle.bgSelected : cardStyle.bgUnselected,
                      borderColor: isSel ? cardStyle.borderSelected : cardStyle.borderUnselected,
                      minHeight: `${cardStyle.cardMinHeight}px`,
                      fontFamily: getFontFamilyCss(cardStyle.fontFamily),
                    }}
                    className={`flex flex-col justify-between gap-1.5 p-2 rounded-2xl border transition duration-150 shadow-md ${
                      cardStyle.borderRadius
                    } ${isSel ? 'ring-2 ring-amber-300/80 scale-[1.01]' : ''}`}
                  >
                    {/* Top: Avatar/Number, Name & Prominent Points on Right */}
                    <div className="flex items-center justify-between gap-1.5 w-full min-w-0">
                      <div className="flex items-center min-w-0 flex-1">
                        <div
                          style={{
                            fontSize: `${cardStyle.numberFontSize}px`,
                          }}
                          className={`w-9 h-9 rounded-xl flex items-center justify-center font-mono font-black border mr-1.5 shrink-0 ${
                            isSel ? 'bg-slate-950/30 text-slate-950 border-slate-950/30' : 'bg-slate-950 text-amber-400 border-amber-500/30'
                          }`}
                        >
                          #{p.nr}
                        </div>

                        <div className="flex-1 min-w-0 text-left">
                          <div
                            style={{
                              fontSize: `${cardStyle.nameFontSize}px`,
                              color: isSel ? cardStyle.textSelected : cardStyle.textUnselected,
                            }}
                            className="font-black uppercase tracking-tight truncate leading-tight"
                          >
                            {p.name}
                          </div>
                          <div className="text-[10px] font-semibold opacity-75">Zawodnik UKS</div>
                        </div>
                      </div>

                      <span
                        style={{
                          fontSize: `${Math.max(cardStyle.ptsFontSize, 24)}px`,
                        }}
                        className={`shrink-0 min-w-[34px] px-2 py-0.5 rounded-xl font-mono font-black leading-none flex items-center justify-center ${
                          isSel ? 'bg-slate-950 text-amber-300' : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                        }`}
                      >
                        {p.pts}
                      </span>
                    </div>

                    {/* Bottom: EVAL:, +-:, Faule: matching nameFontSize */}
                    <div
                      className={`w-full flex flex-wrap items-center justify-between gap-1 pt-1 border-t tabular-nums ${
                        isSel ? 'border-slate-950/20' : 'border-slate-800/70'
                      }`}
                    >
                      <span
                        style={{ fontSize: `${cardStyle.nameFontSize}px` }}
                        className={`px-1 py-0.5 rounded font-normal leading-none whitespace-nowrap ${
                          isSel ? 'bg-slate-950/20 text-slate-950' : 'bg-slate-950/40 text-slate-200'
                        }`}
                      >
                        <span>EVAL: </span>
                        <span className="font-black">{p.eval}</span>
                      </span>
                      <span
                        style={{ fontSize: `${cardStyle.nameFontSize}px` }}
                        className={`px-1 py-0.5 rounded font-normal leading-none whitespace-nowrap ${
                          p.pm > 0
                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                            : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                        }`}
                      >
                        <span>+-: </span>
                        <span className="font-black">{p.pm > 0 ? `+${p.pm}` : p.pm}</span>
                      </span>
                      <span
                        style={{ fontSize: `${cardStyle.nameFontSize}px` }}
                        className={`px-1 py-0.5 rounded font-normal leading-none whitespace-nowrap ${
                          isSel ? 'bg-slate-950/20 text-slate-950' : 'bg-slate-800 text-slate-300'
                        }`}
                      >
                        <span>Faule: </span>
                        <span className="font-black">{p.fouls}</span>
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 3. VIRTUAL KAFELKI AKCJI (ACTION KEYPAD) */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs font-bold text-slate-400 px-1">
              <span>Panel akcji meczowych (Kliknij dowolny kafelek, aby go edytować)</span>
              <span className="text-[10px] text-amber-400 font-mono">15 kafelków</span>
            </div>

            {/* Row 1: RZUTY 2PT I 3PT */}
            <div className="grid grid-cols-4 gap-1.5 sm:gap-2">
              {(['twoPointMade', 'twoPointMiss', 'threePointMade', 'threePointMiss'] as ActionTileKey[]).map(
                (key) => {
                  const tile = theme.actionTiles[key];
                  const isSelected =
                    selectedTarget?.type === 'actionTile' && selectedTarget.key === key;
                  return (
                    <button
                      key={key}
                      onClick={() => {
                        playClickSound();
                        triggerHaptic(25);
                        setSelectedTarget({ type: 'actionTile', key });
                      }}
                      style={{
                        background: tile.bgGradient,
                        borderColor: isSelected ? '#f59e0b' : tile.borderColor,
                        color: tile.textColor,
                        height: `${tile.height}px`,
                        fontFamily: getFontFamilyCss(tile.fontFamily),
                        boxShadow: isSelected ? '0 0 20px rgba(245, 158, 11, 0.6)' : tile.shadow,
                      }}
                      className={`relative rounded-2xl flex flex-col items-center justify-center transition duration-150 border-2 select-none active:scale-95 ${
                        tile.borderRadius
                      } ${isSelected ? 'ring-4 ring-amber-400/50 scale-[1.02] z-10' : 'hover:opacity-95'}`}
                    >
                      <span
                        style={{ fontSize: `${tile.fontSizePrimary}px` }}
                        className="font-black leading-none tracking-tight"
                      >
                        {key === 'twoPointMade' && '+2 PKT'}
                        {key === 'twoPointMiss' && '2PT Pudło'}
                        {key === 'threePointMade' && '+3 PKT'}
                        {key === 'threePointMiss' && '3PT Pudło'}
                      </span>
                      <span
                        style={{
                          fontSize: `${tile.fontSizeSecondary}px`,
                          color: tile.subTextColor,
                        }}
                        className="font-bold uppercase tracking-wider mt-0.5 opacity-90"
                      >
                        {key === 'twoPointMade' && '2PT Celny'}
                        {key === 'twoPointMiss' && 'Niecelny'}
                        {key === 'threePointMade' && '3PT Trójka'}
                        {key === 'threePointMiss' && 'Niecelny'}
                      </span>

                      {isSelected && (
                        <div className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-amber-400 text-slate-950 flex items-center justify-center text-[10px] font-black shadow-md">
                          ✓
                        </div>
                      )}
                    </button>
                  );
                }
              )}
            </div>

            {/* Row 2: RZUTY WOLNE I ZBIÓRKI */}
            <div className="grid grid-cols-4 gap-1.5 sm:gap-2">
              {(['ftMade', 'ftMiss', 'offReb', 'defReb'] as ActionTileKey[]).map((key) => {
                const tile = theme.actionTiles[key];
                const isSelected =
                  selectedTarget?.type === 'actionTile' && selectedTarget.key === key;
                return (
                  <button
                    key={key}
                    onClick={() => {
                      playClickSound();
                      triggerHaptic(25);
                      setSelectedTarget({ type: 'actionTile', key });
                    }}
                    style={{
                      background: tile.bgGradient,
                      borderColor: isSelected ? '#f59e0b' : tile.borderColor,
                      color: tile.textColor,
                      height: `${tile.height}px`,
                      fontFamily: getFontFamilyCss(tile.fontFamily),
                      boxShadow: isSelected ? '0 0 20px rgba(245, 158, 11, 0.6)' : tile.shadow,
                    }}
                    className={`relative rounded-2xl flex flex-col items-center justify-center transition duration-150 border-2 select-none active:scale-95 ${
                      tile.borderRadius
                    } ${isSelected ? 'ring-4 ring-amber-400/50 scale-[1.02] z-10' : 'hover:opacity-95'}`}
                  >
                    <span
                      style={{ fontSize: `${tile.fontSizePrimary}px` }}
                      className="font-black leading-none tracking-tight"
                    >
                      {key === 'ftMade' && '+1 PKT'}
                      {key === 'ftMiss' && 'Wolny Pudło'}
                      {key === 'offReb' && 'ZB ATAK'}
                      {key === 'defReb' && 'ZB OBRONA'}
                    </span>
                    <span
                      style={{
                        fontSize: `${tile.fontSizeSecondary}px`,
                        color: tile.subTextColor,
                      }}
                      className="font-bold uppercase tracking-wider mt-0.5 opacity-90"
                    >
                      {key === 'ftMade' && 'Wolny Celny'}
                      {key === 'ftMiss' && 'Niecelny FT'}
                      {key === 'offReb' && 'Ofensywna'}
                      {key === 'defReb' && 'Defensywna'}
                    </span>

                    {isSelected && (
                      <div className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-amber-400 text-slate-950 flex items-center justify-center text-[10px] font-black shadow-md">
                        ✓
                      </div>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Row 3: ASYSTA, PRZECHWYT, BLOK, STRATA, FAUL */}
            <div className="grid grid-cols-5 gap-1.5 sm:gap-2">
              {(['assist', 'steal', 'block', 'turnover', 'foul'] as ActionTileKey[]).map((key) => {
                const tile = theme.actionTiles[key];
                const isSelected =
                  selectedTarget?.type === 'actionTile' && selectedTarget.key === key;
                return (
                  <button
                    key={key}
                    onClick={() => {
                      playClickSound();
                      triggerHaptic(25);
                      setSelectedTarget({ type: 'actionTile', key });
                    }}
                    style={{
                      background: tile.bgGradient,
                      borderColor: isSelected ? '#f59e0b' : tile.borderColor,
                      color: tile.textColor,
                      height: `${tile.height}px`,
                      fontFamily: getFontFamilyCss(tile.fontFamily),
                      boxShadow: isSelected ? '0 0 20px rgba(245, 158, 11, 0.6)' : tile.shadow,
                    }}
                    className={`relative rounded-2xl flex flex-col items-center justify-center transition duration-150 border-2 select-none active:scale-95 ${
                      tile.borderRadius
                    } ${isSelected ? 'ring-4 ring-amber-400/50 scale-[1.02] z-10' : 'hover:opacity-95'}`}
                  >
                    <span
                      style={{ fontSize: `${tile.fontSizePrimary}px` }}
                      className="font-black leading-none tracking-tight"
                    >
                      {key === 'assist' && 'AST'}
                      {key === 'steal' && 'PRZ'}
                      {key === 'block' && 'BLK'}
                      {key === 'turnover' && 'STR'}
                      {key === 'foul' && 'FAUL'}
                    </span>
                    <span
                      style={{
                        fontSize: `${tile.fontSizeSecondary}px`,
                        color: tile.subTextColor,
                      }}
                      className="font-bold uppercase tracking-wider mt-0.5 opacity-90 truncate max-w-[90%]"
                    >
                      {key === 'assist' && 'Asysta'}
                      {key === 'steal' && 'Przechwyt'}
                      {key === 'block' && 'Blok'}
                      {key === 'turnover' && 'Strata'}
                      {key === 'foul' && 'Osobisty'}
                    </span>

                    {isSelected && (
                      <div className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-amber-400 text-slate-950 flex items-center justify-center text-[10px] font-black shadow-md">
                        ✓
                      </div>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Row 4: OPPONENT & UNDO */}
            <div className="grid grid-cols-2 gap-2 pt-1">
              {(['oppScoring', 'undo'] as ActionTileKey[]).map((key) => {
                const tile = theme.actionTiles[key];
                const isSelected =
                  selectedTarget?.type === 'actionTile' && selectedTarget.key === key;
                return (
                  <button
                    key={key}
                    onClick={() => {
                      playClickSound();
                      triggerHaptic(25);
                      setSelectedTarget({ type: 'actionTile', key });
                    }}
                    style={{
                      background: tile.bgGradient,
                      borderColor: isSelected ? '#f59e0b' : tile.borderColor,
                      color: tile.textColor,
                      height: `${tile.height}px`,
                      fontFamily: getFontFamilyCss(tile.fontFamily),
                      boxShadow: isSelected ? '0 0 20px rgba(245, 158, 11, 0.6)' : tile.shadow,
                    }}
                    className={`relative rounded-xl flex items-center justify-center gap-2 transition duration-150 border-2 select-none active:scale-95 ${
                      tile.borderRadius
                    } ${isSelected ? 'ring-4 ring-amber-400/50 scale-[1.02] z-10' : 'hover:opacity-95'}`}
                  >
                    <span
                      style={{ fontSize: `${tile.fontSizePrimary}px` }}
                      className="font-black leading-none"
                    >
                      {key === 'oppScoring' ? 'Rywal: +1, +2, +3' : '⟲ Cofnij akcję'}
                    </span>

                    {isSelected && (
                      <div className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-amber-400 text-slate-950 flex items-center justify-center text-[10px] font-black shadow-md">
                        ✓
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* RIGHT: INSPECTOR PANEL (Settings for Selected Element) */}
        <div className="w-full lg:w-[420px] bg-slate-900 border-t lg:border-t-0 lg:border-l border-slate-800 flex flex-col shrink-0 overflow-y-auto max-h-[48vh] lg:max-h-none">
          {/* Inspector Header */}
          <div className="p-3.5 border-b border-slate-800 bg-slate-950/60 sticky top-0 z-20 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sliders className="w-4 h-4 text-amber-400" />
              <div>
                <span className="text-xs font-black text-white block">
                  {selectedTarget?.type === 'scoreboard' && 'Edycja: Tablica Wyników'}
                  {selectedTarget?.type === 'playerCards' && 'Edycja: Kafelki Zawodników'}
                  {selectedTarget?.type === 'actionTile' &&
                    `Edycja: ${theme.actionTiles[selectedTarget.key].name}`}
                </span>
                <span className="text-[10px] text-amber-400">Dostosuj parametry wyglądu</span>
              </div>
            </div>

            {/* Quick Test Sound Button */}
            {selectedTarget?.type === 'actionTile' && (
              <button
                onClick={(e) =>
                  handleTestTileClick(
                    e,
                    theme.actionTiles[selectedTarget.key].name,
                    selectedTarget.key.includes('three') ? 3 : selectedTarget.key.includes('two') ? 2 : 1
                  )
                }
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-300 text-[10px] font-bold border border-slate-700"
                title="Przetestuj kliknięcie"
              >
                <Volume2 className="w-3 h-3 text-amber-400" />
                <span>Testuj dźwięk</span>
              </button>
            )}
          </div>

          {/* Inspector Sub-Tabs: Rozmiar / Kolor / Czcionka */}
          <div className="grid grid-cols-3 p-2 border-b border-slate-800 gap-1.5 bg-slate-950/40">
            <button
              onClick={() => setActiveInspectorTab('color')}
              className={`py-1.5 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition ${
                activeInspectorTab === 'color'
                  ? 'bg-amber-500 text-slate-950 shadow-sm'
                  : 'bg-slate-800/80 text-slate-300 hover:text-white'
              }`}
            >
              <Palette className="w-3.5 h-3.5" />
              <span>Kolor & Tło</span>
            </button>

            <button
              onClick={() => setActiveInspectorTab('size')}
              className={`py-1.5 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition ${
                activeInspectorTab === 'size'
                  ? 'bg-amber-500 text-slate-950 shadow-sm'
                  : 'bg-slate-800/80 text-slate-300 hover:text-white'
              }`}
            >
              <Maximize2 className="w-3.5 h-3.5" />
              <span>Rozmiar</span>
            </button>

            <button
              onClick={() => setActiveInspectorTab('font')}
              className={`py-1.5 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition ${
                activeInspectorTab === 'font'
                  ? 'bg-amber-500 text-slate-950 shadow-sm'
                  : 'bg-slate-800/80 text-slate-300 hover:text-white'
              }`}
            >
              <Type className="w-3.5 h-3.5" />
              <span>Czcionka</span>
            </button>
          </div>

          {/* INSPECTOR BODY */}
          <div className="p-4 space-y-4 text-xs">
            {/* === SCENARIO 1: ACTION TILE CONTROLS === */}
            {selectedTarget?.type === 'actionTile' && currentActionTile && (
              <>
                {/* TAB 1: KOLORY I TŁO DLA KAFELKA AKCJI */}
                {activeInspectorTab === 'color' && (
                  <div className="space-y-3.5">
                    <div>
                      <label className="font-bold text-slate-300 block mb-1.5">
                        Gotowe palety barw dla kafelka:
                      </label>
                      <div className="grid grid-cols-2 gap-2">
                        {COLOR_PRESETS.map((cp) => (
                          <button
                            key={cp.name}
                            onClick={() => {
                              playClickSound();
                              const updated = {
                                ...theme.actionTiles,
                                [selectedTarget.key]: {
                                  ...currentActionTile,
                                  bgGradient: cp.bg,
                                  borderColor: cp.border,
                                  textColor: cp.text,
                                  subTextColor: cp.sub,
                                },
                              };
                              setTheme({ ...theme, actionTiles: updated });
                              saveLiveMatchTheme({ ...theme, actionTiles: updated });
                            }}
                            className="p-2 rounded-xl flex items-center gap-2 border transition hover:scale-[1.02] text-left"
                            style={{
                              background: cp.bg,
                              borderColor: cp.border,
                              color: cp.text,
                            }}
                          >
                            <span className="w-3.5 h-3.5 rounded-full border border-white/40 shrink-0" style={{ background: cp.border }} />
                            <span className="text-[11px] font-black truncate">{cp.name}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Custom Hex Inputs */}
                    <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-300">Kolor ramki kafelka:</span>
                        <div className="flex items-center gap-1.5">
                          <input
                            type="color"
                            value={currentActionTile.borderColor}
                            onChange={(e) => {
                              const updated = {
                                ...theme.actionTiles,
                                [selectedTarget.key]: {
                                  ...currentActionTile,
                                  borderColor: e.target.value,
                                },
                              };
                              setTheme({ ...theme, actionTiles: updated });
                              saveLiveMatchTheme({ ...theme, actionTiles: updated });
                            }}
                            className="w-7 h-7 rounded border border-slate-700 cursor-pointer bg-transparent"
                          />
                          <span className="font-mono text-[11px] text-slate-400">{currentActionTile.borderColor}</span>
                        </div>
                      </div>

                      <div className="flex items-center justify-between pt-1 border-t border-slate-800/80">
                        <span className="font-bold text-slate-300">Kolor tekstu głównego:</span>
                        <div className="flex items-center gap-1.5">
                          <input
                            type="color"
                            value={currentActionTile.textColor.startsWith('#') ? currentActionTile.textColor : '#ffffff'}
                            onChange={(e) => {
                              const updated = {
                                ...theme.actionTiles,
                                [selectedTarget.key]: {
                                  ...currentActionTile,
                                  textColor: e.target.value,
                                },
                              };
                              setTheme({ ...theme, actionTiles: updated });
                              saveLiveMatchTheme({ ...theme, actionTiles: updated });
                            }}
                            className="w-7 h-7 rounded border border-slate-700 cursor-pointer bg-transparent"
                          />
                          <span className="font-mono text-[11px] text-slate-400">{currentActionTile.textColor}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* TAB 2: ROZMIAR I ZAOKRĄGLENIE DLA KAFELKA AKCJI */}
                {activeInspectorTab === 'size' && (
                  <div className="space-y-4">
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="font-bold text-slate-300">Wysokość kafelka:</label>
                        <span className="font-mono text-amber-400 font-bold">{currentActionTile.height} px</span>
                      </div>
                      <input
                        type="range"
                        min={44}
                        max={92}
                        step={2}
                        value={currentActionTile.height}
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          const updated = {
                            ...theme.actionTiles,
                            [selectedTarget.key]: { ...currentActionTile, height: val },
                          };
                          setTheme({ ...theme, actionTiles: updated });
                          saveLiveMatchTheme({ ...theme, actionTiles: updated });
                        }}
                        className="w-full accent-amber-500 cursor-pointer"
                      />
                      <div className="flex justify-between text-[10px] text-slate-500 font-mono mt-1">
                        <span>44px (Kompakt)</span>
                        <span>64px (Standard)</span>
                        <span>92px (Maxi)</span>
                      </div>
                    </div>

                    <div>
                      <label className="font-bold text-slate-300 block mb-1.5">
                        Zaokrąglenie rogów (Kształt):
                      </label>
                      <div className="grid grid-cols-2 gap-2">
                        {[
                          { id: 'rounded-none', label: 'Kanciaste (0px)' },
                          { id: 'rounded-lg', label: 'Lekkie (8px)' },
                          { id: 'rounded-2xl', label: 'Standard (16px)' },
                          { id: 'rounded-3xl', label: 'Mocne (24px)' },
                          { id: 'rounded-full', label: 'Pigułka (Full)' },
                        ].map((r) => (
                          <button
                            key={r.id}
                            onClick={() => {
                              playClickSound();
                              const updated = {
                                ...theme.actionTiles,
                                [selectedTarget.key]: {
                                  ...currentActionTile,
                                  borderRadius: r.id as TileCornerRadius,
                                },
                              };
                              setTheme({ ...theme, actionTiles: updated });
                              saveLiveMatchTheme({ ...theme, actionTiles: updated });
                            }}
                            className={`p-2.5 border text-center transition font-bold text-xs ${r.id} ${
                              currentActionTile.borderRadius === r.id
                                ? 'bg-amber-500 text-slate-950 border-amber-400'
                                : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700'
                            }`}
                          >
                            {r.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* TAB 3: CZCIONKA I NAPISY DLA KAFELKA AKCJI */}
                {activeInspectorTab === 'font' && (
                  <div className="space-y-4">
                    <div>
                      <label className="font-bold text-slate-300 block mb-1.5">Krój czcionki:</label>
                      <div className="grid grid-cols-2 gap-2">
                        {[
                          { id: 'mono', label: 'Sportowa Mono', font: 'font-mono' },
                          { id: 'sans', label: 'Nowoczesna Sans', font: 'font-sans' },
                          { id: 'display', label: 'Wyrazista Display', font: 'font-black tracking-tight' },
                          { id: 'serif', label: 'Klasyczna Serif', font: 'font-serif' },
                        ].map((f) => (
                          <button
                            key={f.id}
                            onClick={() => {
                              playClickSound();
                              const updated = {
                                ...theme.actionTiles,
                                [selectedTarget.key]: {
                                  ...currentActionTile,
                                  fontFamily: f.id as TileFontFamily,
                                },
                              };
                              setTheme({ ...theme, actionTiles: updated });
                              saveLiveMatchTheme({ ...theme, actionTiles: updated });
                            }}
                            className={`p-2.5 rounded-xl border text-center transition ${f.font} text-xs ${
                              currentActionTile.fontFamily === f.id
                                ? 'bg-amber-500 text-slate-950 border-amber-400 font-bold'
                                : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700'
                            }`}
                          >
                            {f.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="font-bold text-slate-300">Rozmiar głównego napisu (+2 PKT):</label>
                        <span className="font-mono text-amber-400 font-bold">{currentActionTile.fontSizePrimary} px</span>
                      </div>
                      <input
                        type="range"
                        min={12}
                        max={36}
                        step={1}
                        value={currentActionTile.fontSizePrimary}
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          const updated = {
                            ...theme.actionTiles,
                            [selectedTarget.key]: { ...currentActionTile, fontSizePrimary: val },
                          };
                          setTheme({ ...theme, actionTiles: updated });
                          saveLiveMatchTheme({ ...theme, actionTiles: updated });
                        }}
                        className="w-full accent-amber-500 cursor-pointer"
                      />
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="font-bold text-slate-300">Rozmiar podtytułu (np. 2PT Celny):</label>
                        <span className="font-mono text-amber-400 font-bold">{currentActionTile.fontSizeSecondary} px</span>
                      </div>
                      <input
                        type="range"
                        min={8}
                        max={18}
                        step={1}
                        value={currentActionTile.fontSizeSecondary}
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          const updated = {
                            ...theme.actionTiles,
                            [selectedTarget.key]: { ...currentActionTile, fontSizeSecondary: val },
                          };
                          setTheme({ ...theme, actionTiles: updated });
                          saveLiveMatchTheme({ ...theme, actionTiles: updated });
                        }}
                        className="w-full accent-amber-500 cursor-pointer"
                      />
                    </div>
                  </div>
                )}

                {/* BATCH APPLY ACTION BUTTONS */}
                <div className="pt-3 border-t border-slate-800 space-y-2">
                  <span className="text-[11px] font-bold text-slate-400 block">Szybkie powielanie stylu:</span>
                  <div className="grid grid-cols-1 gap-1.5">
                    <button
                      onClick={() => handleApplyToScoringTiles(selectedTarget.key)}
                      className="p-2 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-700 text-slate-200 text-xs font-bold transition flex items-center justify-between"
                    >
                      <span>➔ Zastosuj do wszystkich rzutów (+2, +3, +1)</span>
                      <ArrowRight className="w-3.5 h-3.5 text-amber-400" />
                    </button>

                    <button
                      onClick={() => handleApplyToDefenseTiles(selectedTarget.key)}
                      className="p-2 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-700 text-slate-200 text-xs font-bold transition flex items-center justify-between"
                    >
                      <span>➔ Zastosuj do kafelków obrony / zbiórek</span>
                      <ArrowRight className="w-3.5 h-3.5 text-indigo-400" />
                    </button>

                    <button
                      onClick={() => handleApplyToAllActionTiles(selectedTarget.key)}
                      className="p-2 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-700 text-slate-200 text-xs font-bold transition flex items-center justify-between"
                    >
                      <span>➔ Ujednolić rozmiar na całym panelu akcji</span>
                      <Maximize2 className="w-3.5 h-3.5 text-emerald-400" />
                    </button>
                  </div>
                </div>
              </>
            )}

            {/* === SCENARIO 2: TABLICA WYNIKÓW (SCOREBOARD) CONTROLS === */}
            {selectedTarget?.type === 'scoreboard' && (
              <div className="space-y-4">
                {/* Scoreboard Colors */}
                {activeInspectorTab === 'color' && (
                  <div className="space-y-3.5">
                    <div>
                      <label className="font-bold text-slate-300 block mb-1.5">Tło tablicy wyników:</label>
                      <div className="grid grid-cols-2 gap-2">
                        {[
                          { name: 'Ciemny Granat', bg: 'linear-gradient(180deg, #090d16 0%, #0f172a 100%)', border: '#334155' },
                          { name: 'Złoty Mistrzowski', bg: 'linear-gradient(180deg, #0a0a0a 0%, #17150c 100%)', border: '#eab308' },
                          { name: 'Cyber Fiolet', bg: 'linear-gradient(180deg, #05051a 0%, #0d092b 100%)', border: '#818cf8' },
                          { name: 'Głęboka Czerń', bg: '#000000', border: '#38bdf8' },
                        ].map((sc) => (
                          <button
                            key={sc.name}
                            onClick={() => {
                              playClickSound();
                              const updated = {
                                ...theme.scoreboard,
                                bgStyle: sc.bg,
                                borderColor: sc.border,
                              };
                              setTheme({ ...theme, scoreboard: updated });
                              saveLiveMatchTheme({ ...theme, scoreboard: updated });
                            }}
                            style={{ background: sc.bg, borderColor: sc.border }}
                            className="p-2.5 rounded-xl border text-center font-bold text-xs hover:scale-102 transition"
                          >
                            {sc.name}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800 space-y-2.5">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-300">Kolor punktów Naszej Drużyny:</span>
                        <div className="flex items-center gap-1.5">
                          <input
                            type="color"
                            value={theme.scoreboard.scoreColorOur}
                            onChange={(e) => {
                              const updated = { ...theme.scoreboard, scoreColorOur: e.target.value };
                              setTheme({ ...theme, scoreboard: updated });
                              saveLiveMatchTheme({ ...theme, scoreboard: updated });
                            }}
                            className="w-7 h-7 rounded border border-slate-700 cursor-pointer bg-transparent"
                          />
                          <span className="font-mono text-[11px] text-slate-400">{theme.scoreboard.scoreColorOur}</span>
                        </div>
                      </div>

                      <div className="flex items-center justify-between pt-1 border-t border-slate-800/80">
                        <span className="font-bold text-slate-300">Kolor punktów Rywala:</span>
                        <div className="flex items-center gap-1.5">
                          <input
                            type="color"
                            value={theme.scoreboard.scoreColorOpp}
                            onChange={(e) => {
                              const updated = { ...theme.scoreboard, scoreColorOpp: e.target.value };
                              setTheme({ ...theme, scoreboard: updated });
                              saveLiveMatchTheme({ ...theme, scoreboard: updated });
                            }}
                            className="w-7 h-7 rounded border border-slate-700 cursor-pointer bg-transparent"
                          />
                          <span className="font-mono text-[11px] text-slate-400">{theme.scoreboard.scoreColorOpp}</span>
                        </div>
                      </div>

                      <div className="pt-2 border-t border-slate-800/80 space-y-2.5">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-slate-200">Zegar — PAUZA / START</span>
                          <button
                            type="button"
                            onClick={() =>
                              updateScoreboard({
                                clockColor: DEFAULT_CLOCK_APPEARANCE.clockRunningColor,
                                ...DEFAULT_CLOCK_APPEARANCE,
                              })
                            }
                            className="text-[10px] font-bold text-slate-400 hover:text-amber-300 transition-colors"
                          >
                            Domyślne zegara
                          </button>
                        </div>

                        {/* Paused state colors */}
                        <div className="p-2.5 rounded-lg bg-rose-950/20 border border-rose-500/25 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-[11px] font-black uppercase tracking-wider text-rose-300">
                              Stan PAUZA
                            </span>
                            <button
                              type="button"
                              onClick={() =>
                                updateScoreboard({
                                  clockPausedPulse: !(
                                    theme.scoreboard.clockPausedPulse ?? DEFAULT_CLOCK_APPEARANCE.clockPausedPulse
                                  ),
                                })
                              }
                              className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                                (theme.scoreboard.clockPausedPulse ?? DEFAULT_CLOCK_APPEARANCE.clockPausedPulse)
                                  ? 'bg-rose-500/20 border-rose-400/50 text-rose-200'
                                  : 'bg-slate-900 border-slate-700 text-slate-400'
                              }`}
                            >
                              Pulsowanie:{' '}
                              {(theme.scoreboard.clockPausedPulse ?? DEFAULT_CLOCK_APPEARANCE.clockPausedPulse)
                                ? 'WŁ'
                                : 'WYŁ'}
                            </button>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <div className="flex items-center justify-between bg-slate-950/70 px-2 py-1 rounded border border-slate-800">
                              <span className="text-[11px] text-slate-300">Cyfry:</span>
                              <input
                                type="color"
                                value={theme.scoreboard.clockPausedColor || DEFAULT_CLOCK_APPEARANCE.clockPausedColor}
                                onChange={(e) => updateScoreboard({ clockPausedColor: e.target.value })}
                                className="w-6 h-6 rounded border border-slate-700 cursor-pointer bg-transparent"
                              />
                            </div>
                            <div className="flex items-center justify-between bg-slate-950/70 px-2 py-1 rounded border border-slate-800">
                              <span className="text-[11px] text-slate-300">Tło:</span>
                              <input
                                type="color"
                                value={theme.scoreboard.clockPausedBg || DEFAULT_CLOCK_APPEARANCE.clockPausedBg}
                                onChange={(e) => updateScoreboard({ clockPausedBg: e.target.value })}
                                className="w-6 h-6 rounded border border-slate-700 cursor-pointer bg-transparent"
                              />
                            </div>
                          </div>
                        </div>

                        {/* Running state colors */}
                        <div className="p-2.5 rounded-lg bg-emerald-950/20 border border-emerald-500/25 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-[11px] font-black uppercase tracking-wider text-emerald-300">
                              Stan START
                            </span>
                            <button
                              type="button"
                              onClick={() =>
                                updateScoreboard({
                                  clockRunningPulse: !(
                                    theme.scoreboard.clockRunningPulse ?? DEFAULT_CLOCK_APPEARANCE.clockRunningPulse
                                  ),
                                })
                              }
                              className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                                (theme.scoreboard.clockRunningPulse ?? DEFAULT_CLOCK_APPEARANCE.clockRunningPulse)
                                  ? 'bg-emerald-500/20 border-emerald-400/50 text-emerald-200'
                                  : 'bg-slate-900 border-slate-700 text-slate-400'
                              }`}
                            >
                              Pulsowanie:{' '}
                              {(theme.scoreboard.clockRunningPulse ?? DEFAULT_CLOCK_APPEARANCE.clockRunningPulse)
                                ? 'WŁ'
                                : 'WYŁ'}
                            </button>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <div className="flex items-center justify-between bg-slate-950/70 px-2 py-1 rounded border border-slate-800">
                              <span className="text-[11px] text-slate-300">Cyfry:</span>
                              <input
                                type="color"
                                value={
                                  theme.scoreboard.clockRunningColor ||
                                  theme.scoreboard.clockColor ||
                                  DEFAULT_CLOCK_APPEARANCE.clockRunningColor
                                }
                                onChange={(e) =>
                                  updateScoreboard({
                                    clockRunningColor: e.target.value,
                                    clockColor: e.target.value,
                                  })
                                }
                                className="w-6 h-6 rounded border border-slate-700 cursor-pointer bg-transparent"
                              />
                            </div>
                            <div className="flex items-center justify-between bg-slate-950/70 px-2 py-1 rounded border border-slate-800">
                              <span className="text-[11px] text-slate-300">Tło:</span>
                              <input
                                type="color"
                                value={theme.scoreboard.clockRunningBg || DEFAULT_CLOCK_APPEARANCE.clockRunningBg}
                                onChange={(e) => updateScoreboard({ clockRunningBg: e.target.value })}
                                className="w-6 h-6 rounded border border-slate-700 cursor-pointer bg-transparent"
                              />
                            </div>
                          </div>
                        </div>

                        {/* Intensity, Glow & Pulse Speed */}
                        <div className="space-y-2 pt-1">
                          <div>
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-[11px] font-bold text-slate-300">Intensywność tła zegara:</span>
                              <span className="font-mono text-[11px] font-bold text-amber-400">
                                {theme.scoreboard.clockBgIntensity ?? DEFAULT_CLOCK_APPEARANCE.clockBgIntensity}%
                              </span>
                            </div>
                            <input
                              type="range"
                              min={0}
                              max={50}
                              step={2}
                              value={theme.scoreboard.clockBgIntensity ?? DEFAULT_CLOCK_APPEARANCE.clockBgIntensity}
                              onChange={(e) => updateScoreboard({ clockBgIntensity: Number(e.target.value) })}
                              className="w-full accent-amber-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
                            />
                          </div>

                          <div className="flex items-center justify-between gap-2">
                            <button
                              type="button"
                              onClick={() =>
                                updateScoreboard({
                                  clockGlowEnabled: !(
                                    theme.scoreboard.clockGlowEnabled ?? DEFAULT_CLOCK_APPEARANCE.clockGlowEnabled
                                  ),
                                })
                              }
                              className={`px-2.5 py-1 rounded-lg border text-[11px] font-bold ${
                                (theme.scoreboard.clockGlowEnabled ?? DEFAULT_CLOCK_APPEARANCE.clockGlowEnabled)
                                  ? 'bg-amber-500/20 border-amber-500/50 text-amber-200'
                                  : 'bg-slate-900 border-slate-700 text-slate-400'
                              }`}
                            >
                              Poświata:{' '}
                              {(theme.scoreboard.clockGlowEnabled ?? DEFAULT_CLOCK_APPEARANCE.clockGlowEnabled)
                                ? 'WŁ'
                                : 'WYŁ'}
                            </button>

                            <div className="flex items-center gap-1">
                              {(['slow', 'normal', 'fast'] as const).map((spd) => {
                                const active =
                                  (theme.scoreboard.clockPulseSpeed || DEFAULT_CLOCK_APPEARANCE.clockPulseSpeed) ===
                                  spd;
                                const label = spd === 'slow' ? 'Wolne' : spd === 'normal' ? 'Norm.' : 'Szybkie';
                                return (
                                  <button
                                    key={spd}
                                    type="button"
                                    onClick={() => updateScoreboard({ clockPulseSpeed: spd })}
                                    className={`px-2 py-1 rounded-lg border text-[10px] font-bold ${
                                      active
                                        ? 'bg-amber-500/20 border-amber-500/60 text-amber-200'
                                        : 'bg-slate-900 border-slate-700 text-slate-400'
                                    }`}
                                  >
                                    {label}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Scoreboard Size */}
                {activeInspectorTab === 'size' && (
                  <div className="space-y-4">
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="font-bold text-slate-300">Wielkość cyfr wyniku:</label>
                        <span className="font-mono text-amber-400 font-bold">{theme.scoreboard.scoreFontSize} px</span>
                      </div>
                      <input
                        type="range"
                        min={44}
                        max={96}
                        step={2}
                        value={theme.scoreboard.scoreFontSize}
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          const updated = { ...theme.scoreboard, scoreFontSize: val };
                          setTheme({ ...theme, scoreboard: updated });
                          saveLiveMatchTheme({ ...theme, scoreboard: updated });
                        }}
                        className="w-full accent-amber-500 cursor-pointer"
                      />
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="font-bold text-slate-300">Wielkość cyfr zegara:</label>
                        <span className="font-mono text-amber-400 font-bold">{theme.scoreboard.clockFontSize} px</span>
                      </div>
                      <input
                        type="range"
                        min={24}
                        max={54}
                        step={2}
                        value={theme.scoreboard.clockFontSize}
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          const updated = { ...theme.scoreboard, clockFontSize: val };
                          setTheme({ ...theme, scoreboard: updated });
                          saveLiveMatchTheme({ ...theme, scoreboard: updated });
                        }}
                        className="w-full accent-amber-500 cursor-pointer"
                      />
                    </div>

                    <div>
                      <label className="font-bold text-slate-300 block mb-1.5">Zaokrąglenie tablicy:</label>
                      <div className="grid grid-cols-2 gap-2">
                        {[
                          { id: 'rounded-none', label: 'Kanciaste (0px)' },
                          { id: 'rounded-xl', label: 'Standard (12px)' },
                          { id: 'rounded-2xl', label: 'Zaokrąglone (16px)' },
                          { id: 'rounded-3xl', label: 'Mocne (24px)' },
                        ].map((r) => (
                          <button
                            key={r.id}
                            onClick={() => {
                              playClickSound();
                              const updated = { ...theme.scoreboard, borderRadius: r.id as TileCornerRadius };
                              setTheme({ ...theme, scoreboard: updated });
                              saveLiveMatchTheme({ ...theme, scoreboard: updated });
                            }}
                            className={`p-2 rounded-xl border text-center font-bold text-xs ${
                              theme.scoreboard.borderRadius === r.id
                                ? 'bg-amber-500 text-slate-950 border-amber-400'
                                : 'bg-slate-950 border-slate-800 text-slate-300'
                            }`}
                          >
                            {r.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* Scoreboard Font */}
                {activeInspectorTab === 'font' && (
                  <div className="space-y-4">
                    <label className="font-bold text-slate-300 block mb-1.5">Krój czcionki tablicy:</label>
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        { id: 'mono', label: 'Cyfrowa Monospace', font: 'font-mono' },
                        { id: 'sans', label: 'Nowoczesna Sans', font: 'font-sans' },
                        { id: 'display', label: 'Meczowa Display', font: 'font-black tracking-tight' },
                        { id: 'serif', label: 'Klasyczna Serif', font: 'font-serif' },
                      ].map((f) => (
                        <button
                          key={f.id}
                          onClick={() => {
                            playClickSound();
                            const updated = { ...theme.scoreboard, fontFamily: f.id as TileFontFamily };
                            setTheme({ ...theme, scoreboard: updated });
                            saveLiveMatchTheme({ ...theme, scoreboard: updated });
                          }}
                          className={`p-3 rounded-xl border text-center transition ${f.font} text-xs ${
                            theme.scoreboard.fontFamily === f.id
                              ? 'bg-amber-500 text-slate-950 border-amber-400 font-black'
                              : 'bg-slate-950 border-slate-800 text-slate-300'
                          }`}
                        >
                          {f.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* === SCENARIO 3: KAFELKI ZAWODNIKÓW (PLAYER CARDS) CONTROLS === */}
            {selectedTarget?.type === 'playerCards' && (
              <div className="space-y-4">
                {/* Player Cards Colors */}
                {activeInspectorTab === 'color' && (
                  <div className="space-y-3.5">
                    <div>
                      <label className="font-bold text-slate-300 block mb-1.5">
                        Tło aktywnego (wybranego) zawodnika:
                      </label>
                      <div className="grid grid-cols-2 gap-2">
                        {[
                          { name: 'Złoty Mistrzowski', bg: 'linear-gradient(90deg, #fbbf24 0%, #f59e0b 50%, #d97706 100%)', text: '#020617', border: '#fde68a' },
                          { name: 'Szmaragdowy', bg: 'linear-gradient(90deg, #34d399 0%, #10b981 100%)', text: '#020617', border: '#6ee7b7' },
                          { name: 'Cyber Turkus', bg: 'linear-gradient(90deg, #06b6d4 0%, #3b82f6 100%)', text: '#ffffff', border: '#67e8f9' },
                          { name: 'Czysta Biel', bg: '#ffffff', text: '#000000', border: '#cbd5e1' },
                        ].map((c) => (
                          <button
                            key={c.name}
                            onClick={() => {
                              playClickSound();
                              const updated = {
                                ...theme.playerCards,
                                bgSelected: c.bg,
                                textSelected: c.text,
                                borderSelected: c.border,
                              };
                              setTheme({ ...theme, playerCards: updated });
                              saveLiveMatchTheme({ ...theme, playerCards: updated });
                            }}
                            style={{ background: c.bg, color: c.text }}
                            className="p-2.5 rounded-xl border text-center font-bold text-xs shadow-sm hover:scale-102 transition"
                          >
                            {c.name}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <label className="font-bold text-slate-300 block mb-1.5">
                        Tło pozostałych zawodników:
                      </label>
                      <div className="grid grid-cols-2 gap-2">
                        {[
                          { name: 'Ciemny Granat', bg: 'linear-gradient(180deg, #0f172a 0%, #090d16 100%)', border: '#1e293b' },
                          { name: 'Głęboka Czerń', bg: '#030508', border: '#1e293b' },
                          { name: 'Złoto-Ciemne', bg: 'linear-gradient(180deg, #17150c 0%, #0c0b06 100%)', border: '#713f12' },
                          { name: 'Grafit', bg: '#18181b', border: '#3f3f46' },
                        ].map((c) => (
                          <button
                            key={c.name}
                            onClick={() => {
                              playClickSound();
                              const updated = {
                                ...theme.playerCards,
                                bgUnselected: c.bg,
                                borderUnselected: c.border,
                              };
                              setTheme({ ...theme, playerCards: updated });
                              saveLiveMatchTheme({ ...theme, playerCards: updated });
                            }}
                            style={{ background: c.bg, borderColor: c.border }}
                            className="p-2.5 rounded-xl border text-center font-bold text-xs hover:scale-102 transition text-slate-200"
                          >
                            {c.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* Player Cards Size */}
                {activeInspectorTab === 'size' && (
                  <div className="space-y-4">
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="font-bold text-slate-300">Wysokość kafelka zawodnika:</label>
                        <span className="font-mono text-amber-400 font-bold">{theme.playerCards.cardMinHeight} px</span>
                      </div>
                      <input
                        type="range"
                        min={52}
                        max={86}
                        step={2}
                        value={theme.playerCards.cardMinHeight}
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          const updated = { ...theme.playerCards, cardMinHeight: val };
                          setTheme({ ...theme, playerCards: updated });
                          saveLiveMatchTheme({ ...theme, playerCards: updated });
                        }}
                        className="w-full accent-amber-500 cursor-pointer"
                      />
                    </div>

                    <div>
                      <label className="font-bold text-slate-300 block mb-1.5">Zaokrąglenie kafelków:</label>
                      <div className="grid grid-cols-2 gap-2">
                        {[
                          { id: 'rounded-none', label: 'Kanciaste (0px)' },
                          { id: 'rounded-lg', label: 'Lekkie (8px)' },
                          { id: 'rounded-2xl', label: 'Standard (16px)' },
                          { id: 'rounded-3xl', label: 'Mocne (24px)' },
                        ].map((r) => (
                          <button
                            key={r.id}
                            onClick={() => {
                              playClickSound();
                              const updated = { ...theme.playerCards, borderRadius: r.id as TileCornerRadius };
                              setTheme({ ...theme, playerCards: updated });
                              saveLiveMatchTheme({ ...theme, playerCards: updated });
                            }}
                            className={`p-2 rounded-xl border text-center font-bold text-xs ${
                              theme.playerCards.borderRadius === r.id
                                ? 'bg-amber-500 text-slate-950 border-amber-400'
                                : 'bg-slate-950 border-slate-800 text-slate-300'
                            }`}
                          >
                            {r.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* Player Cards Font & Text Size */}
                {activeInspectorTab === 'font' && (
                  <div className="space-y-4">
                    <div>
                      <label className="font-bold text-slate-300 block mb-1.5">Krój czcionki:</label>
                      <div className="grid grid-cols-2 gap-2">
                        {[
                          { id: 'sans', label: 'Nowoczesna Sans' },
                          { id: 'mono', label: 'Sportowa Mono' },
                          { id: 'display', label: 'Meczowa Display' },
                        ].map((f) => (
                          <button
                            key={f.id}
                            onClick={() => {
                              playClickSound();
                              const updated = { ...theme.playerCards, fontFamily: f.id as TileFontFamily };
                              setTheme({ ...theme, playerCards: updated });
                              saveLiveMatchTheme({ ...theme, playerCards: updated });
                            }}
                            className={`p-2.5 rounded-xl border text-center font-bold text-xs ${
                              theme.playerCards.fontFamily === f.id
                                ? 'bg-amber-500 text-slate-950 border-amber-400'
                                : 'bg-slate-950 border-slate-800 text-slate-300'
                            }`}
                          >
                            {f.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="font-bold text-slate-300">Wielkość cyfr punktów zawodnika:</label>
                        <span className="font-mono text-amber-400 font-bold">{theme.playerCards.ptsFontSize} px</span>
                      </div>
                      <input
                        type="range"
                        min={14}
                        max={30}
                        step={1}
                        value={theme.playerCards.ptsFontSize}
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          const updated = { ...theme.playerCards, ptsFontSize: val };
                          setTheme({ ...theme, playerCards: updated });
                          saveLiveMatchTheme({ ...theme, playerCards: updated });
                        }}
                        className="w-full accent-amber-500 cursor-pointer"
                      />
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="font-bold text-slate-300">Wielkość nazwiska zawodnika:</label>
                        <span className="font-mono text-amber-400 font-bold">{theme.playerCards.nameFontSize} px</span>
                      </div>
                      <input
                        type="range"
                        min={11}
                        max={19}
                        step={1}
                        value={theme.playerCards.nameFontSize}
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          const updated = { ...theme.playerCards, nameFontSize: val };
                          setTheme({ ...theme, playerCards: updated });
                          saveLiveMatchTheme({ ...theme, playerCards: updated });
                        }}
                        className="w-full accent-amber-500 cursor-pointer"
                      />
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

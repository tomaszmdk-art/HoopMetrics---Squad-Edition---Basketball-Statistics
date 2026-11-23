import React, { useState, useEffect } from 'react';
import { AppSettings } from '../types/basketball';
import { Settings, Volume2, Smartphone, Download, Check, Sparkles, Hand, Clock, X, Lock, KeyRound, Eye, EyeOff, RefreshCw, Mic, Shield, Scale, Palette, Play, Pause, RotateCcw } from 'lucide-react';
import { announcePlay, playClickSound, triggerHaptic } from '../services/tts';
import { PWAInstallModal } from './PWAInstallModal';
import { useLanguage } from '../i18n/LanguageContext';
import { LiveMatchTheme } from '../types/liveMatchTheme';
import {
  DEFAULT_CLOCK_APPEARANCE,
  getClockPulseDuration,
  getStoredLiveMatchTheme,
  hexToRgba,
  saveLiveMatchTheme,
} from '../services/liveMatchThemeService';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: AppSettings;
  onSaveSettings: (settings: AppSettings) => void;
  onOpenTransferModal?: () => void;
  onOpenClubProfile?: () => void;
  onOpenLegalModal?: () => void;
  onOpenLiveCustomizer?: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  settings,
  onSaveSettings,
  onOpenTransferModal,
  onOpenClubProfile,
  onOpenLegalModal,
  onOpenLiveCustomizer,
}) => {
  const { language, setLanguage, supportedLanguages, t } = useLanguage();
  const [current, setCurrent] = useState<AppSettings>(settings);
  const [showPwaGuide, setShowPwaGuide] = useState(false);
  const [isTestingVoice, setIsTestingVoice] = useState(false);
  const [pinInput, setPinInput] = useState(settings.coachPin || '');
  const [pinSaved, setPinSaved] = useState(false);
  const [showPin, setShowPin] = useState(false);
  const [liveTheme, setLiveTheme] = useState<LiveMatchTheme>(getStoredLiveMatchTheme);
  const [clockPreviewRunning, setClockPreviewRunning] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setCurrent(settings);
      setPinInput(settings.coachPin || '');
      setPinSaved(false);
      setLiveTheme(getStoredLiveMatchTheme());
    }
  }, [isOpen, settings]);

  const updateClockStyle = (patch: Partial<LiveMatchTheme['scoreboard']>) => {
    const next: LiveMatchTheme = {
      ...liveTheme,
      scoreboard: {
        ...liveTheme.scoreboard,
        ...patch,
      },
    };
    setLiveTheme(next);
    saveLiveMatchTheme(next);
  };

  if (!isOpen) return null;

  const handleToggle = (key: keyof AppSettings) => {
    playClickSound();
    triggerHaptic(20);
    const updated = { ...current, [key]: !current[key] };
    setCurrent(updated);
    onSaveSettings(updated);
  };

  const handleVoiceChange = (voice: AppSettings['announcerVoice']) => {
    playClickSound();
    const updated = { ...current, announcerVoice: voice };
    setCurrent(updated);
    onSaveSettings(updated);
  };

  const handleTestVoice = () => {
    setIsTestingVoice(true);
    announcePlay('Trójka! Jan Kowalski celnie za 3 punkty! Nasz zespół prowadzi.', {
      voice: current.announcerVoice,
      onEnd: () => setIsTestingVoice(false),
    });
  };

  const handleSavePin = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const cleanPin = pinInput.trim();
    if (!cleanPin) return;
    const updated = { ...current, coachPin: cleanPin };
    setCurrent(updated);
    onSaveSettings(updated);
    playClickSound();
    triggerHaptic(30);
    setPinSaved(true);
    setTimeout(() => setPinSaved(false), 2500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/90">
      <div className="w-full max-w-md rounded-2xl bg-slate-900 border border-slate-800 p-5 shadow-2xl text-slate-100 max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-4">
          <div className="flex items-center gap-2">
            <Settings className="w-5 h-5 text-amber-400" />
            <h3 className="text-base font-bold text-white">{t('nav.settings', 'Ustawienia Aplikacji')}</h3>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg text-slate-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4 text-xs">
          {/* Wybór języka / Language Selection */}
          <div className="bg-slate-950/80 p-3.5 rounded-xl border border-slate-800 space-y-2.5">
            <div className="flex items-center justify-between">
              <div>
                <span className="font-bold text-sm text-white block">
                  {t('common.language', 'Język aplikacji')} / Language
                </span>
                <span className="text-slate-400 text-[11px]">
                  {t('common.defaultNotice', 'Domyślny: Angielski')} • Default: English
                </span>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 pt-1">
              {supportedLanguages.map((lang) => {
                const isSelected = lang.code === language;
                return (
                  <button
                    key={lang.code}
                    type="button"
                    onClick={() => {
                      playClickSound();
                      triggerHaptic(20);
                      setLanguage(lang.code);
                    }}
                    className={`py-2 px-2 rounded-xl border flex items-center justify-center gap-1.5 transition text-xs font-bold ${
                      isSelected
                        ? 'bg-amber-500 text-slate-950 border-amber-300 ring-2 ring-amber-400/40 shadow-md font-black'
                        : 'bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800 hover:text-white'
                    }`}
                  >
                    <span className="text-sm">{lang.flag}</span>
                    <span>{lang.nativeLabel}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Wygląd i Personalizacja Kafelków Pulpitu Live Match */}
          {onOpenLiveCustomizer && (
            <div className="bg-gradient-to-br from-amber-500/15 via-slate-950 to-orange-500/10 p-3.5 rounded-xl border border-amber-500/40 space-y-2.5 shadow-lg shadow-amber-950/20">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Palette className="w-4 h-4 text-amber-400" />
                  <span className="font-bold text-sm text-white">Wygląd Pulpitu Live Match</span>
                </div>
                <span className="text-[10px] bg-amber-500/20 text-amber-300 font-bold px-2 py-0.5 rounded-full border border-amber-500/30">
                  Edytor Kafelków
                </span>
              </div>

              <p className="text-slate-300 text-xs leading-relaxed">
                Dostosuj kafelki meczowe i tablicę wyników pod swój telefon lub tablet. Zmieniaj rozmiar kafelków, kolory, zaokrąglenia, czcionki oraz wielkości napisów z podglądem na żywo.
              </p>

              <button
                type="button"
                onClick={() => {
                  playClickSound();
                  triggerHaptic(30);
                  onClose();
                  onOpenLiveCustomizer();
                }}
                className="w-full py-2.5 px-3 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 font-black text-xs flex items-center justify-center gap-2 transition active:scale-95 shadow-md shadow-orange-950/40"
              >
                <Palette className="w-4 h-4" />
                <span>Otwórz wirtualny pulpit (Edytor kafelków)</span>
              </button>
            </div>
          )}

          {/* Wygląd, kolory, tło i pulsowanie zegara kwarty */}
          {(() => {
            const sb = liveTheme.scoreboard;
            const runColor = sb.clockRunningColor || DEFAULT_CLOCK_APPEARANCE.clockRunningColor;
            const runBg = sb.clockRunningBg || DEFAULT_CLOCK_APPEARANCE.clockRunningBg;
            const pauseColor = sb.clockPausedColor || DEFAULT_CLOCK_APPEARANCE.clockPausedColor;
            const pauseBg = sb.clockPausedBg || DEFAULT_CLOCK_APPEARANCE.clockPausedBg;
            const intensity = sb.clockBgIntensity ?? DEFAULT_CLOCK_APPEARANCE.clockBgIntensity;
            const glowOn = sb.clockGlowEnabled ?? DEFAULT_CLOCK_APPEARANCE.clockGlowEnabled;
            const pausePulseOn = sb.clockPausedPulse ?? DEFAULT_CLOCK_APPEARANCE.clockPausedPulse;
            const runPulseOn = sb.clockRunningPulse ?? DEFAULT_CLOCK_APPEARANCE.clockRunningPulse;
            const pulseSpeed = sb.clockPulseSpeed || DEFAULT_CLOCK_APPEARANCE.clockPulseSpeed;
            const fullscreenOverlayOn = sb.clockPausedFullscreenOverlay ?? DEFAULT_CLOCK_APPEARANCE.clockPausedFullscreenOverlay;
            const screenBgPulseOn = sb.clockScreenBgPulse ?? DEFAULT_CLOCK_APPEARANCE.clockScreenBgPulse;
            const pulseDur = getClockPulseDuration(pulseSpeed);

            const previewColor = clockPreviewRunning ? runColor : pauseColor;
            const previewBg = clockPreviewRunning ? runBg : pauseBg;
            const previewPulsing = clockPreviewRunning ? runPulseOn : pausePulseOn;
            const previewAlpha = intensity / 100;

            return (
              <div className="bg-slate-950/80 p-3.5 rounded-xl border border-slate-800 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-emerald-400" />
                    <span className="font-bold text-sm text-white">Zegar kwarty — kolory i pulsowanie</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      playClickSound();
                      updateClockStyle({ ...DEFAULT_CLOCK_APPEARANCE });
                    }}
                    className="flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-[10px] font-bold text-slate-300"
                    title="Przywróć domyślne kolory i pulsowanie zegara"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>Domyślne</span>
                  </button>
                </div>

                {/* Klikalny podgląd na żywo */}
                <div className="flex flex-col items-center gap-1.5 p-2.5 rounded-xl bg-slate-900/80 border border-slate-800">
                  <button
                    type="button"
                    onClick={() => {
                      playClickSound();
                      setClockPreviewRunning(!clockPreviewRunning);
                    }}
                    style={{
                      borderColor: hexToRgba(previewBg, Math.min(0.95, previewAlpha + 0.5)),
                      boxShadow: glowOn
                        ? `0 0 18px ${hexToRgba(previewBg, Math.min(0.55, previewAlpha * 1.45))}`
                        : undefined,
                    }}
                    className="relative px-5 py-2 rounded-2xl border-2 bg-slate-950 overflow-hidden flex flex-col items-center justify-center transition active:scale-95"
                    title="Kliknij podgląd, aby przełączyć między PAUZA i START"
                  >
                    <div
                      style={{
                        background: `linear-gradient(180deg, ${hexToRgba(previewBg, previewAlpha)} 0%, ${hexToRgba(previewBg, previewAlpha * 0.45)} 100%)`,
                        animationDuration: previewPulsing ? pulseDur : undefined,
                      }}
                      className={`absolute inset-0 pointer-events-none ${previewPulsing ? 'animate-clock-bg-pulse' : ''}`}
                    />
                    <span
                      style={{
                        color: previewColor,
                        textShadow: glowOn ? `0 0 12px ${hexToRgba(previewColor, 0.6)}` : undefined,
                        animationDuration: previewPulsing ? pulseDur : undefined,
                      }}
                      className={`relative z-10 font-mono font-black text-2xl leading-none ${previewPulsing ? 'animate-clock-pulse' : ''}`}
                    >
                      06:42
                    </span>
                    <span
                      style={{
                        color: previewColor,
                        animationDuration: previewPulsing ? pulseDur : undefined,
                      }}
                      className={`relative z-10 mt-1 inline-flex items-center gap-1 text-[9px] font-black tracking-wider ${
                        clockPreviewRunning ? '' : 'uppercase'
                      } ${
                        previewPulsing ? 'animate-clock-pulse' : ''
                      }`}
                    >
                      {clockPreviewRunning ? (
                        <>
                          <Play className="w-2.5 h-2.5 fill-current" />
                          <span>Zegar idzie</span>
                        </>
                      ) : (
                        <>
                          <Pause className="w-2.5 h-2.5 fill-current" />
                          <span>PAUZA</span>
                        </>
                      )}
                    </span>
                  </button>
                  <span className="text-[10px] text-slate-400">
                    Kliknij podgląd powyżej, aby przetestować stan <strong className="text-slate-200">{clockPreviewRunning ? 'PAUZA' : 'Zegar idzie'}</strong>
                  </span>
                </div>

                {/* Kolory stanu PAUZA i START */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div className="p-2.5 rounded-xl bg-slate-900/70 border border-rose-500/30 space-y-2">
                    <div className="font-bold text-[11px] text-rose-300 flex items-center gap-1">
                      <Pause className="w-3 h-3 fill-current" />
                      <span>Zegar zatrzymany (PAUZA)</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] text-slate-300">Kolor cyfr i napisu:</span>
                      <input
                        type="color"
                        value={pauseColor}
                        onChange={(e) => updateClockStyle({ clockPausedColor: e.target.value })}
                        className="w-7 h-6 rounded border border-slate-700 cursor-pointer bg-transparent"
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] text-slate-300">Odcień tła i ramki:</span>
                      <input
                        type="color"
                        value={pauseBg}
                        onChange={(e) => updateClockStyle({ clockPausedBg: e.target.value })}
                        className="w-7 h-6 rounded border border-slate-700 cursor-pointer bg-transparent"
                      />
                    </div>
                    <div className="flex items-center justify-between pt-1 border-t border-slate-800">
                      <span className="text-[11px] text-slate-300">Pulsowanie pauzy:</span>
                      <button
                        type="button"
                        onClick={() => {
                          playClickSound();
                          updateClockStyle({ clockPausedPulse: !pausePulseOn });
                        }}
                        className={`w-10 h-5 rounded-full transition p-0.5 flex items-center ${
                          pausePulseOn ? 'bg-rose-500 justify-end' : 'bg-slate-800 justify-start'
                        }`}
                      >
                        <span className="w-4 h-4 rounded-full bg-white shadow" />
                      </button>
                    </div>
                  </div>

                  <div className="p-2.5 rounded-xl bg-slate-900/70 border border-emerald-500/30 space-y-2">
                    <div className="font-bold text-[11px] text-emerald-300 flex items-center gap-1">
                      <Play className="w-3 h-3 fill-current" />
                      <span>Zegar włączony (START)</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] text-slate-300">Kolor cyfr i napisu:</span>
                      <input
                        type="color"
                        value={runColor}
                        onChange={(e) =>
                          updateClockStyle({
                            clockRunningColor: e.target.value,
                            clockColor: e.target.value,
                          })
                        }
                        className="w-7 h-6 rounded border border-slate-700 cursor-pointer bg-transparent"
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] text-slate-300">Odcień tła i ramki:</span>
                      <input
                        type="color"
                        value={runBg}
                        onChange={(e) => updateClockStyle({ clockRunningBg: e.target.value })}
                        className="w-7 h-6 rounded border border-slate-700 cursor-pointer bg-transparent"
                      />
                    </div>
                    <div className="flex items-center justify-between pt-1 border-t border-slate-800">
                      <span className="text-[11px] text-slate-300">Pulsowanie biegu:</span>
                      <button
                        type="button"
                        onClick={() => {
                          playClickSound();
                          updateClockStyle({ clockRunningPulse: !runPulseOn });
                        }}
                        className={`w-10 h-5 rounded-full transition p-0.5 flex items-center ${
                          runPulseOn ? 'bg-emerald-500 justify-end' : 'bg-slate-800 justify-start'
                        }`}
                      >
                        <span className="w-4 h-4 rounded-full bg-white shadow" />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Intensywność tła, szybkość pulsowania i poświata */}
                <div className="p-2.5 rounded-xl bg-slate-900/70 border border-slate-800 space-y-2.5">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[11px] font-semibold text-slate-300">Intensywność koloru tła okienka:</span>
                      <span className="font-mono text-[11px] font-bold text-amber-400">{intensity}%</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={50}
                      step={2}
                      value={intensity}
                      onChange={(e) => updateClockStyle({ clockBgIntensity: Number(e.target.value) })}
                      className="w-full accent-amber-500 cursor-pointer"
                    />
                  </div>

                  <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-800">
                    <span className="text-[11px] font-semibold text-slate-300">Szybkość pulsowania:</span>
                    <div className="grid grid-cols-3 gap-1">
                      {(
                        [
                          { id: 'slow', label: 'Wolne' },
                          { id: 'normal', label: 'Normalne' },
                          { id: 'fast', label: 'Szybkie' },
                        ] as const
                      ).map((sp) => (
                        <button
                          key={sp.id}
                          type="button"
                          onClick={() => {
                            playClickSound();
                            updateClockStyle({ clockPulseSpeed: sp.id });
                          }}
                          className={`px-2 py-1 rounded-lg text-[10px] font-bold border transition ${
                            pulseSpeed === sp.id
                              ? 'bg-amber-500 text-slate-950 border-amber-400'
                              : 'bg-slate-950 border-slate-800 text-slate-300 hover:bg-slate-800'
                          }`}
                        >
                          {sp.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-1 border-t border-slate-800">
                    <span className="text-[11px] font-semibold text-slate-300">Świecenie cyfr i ramki (Poświata):</span>
                    <button
                      type="button"
                      onClick={() => {
                        playClickSound();
                        updateClockStyle({ clockGlowEnabled: !glowOn });
                      }}
                      className={`w-10 h-5 rounded-full transition p-0.5 flex items-center ${
                        glowOn ? 'bg-amber-500 justify-end' : 'bg-slate-800 justify-start'
                      }`}
                    >
                      <span className="w-4 h-4 rounded-full bg-slate-950 shadow" />
                    </button>
                  </div>

                  <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-800">
                    <span className="text-[11px] font-semibold text-slate-300">
                      Pulsujący napis „Zegar zatrzymany” na cały ekran:
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        playClickSound();
                        updateClockStyle({ clockPausedFullscreenOverlay: !fullscreenOverlayOn });
                      }}
                      className={`w-10 h-5 rounded-full transition p-0.5 flex items-center shrink-0 ${
                        fullscreenOverlayOn ? 'bg-rose-500 justify-end' : 'bg-slate-800 justify-start'
                      }`}
                    >
                      <span className="w-4 h-4 rounded-full bg-white shadow" />
                    </button>
                  </div>

                  <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-800">
                    <span className="text-[11px] font-semibold text-slate-300">
                      Migające tło ekranu (zielone / czerwone jak zegar):
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        playClickSound();
                        updateClockStyle({ clockScreenBgPulse: !screenBgPulseOn });
                      }}
                      className={`w-10 h-5 rounded-full transition p-0.5 flex items-center shrink-0 ${
                        screenBgPulseOn ? 'bg-emerald-500 justify-end' : 'bg-slate-800 justify-start'
                      }`}
                    >
                      <span className="w-4 h-4 rounded-full bg-white shadow" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Lektor meczowy (TTS) */}
          <div className="bg-slate-950/80 p-3.5 rounded-xl border border-slate-800 space-y-2.5">
            <div className="flex items-center justify-between">
              <div>
                <span className="font-bold text-sm text-white block">Głosowy Lektor Meczowy (TTS)</span>
                <span className="text-slate-400">
                  Model Gemini 3.8 Flash TTS / synteza mowy akcji na parkiecie
                </span>
              </div>
              <button
                type="button"
                onClick={() => handleToggle('ttsEnabled')}
                className={`w-12 h-6 rounded-full transition p-1 flex items-center ${
                  current.ttsEnabled ? 'bg-amber-500 justify-end' : 'bg-slate-800 justify-start'
                }`}
              >
                <span className="w-4 h-4 rounded-full bg-slate-950 shadow-md" />
              </button>
            </div>

            {current.ttsEnabled && (
              <div className="pt-2 border-t border-slate-800/80 space-y-2">
                <label className="block text-[11px] font-bold text-slate-400">
                  Głos spikera (Gemini TTS):
                </label>
                <div className="grid grid-cols-4 gap-1.5 font-semibold">
                  {(['Puck', 'Kore', 'Fenrir', 'Zephyr'] as const).map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => handleVoiceChange(v)}
                      className={`py-1.5 rounded-lg border text-center transition ${
                        current.announcerVoice === v
                          ? 'bg-amber-500 text-slate-950 border-amber-400 font-bold'
                          : 'bg-slate-900 border-slate-800 text-slate-300'
                      }`}
                    >
                      {v}
                    </button>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={handleTestVoice}
                  disabled={isTestingVoice}
                  className="w-full py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-400 font-bold text-xs flex items-center justify-center gap-1.5 transition active:scale-95"
                >
                  <Volume2 className="w-3.5 h-3.5" />
                  <span>{isTestingVoice ? 'Odtwarzanie...' : 'Przetestuj głos lektora'}</span>
                </button>
              </div>
            )}
          </div>

          {/* Dyktowanie Głosem i Tryb Ciągły */}
          <div className="bg-slate-950/80 p-3.5 rounded-xl border border-amber-500/30 space-y-2">
            <div className="flex items-center gap-2 text-amber-400 font-bold">
              <Mic className="w-4 h-4" />
              <span>Dyktowanie statystyk głosem (Voice Input)</span>
            </div>
            <p className="text-slate-300 text-xs leading-relaxed">
              Podczas meczu na żywo możesz mówić komendy koszykarskie w języku polskim (np. <span className="text-amber-300 font-mono font-bold">"dziesiątka zbiórka w ataku, pudło za dwa"</span>).
            </p>
            <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 text-[11px] text-slate-400 space-y-1">
              <div className="font-semibold text-slate-200">Funkcje modułu głosowego:</div>
              <div>• Błyskawiczny lokalny parser polskiego słownictwa koszykarskiego (0ms opóźnienia)</div>
              <div>• Tryb ciągły (Hands-free) bez konieczności dotykania telefonu</div>
              <div>• Obsługa cofania akcji głosem (<span className="text-rose-400">"cofnij"</span>)</div>
              <div>• Awaryjne rozpoznawanie złożonych zdań modelem Gemini 3.8 Flash</div>
            </div>
          </div>

          {/* Dźwięki i wibracje */}
          <div className="bg-slate-950/80 p-3.5 rounded-xl border border-slate-800 flex items-center justify-between">
            <div>
              <span className="font-bold text-sm text-white block">Sygnały dźwiękowe i wibracje</span>
              <span className="text-slate-400">
                Sygrena syreny kwarty, potwierdzenia kliknięć na telefonie
              </span>
            </div>
            <button
              type="button"
              onClick={() => handleToggle('soundEffects')}
              className={`w-12 h-6 rounded-full transition p-1 flex items-center ${
                current.soundEffects ? 'bg-amber-500 justify-end' : 'bg-slate-800 justify-start'
              }`}
            >
              <span className="w-4 h-4 rounded-full bg-slate-950 shadow-md" />
            </button>
          </div>

          {/* Domyślny czas kwarty */}
          <div className="bg-slate-950/80 p-3.5 rounded-xl border border-slate-800 space-y-2">
            <span className="font-bold text-sm text-white block">Domyślny czas kwarty</span>
            <span className="text-slate-400 block">Domyślny czas kwarty dla meczów drużyny</span>
            <div className="grid grid-cols-2 gap-2 font-bold">
              <button
                type="button"
                onClick={() => {
                  const updated = { ...current, defaultQuarterMinutes: 8 };
                  setCurrent(updated);
                  onSaveSettings(updated);
                }}
                className={`py-2 rounded-lg border text-center transition ${
                  current.defaultQuarterMinutes === 8
                    ? 'bg-amber-500 text-slate-950 border-amber-400'
                    : 'bg-slate-900 border-slate-800 text-slate-300'
                }`}
              >
                4 x 8 min (Młodzież PZKosz)
              </button>
              <button
                type="button"
                onClick={() => {
                  const updated = { ...current, defaultQuarterMinutes: 10 };
                  setCurrent(updated);
                  onSaveSettings(updated);
                }}
                className={`py-2 rounded-lg border text-center transition ${
                  current.defaultQuarterMinutes === 10
                    ? 'bg-amber-500 text-slate-950 border-amber-400'
                    : 'bg-slate-900 border-slate-800 text-slate-300'
                }`}
              >
                4 x 10 min (FIBA Standard)
              </button>
            </div>
          </div>

          {/* Kod PIN Trenera */}
          <div className="bg-slate-950/80 p-3.5 rounded-xl border border-slate-800 space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Lock className="w-4 h-4 text-amber-400" />
                <span className="font-bold text-sm text-white">Kod PIN Trenera dla tego pokoju</span>
              </div>
              <span className="text-[10px] text-amber-400 font-bold bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/30">
                Bezpieczeństwo
              </span>
            </div>

            <p className="text-slate-400 text-xs leading-relaxed">
              Kod PIN zabezpiecza pokój Twojej drużyny przed niepowołaną edycją. Jest wymagany, aby trener mógł odblokować edycję na innym telefonie lub z trybu rodzica/widza.
            </p>

            <form onSubmit={handleSavePin} className="space-y-2 pt-1">
              <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                Kod PIN Trenera tego pokoju:
              </label>
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <input
                    type={showPin ? 'text' : 'password'}
                    value={pinInput}
                    onChange={(e) => {
                      setPinInput(e.target.value);
                      setPinSaved(false);
                    }}
                    maxLength={12}
                    placeholder="Wpisz Twój PIN"
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 pr-9 font-mono text-sm text-white font-bold tracking-widest focus:outline-none focus:border-amber-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPin(!showPin)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                    title={showPin ? 'Ukryj PIN' : 'Pokaż PIN'}
                  >
                    {showPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>

                <button
                  type="submit"
                  className={`px-4 py-2 rounded-xl font-bold text-xs flex items-center gap-1.5 transition active:scale-95 shrink-0 ${
                    pinSaved
                      ? 'bg-emerald-600 text-white'
                      : 'bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-md shadow-amber-950/30'
                  }`}
                >
                  {pinSaved ? (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>Zapisano!</span>
                    </>
                  ) : (
                    <>
                      <KeyRound className="w-3.5 h-3.5" />
                      <span>Zmień PIN</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>

          {/* Profil Klubu & Składy */}
          {onOpenClubProfile && (
            <div className="bg-slate-950/80 p-3.5 rounded-xl border border-amber-500/30 space-y-2">
              <div className="flex items-center gap-2 text-amber-400 font-bold">
                <Shield className="w-4 h-4" />
                <span>Profil Drużyny & Barwy</span>
              </div>
              <p className="text-slate-300 text-xs leading-relaxed">
                Zmień nazwę drużyny, wgraj własny herb, wybierz barwy lub szybko zaimportuj skład z tekstu/Excela.
              </p>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenClubProfile();
                }}
                className="w-full py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs flex items-center justify-center gap-1.5 transition active:scale-95 shadow-md shadow-amber-950/30"
              >
                <Shield className="w-3.5 h-3.5" />
                <span>Otwórz konfigurator klubu</span>
              </button>
            </div>
          )}

          {/* Sklep Google Play, Licencje & Prawa */}
          {onOpenLegalModal && (
            <div className="bg-slate-950/80 p-3.5 rounded-xl border border-indigo-500/30 space-y-2">
              <div className="flex items-center gap-2 text-indigo-400 font-bold">
                <Scale className="w-4 h-4" />
                <span>Sklep Google Play, Licencje & Prawa Autorskie</span>
              </div>
              <p className="text-slate-300 text-xs leading-relaxed">
                Instrukcja publikacji pakietu Android (.AAB) w sklepie Google, prawa do znaków towarowych oraz polityka prywatności RODO.
              </p>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenLegalModal();
                }}
                className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition active:scale-95 shadow-md shadow-indigo-950/30"
              >
                <Scale className="w-3.5 h-3.5" />
                <span>Przewodnik Google Play & Prawa</span>
              </button>
            </div>
          )}

          {/* Transfer & Kopia Zapasowa Danych */}
          {onOpenTransferModal && (
            <div className="bg-slate-950/80 p-3.5 rounded-xl border border-sky-500/30 space-y-2">
              <div className="flex items-center gap-2 text-sky-400 font-bold">
                <RefreshCw className="w-4 h-4" />
                <span>Przesyłanie danych (Telefon 📱 ⇄ Komputer 💻)</span>
              </div>
              <p className="text-slate-300 text-xs leading-relaxed">
                Przenieś mecze prowadzone na telefonie na komputer lub wyeksportuj kopię zapasową bazy danych do pliku JSON.
              </p>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenTransferModal();
                }}
                className="w-full py-2.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-xs flex items-center justify-center gap-1.5 transition active:scale-95 shadow-md shadow-sky-950/30"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Otwórz narzędzie transferu i synchronizacji</span>
              </button>
            </div>
          )}

          {/* PWA & Instalacja */}
          <div className="bg-gradient-to-br from-slate-950 to-slate-900 p-3.5 rounded-xl border border-amber-500/30 space-y-2">
            <div className="flex items-center gap-2 text-amber-400 font-bold">
              <Smartphone className="w-4 h-4" />
              <span>Instalacja PWA na telefonie</span>
            </div>
            <p className="text-slate-300 text-xs leading-relaxed">
              Aplikacja działa w trybie offline i może zostać dodana do ekranu głównego Androida lub iOS bez logowania i bez opłat.
            </p>
            <button
              type="button"
              onClick={() => setShowPwaGuide(true)}
              className="w-full py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs flex items-center justify-center gap-1.5 transition active:scale-95 shadow-md shadow-amber-950/30"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Pokaż instrukcję instalacji PWA</span>
            </button>
          </div>
        </div>

        <div className="mt-5 pt-3 border-t border-slate-800 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs transition"
          >
            Zamknij
          </button>
        </div>
      </div>

      <PWAInstallModal isOpen={showPwaGuide} onClose={() => setShowPwaGuide(false)} />
    </div>
  );
};

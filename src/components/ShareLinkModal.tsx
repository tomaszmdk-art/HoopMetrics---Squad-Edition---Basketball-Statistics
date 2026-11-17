import React, { useState, useEffect } from 'react';
import {
  X,
  Copy,
  Check,
  ExternalLink,
  ShieldCheck,
  Eye,
  EyeOff,
  Share2,
  CheckCircle2,
  MessageCircle,
  Link2,
  KeyRound,
  Lock,
} from 'lucide-react';
import { ClubProfile } from '../types/basketball';
import { playClickSound, triggerHaptic } from '../services/tts';
import {
  buildCoachRoomUrl,
  buildParentRoomUrl,
  getShareBaseOrigin,
  setShareBaseOrigin,
} from '../services/syncService';

interface ShareLinkModalProps {
  isOpen: boolean;
  onClose: () => void;
  roomId: string;
  coachToken?: string | null;
  isCoach?: boolean;
  coachPin?: string;
  justCreated?: boolean;
  onSwitchToSpectatorMode?: () => void;
  clubProfile?: ClubProfile;
}

export const ShareLinkModal: React.FC<ShareLinkModalProps> = ({
  isOpen,
  onClose,
  roomId,
  coachToken,
  isCoach = false,
  coachPin,
  justCreated = false,
  onSwitchToSpectatorMode,
  clubProfile,
}) => {
  const [copiedParent, setCopiedParent] = useState(false);
  const [copiedCoach, setCopiedCoach] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [showPinValue, setShowPinValue] = useState(false);
  const [baseOrigin, setBaseOrigin] = useState<string>(() => getShareBaseOrigin());
  const [isEditingOrigin, setIsEditingOrigin] = useState(false);
  const [originInput, setOriginInput] = useState('');

  useEffect(() => {
    if (isOpen) {
      const current = getShareBaseOrigin();
      setBaseOrigin(current);
      setOriginInput(current);
      setCopiedParent(false);
      setCopiedCoach(false);
      setCopiedCode(false);
      setShowPinValue(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const parentUrl = buildParentRoomUrl(roomId, baseOrigin);
  const coachUrl = coachToken ? buildCoachRoomUrl(roomId, coachToken, baseOrigin) : '';
  const clubDisplayName = clubProfile?.name || 'Drużyna Koszykarska';
  const clubSeason = clubProfile?.season || '2026/2027';

  const copyText = async (text: string, which: 'parent' | 'coach' | 'code') => {
    playClickSound();
    triggerHaptic(35);
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const el = document.createElement('textarea');
      el.value = text;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
    }
    if (which === 'parent') {
      setCopiedParent(true);
      setTimeout(() => setCopiedParent(false), 2500);
    } else if (which === 'coach') {
      setCopiedCoach(true);
      setTimeout(() => setCopiedCoach(false), 2500);
    } else {
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2500);
    }
  };

  const shareText = `🏀 Śledź na żywo wyniki i statystyki drużyny ${clubDisplayName}:\n${parentUrl}\n\nKod pokoju: ${roomId}`;
  const whatsappHref = `https://api.whatsapp.com/send?text=${encodeURIComponent(shareText)}`;

  const handleNativeShare = async () => {
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({
          title: `${clubDisplayName} — Statystyki na żywo`,
          text: `Śledź na żywo wyniki meczu i statystyki drużyny ${clubDisplayName} (Sezon ${clubSeason}):`,
          url: parentUrl,
        });
      } catch {
        // cancelled
      }
    } else {
      copyText(parentUrl, 'parent');
    }
  };

  const handleSaveOrigin = () => {
    playClickSound();
    setShareBaseOrigin(originInput);
    setBaseOrigin(getShareBaseOrigin());
    setIsEditingOrigin(false);
  };

  const handleResetOrigin = () => {
    playClickSound();
    setShareBaseOrigin(null);
    const fallback = getShareBaseOrigin();
    setBaseOrigin(fallback);
    setOriginInput(fallback);
    setIsEditingOrigin(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/90">
      <div className="w-full max-w-lg rounded-3xl bg-slate-900 border border-slate-800 shadow-2xl text-slate-100 overflow-hidden my-auto max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="p-4 sm:p-5 bg-gradient-to-r from-slate-950 via-slate-900 to-amber-950/40 border-b border-slate-800 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400">
              <Share2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black text-white">
                {justCreated ? 'Pokój drużyny gotowy!' : 'Linki Dostępu do Pokoju'}
              </h2>
              <p className="text-xs text-amber-400 font-semibold">
                {clubDisplayName} • Kod: <span className="font-mono">{roomId}</span>
              </p>
            </div>
          </div>

          <button
            onClick={() => {
              playClickSound();
              onClose();
            }}
            className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 sm:p-6 space-y-4 text-xs overflow-y-auto flex-1">
          {justCreated && (
            <div className="p-3.5 rounded-2xl bg-emerald-500/15 border border-emerald-500/40 text-emerald-200 flex items-start gap-2.5">
              <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <div className="font-bold text-emerald-300">
                  Utworzono prywatny pokój Twojej drużyny!
                </div>
                <p className="text-[11px] text-slate-300 leading-relaxed">
                  Wyślij poniżej <strong>Link dla Rodziców</strong> na grupę drużynową, a swój <strong>Link Trenera / PIN</strong> zachowaj dla siebie lub drugiego statystyka.
                </p>
              </div>
            </div>
          )}

          {/* Room Code Quick Copy */}
          <div className="flex items-center justify-between gap-2 p-3 rounded-xl bg-slate-950 border border-slate-800">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                Kod pokoju drużyny
              </span>
              <span className="font-mono font-black text-sm text-amber-300">{roomId}</span>
            </div>
            <button
              type="button"
              onClick={() => copyText(roomId, 'code')}
              className={`px-3 py-1.5 rounded-lg font-bold text-xs flex items-center gap-1.5 transition ${
                copiedCode
                  ? 'bg-emerald-600 text-white'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-200'
              }`}
            >
              {copiedCode ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedCode ? 'Skopiowano' : 'Kopiuj kod'}</span>
            </button>
          </div>

          {/* 1. PARENT / SPECTATOR LINK */}
          <div className="p-4 rounded-2xl bg-slate-950/90 border border-emerald-500/30 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 font-bold text-emerald-300 text-xs sm:text-sm">
                <Eye className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Link dla Rodziców i Kibiców (Podgląd Live)</span>
              </div>
              <button
                type="button"
                onClick={() => setIsEditingOrigin(!isEditingOrigin)}
                className="text-[10px] text-slate-400 hover:text-amber-300 underline shrink-0"
              >
                {isEditingOrigin ? 'Ukryj domenę' : 'Zmień domenę'}
              </button>
            </div>

            {isEditingOrigin && (
              <div className="space-y-2 p-2.5 rounded-xl bg-slate-900 border border-slate-700">
                <label className="text-[10px] text-slate-400 block">
                  Adres opublikowanej aplikacji (domena bazowa):
                </label>
                <input
                  type="text"
                  value={originInput}
                  onChange={(e) => setOriginInput(e.target.value)}
                  placeholder="https://twoja-aplikacja.ai.studio"
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 font-mono text-xs text-white focus:outline-none focus:border-amber-400"
                />
                <div className="flex items-center gap-2 justify-end">
                  <button
                    type="button"
                    onClick={handleResetOrigin}
                    className="px-2.5 py-1 rounded bg-slate-800 text-slate-300 hover:text-white text-[11px]"
                  >
                    Bieżący adres
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveOrigin}
                    className="px-3 py-1 rounded bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-[11px]"
                  >
                    Zapisz
                  </button>
                </div>
              </div>
            )}

            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={parentUrl}
                className="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 font-mono text-xs text-emerald-300 focus:outline-none select-all"
              />
              <button
                type="button"
                onClick={() => copyText(parentUrl, 'parent')}
                className={`py-2 px-3.5 rounded-xl font-bold flex items-center gap-1.5 transition active:scale-95 shrink-0 ${
                  copiedParent
                    ? 'bg-emerald-600 text-white'
                    : 'bg-emerald-500 hover:bg-emerald-400 text-slate-950'
                }`}
              >
                {copiedParent ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                <span>{copiedParent ? 'Skopiowano!' : 'Kopiuj'}</span>
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <a
                href={whatsappHref}
                target="_blank"
                rel="noopener noreferrer"
                className="py-2.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold flex items-center justify-center gap-2 transition active:scale-95"
              >
                <MessageCircle className="w-4 h-4 fill-current" />
                <span>Wyślij na WhatsApp</span>
              </a>

              {typeof navigator !== 'undefined' && 'share' in navigator ? (
                <button
                  type="button"
                  onClick={handleNativeShare}
                  className="py-2.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold flex items-center justify-center gap-2 transition border border-slate-700"
                >
                  <Share2 className="w-4 h-4 text-amber-400" />
                  <span>Udostępnij (SMS / Inne)</span>
                </button>
              ) : (
                <a
                  href={parentUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="py-2.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-emerald-300 font-bold flex items-center justify-center gap-2 transition border border-slate-700"
                >
                  <ExternalLink className="w-4 h-4" />
                  <span>Otwórz podgląd</span>
                </a>
              )}
            </div>
          </div>

          {/* 2. COACH / STATISTICIAN LINK & PIN (ONLY FOR AUTHENTICATED COACH) */}
          {isCoach && coachToken && (
            <div className="p-4 rounded-2xl bg-slate-950/90 border border-amber-500/40 space-y-3">
              <div className="flex items-center gap-2 font-bold text-amber-300 text-xs sm:text-sm">
                <Lock className="w-4 h-4 text-amber-400 shrink-0" />
                <span>Link & PIN dla Trenera / Statystyka (Edycja)</span>
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Zachowaj ten link prywatnie. Daje pełne uprawnienia do prowadzenia meczu na żywo, edycji składu oraz ustawień drużyny na innym telefonie lub komputerze.
              </p>

              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={coachUrl}
                  className="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 font-mono text-xs text-amber-300 focus:outline-none select-all"
                />
                <button
                  type="button"
                  onClick={() => copyText(coachUrl, 'coach')}
                  className={`py-2 px-3.5 rounded-xl font-bold flex items-center gap-1.5 transition active:scale-95 shrink-0 ${
                    copiedCoach
                      ? 'bg-emerald-600 text-white'
                      : 'bg-amber-500 hover:bg-amber-400 text-slate-950'
                  }`}
                >
                  {copiedCoach ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  <span>{copiedCoach ? 'Skopiowano!' : 'Kopiuj'}</span>
                </button>
              </div>

              {coachPin && (
                <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-slate-900 border border-slate-800">
                  <div className="flex items-center gap-2">
                    <KeyRound className="w-3.5 h-3.5 text-amber-400" />
                    <span className="text-slate-400">Kod PIN pokoju:</span>
                    <span className="font-mono font-black text-white tracking-widest">
                      {showPinValue ? coachPin : '••••'}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowPinValue(!showPinValue)}
                    className="text-slate-400 hover:text-white flex items-center gap-1 text-[11px]"
                  >
                    {showPinValue ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    <span>{showPinValue ? 'Ukryj' : 'Pokaż'}</span>
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Security note */}
          <div className="p-3.5 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-1.5">
            <div className="font-bold text-slate-200 flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span>Izolacja i bezpieczeństwo pokoju:</span>
            </div>
            <p className="text-slate-400 text-[11px] leading-relaxed">
              Rodzice otwierający link podglądu widzą wynik na żywo i statystyki wyłącznie tej drużyny, bez możliwości zmiany wyniku czy składu. W tym samym czasie inne drużyny mogą prowadzić swoje mecze w osobnych pokojach.
            </p>
          </div>

          {isCoach && onSwitchToSpectatorMode && (
            <button
              type="button"
              onClick={() => {
                playClickSound();
                onClose();
                onSwitchToSpectatorMode();
              }}
              className="w-full py-2.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-300 border border-amber-500/30 font-bold flex items-center justify-center gap-1.5 transition active:scale-95"
            >
              <Eye className="w-4 h-4 text-amber-400" />
              <span>Zablokuj edycję na tym urządzeniu (Tryb Rodzica)</span>
            </button>
          )}
        </div>

        {/* Footer */}
        <div className="p-3 bg-slate-950 border-t border-slate-800 text-center shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="w-full py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs transition"
          >
            Zamknij
          </button>
        </div>
      </div>
    </div>
  );
};

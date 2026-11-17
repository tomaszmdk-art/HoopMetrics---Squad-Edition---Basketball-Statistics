import React from 'react';
import { Match } from '../types/basketball';
import { Edit3, AlertCircle, Calendar, ShieldCheck, X, CheckCircle2 } from 'lucide-react';
import { playClickSound, triggerHaptic } from '../services/tts';

interface ResumeMatchConfirmModalProps {
  isOpen: boolean;
  match: Match | null;
  clubName?: string;
  onClose: () => void;
  onConfirm: (match: Match) => void;
}

export const ResumeMatchConfirmModal: React.FC<ResumeMatchConfirmModalProps> = ({
  isOpen,
  match,
  clubName = 'Nasz Zespół',
  onClose,
  onConfirm,
}) => {
  if (!isOpen || !match) return null;

  const handleConfirm = () => {
    playClickSound();
    triggerHaptic(40);
    onConfirm(match);
  };

  const handleCancel = () => {
    playClickSound();
    triggerHaptic(20);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/90">
      <div className="w-full max-w-md rounded-3xl bg-slate-900 border border-slate-800 p-5 sm:p-6 shadow-2xl text-slate-100 space-y-5">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 shrink-0 shadow-lg shadow-amber-950/40">
              <Edit3 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-black text-white tracking-tight">
                Edycja zakończonego meczu
              </h3>
              <p className="text-xs text-amber-400 font-medium">
                Potwierdzenie odblokowania protokołu
              </p>
            </div>
          </div>
          <button
            onClick={handleCancel}
            className="p-1 rounded-xl text-slate-400 hover:text-white transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Match Info Card */}
        <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span className="font-bold text-amber-400">{match.teamCategory}</span>
            <span className="flex items-center gap-1 font-mono text-[11px]">
              <Calendar className="w-3 h-3 text-slate-500" />
              {match.date} • {match.location || 'Dom'}
            </span>
          </div>

          <div className="flex items-center justify-between py-1">
            <div className="text-left max-w-[40%]">
              <div className="text-[11px] text-slate-400 font-bold uppercase truncate">{clubName}</div>
              <div className="text-2xl font-black text-amber-400 font-mono">{match.ourScore}</div>
            </div>
            <div className="text-xl font-black text-slate-600">:</div>
            <div className="text-right max-w-[40%]">
              <div className="text-[11px] text-slate-400 font-bold uppercase truncate">{match.opponent}</div>
              <div className="text-2xl font-black text-white font-mono">{match.opponentScore}</div>
            </div>
          </div>

          <div className="text-[11px] text-slate-400 font-mono pt-1 border-t border-slate-800/80 flex items-center justify-between">
            <span>Stan: Zakończony</span>
            <span>{match.events.length} akcji w protokole</span>
          </div>
        </div>

        {/* Notice text */}
        <div className="flex items-start gap-2.5 p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-200/90 leading-relaxed">
          <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <p>
            Ten mecz został oznaczony jako <strong>zakończony</strong>. Odblokowanie przeniesie Cię do aktywnego panelu meczowego na żywo, gdzie będziesz mógł dokonać poprawek punktów, fauli, zmian lub czasu gry.
          </p>
        </div>

        {/* Buttons */}
        <div className="flex items-center gap-3 pt-1">
          <button
            type="button"
            onClick={handleCancel}
            className="flex-1 py-3 px-4 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs transition active:scale-95 text-center"
          >
            Anuluj
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            className="flex-1 py-3 px-4 rounded-2xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 font-black text-xs transition shadow-lg shadow-amber-950/40 active:scale-95 flex items-center justify-center gap-1.5"
          >
            <CheckCircle2 className="w-4 h-4 text-slate-950" />
            <span>Tak, edytuj mecz</span>
          </button>
        </div>
      </div>
    </div>
  );
};

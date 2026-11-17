import React, { useState } from 'react';
import { X, Lock, ShieldAlert } from 'lucide-react';
import { playClickSound, triggerHaptic } from '../services/tts';

interface CoachPinModalProps {
  isOpen: boolean;
  onClose: () => void;
  onVerifyPin?: (pin: string) => Promise<{ ok: boolean; error?: string }>;
  onSuccess?: () => void;
  expectedPin?: string;
  teamName?: string;
}

export const CoachPinModal: React.FC<CoachPinModalProps> = ({
  isOpen,
  onClose,
  onVerifyPin,
  onSuccess,
  expectedPin,
  teamName,
}) => {
  const [pin, setPin] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pin.trim() || isVerifying) return;

    playClickSound();
    triggerHaptic(30);
    setErrorMsg(null);

    if (onVerifyPin) {
      setIsVerifying(true);
      try {
        const res = await onVerifyPin(pin.trim());
        if (res.ok) {
          setPin('');
          setErrorMsg(null);
          onSuccess?.();
        } else {
          setErrorMsg(res.error || 'Nieprawidłowy kod PIN trenera. Spróbuj ponownie.');
          triggerHaptic(100);
        }
      } finally {
        setIsVerifying(false);
      }
      return;
    }

    const targetPin = expectedPin?.trim() || '';
    if (targetPin && pin.trim() === targetPin) {
      setErrorMsg(null);
      setPin('');
      onSuccess?.();
    } else {
      setErrorMsg('Nieprawidłowy kod PIN trenera. Spróbuj ponownie.');
      triggerHaptic(100);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/90">
      <div className="w-full max-w-sm rounded-3xl bg-slate-900 border border-slate-800 shadow-2xl text-slate-100 overflow-hidden my-auto p-5">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400">
              <Lock className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Logowanie Trenera</h3>
              {teamName && (
                <p className="text-[10px] text-amber-400 font-semibold truncate max-w-[200px]">
                  {teamName}
                </p>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <p className="text-xs text-slate-300 leading-relaxed">
            Wprowadź kod PIN trenera tego pokoju, aby odblokować prowadzenie meczu na żywo, edycję składu i ustawień.
          </p>

          <div>
            <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">
              Kod PIN Trenera:
            </label>
            <input
              type="password"
              autoFocus
              maxLength={16}
              value={pin}
              onChange={(e) => {
                setPin(e.target.value);
                setErrorMsg(null);
              }}
              placeholder="Wprowadź kod PIN"
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2.5 text-center text-xl font-mono tracking-widest text-white focus:outline-none focus:border-amber-500"
            />
            {errorMsg && (
              <p className="text-xs text-rose-400 font-semibold mt-1.5 flex items-center gap-1">
                <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
                <span>{errorMsg}</span>
              </p>
            )}
          </div>

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs transition"
            >
              Anuluj
            </button>
            <button
              type="submit"
              disabled={isVerifying || !pin.trim()}
              className="flex-1 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 font-bold text-xs transition shadow-md shadow-amber-950/40"
            >
              {isVerifying ? 'Sprawdzam...' : 'Odblokuj'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

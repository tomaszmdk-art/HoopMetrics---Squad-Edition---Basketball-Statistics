import React, { useState } from 'react';
import { Match, Player } from '../types/basketball';
import {
  AlertTriangle,
  CheckCircle2,
  X,
  Clock,
  Trophy,
  ShieldAlert,
  ArrowRight,
  HelpCircle,
  FileText,
  Shield,
  UserCheck,
} from 'lucide-react';
import { exportMatchPdf } from '../services/exportPdf';
import { hasAnyPersonalData } from '../services/playerDisplay';
import { playClickSound, triggerHaptic } from '../services/tts';

interface FinishMatchModalProps {
  isOpen: boolean;
  match: Match;
  rosterPlayers: Player[];
  onConfirmFinish: () => void;
  onCancel: () => void;
}

export const FinishMatchModal: React.FC<FinishMatchModalProps> = ({
  isOpen,
  match,
  rosterPlayers,
  onConfirmFinish,
  onCancel,
}) => {
  const [confirmedChecked, setConfirmedChecked] = useState(false);
  const [includePersonalData, setIncludePersonalData] = useState(false);

  if (!isOpen) return null;
  const hasPii = hasAnyPersonalData(rosterPlayers);

  const isClockRunning = match.isClockRunning;
  const isFinalQuarter = match.currentQuarter >= 4;
  const isClockZero = match.clockSeconds === 0;

  // Potential warnings for the coach/scorer
  const warnings: string[] = [];
  if (isClockRunning) {
    warnings.push('Zegar meczowy wciąż tyka! Zatrzymaj zegar przed oficjalnym zakończeniem.');
  }
  if (!isFinalQuarter) {
    warnings.push(`Trwa dopiero kwarta ${match.currentQuarter} z 4. Oficjalny mecz zazwyczaj kończy się po 4. kwarcie.`);
  }
  if (match.events.length === 0) {
    warnings.push('W meczu nie zarejestrowano jeszcze żadnego zdarzenia ani rzutu.');
  }
  if (match.ourScore === match.opponentScore && match.ourScore > 0) {
    warnings.push('Wynik jest remisowy. W koszykówce w przypadku remisu rozgrywa się 5-minutową dogrywkę (OT).');
  }

  const handleFinish = () => {
    playClickSound();
    triggerHaptic(50);
    onConfirmFinish();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/90">
      <div className="w-full max-w-lg rounded-3xl bg-slate-900 border-2 border-amber-500/40 p-5 sm:p-6 shadow-2xl text-slate-100 flex flex-col space-y-5">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-black text-white">
                Potwierdzenie Zakończenia Meczu
              </h2>
              <p className="text-xs text-slate-400">
                Mecz {match.teamCategory && match.teamCategory !== 'TEAM' ? `${match.teamCategory} ` : ''}vs {match.opponent}
              </p>
            </div>
          </div>
          <button
            onClick={onCancel}
            className="p-1 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Current Score Review Box */}
        <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 text-center">
          <span className="text-[11px] font-black uppercase tracking-wider text-slate-400 block mb-1">
            Oficjalny wynik końcowy do protokołu:
          </span>
          <div className="flex items-center justify-center gap-4 py-1">
            <div className="text-right">
              <span className="text-xs font-bold text-slate-400 block">GOSPODARZE</span>
              <span className="text-3xl sm:text-4xl font-black text-amber-400">{match.ourScore}</span>
            </div>
            <span className="text-2xl font-black text-slate-600">:</span>
            <div className="text-left">
              <span className="text-xs font-bold text-slate-400 block uppercase truncate max-w-[150px]">{match.opponent}</span>
              <span className="text-3xl sm:text-4xl font-black text-white">{match.opponentScore}</span>
            </div>
          </div>
          <div className="text-xs text-slate-400 font-mono mt-2">
            Status: Kwarta {match.currentQuarter} • Czas {Math.floor(match.clockSeconds / 60)}:{(match.clockSeconds % 60).toString().padStart(2, '0')} • Akcji: {match.events.length}
          </div>
        </div>

        {/* Warnings list if any */}
        {warnings.length > 0 && (
          <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs space-y-2">
            <div className="flex items-center gap-2 font-bold">
              <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400" />
              <span>Uwaga! Sprawdź przed finalizacją:</span>
            </div>
            <ul className="list-disc list-inside space-y-1 text-slate-300 pl-1">
              {warnings.map((w, idx) => (
                <li key={idx}>{w}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Explicit confirmation checkbox to prevent accidental clicks */}
        <label className="flex items-start gap-3 p-3 rounded-xl bg-slate-950/60 border border-slate-800 cursor-pointer select-none hover:border-slate-700 transition">
          <input
            type="checkbox"
            checked={confirmedChecked}
            onChange={(e) => setConfirmedChecked(e.target.checked)}
            className="mt-0.5 w-4 h-4 rounded bg-slate-800 border-slate-700 text-amber-500 focus:ring-amber-400 cursor-pointer"
          />
          <div className="text-xs text-slate-300 leading-snug">
            <strong className="text-white">Potwierdzam wynik meczu.</strong>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Po zatwierdzeniu mecz zostanie przeniesiony do historii spotkań, a statystyki zostaną zliczone do średnich sezonowych. (W każdej chwili będziesz mógł wznowić mecz z historii).
            </p>
          </div>
        </label>

        <div className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800 flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs font-semibold text-slate-300">
            Tryb raportu PDF:
          </span>
          <div className="flex flex-col items-start sm:items-end gap-1">
            <div className="inline-flex items-center gap-1 p-0.5 rounded-lg bg-slate-900 border border-slate-800">
              <button
                type="button"
                onClick={() => setIncludePersonalData(false)}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-bold transition ${
                  !includePersonalData
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                    : 'text-slate-400 hover:text-slate-200 border border-transparent'
                }`}
              >
                <Shield className="w-3 h-3" />
                <span>Zanonimizowany (nr)</span>
              </button>
              <button
                type="button"
                onClick={() => setIncludePersonalData(true)}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-bold transition ${
                  includePersonalData
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                    : 'text-slate-400 hover:text-slate-200 border border-transparent'
                }`}
              >
                <UserCheck className="w-3 h-3" />
                <span>Pełny (nazwiska/zdjęcia)</span>
              </button>
            </div>
            {includePersonalData && !hasPii && (
              <span className="text-[10px] text-amber-300/90">
                Brak lokalnych nazwisk/zdjęć — PDF użyje numerów zawodników.
              </span>
            )}
          </div>
        </div>

        {/* Modal Action Buttons */}
        <div className="flex flex-col-reverse sm:flex-row items-center justify-end gap-2.5 pt-2">
          <button
            type="button"
            onClick={() => {
              playClickSound();
              triggerHaptic(20);
              exportMatchPdf(match, rosterPlayers, {
                includeBoxScore: true,
                includePlayByPlay: true,
                includePlayerPages: true,
                includePersonalData,
              });
            }}
            className="w-full sm:w-auto py-2.5 px-3.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 text-xs font-bold transition flex items-center justify-center gap-1.5"
            title="Pobierz oficjalny raport PDF przed zakończeniem"
          >
            <FileText className="w-3.5 h-3.5 text-amber-400" />
            <span>Pobierz PDF</span>
          </button>

          <button
            onClick={onCancel}
            className="w-full sm:w-auto py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold transition"
          >
            Wróć do meczu (Anuluj)
          </button>

          <button
            onClick={handleFinish}
            disabled={!confirmedChecked}
            className="w-full sm:w-auto py-3 px-6 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-black text-xs shadow-lg shadow-emerald-950/50 transition flex items-center justify-center gap-2"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>Zatwierdź i Zakończ Mecz</span>
          </button>
        </div>
      </div>
    </div>
  );
};

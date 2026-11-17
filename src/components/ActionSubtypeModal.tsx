import React from 'react';
import { ActionType, Player } from '../types/basketball';
import { EXTENDED_ACTION_CONFIG, ActionSubOption } from '../services/extendedStatsConfig';
import { useLanguage } from '../i18n/LanguageContext';
import { X, Zap, ArrowRight, Shield } from 'lucide-react';
import { playClickSound, triggerHaptic } from '../services/tts';

interface ActionSubtypeModalProps {
  isOpen: boolean;
  actionType: ActionType | null;
  player: Player | null;
  onSelectSubtype: (subtype?: string) => void;
  onClose: () => void;
}

export const ActionSubtypeModal: React.FC<ActionSubtypeModalProps> = ({
  isOpen,
  actionType,
  player,
  onSelectSubtype,
  onClose,
}) => {
  const { language } = useLanguage();

  if (!isOpen || !actionType) return null;

  const config = EXTENDED_ACTION_CONFIG[actionType];
  if (!config) return null;

  const getSubOptionLabel = (opt: ActionSubOption) => {
    switch (language) {
      case 'en':
        return opt.enLabel;
      case 'de':
        return opt.deLabel;
      case 'fr':
        return opt.frLabel;
      case 'zh':
        return opt.zhLabel;
      case 'it':
        return opt.itLabel;
      case 'pl':
      default:
        return opt.label;
    }
  };

  const title = language === 'pl' ? config.title : config.enTitle;
  const subtitle = language === 'pl' ? config.subtitle : config.enSubtitle;

  const handlePick = (opt: ActionSubOption) => {
    playClickSound();
    triggerHaptic(30);
    // When Polish is selected, store the Polish label, otherwise store localized or English label
    const chosenLabel = language === 'pl' ? opt.label : opt.enLabel;
    onSelectSubtype(chosenLabel);
  };

  const handleQuickSkip = () => {
    playClickSound();
    triggerHaptic(20);
    onSelectSubtype(undefined); // Record basic action without subType
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2.5 sm:p-4 bg-slate-950/90 overflow-y-auto">
      <div className="w-full max-w-lg bg-slate-900 border border-slate-700/80 rounded-3xl shadow-2xl text-slate-100 flex flex-col max-h-[92vh] overflow-hidden my-auto">
        {/* Header Bar */}
        <div className="p-3.5 sm:p-4 border-b border-slate-800 bg-slate-950/90 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            {player?.photo ? (
              <div className="relative w-11 h-11 rounded-2xl overflow-hidden border border-amber-400/50 shadow shrink-0 bg-slate-950">
                <img
                  src={player.photo}
                  alt={player.lastName}
                  className="w-full h-full object-cover"
                />
                <span className="absolute bottom-0 right-0 bg-slate-950/90 text-amber-400 text-[9px] font-mono font-black px-1 rounded-tl">
                  #{player.number}
                </span>
              </div>
            ) : player ? (
              <div className="w-11 h-11 rounded-2xl bg-amber-500/20 border border-amber-500/40 text-amber-400 flex flex-col items-center justify-center font-mono font-black text-xs shrink-0">
                <span className="text-[7px] text-slate-400 leading-none">NR</span>
                <span className="text-sm leading-none">#{player.number}</span>
              </div>
            ) : null}

            <div className="min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <h3 className="text-sm sm:text-base font-black text-white tracking-tight truncate">
                  {title}
                </h3>
                {player && (
                  <span className="text-xs font-mono font-bold text-amber-400 px-1.5 py-0.2 rounded bg-amber-400/10 border border-amber-400/20 truncate">
                    #{player.number} {player.lastName}
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-400 font-medium truncate">{subtitle}</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition shrink-0 ml-2"
            title="Anuluj akcję"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Sub-Options Grid */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-2">
          <div className="grid grid-cols-1 xs:grid-cols-2 gap-2">
            {config.options.map((opt) => {
              const label = getSubOptionLabel(opt);
              return (
                <button
                  key={opt.id}
                  onClick={() => handlePick(opt)}
                  className="p-3 rounded-2xl bg-slate-950/70 hover:bg-slate-800 border border-slate-800 hover:border-amber-400/60 text-left transition active:scale-95 group flex items-start gap-2.5 shadow-sm"
                >
                  <span className="text-xl shrink-0 group-hover:scale-110 transition-transform">
                    {opt.icon}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-xs sm:text-sm font-bold text-slate-200 group-hover:text-amber-300 leading-snug">
                      {label}
                    </div>
                    {opt.tag && (
                      <span className="inline-block mt-1 text-[9px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-slate-800 group-hover:bg-amber-400/20 text-slate-400 group-hover:text-amber-300 border border-slate-700/60 group-hover:border-amber-400/40">
                        {opt.tag}
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Footer: Quick Basic Save (Skip subtype) & Cancel */}
        <div className="p-3 sm:p-3.5 border-t border-slate-800 bg-slate-950/95 flex items-center justify-between gap-2 shrink-0">
          <button
            onClick={onClose}
            className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition active:scale-95"
          >
            {language === 'pl' ? 'Anuluj' : 'Cancel'}
          </button>

          <button
            onClick={handleQuickSkip}
            className="flex-1 py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 border border-amber-500/30 text-amber-300 font-bold text-xs flex items-center justify-center gap-1.5 transition active:scale-95 shadow-sm"
            title="Zapisz samą akcję bez uszczegóławiania"
          >
            <Zap className="w-3.5 h-3.5 text-amber-400 fill-current" />
            <span>
              {language === 'pl'
                ? 'Zapisz ogólnie (bez szczegółu)'
                : 'Quick Save (No details)'}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};

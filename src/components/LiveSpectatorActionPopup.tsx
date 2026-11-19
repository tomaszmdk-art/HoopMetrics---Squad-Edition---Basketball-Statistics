import React, { useEffect, useRef } from 'react';
import { ClubProfile, Match, MatchEvent, Player } from '../types/basketball';
import { X, Clock } from 'lucide-react';
import {
  findPlayerForEvent,
  getPlayerFullName,
  resolveEventAssistLabel,
  resolveSubstitutionLabels,
} from '../services/playerDisplay';

interface LiveSpectatorActionPopupProps {
  event: MatchEvent | null;
  match: Match;
  players?: Player[];
  clubProfile?: ClubProfile;
  onClose: () => void;
  durationMs?: number;
}

export const PROTOCOL_ACTION_META: Record<
  string,
  { label: string; badgeClass: string; borderClass: string; glowClass: string; icon: string; category: string }
> = {
  '2PT_MADE': {
    label: 'Celny rzut za 2 punkty (+2)',
    badgeClass: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
    borderClass: 'border-emerald-500/60',
    glowClass: 'shadow-emerald-500/20',
    icon: '🏀',
    category: 'score',
  },
  '2PT_MISS': {
    label: 'Niecelny rzut za 2 punkty',
    badgeClass: 'bg-slate-800 text-slate-300 border-slate-700',
    borderClass: 'border-slate-700',
    glowClass: 'shadow-slate-900/40',
    icon: '❌',
    category: 'miss',
  },
  '3PT_MADE': {
    label: 'Celny rzut za 3 punkty (+3)',
    badgeClass: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
    borderClass: 'border-amber-500/70',
    glowClass: 'shadow-amber-500/30',
    icon: '🔥',
    category: 'score',
  },
  '3PT_MISS': {
    label: 'Niecelny rzut za 3 punkty',
    badgeClass: 'bg-slate-800 text-slate-300 border-slate-700',
    borderClass: 'border-slate-700',
    glowClass: 'shadow-slate-900/40',
    icon: '❌',
    category: 'miss',
  },
  'FT_MADE': {
    label: 'Celny rzut wolny (+1)',
    badgeClass: 'bg-teal-500/20 text-teal-300 border-teal-500/40',
    borderClass: 'border-teal-500/60',
    glowClass: 'shadow-teal-500/20',
    icon: '🎯',
    category: 'score',
  },
  'FT_MISS': {
    label: 'Niecelny rzut wolny',
    badgeClass: 'bg-slate-800 text-slate-300 border-slate-700',
    borderClass: 'border-slate-700',
    glowClass: 'shadow-slate-900/40',
    icon: '❌',
    category: 'miss',
  },
  'OFF_REB': {
    label: 'Zbiórka w ataku (ofensywna)',
    badgeClass: 'bg-blue-500/20 text-blue-300 border-blue-500/40',
    borderClass: 'border-blue-500/60',
    glowClass: 'shadow-blue-500/20',
    icon: '📦',
    category: 'rebound',
  },
  'DEF_REB': {
    label: 'Zbiórka w obronie (defensywna)',
    badgeClass: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40',
    borderClass: 'border-indigo-500/60',
    glowClass: 'shadow-indigo-500/20',
    icon: '🛡️',
    category: 'rebound',
  },
  'ASSIST': {
    label: 'Asysta',
    badgeClass: 'bg-sky-500/20 text-sky-300 border-sky-500/40',
    borderClass: 'border-sky-500/60',
    glowClass: 'shadow-sky-500/20',
    icon: '🔄',
    category: 'assist',
  },
  'STEAL': {
    label: 'Przechwyt piłki',
    badgeClass: 'bg-violet-500/20 text-violet-300 border-violet-500/40',
    borderClass: 'border-violet-500/60',
    glowClass: 'shadow-violet-500/20',
    icon: '⚡',
    category: 'defense',
  },
  'BLOCK': {
    label: 'Blok rzutu',
    badgeClass: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40',
    borderClass: 'border-cyan-500/60',
    glowClass: 'shadow-cyan-500/20',
    icon: '🛑',
    category: 'defense',
  },
  'TURNOVER': {
    label: 'Strata piłki',
    badgeClass: 'bg-amber-600/20 text-amber-300 border-amber-600/40',
    borderClass: 'border-amber-600/60',
    glowClass: 'shadow-amber-600/20',
    icon: '⚠️',
    category: 'turnover',
  },
  'FOUL': {
    label: 'Faul osobisty',
    badgeClass: 'bg-rose-500/20 text-rose-300 border-rose-500/40',
    borderClass: 'border-rose-500/70',
    glowClass: 'shadow-rose-500/30',
    icon: '🚫',
    category: 'foul',
  },
  'OPP_1PT': {
    label: 'Punkt przeciwnika (+1)',
    badgeClass: 'bg-orange-500/20 text-orange-300 border-orange-500/40',
    borderClass: 'border-orange-500/60',
    glowClass: 'shadow-orange-500/20',
    icon: '🎯',
    category: 'score',
  },
  'OPP_2PT': {
    label: 'Kosz przeciwnika (+2)',
    badgeClass: 'bg-orange-500/20 text-orange-300 border-orange-500/40',
    borderClass: 'border-orange-500/60',
    glowClass: 'shadow-orange-500/20',
    icon: '🏀',
    category: 'score',
  },
  'OPP_3PT': {
    label: 'Trójka przeciwnika (+3)',
    badgeClass: 'bg-orange-500/20 text-orange-300 border-orange-500/40',
    borderClass: 'border-orange-500/70',
    glowClass: 'shadow-orange-500/30',
    icon: '🔥',
    category: 'score',
  },
  'OPP_MINUS_1': {
    label: 'Korekta punktów przeciwnika (-1)',
    badgeClass: 'bg-slate-800 text-slate-300 border-slate-700',
    borderClass: 'border-slate-700',
    glowClass: 'shadow-slate-900/40',
    icon: '✏️',
    category: 'score',
  },
  'OPP_FOUL': {
    label: 'Faul przeciwnika',
    badgeClass: 'bg-rose-500/20 text-rose-300 border-rose-500/40',
    borderClass: 'border-rose-500/60',
    glowClass: 'shadow-rose-500/20',
    icon: '🚫',
    category: 'foul',
  },
  'MANUAL_OUR_PLUS_1': {
    label: 'Ręczna korekta punktowa (+1)',
    badgeClass: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
    borderClass: 'border-amber-500/60',
    glowClass: 'shadow-amber-500/20',
    icon: '✏️',
    category: 'score',
  },
  'MANUAL_OUR_PLUS_2': {
    label: 'Ręczna korekta punktowa (+2)',
    badgeClass: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
    borderClass: 'border-amber-500/60',
    glowClass: 'shadow-amber-500/20',
    icon: '✏️',
    category: 'score',
  },
  'MANUAL_OUR_PLUS_3': {
    label: 'Ręczna korekta punktowa (+3)',
    badgeClass: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
    borderClass: 'border-amber-500/60',
    glowClass: 'shadow-amber-500/20',
    icon: '✏️',
    category: 'score',
  },
  'MANUAL_OUR_MINUS_1': {
    label: 'Ręczna korekta punktowa (-1)',
    badgeClass: 'bg-slate-800 text-slate-300 border-slate-700',
    borderClass: 'border-slate-700',
    glowClass: 'shadow-slate-900/40',
    icon: '✏️',
    category: 'score',
  },
  'SUBSTITUTION': {
    label: 'Zmiana zawodnika',
    badgeClass: 'bg-orange-500/20 text-orange-300 border-orange-500/40',
    borderClass: 'border-orange-500/60',
    glowClass: 'shadow-orange-500/20',
    icon: '🔄',
    category: 'substitution',
  },
  'SUB_IN': {
    label: 'Wejście na parkiet',
    badgeClass: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
    borderClass: 'border-emerald-500/60',
    glowClass: 'shadow-emerald-500/20',
    icon: '⬆️',
    category: 'substitution',
  },
  'SUB_OUT': {
    label: 'Zejście na ławkę',
    badgeClass: 'bg-slate-800 text-slate-300 border-slate-700',
    borderClass: 'border-slate-700',
    glowClass: 'shadow-slate-900/40',
    icon: '⬇️',
    category: 'substitution',
  },
};

export const LiveSpectatorActionPopup: React.FC<LiveSpectatorActionPopupProps> = ({
  event,
  match,
  players = [],
  clubProfile,
  onClose,
  durationMs = 3000,
}) => {
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  const lastHandledEventIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!event) return;
    // Don't restart countdown if parent re-renders while showing the exact same event
    if (lastHandledEventIdRef.current === event.id) return;
    lastHandledEventIdRef.current = event.id;

    const timer = setTimeout(() => {
      onCloseRef.current();
    }, durationMs);

    return () => clearTimeout(timer);
  }, [event?.id, durationMs]);

  if (!event) return null;

  const clubName = clubProfile?.shortName || clubProfile?.name || 'Nasz Zespół';
  const oppName = match.opponent || 'Rywal';

  const meta = PROTOCOL_ACTION_META[event.type] || {
    label: event.type.replace('_', ' '),
    badgeClass: 'bg-slate-800 text-slate-200 border-slate-700',
    borderClass: 'border-slate-700',
    glowClass: 'shadow-slate-900/40',
    icon: '⚡',
    category: 'score',
  };

  const isOurTeam = event.team === 'our';
  const matchedPlayer = findPlayerForEvent(event, players);
  const hasActor = Boolean(event.playerId || event.playerNumber !== undefined);
  const matchedFullName = matchedPlayer
    ? `${matchedPlayer.firstName || ''} ${matchedPlayer.lastName || ''}`.trim()
    : '';
  const actorName = matchedFullName || event.playerName?.trim() || '';
  const actorNumber = event.playerNumber ?? matchedPlayer?.number;
  const actorAlt = matchedPlayer ? getPlayerFullName(matchedPlayer) : (actorName || 'Zawodnik');
  const assistLabel = resolveEventAssistLabel(event, players, true);
  const quarterLabel = event.quarter > 4 ? 'Dogrywka (OT)' : `Kwarta ${event.quarter}`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-950/85 transition-opacity duration-150"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Powiadomienie o nowej akcji w meczu"
    >
      <div
        key={event.id}
        className={`relative w-full max-w-lg rounded-3xl bg-slate-900 border-2 ${meta.borderClass} ${meta.glowClass} shadow-2xl p-5 sm:p-6 text-slate-100 flex flex-col gap-4 animate-popup-bounce`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Header Bar */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <span className="relative flex h-3 w-3">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
            </span>
            <span className="text-xs font-black tracking-wider text-amber-400 uppercase">
              NOWE ZDARZENIE W PROTOKOLE
            </span>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-slate-950 border border-slate-800 font-mono text-xs text-slate-300">
              <Clock className="w-3.5 h-3.5 text-amber-400" />
              <span className="font-bold text-amber-300">{quarterLabel}</span>
              <span className="text-slate-500">•</span>
              <span className="font-extrabold text-white">{event.gameClock}</span>
            </div>

            <button
              onClick={onClose}
              className="p-1 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition active:scale-95"
              title="Zamknij (lub poczekaj 3s)"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Player / Team Spotlight Card */}
        <div className="flex items-center gap-4 bg-slate-950/80 rounded-2xl p-3.5 border border-slate-800/80">
          {/* Avatar or Jersey number badge */}
          {matchedPlayer?.photo ? (
            <img
              src={matchedPlayer.photo}
              alt={actorAlt}
              className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl object-cover border-2 border-amber-400/80 shrink-0 shadow-md"
            />
          ) : (
            <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-gradient-to-br from-slate-800 to-slate-950 border-2 border-amber-500/70 flex flex-col items-center justify-center shrink-0 shadow-md">
              <span className="font-mono font-black text-xl sm:text-2xl text-amber-400 leading-none">
                {actorNumber !== undefined ? `#${actorNumber}` : meta.icon}
              </span>
              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter mt-0.5">
                {isOurTeam ? 'UKS' : 'RYWAL'}
              </span>
            </div>
          )}

          {/* Player & Team Info */}
          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              {isOurTeam ? clubName : oppName}
            </div>
            <div className="text-lg sm:text-2xl font-black text-white truncate tracking-tight">
              {hasActor ? (
                <>
                  {actorNumber !== undefined && (
                    <span className="text-amber-400 font-mono mr-1.5">#{actorNumber}</span>
                  )}
                  {actorName || 'Zawodnik'}
                </>
              ) : (
                <span>{isOurTeam ? clubName : oppName}</span>
              )}
            </div>
            {matchedPlayer?.position && (
              <div className="text-xs text-slate-400 font-medium">
                Pozycja: <strong className="text-slate-300">{matchedPlayer.position}</strong>
              </div>
            )}
          </div>

          {/* Points Bubble if Scored */}
          {event.points > 0 && (
            <div className="flex flex-col items-center justify-center px-3 py-1.5 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 text-slate-950 font-black shadow-lg shadow-emerald-950/40 shrink-0">
              <span className="text-2xl sm:text-3xl font-mono leading-none">+{event.points}</span>
              <span className="text-[10px] tracking-wider uppercase">PKT</span>
            </div>
          )}
        </div>

        {/* Action Description - Exactly as written in the Official Protocol */}
        <div className="space-y-2">
          <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">
            Zapis w protokole meczowym:
          </div>
          <div className="p-3.5 rounded-2xl bg-slate-950/90 border border-slate-800 flex flex-col gap-2">
            <div className="flex items-center gap-2.5 flex-wrap">
              <span className="text-2xl">{meta.icon}</span>
              <span className="text-base sm:text-lg font-black text-white tracking-tight">
                {meta.label}
              </span>
            </div>

            {/* Substitution pair details */}
            {event.type === 'SUBSTITUTION' && (() => {
              const { inLabel, outLabel } = resolveSubstitutionLabels(event, players, true);
              if (!inLabel && !outLabel) return null;
              return (
                <div className="flex items-center gap-2 text-xs font-semibold text-slate-200 bg-slate-900 px-2.5 py-1.5 rounded-xl border border-slate-700 flex-wrap">
                  <span className="text-rose-300">Schodzi: {outLabel || '-'}</span>
                  <span className="text-slate-500">➔</span>
                  <span className="text-emerald-300">Wchodzi: {inLabel || '-'}</span>
                </div>
              );
            })()}

            {/* Sub-type details (e.g. Layup, Kroki, etc.) */}
            {event.subType && (
              <div className="flex items-center gap-2 text-xs font-semibold text-amber-300 bg-amber-500/10 px-2.5 py-1 rounded-xl border border-amber-500/30">
                <span className="text-amber-400">↳ Szczegół akcji:</span>
                <strong className="text-amber-200">{event.subType}</strong>
              </div>
            )}

            {/* Assist details */}
            {assistLabel && (
              <div className="flex items-center gap-2 text-xs font-semibold text-sky-300 bg-sky-500/10 px-2.5 py-1 rounded-xl border border-sky-500/30">
                <span className="text-sky-400">↳ Asysta przy koszu:</span>
                <strong className="text-sky-200">{assistLabel}</strong>
              </div>
            )}
          </div>
        </div>

        {/* Current Official Match Score after this action */}
        <div className="flex items-center justify-between p-3 rounded-2xl bg-slate-950 border border-slate-800/90 text-xs">
          <div className="flex flex-col">
            <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">
              Aktualny wynik meczu:
            </span>
            <div className="flex items-center gap-2 text-sm sm:text-base font-black text-white mt-0.5">
              <span className={isOurTeam && event.points > 0 ? 'text-amber-400' : 'text-slate-200'}>
                {clubName}
              </span>
              <span className="font-mono text-amber-400 text-lg sm:text-xl font-black bg-slate-900 px-2.5 py-0.5 rounded-lg border border-slate-800">
                {event.ourScoreAfter} : {event.oppScoreAfter}
              </span>
              <span className={!isOurTeam && event.points > 0 ? 'text-orange-400' : 'text-slate-200'}>
                {oppName}
              </span>
            </div>
          </div>

          <div className="text-right">
            <span className="text-[10px] text-slate-400 block font-mono">
              Akcja #{match.events.findIndex((e) => e.id === event.id) + 1 || match.events.length}
            </span>
            <span className="text-[11px] font-bold text-emerald-400">
              Protokół zaktualizowany
            </span>
          </div>
        </div>

        {/* 3-Second Countdown Progress Bar Footer */}
        <div className="pt-1 flex flex-col gap-1.5">
          <div className="w-full bg-slate-800/80 h-1.5 rounded-full overflow-hidden">
            <div className="h-full bg-gradient-to-r from-amber-400 to-amber-500 rounded-full animate-popup-progress" />
          </div>
          <div className="flex items-center justify-between text-[11px] text-slate-400 font-medium px-1">
            <span>Komunikat zamknie się automatycznie za 3s</span>
            <span className="text-slate-500 text-[10px]">(kliknij w dowolne miejsce, aby zamknąć)</span>
          </div>
        </div>
      </div>
    </div>
  );
};

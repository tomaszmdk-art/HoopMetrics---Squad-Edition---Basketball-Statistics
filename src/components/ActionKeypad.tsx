import React, { useState } from 'react';
import { ActionType, MatchEvent, Player } from '../types/basketball';
import {
  RotateCcw,
  Sparkles,
  Zap,
} from 'lucide-react';
import { playClickSound, playScoreSound, triggerHaptic } from '../services/tts';
import { useLanguage } from '../i18n/LanguageContext';
import { LiveMatchTheme, ActionTileKey, TileFontFamily } from '../types/liveMatchTheme';
import { getPlayerShortName } from '../services/playerDisplay';

interface ActionKeypadProps {
  layoutMode?: 'mobile' | 'tablet';
  onCourtPlayers: Player[];
  selectedPlayerId: string | null;
  onSelectPlayer: (id: string | null) => void;
  onOpenSubModal: () => void;
  selectedPlayer: Player | null;
  selectedPlayerPoints?: number;
  selectedPlayerEval?: number;
  lastEvent?: MatchEvent;
  onRecordAction: (type: ActionType, subType?: string) => void;
  onUndoLastAction: () => void;
  canUndo: boolean;
  handMode?: 'right' | 'left';
  statsMode?: 'basic' | 'extended';
  onToggleStatsMode?: () => void;
  liveTheme?: LiveMatchTheme;
}

const ACTION_LABELS: Record<string, string> = {
  '2PT_MADE': '2PT Celny',
  '2PT_MISS': '2PT Pudło',
  '3PT_MADE': '3PT Celna',
  '3PT_MISS': '3PT Pudło',
  'FT_MADE': 'Wolny Celny',
  'FT_MISS': 'Wolny Pudło',
  'OFF_REB': 'Zbiórka Atak',
  'DEF_REB': 'Zbiórka Obrona',
  'ASSIST': 'Asysta',
  'STEAL': 'Przechwyt',
  'BLOCK': 'Blok',
  'TURNOVER': 'Strata',
  'FOUL': 'Faul',
  'OPP_1PT': '+1 Rywal',
  'OPP_2PT': '+2 Rywal',
  'OPP_3PT': '+3 Rywal',
  'OPP_MINUS_1': '-1 Rywal',
};

// Sub-options for Extended Stats Mode
const EXTENDED_ACTION_CONFIG: Partial<
  Record<
    ActionType,
    {
      title: string;
      options: { id: string; label: string; icon?: string }[];
    }
  >
> = {
  '2PT_MADE': {
    title: 'Typ rzutu za 2 punkty (Celny)',
    options: [
      { id: 'Wjazd pod kosz (Layup)', label: 'Wjazd pod kosz (Layup)' },
      { id: 'Półdystans (Jumper)', label: 'Półdystans (Jumper)' },
      { id: 'Floater / Półhak', label: 'Floater / Półhak' },
      { id: 'Wsad (Dunk)', label: 'Wsad (Dunk)' },
      { id: 'Dobitka (Tip-in)', label: 'Dobitka (Tip-in)' },
    ],
  },
  '2PT_MISS': {
    title: 'Typ rzutu za 2 punkty (Niecelny)',
    options: [
      { id: 'Wjazd pod kosz (Layup)', label: 'Wjazd pod kosz (Layup)' },
      { id: 'Półdystans (Jumper)', label: 'Półdystans (Jumper)' },
      { id: 'Floater / Półhak', label: 'Floater / Półhak' },
      { id: 'Zablokowany przez rywala', label: 'Zablokowany przez rywala' },
    ],
  },
  '3PT_MADE': {
    title: 'Typ rzutu za 3 punkty (Celny)',
    options: [
      { id: 'Catch and Shoot (Po podaniu)', label: 'Catch & Shoot (Po podaniu)' },
      { id: 'Po koźle (Pull-up)', label: 'Po koźle (Pull-up)' },
      { id: 'Step-back (Z odskoku)', label: 'Step-back (Z odskoku)' },
      { id: 'Z rogu (Corner 3)', label: 'Z rogu (Corner 3)' },
      { id: 'Buzzer Beater / Ostatnia sekunda', label: 'Buzzer Beater' },
    ],
  },
  '3PT_MISS': {
    title: 'Typ rzutu za 3 punkty (Niecelny)',
    options: [
      { id: 'Catch and Shoot', label: 'Catch and Shoot' },
      { id: 'Po koźle (Pull-up)', label: 'Po koźle (Pull-up)' },
      { id: 'Z rogu (Corner 3)', label: 'Z rogu (Corner 3)' },
      { id: 'Zablokowany', label: 'Zablokowany' },
    ],
  },
  'TURNOVER': {
    title: 'Rodzaj straty (Błąd)',
    options: [
      { id: 'Złe podanie', label: 'Złe podanie' },
      { id: 'Kroki', label: 'Kroki' },
      { id: 'Błąd kozłowania (Podwójne)', label: 'Podwójne kozłowanie' },
      { id: 'Piłka niesiona', label: 'Piłka niesiona' },
      { id: 'Wyjście w aut', label: 'Wyjście w aut' },
      { id: 'Błąd 3 sekund', label: 'Błąd 3 sekund' },
      { id: 'Błąd 8 sekund', label: 'Błąd 8 sekund' },
      { id: 'Błąd 24 sekund', label: 'Błąd 24 sekund' },
      { id: 'Faul w ataku (Szarża)', label: 'Faul w ataku (Szarża)' },
    ],
  },
  'FOUL': {
    title: 'Rodzaj faulu',
    options: [
      { id: 'Faul osobisty w obronie', label: 'Osobisty w obronie' },
      { id: 'Faul przy rzucie (2FT)', label: 'Przy rzucie za 2 (2FT)' },
      { id: 'Faul przy rzucie za 3 (3FT)', label: 'Przy rzucie za 3 (3FT)' },
      { id: 'Faul w ataku', label: 'Faul w ataku' },
      { id: 'Faul niesportowy (U)', label: 'Niesportowy (U)' },
      { id: 'Faul techniczny (T)', label: 'Techniczny (T)' },
    ],
  },
};

const getFontFamilyCss = (ff?: TileFontFamily) => {
  switch (ff) {
    case 'mono':
      return 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace';
    case 'sans':
      return 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    case 'display':
      return 'Impact, "Arial Black", "Trebuchet MS", sans-serif';
    case 'serif':
      return 'Georgia, Cambria, "Times New Roman", Times, serif';
    default:
      return undefined;
  }
};

export const ActionKeypad: React.FC<ActionKeypadProps> = ({
  layoutMode = 'mobile',
  onCourtPlayers,
  selectedPlayerId,
  onSelectPlayer,
  onOpenSubModal,
  selectedPlayer,
  selectedPlayerPoints,
  selectedPlayerEval,
  lastEvent,
  onRecordAction,
  onUndoLastAction,
  canUndo,
  statsMode = 'basic',
  liveTheme,
}) => {
  const [pendingExtendedAction, setPendingExtendedAction] = useState<ActionType | null>(null);

  const handleActionClick = (type: ActionType) => {
    triggerHaptic(25);

    // Opponent scoring does not require selecting our player
    if (type.startsWith('OPP_') || type.startsWith('MANUAL_')) {
      if (type === 'OPP_3PT') playScoreSound(3);
      else if (type === 'OPP_2PT') playScoreSound(2);
      else if (type === 'OPP_1PT' || type.startsWith('MANUAL_OUR_PLUS')) playScoreSound(1);
      else playClickSound();

      onRecordAction(type);
      return;
    }

    if (!selectedPlayer) {
      triggerHaptic(60);
      playClickSound();
      return;
    }

    // In EXTENDED mode: open subtype modal if configured
    if (statsMode === 'extended' && EXTENDED_ACTION_CONFIG[type]) {
      setPendingExtendedAction(type);
      return;
    }

    // In BASIC mode: instant scoring
    if (type === '3PT_MADE') playScoreSound(3);
    else if (type === '2PT_MADE') playScoreSound(2);
    else if (type === 'FT_MADE') playScoreSound(1);
    else playClickSound();

    onRecordAction(type);
  };

  const handleSubtypeSelected = (subType?: string) => {
    if (!pendingExtendedAction) return;
    const type = pendingExtendedAction;
    setPendingExtendedAction(null);

    if (type === '3PT_MADE') playScoreSound(3);
    else if (type === '2PT_MADE') playScoreSound(2);
    else if (type === 'FT_MADE') playScoreSound(1);
    else playClickSound();

    onRecordAction(type, subType);
  };

  // Helper for tablet mode tiles styled by liveTheme customizer
  const renderTabletTile = (
    key: ActionTileKey,
    actionType: ActionType,
    defaultTitle: string,
    defaultSub: string
  ) => {
    const tile = liveTheme?.actionTiles?.[key];
    const isSelected = !!selectedPlayer;

    return (
      <button
        key={key}
        onClick={() => handleActionClick(actionType)}
        style={
          tile
            ? {
                background: tile.bgGradient,
                borderColor: isSelected ? tile.borderColor : undefined,
                color: tile.textColor,
                minHeight: `${tile.height}px`,
                fontFamily: getFontFamilyCss(tile.fontFamily),
                boxShadow: tile.shadow,
              }
            : undefined
        }
        className={`w-full min-h-[52px] sm:min-h-[58px] rounded-2xl flex flex-col items-center justify-center transition duration-150 border-2 select-none active:scale-95 shadow ${
          tile ? tile.borderRadius : 'rounded-2xl'
        } ${
          !isSelected
            ? 'opacity-85 hover:opacity-100'
            : 'hover:opacity-95'
        }`}
      >
        <span
          style={tile ? { fontSize: `${tile.fontSizePrimary}px` } : undefined}
          className="font-mono font-black text-base sm:text-lg leading-tight tracking-tight"
        >
          {defaultTitle}
        </span>
        <span
          style={
            tile
              ? {
                  fontSize: `${tile.fontSizeSecondary}px`,
                  color: tile.subTextColor,
                }
              : undefined
          }
          className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider mt-0.5 opacity-90"
        >
          {defaultSub}
        </span>
      </button>
    );
  };

  // Up to 5 slots for on-court players
  const playerSlots = [0, 1, 2, 3, 4].map((idx) => onCourtPlayers[idx] || null);

  return (
    <div className="w-full flex-1 flex flex-col justify-between p-1.5 sm:p-2.5 bg-slate-950 text-slate-100 select-none">
      {layoutMode === 'tablet' ? (
        /* TABLET ACTION KEYPAD: 4 Full-Width Rows, fully styled by liveTheme customizer */
        <div className="flex-1 flex flex-col justify-between gap-2.5 p-1 sm:p-2 bg-slate-950">
          {/* Row 1: RZUTY ZA 2 I 3 PUNKTY (4 kolumny) */}
          <div className="grid grid-cols-4 gap-2 flex-1">
            {/* 2PT MADE */}
            {renderTabletTile('twoPointMade', '2PT_MADE', '+2 PKT', '2PT Celny')}
            {/* 2PT MISS */}
            {renderTabletTile('twoPointMiss', '2PT_MISS', '2PT Pudło', 'Niecelny')}
            {/* 3PT MADE */}
            {renderTabletTile('threePointMade', '3PT_MADE', '+3 PKT', '3PT Trójka')}
            {/* 3PT MISS */}
            {renderTabletTile('threePointMiss', '3PT_MISS', '3PT Pudło', 'Niecelny')}
          </div>

          {/* Row 2: RZUTY WOLNE I ZBIÓRKI (4 kolumny) */}
          <div className="grid grid-cols-4 gap-2 flex-1">
            {/* FT MADE */}
            {renderTabletTile('ftMade', 'FT_MADE', '+1 PKT', 'Wolny Celny')}
            {/* FT MISS */}
            {renderTabletTile('ftMiss', 'FT_MISS', 'Wolny Pudło', 'Niecelny FT')}
            {/* OFF REB */}
            {renderTabletTile('offReb', 'OFF_REB', 'ZB ATAK', 'Ofensywna')}
            {/* DEF REB */}
            {renderTabletTile('defReb', 'DEF_REB', 'ZB OBRONA', 'Defensywna')}
          </div>

          {/* Row 3: ASYSTA, PRZECHWYT, BLOK, STRATA, FAUL (5 kolumn) */}
          <div className="grid grid-cols-5 gap-2 flex-1">
            {/* AST */}
            {renderTabletTile('assist', 'ASSIST', 'AST', 'ASYSTA')}
            {/* PRZ */}
            {renderTabletTile('steal', 'STEAL', 'PRZ', 'PRZECHWYT')}
            {/* BLK */}
            {renderTabletTile('block', 'BLOCK', 'BLK', 'BLOK')}
            {/* STR */}
            {renderTabletTile('turnover', 'TURNOVER', 'STR', 'STRATA')}
            {/* FAUL */}
            {renderTabletTile('foul', 'FOUL', 'FAUL', 'OSOBISTY')}
          </div>

          {/* Row 4: DOLNY PASEK NARZĘDZIOWY (COFNIJ + RYWAL) (5 kolumn) */}
          <div className="grid grid-cols-5 gap-2 pt-2 border-t border-slate-800/80">
            {/* COFNIJ */}
            <button
              onClick={onUndoLastAction}
              disabled={!canUndo}
              className={`h-12 sm:h-14 rounded-2xl flex flex-col items-center justify-center border-2 transition active:scale-95 ${
                canUndo
                  ? 'bg-slate-900 hover:bg-slate-800 text-amber-400 border-amber-400/80 shadow-md'
                  : 'bg-slate-950 border-slate-800 text-slate-600 cursor-not-allowed'
              }`}
              title="Cofnij ostatnie zarejestrowane zdarzenie"
            >
              <div className="flex items-center gap-1.5">
                <RotateCcw className="w-4 h-4" />
                <span className="font-mono font-black text-sm sm:text-base">COFNIJ</span>
              </div>
              {lastEvent && (
                <span className="text-[10px] text-slate-400 truncate max-w-[120px]">
                  {lastEvent.playerNumber ? `#${lastEvent.playerNumber} ` : ''}
                  {ACTION_LABELS[lastEvent.type] || lastEvent.type}
                </span>
              )}
            </button>

            {/* +1 Rywal */}
            <button
              onClick={() => handleActionClick('OPP_1PT')}
              className="h-12 sm:h-14 rounded-2xl bg-slate-900 hover:bg-slate-800 active:bg-orange-500/20 border border-orange-500/50 text-orange-400 font-bold flex flex-col items-center justify-center transition active:scale-95 shadow"
              title="Punkt dla rywala (+1)"
            >
              <span className="font-mono font-black text-sm sm:text-base leading-tight">+1 Rywal</span>
              <span className="text-[9px] text-slate-400 uppercase">WOLNY</span>
            </button>

            {/* +2 Rywal */}
            <button
              onClick={() => handleActionClick('OPP_2PT')}
              className="h-12 sm:h-14 rounded-2xl bg-slate-900 hover:bg-slate-800 active:bg-orange-500/20 border border-orange-500/50 text-orange-400 font-bold flex flex-col items-center justify-center transition active:scale-95 shadow"
              title="Kosz z gry dla rywala (+2)"
            >
              <span className="font-mono font-black text-sm sm:text-base leading-tight">+2 Rywal</span>
              <span className="text-[9px] text-slate-400 uppercase">Z GRY</span>
            </button>

            {/* +3 Rywal */}
            <button
              onClick={() => handleActionClick('OPP_3PT')}
              className="h-12 sm:h-14 rounded-2xl bg-slate-900 hover:bg-slate-800 active:bg-orange-500/20 border border-orange-500/50 text-orange-400 font-bold flex flex-col items-center justify-center transition active:scale-95 shadow"
              title="Trójka dla rywala (+3)"
            >
              <span className="font-mono font-black text-sm sm:text-base leading-tight">+3 Rywal</span>
              <span className="text-[9px] text-slate-400 uppercase">TRÓJKA</span>
            </button>

            {/* -1 Rywal */}
            <button
              onClick={() => handleActionClick('OPP_MINUS_1')}
              className="h-12 sm:h-14 rounded-2xl bg-slate-900 hover:bg-slate-800 active:bg-rose-500/20 border border-rose-500/50 text-rose-400 font-bold flex flex-col items-center justify-center transition active:scale-95 shadow"
              title="Odejmij punkt rywalowi (-1)"
            >
              <span className="font-mono font-black text-sm sm:text-base leading-tight">-1 Rywal</span>
              <span className="text-[9px] text-slate-400 uppercase">KOREKTA</span>
            </button>
          </div>
        </div>
      ) : (
        /* MOBILE ACTION KEYPAD (matches obraz_e70c8a86.png with rich tablet-grade shading & shadows) */
        <>
          {/* 1. MIDDLE SECTION: Left Column (5 Players + ZMIANY) & Right Column (1/2/3 PKT + PUDŁA + ZBIÓRKI) */}
          <div className="flex-1 flex gap-1.5 sm:gap-2.5 min-h-[300px]">
            {/* LEWA KOLUMNA: 5 KAFELKÓW ZAWODNIKÓW + PRZYCISK ZMIANY */}
            <div className="w-[28%] xs:w-[26%] sm:w-[24%] max-w-[130px] flex flex-col justify-between gap-1 sm:gap-1.5">
              {/* 5 KAFELKÓW ZAWODNIKÓW */}
              {playerSlots.map((player, idx) => {
                const isSelected = player ? selectedPlayerId === player.id : false;

                return (
                  <button
                    key={player ? player.id : `empty-slot-${idx}`}
                    disabled={!player}
                    onClick={() => {
                      if (player) {
                        playClickSound();
                        triggerHaptic(20);
                        onSelectPlayer(isSelected ? null : player.id);
                      }
                    }}
                    className={`relative flex-1 min-h-[46px] xs:min-h-[50px] sm:min-h-[56px] rounded-xl flex flex-col items-center justify-center p-0.5 transition-colors select-none overflow-hidden ${
                      player
                        ? isSelected
                          ? 'bg-gradient-to-b from-cyan-200 via-cyan-300 to-cyan-400 text-slate-950 border-4 border-slate-950 ring-2 ring-cyan-400 shadow-md font-black'
                          : 'bg-gradient-to-b from-amber-300 via-amber-400 to-amber-500 hover:from-amber-200 hover:to-amber-400 active:from-amber-400 active:to-amber-600 text-slate-950 border-2 border-amber-600/90 shadow-md shadow-amber-950/40 active:scale-95'
                        : 'bg-gradient-to-b from-slate-900 to-slate-950 border-2 border-slate-800 text-slate-600 cursor-not-allowed'
                    }`}
                    title={
                      player
                        ? `Zawodnik #${player.number}${
                            player.lastName?.trim() || player.firstName?.trim()
                              ? ` ${getPlayerShortName(player)}`
                              : ''
                          }${isSelected ? ' (WYBRANY)' : ''}`
                        : 'Pusty slot na parkiecie'
                    }
                  >
                    {player ? (
                      <>
                        {isSelected && (
                          <span className="absolute top-1 right-1 px-1 py-0.2 rounded bg-slate-950 text-cyan-300 font-mono text-[7px] font-black leading-tight">
                            AKTYWNY
                          </span>
                        )}
                        <span className="font-mono font-black text-lg xs:text-xl sm:text-2xl leading-none">
                          #{player.number}
                        </span>
                        <span className="text-[10px] xs:text-[11px] font-black uppercase tracking-tight truncate max-w-full px-1 text-slate-950 leading-tight mt-0.5">
                          {player.lastName?.trim() || player.firstName?.trim() || player.position || 'Zawodnik'}
                        </span>
                      </>
                    ) : (
                      <>
                        <span className="font-mono font-bold text-base leading-none">#--</span>
                        <span className="text-[9px] text-slate-600 font-semibold leading-none mt-0.5">Brak</span>
                      </>
                    )}
                  </button>
                );
              })}

              {/* PRZYCISK ZMIANY (POMARAŃCZOWY Z CIENIOWANIEM) */}
              <button
                onClick={() => {
                  playClickSound();
                  triggerHaptic(25);
                  onOpenSubModal();
                }}
                className="h-11 xs:h-12 sm:h-13 rounded-xl bg-gradient-to-b from-orange-400 via-orange-500 to-orange-600 hover:from-orange-300 hover:to-orange-500 active:from-orange-600 active:to-orange-700 text-slate-950 font-black text-xs xs:text-sm sm:text-base uppercase tracking-tight flex items-center justify-center border-2 border-orange-400/90 shadow-md shadow-orange-950/50 active:scale-95 transition"
                title="Otwórz okno zmian zawodników"
              >
                ZMIANY
              </button>
            </div>

            {/* PRAWA KOLUMNA: 3 RZĘDY RZUTÓW (1, 2, 3 PKT + PUDŁO) ORAZ RZĄD ZBIÓREK (ATAK / OBRONA) */}
            <div className="flex-1 flex flex-col justify-between gap-1 sm:gap-1.5">
              {/* RZĄD 1: 1 PKT (ZIELONY) | 1 PUDŁO (CZERWONY) */}
              <div className="grid grid-cols-2 gap-1 sm:gap-1.5 flex-1">
                <button
                  onClick={() => handleActionClick('FT_MADE')}
                  disabled={!selectedPlayer}
                  className={`min-h-[46px] xs:min-h-[50px] sm:min-h-[56px] h-full rounded-xl flex items-center justify-center font-mono font-black text-lg xs:text-xl sm:text-2xl border-2 transition active:scale-95 ${
                    selectedPlayer
                      ? 'bg-gradient-to-b from-emerald-400 via-emerald-500 to-emerald-600 hover:from-emerald-300 hover:to-emerald-500 active:from-emerald-600 active:to-emerald-700 text-slate-950 border-emerald-300/90 shadow-md shadow-emerald-950/50'
                      : 'bg-gradient-to-b from-emerald-950/30 to-emerald-950/60 border-emerald-900/40 text-emerald-700/50 cursor-not-allowed shadow-none'
                  }`}
                >
                  1 PKT
                </button>
                <button
                  onClick={() => handleActionClick('FT_MISS')}
                  disabled={!selectedPlayer}
                  className={`min-h-[46px] xs:min-h-[50px] sm:min-h-[56px] h-full rounded-xl flex flex-col items-center justify-center font-mono font-black text-xs xs:text-sm sm:text-base leading-tight border-2 transition active:scale-95 ${
                    selectedPlayer
                      ? 'bg-gradient-to-b from-rose-500 via-rose-600 to-rose-700 hover:from-rose-400 hover:to-rose-600 active:from-rose-700 active:to-rose-800 text-white border-rose-400/90 shadow-md shadow-rose-950/50'
                      : 'bg-gradient-to-b from-rose-950/30 to-rose-950/60 border-rose-900/40 text-rose-800/50 cursor-not-allowed shadow-none'
                  }`}
                >
                  <span>1</span>
                  <span>PUDŁO</span>
                </button>
              </div>

              {/* RZĄD 2: 2 PKT (ZIELONY) | 2 PUDŁO (CZERWONY) */}
              <div className="grid grid-cols-2 gap-1 sm:gap-1.5 flex-1">
                <button
                  onClick={() => handleActionClick('2PT_MADE')}
                  disabled={!selectedPlayer}
                  className={`min-h-[46px] xs:min-h-[50px] sm:min-h-[56px] h-full rounded-xl flex items-center justify-center font-mono font-black text-lg xs:text-xl sm:text-2xl border-2 transition active:scale-95 ${
                    selectedPlayer
                      ? 'bg-gradient-to-b from-emerald-400 via-emerald-500 to-emerald-600 hover:from-emerald-300 hover:to-emerald-500 active:from-emerald-600 active:to-emerald-700 text-slate-950 border-emerald-300/90 shadow-md shadow-emerald-950/50'
                      : 'bg-gradient-to-b from-emerald-950/30 to-emerald-950/60 border-emerald-900/40 text-emerald-700/50 cursor-not-allowed shadow-none'
                  }`}
                >
                  2 PKT
                </button>
                <button
                  onClick={() => handleActionClick('2PT_MISS')}
                  disabled={!selectedPlayer}
                  className={`min-h-[46px] xs:min-h-[50px] sm:min-h-[56px] h-full rounded-xl flex flex-col items-center justify-center font-mono font-black text-xs xs:text-sm sm:text-base leading-tight border-2 transition active:scale-95 ${
                    selectedPlayer
                      ? 'bg-gradient-to-b from-rose-500 via-rose-600 to-rose-700 hover:from-rose-400 hover:to-rose-600 active:from-rose-700 active:to-rose-800 text-white border-rose-400/90 shadow-md shadow-rose-950/50'
                      : 'bg-gradient-to-b from-rose-950/30 to-rose-950/60 border-rose-900/40 text-rose-800/50 cursor-not-allowed shadow-none'
                  }`}
                >
                  <span>2</span>
                  <span>PUDŁO</span>
                </button>
              </div>

              {/* RZĄD 3: 3 PKT (ZIELONY) | 3 PUDŁO (CZERWONY) */}
              <div className="grid grid-cols-2 gap-1 sm:gap-1.5 flex-1">
                <button
                  onClick={() => handleActionClick('3PT_MADE')}
                  disabled={!selectedPlayer}
                  className={`min-h-[46px] xs:min-h-[50px] sm:min-h-[56px] h-full rounded-xl flex items-center justify-center font-mono font-black text-lg xs:text-xl sm:text-2xl border-2 transition active:scale-95 ${
                    selectedPlayer
                      ? 'bg-gradient-to-b from-emerald-400 via-emerald-500 to-emerald-600 hover:from-emerald-300 hover:to-emerald-500 active:from-emerald-600 active:to-emerald-700 text-slate-950 border-emerald-300/90 shadow-md shadow-emerald-950/50'
                      : 'bg-gradient-to-b from-emerald-950/30 to-emerald-950/60 border-emerald-900/40 text-emerald-700/50 cursor-not-allowed shadow-none'
                  }`}
                >
                  3 PKT
                </button>
                <button
                  onClick={() => handleActionClick('3PT_MISS')}
                  disabled={!selectedPlayer}
                  className={`min-h-[46px] xs:min-h-[50px] sm:min-h-[56px] h-full rounded-xl flex flex-col items-center justify-center font-mono font-black text-xs xs:text-sm sm:text-base leading-tight border-2 transition active:scale-95 ${
                    selectedPlayer
                      ? 'bg-gradient-to-b from-rose-500 via-rose-600 to-rose-700 hover:from-rose-400 hover:to-rose-600 active:from-rose-700 active:to-rose-800 text-white border-rose-400/90 shadow-md shadow-rose-950/50'
                      : 'bg-gradient-to-b from-rose-950/30 to-rose-950/60 border-rose-900/40 text-rose-800/50 cursor-not-allowed shadow-none'
                  }`}
                >
                  <span>3</span>
                  <span>PUDŁO</span>
                </button>
              </div>

              {/* RZĄD 4: ZB ATAK (NIEBIESKI) | ZB OBRONA (FIOLETOWO-GRANATOWY) */}
              <div className="grid grid-cols-2 gap-1 sm:gap-1.5 h-11 xs:h-12 sm:h-13">
                <button
                  onClick={() => handleActionClick('OFF_REB')}
                  disabled={!selectedPlayer}
                  className={`h-full rounded-xl flex flex-col items-center justify-center font-mono font-black border-2 transition active:scale-95 ${
                    selectedPlayer
                      ? 'bg-gradient-to-b from-blue-500 via-blue-600 to-blue-700 hover:from-blue-400 hover:to-blue-600 active:from-blue-700 active:to-blue-800 text-white border-blue-400/90 shadow-md shadow-blue-950/50'
                      : 'bg-gradient-to-b from-blue-950/30 to-blue-950/60 border-blue-900/40 text-blue-700/50 cursor-not-allowed shadow-none'
                  }`}
                >
                  <span className="text-sm xs:text-base sm:text-lg leading-tight">ZB ATAK</span>
                  <span className="text-[8px] xs:text-[9px] font-bold text-blue-200 uppercase leading-none">
                    OFENSYWNA
                  </span>
                </button>
                <button
                  onClick={() => handleActionClick('DEF_REB')}
                  disabled={!selectedPlayer}
                  className={`h-full rounded-xl flex flex-col items-center justify-center font-mono font-black border-2 transition active:scale-95 ${
                    selectedPlayer
                      ? 'bg-gradient-to-b from-indigo-500 via-indigo-600 to-indigo-700 hover:from-indigo-400 hover:to-indigo-600 active:from-indigo-700 active:to-indigo-800 text-white border-indigo-400/90 shadow-md shadow-indigo-950/50'
                      : 'bg-gradient-to-b from-indigo-950/30 to-indigo-950/60 border-indigo-900/40 text-indigo-700/50 cursor-not-allowed shadow-none'
                  }`}
                >
                  <span className="text-sm xs:text-base sm:text-lg leading-tight">ZB OBRONA</span>
                  <span className="text-[8px] xs:text-[9px] font-bold text-indigo-200 uppercase leading-none">
                    DEFENSYWNA
                  </span>
                </button>
              </div>
            </div>
          </div>

          {/* 2. DOLNY RZĄD 1 (CAŁA SZEROKOŚĆ): 5 PRZYCISKÓW STATYSTYK (AST, PRZ, BLK, STR, FAUL) */}
          <div className="grid grid-cols-5 gap-1 xs:gap-1.5 sm:gap-2 mt-1.5 sm:mt-2">
            {/* AST */}
            <button
              onClick={() => handleActionClick('ASSIST')}
              disabled={!selectedPlayer}
              className={`h-11 xs:h-12 sm:h-13 rounded-xl flex flex-col items-center justify-center border-2 transition active:scale-95 ${
                selectedPlayer
                  ? 'bg-gradient-to-b from-sky-400 via-sky-500 to-sky-600 hover:from-sky-300 hover:to-sky-500 active:from-sky-600 active:to-sky-700 text-slate-950 border-sky-300/90 shadow-md shadow-sky-950/50'
                  : 'bg-gradient-to-b from-sky-950/30 to-sky-950/60 border-sky-900/40 text-sky-700/50 cursor-not-allowed shadow-none'
              }`}
            >
              <span className="font-mono font-black text-sm xs:text-base sm:text-lg leading-none">AST</span>
              <span className="text-[8px] xs:text-[9px] font-bold text-sky-950 uppercase leading-none mt-0.5">
                ASYSTA
              </span>
            </button>

            {/* PRZ */}
            <button
              onClick={() => handleActionClick('STEAL')}
              disabled={!selectedPlayer}
              className={`h-11 xs:h-12 sm:h-13 rounded-xl flex flex-col items-center justify-center border-2 transition active:scale-95 ${
                selectedPlayer
                  ? 'bg-gradient-to-b from-purple-500 via-purple-600 to-purple-700 hover:from-purple-400 hover:to-purple-600 active:from-purple-700 active:to-purple-800 text-white border-purple-400/90 shadow-md shadow-purple-950/50'
                  : 'bg-gradient-to-b from-purple-950/30 to-purple-950/60 border-purple-900/40 text-purple-700/50 cursor-not-allowed shadow-none'
              }`}
            >
              <span className="font-mono font-black text-sm xs:text-base sm:text-lg leading-none">PRZ</span>
              <span className="text-[8px] xs:text-[9px] font-bold text-purple-200 uppercase leading-none mt-0.5">
                PRZECHWYT
              </span>
            </button>

            {/* BLK */}
            <button
              onClick={() => handleActionClick('BLOCK')}
              disabled={!selectedPlayer}
              className={`h-11 xs:h-12 sm:h-13 rounded-xl flex flex-col items-center justify-center border-2 transition active:scale-95 ${
                selectedPlayer
                  ? 'bg-gradient-to-b from-cyan-400 via-cyan-500 to-cyan-600 hover:from-cyan-300 hover:to-cyan-500 active:from-cyan-600 active:to-cyan-700 text-slate-950 border-cyan-300/90 shadow-md shadow-cyan-950/50'
                  : 'bg-gradient-to-b from-cyan-950/30 to-cyan-950/60 border-cyan-900/40 text-cyan-700/50 cursor-not-allowed shadow-none'
              }`}
            >
              <span className="font-mono font-black text-sm xs:text-base sm:text-lg leading-none">BLK</span>
              <span className="text-[8px] xs:text-[9px] font-bold text-cyan-950 uppercase leading-none mt-0.5">
                BLOK
              </span>
            </button>

            {/* STR */}
            <button
              onClick={() => handleActionClick('TURNOVER')}
              disabled={!selectedPlayer}
              className={`h-11 xs:h-12 sm:h-13 rounded-xl flex flex-col items-center justify-center border-2 transition active:scale-95 ${
                selectedPlayer
                  ? 'bg-gradient-to-b from-amber-600 via-amber-700 to-amber-800 hover:from-amber-500 hover:to-amber-700 active:from-amber-700 active:to-amber-900 text-white border-amber-400/90 shadow-md shadow-amber-950/50'
                  : 'bg-gradient-to-b from-amber-950/30 to-amber-950/60 border-amber-900/40 text-amber-700/50 cursor-not-allowed shadow-none'
              }`}
            >
              <span className="font-mono font-black text-sm xs:text-base sm:text-lg leading-none">STR</span>
              <span className="text-[8px] xs:text-[9px] font-bold text-amber-200 uppercase leading-none mt-0.5">
                STRATA
              </span>
            </button>

            {/* FAUL */}
            <button
              onClick={() => handleActionClick('FOUL')}
              disabled={!selectedPlayer}
              className={`h-11 xs:h-12 sm:h-13 rounded-xl flex flex-col items-center justify-center border-2 transition active:scale-95 ${
                selectedPlayer
                  ? 'bg-gradient-to-b from-rose-600 via-rose-700 to-rose-800 hover:from-rose-500 hover:to-rose-700 active:from-rose-700 active:to-rose-900 text-white border-rose-400/90 shadow-md shadow-rose-950/50'
                  : 'bg-gradient-to-b from-rose-950/30 to-rose-950/60 border-rose-900/40 text-rose-700/50 cursor-not-allowed shadow-none'
              }`}
            >
              <span className="font-mono font-black text-sm xs:text-base sm:text-lg leading-none">FAUL</span>
              <span className="text-[8px] xs:text-[9px] font-bold text-rose-200 uppercase leading-none mt-0.5">
                OSOBISTY
              </span>
            </button>
          </div>

          {/* 3. DOLNY RZĄD 2 (CAŁA SZEROKOŚĆ): COFNIJ ORAZ PUNKTY RYWAL (+1, +2, +3, -1) */}
          <div className="grid grid-cols-5 gap-1 xs:gap-1.5 sm:gap-2 mt-1 sm:mt-1.5 pt-1.5 border-t border-slate-800/80">
            {/* COFNIJ */}
            <button
              onClick={onUndoLastAction}
              disabled={!canUndo}
              className={`h-11 xs:h-12 sm:h-13 rounded-xl flex flex-col items-center justify-center border-2 transition active:scale-95 ${
                canUndo
                  ? 'bg-gradient-to-b from-slate-800 to-slate-900 hover:from-slate-700 hover:to-slate-800 active:from-slate-900 active:to-slate-950 text-amber-400 border-amber-400/90 shadow-md shadow-amber-950/40'
                  : 'bg-gradient-to-b from-slate-900 to-slate-950 border-slate-800 text-slate-600 cursor-not-allowed shadow-none'
              }`}
              title="Cofnij ostatnie zarejestrowane zdarzenie"
            >
              <div className="flex items-center gap-1">
                <RotateCcw className="w-3.5 h-3.5" />
                <span className="font-mono font-extrabold text-xs xs:text-sm">COFNIJ</span>
              </div>
              {lastEvent && (
                <span className="text-[8px] xs:text-[9px] text-slate-400 truncate max-w-[70px] leading-tight">
                  {lastEvent.playerNumber ? `#${lastEvent.playerNumber} ` : ''}
                  {ACTION_LABELS[lastEvent.type] || lastEvent.type}
                </span>
              )}
            </button>

            {/* +1 Rywal (WOLNY) */}
            <button
              onClick={() => handleActionClick('OPP_1PT')}
              className="h-11 xs:h-12 sm:h-13 rounded-xl bg-gradient-to-b from-slate-800 to-slate-900 hover:from-slate-700 hover:to-slate-800 active:from-orange-950 active:to-slate-900 border-2 border-orange-500/60 text-orange-400 font-bold flex flex-col items-center justify-center transition active:scale-95 shadow-md shadow-black/40"
              title="Punkt dla rywala (+1)"
            >
              <span className="font-mono font-extrabold text-xs xs:text-sm leading-tight">+1 Rywal</span>
              <span className="text-[8px] text-slate-400 uppercase leading-none">WOLNY</span>
            </button>

            {/* +2 Rywal (Z GRY) */}
            <button
              onClick={() => handleActionClick('OPP_2PT')}
              className="h-11 xs:h-12 sm:h-13 rounded-xl bg-gradient-to-b from-slate-800 to-slate-900 hover:from-slate-700 hover:to-slate-800 active:from-orange-950 active:to-slate-900 border-2 border-orange-500/60 text-orange-400 font-bold flex flex-col items-center justify-center transition active:scale-95 shadow-md shadow-black/40"
              title="Kosz z gry dla rywala (+2)"
            >
              <span className="font-mono font-extrabold text-xs xs:text-sm leading-tight">+2 Rywal</span>
              <span className="text-[8px] text-slate-400 uppercase leading-none">Z GRY</span>
            </button>

            {/* +3 Rywal (TRÓJKA) */}
            <button
              onClick={() => handleActionClick('OPP_3PT')}
              className="h-11 xs:h-12 sm:h-13 rounded-xl bg-gradient-to-b from-slate-800 to-slate-900 hover:from-slate-700 hover:to-slate-800 active:from-orange-950 active:to-slate-900 border-2 border-orange-500/60 text-orange-400 font-bold flex flex-col items-center justify-center transition active:scale-95 shadow-md shadow-black/40"
              title="Trójka dla rywala (+3)"
            >
              <span className="font-mono font-extrabold text-xs xs:text-sm leading-tight">+3 Rywal</span>
              <span className="text-[8px] text-slate-400 uppercase leading-none">TRÓJKA</span>
            </button>

            {/* -1 Rywal (KOREKTA) */}
            <button
              onClick={() => handleActionClick('OPP_MINUS_1')}
              className="h-11 xs:h-12 sm:h-13 rounded-xl bg-gradient-to-b from-slate-800 to-slate-900 hover:from-slate-700 hover:to-slate-800 active:from-rose-950 active:to-slate-900 border-2 border-rose-500/60 text-rose-400 font-bold flex flex-col items-center justify-center transition active:scale-95 shadow-md shadow-black/40"
              title="Odejmij punkt rywalowi (-1)"
            >
              <span className="font-mono font-extrabold text-xs xs:text-sm leading-tight">-1 Rywal</span>
              <span className="text-[8px] text-slate-400 uppercase leading-none">KOREKTA</span>
            </button>
          </div>
        </>
      )}

      {/* EXTENDED MODE SUB-OPTIONS MODAL */}
      {pendingExtendedAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/90">
          <div className="w-full max-w-sm rounded-3xl bg-slate-900 border border-amber-500/40 p-4 sm:p-5 shadow-2xl text-slate-100">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-3">
              <div>
                <h3 className="text-sm sm:text-base font-black text-amber-300">
                  {EXTENDED_ACTION_CONFIG[pendingExtendedAction]?.title || 'Szczegóły akcji'}
                </h3>
                {selectedPlayer && (
                  <p className="text-xs text-slate-400 font-mono">
                    #{selectedPlayer.number}
                    {selectedPlayer.lastName?.trim() || selectedPlayer.firstName?.trim()
                      ? ` ${getPlayerShortName(selectedPlayer)}`
                      : ''}
                  </p>
                )}
              </div>
            </div>

            <div className="space-y-1.5 max-h-[50vh] overflow-y-auto mb-4">
              {EXTENDED_ACTION_CONFIG[pendingExtendedAction]?.options.map((opt) => (
                <button
                  key={opt.id}
                  onClick={() => handleSubtypeSelected(opt.id)}
                  className="w-full text-left p-2.5 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800 text-xs sm:text-sm font-semibold transition active:scale-98 flex items-center justify-between"
                >
                  <span>{opt.label}</span>
                </button>
              ))}
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => handleSubtypeSelected(undefined)}
                className="flex-1 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs transition"
              >
                Pomiń typ (zapisz ogólnie)
              </button>
              <button
                onClick={() => setPendingExtendedAction(null)}
                className="py-2 px-3 rounded-xl bg-slate-800 text-slate-400 text-xs font-semibold hover:text-white"
              >
                Anuluj
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

import React, { useState } from 'react';
import { TeamCategory, Match, ClubProfile } from '../types/basketball';
import { PWAInstallButton } from './PWAInstallModal';
import { LanguageSwitcher } from './LanguageSwitcher';
import { useLanguage } from '../i18n/LanguageContext';
import {
  Users,
  History,
  Settings,
  Flame,
  Volume2,
  VolumeX,
  PlusCircle,
  Share2,
  Eye,
  Lock,
  RefreshCw,
  Shield,
  Scale,
  Heart,
  Mail,
  Menu,
  X,
  LogOut,
  DoorOpen,
} from 'lucide-react';

interface NavbarProps {
  currentTab: 'home' | 'live' | 'roster' | 'history' | 'parent';
  onSelectTab: (tab: 'home' | 'live' | 'roster' | 'history' | 'parent') => void;
  activeCategory?: TeamCategory;
  onSelectCategory?: (cat: TeamCategory) => void;
  activeMatch: Match | undefined;
  clubProfile?: ClubProfile;
  roomId?: string | null;
  onExitRoom?: () => void;
  onOpenClubProfile?: () => void;
  onOpenLegalModal?: () => void;
  onOpenNewMatchModal?: () => void;
  onOpenSettingsModal?: () => void;
  soundEnabled: boolean;
  onToggleSound: () => void;
  readOnly?: boolean;
  onOpenShareModal?: () => void;
  onOpenCoachLogin?: () => void;
  onSwitchToSpectator?: () => void;
  onOpenTransferModal?: () => void;
  onOpenTeamExportImport?: (tab?: 'export' | 'import') => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentTab,
  onSelectTab,
  activeMatch,
  clubProfile,
  roomId,
  onExitRoom,
  onOpenClubProfile,
  onOpenLegalModal,
  onOpenNewMatchModal,
  onOpenSettingsModal,
  soundEnabled,
  onToggleSound,
  readOnly = false,
  onOpenShareModal,
  onOpenCoachLogin,
  onSwitchToSpectator,
  onOpenTransferModal,
  onOpenTeamExportImport,
}) => {
  const { t } = useLanguage();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const clubName = clubProfile?.name || 'MÓJ KLUB KOSZYKARSKI';
  const season = clubProfile?.season || '26/27';

  const closeMenuAndRun = (fn?: () => void) => {
    setIsMobileMenuOpen(false);
    if (fn) fn();
  };

  const handleTabSelect = (tab: 'home' | 'live' | 'roster' | 'history' | 'parent') => {
    setIsMobileMenuOpen(false);
    onSelectTab(tab);
  };

  return (
    <header className="w-full bg-slate-900 border-b border-slate-800 text-slate-100 relative z-30 shadow-md">
      {/* Top Banner */}
      <div className="max-w-7xl mx-auto px-3 sm:px-4 py-2 flex items-center justify-between gap-2">
        {/* Brand identity - Click to go Home (flex-1 min-w-0 guarantees zero overlap) */}
        <div
          onClick={() => handleTabSelect('home')}
          className="flex items-center gap-2.5 cursor-pointer select-none group min-w-0 flex-1"
        >
          <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-md shadow-orange-950/40 shrink-0 border border-amber-300/40 overflow-hidden">
            {clubProfile?.badgeLogoUrl ? (
              <img src={clubProfile.badgeLogoUrl} alt="Logo" className="w-full h-full object-contain" />
            ) : (
              <span className="text-xl leading-none">{clubProfile?.badgeEmoji || '🏀'}</span>
            )}
          </div>

          <div className="leading-tight min-w-0 flex-1">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="font-black text-xs sm:text-sm tracking-tight text-white group-hover:text-amber-400 transition truncate max-w-[165px] sm:max-w-[260px] lg:max-w-[240px]">
                {clubName}
              </span>
              <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-amber-400/10 text-amber-300 border border-amber-400/30 shrink-0 leading-none">
                {season}
              </span>
              {readOnly ? (
                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center gap-0.5 shrink-0 leading-none">
                  <Eye className="w-2.5 h-2.5" />
                  <span>RODZIC / KIBIC</span>
                </span>
              ) : (
                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 shrink-0 leading-none">
                  TRENER
                </span>
              )}
            </div>
            <p className="text-[10px] text-slate-400 font-semibold tracking-wider uppercase truncate mt-0.5">
              {readOnly
                ? `Podgląd Wyników • ${clubProfile?.city || 'Na Żywo'}`
                : `${clubProfile?.city || 'Statystyki Meczowe'} • Protokół Live`}
              {roomId ? ` • Pokój: ${roomId}` : ''}
            </p>
          </div>
        </div>

        {/* MOBILE & COMPACT VIEW (< lg): Clean Hamburger Menu button — zero overlap with club logo & season */}
        <div className="flex lg:hidden items-center shrink-0">
          <button
            type="button"
            onClick={() => setIsMobileMenuOpen((prev) => !prev)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border font-bold text-xs transition active:scale-95 ${
              isMobileMenuOpen
                ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-md'
                : 'bg-slate-800 hover:bg-slate-700 text-amber-400 border-slate-700'
            }`}
            aria-label={isMobileMenuOpen ? 'Zamknij menu' : 'Otwórz menu'}
            aria-expanded={isMobileMenuOpen}
          >
            {isMobileMenuOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
            <span>Menu</span>
          </button>
        </div>

        {/* DESKTOP VIEW (>= lg): Full inline action toolbar */}
        <div className="hidden lg:flex items-center gap-1.5 shrink-0">
          {!readOnly && (
            <>
              {onOpenClubProfile && (
                <button
                  onClick={onOpenClubProfile}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-400 border border-amber-500/30 font-bold text-xs transition active:scale-95 shadow-sm"
                  title="Edytuj dane klubu, barwy i kategorie"
                >
                  <Shield className="w-3.5 h-3.5 text-amber-400" />
                  <span>Klub</span>
                </button>
              )}

              {onOpenLegalModal && (
                <button
                  onClick={onOpenLegalModal}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-indigo-300 border border-indigo-500/30 font-bold text-xs transition active:scale-95 shadow-sm"
                  title="Google Play Store, Licencje & Prawa autorskie"
                >
                  <Scale className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Google Play</span>
                </button>
              )}

              {onOpenNewMatchModal && (
                <button
                  onClick={onOpenNewMatchModal}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 font-black text-xs transition active:scale-95 shadow-md shadow-orange-950/40"
                  title="Rozpocznij nowy mecz"
                >
                  <PlusCircle className="w-3.5 h-3.5" />
                  <span>{t('nav.newMatch', 'Nowy Mecz')}</span>
                </button>
              )}

              {onOpenShareModal && (
                <button
                  onClick={onOpenShareModal}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-400 border border-amber-500/30 font-bold text-xs transition active:scale-95"
                  title="Udostępnij publiczny link do podglądu dla rodziców"
                >
                  <Share2 className="w-3.5 h-3.5" />
                  <span>{t('nav.share', 'Udostępnij')}</span>
                </button>
              )}

              {onOpenTeamExportImport && (
                <button
                  type="button"
                  onClick={() => onOpenTeamExportImport('export')}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-emerald-400 border border-emerald-500/30 font-bold text-xs transition active:scale-95 shadow-sm"
                  title="Eksport & Import drużyny: dane klubu, zdjęcia i dane zawodników, wyniki meczów (JSON + E-mail)"
                >
                  <Mail className="w-3.5 h-3.5 text-emerald-400" />
                  <span>{t('nav.teamExport', 'Eksport / E-mail')}</span>
                </button>
              )}

              {onOpenTransferModal && (
                <button
                  type="button"
                  onClick={onOpenTransferModal}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-sky-400 border border-sky-500/30 font-bold text-xs transition active:scale-95"
                  title="Przesyłanie i synchronizacja danych: Telefon 📱 ⇄ Komputer 💻"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>{t('nav.sync', 'Transfer / Sync')}</span>
                </button>
              )}

              {onSwitchToSpectator && (
                <button
                  onClick={onSwitchToSpectator}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 font-bold text-xs transition active:scale-95"
                  title="Wyloguj trenera / Zablokuj edycję (przejdź do trybu widza)"
                >
                  <Eye className="w-3.5 h-3.5 text-sky-400" />
                  <span>{t('nav.spectatorView', 'Zablokuj (Widz)')}</span>
                </button>
              )}
            </>
          )}

          {readOnly && onOpenCoachLogin && (
            <button
              onClick={onOpenCoachLogin}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/40 font-bold text-xs transition active:scale-95 shadow-sm"
              title="Zaloguj się jako trener (kod PIN), aby odblokować pełną edycję meczów"
            >
              <Lock className="w-3.5 h-3.5 text-amber-400" />
              <span>{t('nav.coach', 'Strefa Trenera')}</span>
            </button>
          )}

          {onExitRoom && (
            <button
              type="button"
              onClick={onExitRoom}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 font-bold text-xs transition active:scale-95"
              title="Wróć do listy pokoi / Zmień drużynę"
            >
              <DoorOpen className="w-3.5 h-3.5 text-amber-400" />
              <span>Pokoje</span>
            </button>
          )}

          <LanguageSwitcher />
          <PWAInstallButton />

          <button
            onClick={onToggleSound}
            className={`p-2 rounded-xl border transition ${
              soundEnabled
                ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400'
                : 'bg-slate-800 border-slate-700 text-slate-500 hover:text-slate-300'
            }`}
            title={soundEnabled ? t('nav.ttsOn', 'Lektor TTS włączony') : t('nav.ttsOff', 'Lektor wyłączony')}
          >
            {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
          </button>

          {!readOnly && onOpenSettingsModal && (
            <button
              onClick={onOpenSettingsModal}
              className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition"
              title={t('nav.settings', 'Ustawienia i instrukcja PWA')}
            >
              <Settings className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* MOBILE HAMBURGER DRAWER (< lg) */}
      {isMobileMenuOpen && (
        <div className="lg:hidden bg-slate-950 border-t border-slate-800 px-3 py-3 space-y-3">
          {!readOnly ? (
            <>
              {onOpenNewMatchModal && (
                <button
                  type="button"
                  onClick={() => closeMenuAndRun(onOpenNewMatchModal)}
                  className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-slate-950 font-black text-sm flex items-center justify-center gap-2 shadow-md active:scale-98"
                >
                  <PlusCircle className="w-4 h-4" />
                  <span>{t('nav.newMatch', 'Nowy Mecz')}</span>
                </button>
              )}

              <div className="grid grid-cols-2 gap-2">
                {onOpenClubProfile && (
                  <button
                    type="button"
                    onClick={() => closeMenuAndRun(onOpenClubProfile)}
                    className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-amber-400 border border-amber-500/30 font-bold text-xs text-left"
                  >
                    <Shield className="w-4 h-4 shrink-0" />
                    <span className="truncate">Edycja Klubu</span>
                  </button>
                )}

                {onOpenLegalModal && (
                  <button
                    type="button"
                    onClick={() => closeMenuAndRun(onOpenLegalModal)}
                    className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-indigo-300 border border-indigo-500/30 font-bold text-xs text-left"
                  >
                    <Scale className="w-4 h-4 shrink-0 text-indigo-400" />
                    <span className="truncate">Google Play & Licencje</span>
                  </button>
                )}

                {onOpenShareModal && (
                  <button
                    type="button"
                    onClick={() => closeMenuAndRun(onOpenShareModal)}
                    className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-amber-300 border border-amber-500/30 font-bold text-xs text-left"
                  >
                    <Share2 className="w-4 h-4 shrink-0" />
                    <span className="truncate">{t('nav.share', 'Udostępnij')}</span>
                  </button>
                )}

                {onOpenTeamExportImport && (
                  <button
                    type="button"
                    onClick={() => closeMenuAndRun(() => onOpenTeamExportImport('export'))}
                    className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-emerald-400 border border-emerald-500/30 font-bold text-xs text-left"
                  >
                    <Mail className="w-4 h-4 shrink-0" />
                    <span className="truncate">{t('nav.teamExport', 'Eksport / E-mail')}</span>
                  </button>
                )}

                {onOpenTransferModal && (
                  <button
                    type="button"
                    onClick={() => closeMenuAndRun(onOpenTransferModal)}
                    className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-sky-400 border border-sky-500/30 font-bold text-xs text-left"
                  >
                    <RefreshCw className="w-4 h-4 shrink-0" />
                    <span className="truncate">{t('nav.sync', 'Transfer / Sync')}</span>
                  </button>
                )}

                {onOpenSettingsModal && (
                  <button
                    type="button"
                    onClick={() => closeMenuAndRun(onOpenSettingsModal)}
                    className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700 font-bold text-xs text-left"
                  >
                    <Settings className="w-4 h-4 shrink-0 text-amber-400" />
                    <span className="truncate">{t('nav.settings', 'Ustawienia')}</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => closeMenuAndRun(onToggleSound)}
                  className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border font-bold text-xs text-left ${
                    soundEnabled
                      ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
                      : 'bg-slate-900 border-slate-700 text-slate-400'
                  }`}
                >
                  {soundEnabled ? <Volume2 className="w-4 h-4 shrink-0" /> : <VolumeX className="w-4 h-4 shrink-0" />}
                  <span className="truncate">{soundEnabled ? 'Lektor: WŁ' : 'Lektor: WYŁ'}</span>
                </button>

                {onSwitchToSpectator && (
                  <button
                    type="button"
                    onClick={() => closeMenuAndRun(onSwitchToSpectator)}
                    className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-700 font-bold text-xs text-left"
                  >
                    <Eye className="w-4 h-4 shrink-0 text-sky-400" />
                    <span className="truncate">{t('nav.spectatorView', 'Zablokuj (Widz)')}</span>
                  </button>
                )}
              </div>
            </>
          ) : (
            <div className="space-y-2">
              {onOpenCoachLogin && (
                <button
                  type="button"
                  onClick={() => closeMenuAndRun(onOpenCoachLogin)}
                  className="w-full py-3 px-4 rounded-xl bg-amber-500/20 border border-amber-500/40 text-amber-300 font-black text-sm flex items-center justify-center gap-2"
                >
                  <Lock className="w-4 h-4" />
                  <span>{t('nav.coach', 'Strefa Trenera')} (PIN)</span>
                </button>
              )}

              <div className="grid grid-cols-2 gap-2">
                {onOpenShareModal && (
                  <button
                    type="button"
                    onClick={() => closeMenuAndRun(onOpenShareModal)}
                    className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-slate-900 border border-amber-500/30 text-amber-300 font-bold text-xs"
                  >
                    <Share2 className="w-4 h-4 shrink-0" />
                    <span className="truncate">{t('nav.share', 'Udostępnij')}</span>
                  </button>
                )}

                {onOpenTransferModal && (
                  <button
                    type="button"
                    onClick={() => closeMenuAndRun(onOpenTransferModal)}
                    className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-slate-900 border border-sky-500/30 text-sky-400 font-bold text-xs"
                  >
                    <RefreshCw className="w-4 h-4 shrink-0" />
                    <span className="truncate">{t('nav.sync', 'Transfer / Sync')}</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => closeMenuAndRun(onToggleSound)}
                  className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border font-bold text-xs col-span-2 ${
                    soundEnabled
                      ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
                      : 'bg-slate-900 border-slate-700 text-slate-400'
                  }`}
                >
                  {soundEnabled ? <Volume2 className="w-4 h-4 shrink-0" /> : <VolumeX className="w-4 h-4 shrink-0" />}
                  <span>{soundEnabled ? 'Lektor TTS: Włączony' : 'Lektor TTS: Wyłączony'}</span>
                </button>
              </div>
            </div>
          )}

          {/* Language, Exit Room & PWA Install */}
          <div className="pt-2 border-t border-slate-800 flex items-center justify-between gap-2 flex-wrap">
            <LanguageSwitcher align="left" />
            <div className="flex items-center gap-2">
              {onExitRoom && (
                <button
                  type="button"
                  onClick={() => closeMenuAndRun(onExitRoom)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700 font-bold text-xs"
                >
                  <LogOut className="w-3.5 h-3.5 text-amber-400" />
                  <span>Zmień pokój</span>
                </button>
              )}
              <PWAInstallButton />
            </div>
          </div>
        </div>
      )}

      {/* Navigation Tabs Bar (clean single-level layout without nested scroll containers) */}
      <div className="bg-slate-950/80 border-t border-slate-800/80 px-2 sm:px-4">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1.5 py-1.5">
          {/* Primary View Tabs */}
          <div className="flex items-center gap-1 overflow-x-auto scrollbar-none pb-0.5 sm:pb-0">
            <button
              onClick={() => handleTabSelect('home')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition whitespace-nowrap shrink-0 ${
                currentTab === 'home'
                  ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-950/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              <span>{readOnly ? t('nav.homeSpectator', '🏠 Wyniki & Przegląd') : t('nav.home', '🏠 Strona Główna')}</span>
            </button>

            <button
              onClick={() => handleTabSelect('live')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition whitespace-nowrap shrink-0 ${
                currentTab === 'live'
                  ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-950/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              <Flame className={`w-3.5 h-3.5 ${activeMatch ? 'text-rose-500' : ''}`} />
              <span>{t('nav.liveMatch', 'Mecz na żywo')}</span>
              {activeMatch && (
                <span className="w-2 h-2 rounded-full bg-rose-500 ml-0.5 shadow-sm shadow-rose-500/80" />
              )}
            </button>

            <button
              onClick={() => handleTabSelect('roster')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition whitespace-nowrap shrink-0 ${
                currentTab === 'roster'
                  ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-950/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>{readOnly ? t('nav.rosterSpectator', 'Zawodnicy & Eval') : t('nav.roster', 'Kadra / Skład')}</span>
            </button>

            <button
              onClick={() => handleTabSelect('history')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition whitespace-nowrap shrink-0 ${
                currentTab === 'history'
                  ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-950/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              <History className="w-3.5 h-3.5" />
              <span>{t('nav.history', 'Historia & Raporty')}</span>
            </button>

            <button
              onClick={() => handleTabSelect('parent')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition whitespace-nowrap shrink-0 ${
                currentTab === 'parent'
                  ? 'bg-rose-500 text-white shadow-md shadow-rose-950/40 ring-1 ring-rose-400'
                  : 'text-rose-400/90 hover:text-rose-300 hover:bg-rose-950/30'
              }`}
              title="Statystyki tylko własnego dziecka (do 3 dzieci w różnych klubach)"
            >
              <Heart className="w-3.5 h-3.5 fill-current" />
              <span>{t('nav.parentMode', 'Tryb Rodzica 👨‍👩‍👧')}</span>
            </button>
          </div>

          {roomId && (
            <div className="hidden sm:flex items-center gap-1.5 text-[11px] font-mono text-slate-400 shrink-0">
              <span>Pokój:</span>
              <span className="px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-amber-300 font-bold">
                {roomId}
              </span>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};

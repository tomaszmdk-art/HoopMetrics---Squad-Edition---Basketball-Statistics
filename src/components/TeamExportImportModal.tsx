import React, { useState, useRef, useEffect } from 'react';
import { ClubProfile, Match, Player, TeamCategory } from '../types/basketball';
import {
  buildTeamExportPackage,
  generateExportFilename,
  downloadJsonFile,
  canShareFiles,
  shareFileViaWebShare,
  buildEmailDraft,
  inspectImportJson,
  executeTeamImport,
  ImportPreviewResult,
  TeamExportPackage,
} from '../services/teamTransferService';
import { playClickSound, triggerHaptic } from '../services/tts';
import { getPlayerShortName } from '../services/playerDisplay';
import {
  fetchLzkoszClubs,
  fetchLzkoszClubTeams,
  fetchLzkoszTeamPreview,
  buildImportPreviewFromLzkosz,
  LzkoszClubSummary,
  LzkoszClubTeamOption,
} from '../services/lzkoszImportService';
import {
  Download,
  Upload,
  Mail,
  Share2,
  FileJson,
  Copy,
  Check,
  CheckCircle2,
  AlertCircle,
  X,
  Shield,
  Users,
  Trophy,
  Camera,
  Send,
  FileCheck,
  Sparkles,
  Info,
  Layers,
  Globe,
  Search,
  Loader2,
  Building2,
  ChevronRight,
} from 'lucide-react';

interface TeamExportImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  clubProfile: ClubProfile;
  players: Player[];
  matches: Match[];
  currentCategory?: TeamCategory;
  onDataImported: (
    updatedMatches: Match[],
    updatedPlayers: Player[],
    updatedClub?: ClubProfile
  ) => void;
  defaultTab?: 'export' | 'import';
  readOnly?: boolean;
}

export const TeamExportImportModal: React.FC<TeamExportImportModalProps> = ({
  isOpen,
  onClose,
  clubProfile,
  players,
  matches,
  onDataImported,
  defaultTab = 'export',
  readOnly = false,
}) => {
  const [activeTab, setActiveTab] = useState<'export' | 'import'>(readOnly ? 'import' : defaultTab);

  // Export State (always full team)
  const exportCategory: 'ALL' = 'ALL';
  const [includePhotos, setIncludePhotos] = useState<boolean>(true);
  const [recipientEmail, setRecipientEmail] = useState<string>('tomasz.mdk@gmail.com');
  const [copiedEmailText, setCopiedEmailText] = useState<boolean>(false);
  const [copiedJsonCode, setCopiedJsonCode] = useState<boolean>(false);
  const [exportSuccessMessage, setExportSuccessMessage] = useState<string | null>(null);
  const [showEmailPreview, setShowEmailPreview] = useState<boolean>(false);

  // Import State
  const [importSource, setImportSource] = useState<'lzkosz' | 'json'>(readOnly ? 'json' : 'lzkosz');
  const [importJsonText, setImportJsonText] = useState<string>('');
  const [importPreview, setImportPreview] = useState<ImportPreviewResult | null>(null);
  const [importMode, setImportMode] = useState<'merge' | 'overwrite'>('merge');
  const [isImporting, setIsImporting] = useState<boolean>(false);
  const [importSuccessMsg, setImportSuccessMsg] = useState<string | null>(null);
  const [importErrorMsg, setImportErrorMsg] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState<boolean>(false);

  // ŁZKosz Import State
  const [lzkoszUrl, setLzkoszUrl] = useState<string>('');
  const [lzkoszIncludePhotos, setLzkoszIncludePhotos] = useState<boolean>(true);
  const [isFetchingLzkoszTeam, setIsFetchingLzkoszTeam] = useState<boolean>(false);
  const [lzkoszClubs, setLzkoszClubs] = useState<LzkoszClubSummary[]>([]);
  const [isLoadingClubs, setIsLoadingClubs] = useState<boolean>(false);
  const [clubsLoadError, setClubsLoadError] = useState<string | null>(null);
  const [clubSearchQuery, setClubSearchQuery] = useState<string>('');
  const [selectedClub, setSelectedClub] = useState<{ id: string; name: string; city: string } | null>(null);
  const [clubTeams, setClubTeams] = useState<LzkoszClubTeamOption[]>([]);
  const [isLoadingClubTeams, setIsLoadingClubTeams] = useState<boolean>(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const clubsFetchInFlightRef = useRef<boolean>(false);

  const loadLzkoszClubsList = async (forceRefresh = false) => {
    if (clubsFetchInFlightRef.current) return;
    clubsFetchInFlightRef.current = true;
    setIsLoadingClubs(true);
    setClubsLoadError(null);
    try {
      const res = await fetchLzkoszClubs(forceRefresh);
      setLzkoszClubs(res.clubs || []);
    } catch (err: unknown) {
      setClubsLoadError(
        (err as Error)?.message || 'Nie udało się pobrać listy klubów z lzkosz.pl.'
      );
    } finally {
      clubsFetchInFlightRef.current = false;
      setIsLoadingClubs(false);
    }
  };

  // When modal opens, sync default tab
  useEffect(() => {
    if (isOpen) {
      setActiveTab(readOnly ? 'import' : defaultTab);
      setImportSource(readOnly ? 'json' : 'lzkosz');
      setImportSuccessMsg(null);
      setImportErrorMsg(null);
      setExportSuccessMessage(null);
    }
  }, [isOpen, defaultTab, readOnly]);

  // Lazy-load ŁZKosz clubs list when user switches to ŁZKosz import
  useEffect(() => {
    if (!isOpen || activeTab !== 'import' || importSource !== 'lzkosz') return;
    if (lzkoszClubs.length > 0 || clubsFetchInFlightRef.current) return;
    void loadLzkoszClubsList(false);
  }, [isOpen, activeTab, importSource, lzkoszClubs.length]);

  if (!isOpen) return null;

  // Build current export package for preview
  const currentExportPkg = buildTeamExportPackage(
    clubProfile,
    players,
    matches,
    exportCategory,
    includePhotos
  );
  const currentFilename = generateExportFilename(clubProfile, exportCategory);
  const currentJsonString = JSON.stringify(currentExportPkg, null, 2);
  const emailDraft = buildEmailDraft(currentExportPkg, recipientEmail, currentFilename);

  // Handler: Direct JSON Download
  const handleDownloadJson = () => {
    playClickSound();
    triggerHaptic(35);
    downloadJsonFile(currentJsonString, currentFilename);
    setExportSuccessMessage(
      `Pobrano plik "${currentFilename}" (${(currentJsonString.length / 1024).toFixed(1)} KB)!`
    );
    setTimeout(() => setExportSuccessMessage(null), 5000);
  };

  // Handler: Web Share API (Attach file directly to mail/apps)
  const handleNativeShare = async () => {
    playClickSound();
    triggerHaptic(40);
    const success = await shareFileViaWebShare(
      currentJsonString,
      currentFilename,
      emailDraft.subject,
      emailDraft.body
    );
    if (success) {
      setExportSuccessMessage('Udostępniono plik drużyny pomyślnie!');
      setTimeout(() => setExportSuccessMessage(null), 5000);
    } else {
      // If Web Share was cancelled or not supported, download file and open mailto as fallback!
      handleDownloadAndOpenMail();
    }
  };

  // Handler: Open Email Client (mailto:) + auto download file to attach
  const handleDownloadAndOpenMail = () => {
    playClickSound();
    triggerHaptic(40);
    // 1. Download file so user has it ready in Downloads
    downloadJsonFile(currentJsonString, currentFilename);

    // 2. Open mail client
    window.location.href = emailDraft.mailtoUrl;

    setExportSuccessMessage(
      `Otwarto program pocztowy i pobrano plik "${currentFilename}". Dołącz pobrany plik jako załącznik!`
    );
    setTimeout(() => setExportSuccessMessage(null), 7000);
  };

  // Handler: Copy email draft text to clipboard
  const handleCopyEmailText = async () => {
    playClickSound();
    triggerHaptic(25);
    try {
      await navigator.clipboard.writeText(
        `Temat: ${emailDraft.subject}\n\n${emailDraft.body}`
      );
      setCopiedEmailText(true);
      setTimeout(() => setCopiedEmailText(false), 3000);
    } catch {
      // fallback
    }
  };

  // Handler: Copy JSON string
  const handleCopyJsonCode = async () => {
    playClickSound();
    triggerHaptic(25);
    try {
      await navigator.clipboard.writeText(currentJsonString);
      setCopiedJsonCode(true);
      setTimeout(() => setCopiedJsonCode(false), 3000);
    } catch {
      // fallback
    }
  };

  // Import: Handle file selection
  const handleFileSelect = (file: File) => {
    if (!file) return;
    playClickSound();
    triggerHaptic(30);
    setImportSuccessMsg(null);
    setImportErrorMsg(null);

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      setImportJsonText(text);
      const preview = inspectImportJson(text);
      setImportPreview(preview);
      if (!preview.valid) {
        setImportErrorMsg(preview.error || 'Nieprawidłowy plik');
      }
    };
    reader.onerror = () => {
      setImportErrorMsg('Błąd odczytu pliku.');
    };
    reader.readAsText(file);
  };

  // Import: Drag and drop handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };
  const handleDragLeave = () => {
    setIsDragOver(false);
  };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      handleFileSelect(file);
    }
  };

  // Import: Execute submission
  const handleConfirmImport = async () => {
    if (!importPreview || !importPreview.valid) return;
    playClickSound();
    triggerHaptic(50);
    setIsImporting(true);
    setImportSuccessMsg(null);
    setImportErrorMsg(null);

    try {
      const result = await executeTeamImport(
        importPreview,
        importMode,
        clubProfile,
        players,
        matches,
        !readOnly
      );

      onDataImported(result.updatedMatches, result.updatedPlayers, result.updatedClub);

      setImportSuccessMsg(
        readOnly
          ? `Sukces! Zapisano lokalnie na tym urządzeniu: ${result.importedPlayersCount} zawodników (${result.importedPhotosCount} ze zdjęciami). Dane osobowe nie są wysyłane na serwer.`
          : importPreview.exportType === 'lzkosz'
            ? `Sukces! Zaimportowano z ŁZKosz.pl: ${result.importedPlayersCount} zawodników (${result.importedPhotosCount} ze zdjęciami) oraz zaktualizowano dane klubu "${result.updatedClub.name}".`
            : `Sukces! Zaimportowano: ${result.importedPlayersCount} zawodników (${result.importedPhotosCount} ze zdjęciami), ${result.importedMatchesCount} meczów oraz zaktualizowano dane klubu "${result.updatedClub.name}".`
      );
      setImportPreview(null);
      setImportJsonText('');
    } catch (err: unknown) {
      setImportErrorMsg((err as Error)?.message || 'Błąd podczas importu danych');
    } finally {
      setIsImporting(false);
    }
  };

  // ŁZKosz Import: Fetch team preview by URL
  const handleFetchLzkoszTeam = async (targetUrl?: string) => {
    const urlToLoad = (targetUrl ?? lzkoszUrl).trim();
    if (!urlToLoad) {
      setImportErrorMsg('Wklej adres strony drużyny na lzkosz.pl lub wybierz klub z listy.');
      return;
    }

    playClickSound();
    triggerHaptic(30);
    setIsFetchingLzkoszTeam(true);
    setImportErrorMsg(null);
    setImportSuccessMsg(null);
    setImportPreview(null);

    try {
      const response = await fetchLzkoszTeamPreview(urlToLoad, lzkoszIncludePhotos);
      if (response.kind === 'club') {
        setSelectedClub({
          id: response.clubId,
          name: response.clubName,
          city: response.city,
        });
        setClubTeams(response.teams || []);
        if (!response.teams || response.teams.length === 0) {
          setImportErrorMsg(`Klub "${response.clubName}" nie ma przypisanych aktywnych drużyn w bieżącym sezonie.`);
        }
        return;
      }

      const preview = buildImportPreviewFromLzkosz(response, clubProfile);
      setImportPreview(preview);
    } catch (err: unknown) {
      setImportErrorMsg(
        (err as Error)?.message || 'Nie udało się pobrać składu drużyny z lzkosz.pl.'
      );
    } finally {
      setIsFetchingLzkoszTeam(false);
    }
  };

  // ŁZKosz Import: Select club from directory to load its teams
  const handleSelectLzkoszClub = async (club: LzkoszClubSummary) => {
    playClickSound();
    triggerHaptic(25);
    setSelectedClub({ id: String(club.id), name: club.name, city: club.city });
    setClubTeams([]);
    setIsLoadingClubTeams(true);
    setImportErrorMsg(null);
    setImportSuccessMsg(null);

    try {
      const data = await fetchLzkoszClubTeams(club.id);
      setClubTeams(data.teams || []);
      if (!data.teams || data.teams.length === 0) {
        setImportErrorMsg(`Nie znaleziono aktywnych drużyn dla klubu "${club.name}".`);
      }
    } catch (err: unknown) {
      setImportErrorMsg(
        (err as Error)?.message || 'Nie udało się pobrać listy drużyn tego klubu.'
      );
    } finally {
      setIsLoadingClubTeams(false);
    }
  };

  const filteredLzkoszClubs = lzkoszClubs.filter((c) => {
    const q = clubSearchQuery.trim().toLowerCase();
    if (!q) return true;
    return (
      c.name.toLowerCase().includes(q) ||
      (c.licenceName && c.licenceName.toLowerCase().includes(q)) ||
      c.city.toLowerCase().includes(q)
    );
  });

  const hasNativeShareSupport = canShareFiles();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/90">
      <div className="w-full max-w-3xl rounded-3xl bg-slate-900 border border-slate-800 shadow-2xl text-slate-100 flex flex-col max-h-[92vh] overflow-hidden">
        {/* Header */}
        <div className="p-4 sm:p-5 bg-gradient-to-r from-slate-950 via-slate-900 to-amber-950/40 border-b border-slate-800 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 shrink-0">
              <Share2 className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base sm:text-lg font-black text-white flex items-center gap-2 flex-wrap">
                <span>{readOnly ? 'Import Składu Drużyny (Lokalnie)' : 'Eksport & Import Drużyny'}</span>
                <span className="text-[10px] sm:text-xs px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30 font-bold">
                  {readOnly ? 'RODO Safe • Tylko na tym urządzeniu' : 'JSON + E-mail ✉️'}
                </span>
              </h2>
              <p className="text-xs text-slate-400 truncate">
                {readOnly
                  ? 'Wczytaj plik od trenera, aby widzieć imiona, nazwiska i zdjęcia wyłącznie na tym urządzeniu'
                  : 'Dane klubu, zdjęcia i dane zawodników oraz wyniki spotkań'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition shrink-0"
            title="Zamknij"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Switcher */}
        {!readOnly && (
          <div className="flex border-b border-slate-800 bg-slate-950/70 p-1.5 gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => {
                playClickSound();
                setActiveTab('export');
              }}
              className={`flex-1 py-2.5 rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition ${
                activeTab === 'export'
                  ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-slate-950 shadow-md shadow-amber-950/40'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
              }`}
            >
              <Download className="w-4 h-4" />
              <span>1. Eksportuj Drużynę (JSON & E-mail)</span>
            </button>

            <button
              type="button"
              onClick={() => {
                playClickSound();
                setActiveTab('import');
              }}
              className={`flex-1 py-2.5 rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition ${
                activeTab === 'import'
                  ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-slate-950 shadow-md shadow-emerald-950/40'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
              }`}
            >
              <Upload className="w-4 h-4" />
              <span>2. Importuj Drużynę (ŁZKosz.pl / JSON)</span>
            </button>
          </div>
        )}

        {/* Body content */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-4 text-xs sm:text-sm flex-1">
          {/* TAB 1: EXPORT */}
          {!readOnly && activeTab === 'export' && (
            <div className="space-y-4">
              {/* Photo toggle */}
              <div className="bg-slate-950/80 p-4 rounded-2xl border border-slate-800 space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <Layers className="w-4 h-4 text-amber-400" />
                    <span className="font-bold text-white text-xs sm:text-sm">
                      Pełny eksport danych drużyny
                    </span>
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer select-none text-xs text-slate-300 hover:text-white">
                    <input
                      type="checkbox"
                      checked={includePhotos}
                      onChange={(e) => setIncludePhotos(e.target.checked)}
                      className="w-4 h-4 accent-amber-500 rounded cursor-pointer"
                    />
                    <Camera className="w-3.5 h-3.5 text-amber-400" />
                    <span className="font-semibold">Dołącz zdjęcia zawodników (Base64)</span>
                  </label>
                </div>
              </div>

              {/* Data Summary Card */}
              <div className="p-4 rounded-2xl bg-gradient-to-br from-slate-900 to-slate-950 border border-slate-800 space-y-3 shadow-inner">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center text-xl shadow-md border border-amber-300/30 overflow-hidden shrink-0">
                      {clubProfile.badgeLogoUrl ? (
                        <img
                          src={clubProfile.badgeLogoUrl}
                          alt="Logo"
                          className="w-full h-full object-contain"
                        />
                      ) : (
                        <span>{clubProfile.badgeEmoji || '🏀'}</span>
                      )}
                    </div>
                    <div>
                      <h3 className="font-black text-sm sm:text-base text-white">
                        {clubProfile.name}
                      </h3>
                      <p className="text-xs text-slate-400">
                        {clubProfile.city || 'Polska'} • Sezon {clubProfile.season || '2026/2027'}
                        {clubProfile.headCoach ? ` • Trener: ${clubProfile.headCoach}` : ''}
                      </p>
                    </div>
                  </div>
                  <span className="text-[11px] font-mono font-bold text-amber-400 bg-amber-500/10 px-2.5 py-1 rounded-full border border-amber-500/20 shrink-0">
                    Cała Drużyna
                  </span>
                </div>

                {/* Counters row */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 text-center">
                  <div className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800/80">
                    <div className="flex items-center justify-center gap-1 text-slate-400 text-[11px] mb-0.5">
                      <Users className="w-3 h-3 text-sky-400" />
                      <span>Zawodnicy</span>
                    </div>
                    <div className="font-mono font-black text-white text-base">
                      {currentExportPkg.metadata.playersCount}
                    </div>
                  </div>

                  <div className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800/80">
                    <div className="flex items-center justify-center gap-1 text-slate-400 text-[11px] mb-0.5">
                      <Camera className="w-3 h-3 text-amber-400" />
                      <span>Zdjęcia</span>
                    </div>
                    <div className="font-mono font-black text-amber-400 text-base">
                      {currentExportPkg.metadata.photosCount}
                    </div>
                  </div>

                  <div className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800/80">
                    <div className="flex items-center justify-center gap-1 text-slate-400 text-[11px] mb-0.5">
                      <Trophy className="w-3 h-3 text-emerald-400" />
                      <span>Mecze</span>
                    </div>
                    <div className="font-mono font-black text-emerald-400 text-base">
                      {currentExportPkg.metadata.matchesCount}
                    </div>
                  </div>

                  <div className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800/80">
                    <div className="flex items-center justify-center gap-1 text-slate-400 text-[11px] mb-0.5">
                      <Sparkles className="w-3 h-3 text-indigo-400" />
                      <span>Bilans</span>
                    </div>
                    <div className="font-mono font-black text-indigo-300 text-base">
                      {currentExportPkg.metadata.winsCount}W - {currentExportPkg.metadata.lossesCount}L
                    </div>
                  </div>
                </div>
              </div>

              {/* SECTION: EMAIL EXPORT (PROMINENT) */}
              <div className="p-4 rounded-2xl bg-gradient-to-r from-amber-950/30 via-slate-950 to-orange-950/30 border border-amber-500/30 space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-amber-500/20 flex items-center justify-center text-amber-400">
                      <Mail className="w-4 h-4" />
                    </div>
                    <div>
                      <span className="font-bold text-white text-xs sm:text-sm">
                        Wyślij eksport na e-mail
                      </span>
                      <p className="text-[11px] text-slate-400">
                        Wyślij plik JSON z podsumowaniem drużyny bezpośrednio na skrzynkę pocztową
                      </p>
                    </div>
                  </div>
                </div>

                {/* Recipient Email Input */}
                <div className="space-y-1.5 pt-1">
                  <label className="text-[11px] font-bold text-slate-300 block">
                    Adres e-mail odbiorcy:
                  </label>
                  <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                      <Mail className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                      <input
                        type="email"
                        value={recipientEmail}
                        onChange={(e) => setRecipientEmail(e.target.value)}
                        placeholder="np. trener@akademia.pl lub tomasz.mdk@gmail.com"
                        className="w-full bg-slate-900 border border-slate-700 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 font-mono"
                      />
                    </div>
                    {recipientEmail !== 'tomasz.mdk@gmail.com' && (
                      <button
                        type="button"
                        onClick={() => setRecipientEmail('tomasz.mdk@gmail.com')}
                        className="px-2.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-bold transition whitespace-nowrap border border-slate-700"
                        title="Przywróć domyślny e-mail"
                      >
                        tomasz.mdk@gmail.com
                      </button>
                    )}
                  </div>
                </div>

                {/* Actions Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                  {/* Share button (Native Web Share with file attachment if supported) */}
                  {hasNativeShareSupport ? (
                    <button
                      type="button"
                      onClick={handleNativeShare}
                      className="py-2.5 px-3 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 font-black text-xs flex items-center justify-center gap-2 transition active:scale-95 shadow-md shadow-amber-950/40"
                    >
                      <Share2 className="w-4 h-4" />
                      <span>Udostępnij plik mailem (z załącznikiem)</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={handleDownloadAndOpenMail}
                      className="py-2.5 px-3 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 font-black text-xs flex items-center justify-center gap-2 transition active:scale-95 shadow-md shadow-amber-950/40"
                    >
                      <Send className="w-4 h-4" />
                      <span>Otwórz program pocztowy (mailto:)</span>
                    </button>
                  )}

                  {/* Direct JSON Download Button */}
                  <button
                    type="button"
                    onClick={handleDownloadJson}
                    className="py-2.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-400 border border-amber-500/40 font-black text-xs flex items-center justify-center gap-2 transition active:scale-95 shadow-sm"
                  >
                    <Download className="w-4 h-4" />
                    <span>Pobierz plik JSON na urządzenie</span>
                  </button>
                </div>

                {/* Additional Helpers: Copy email body or Copy JSON */}
                <div className="flex items-center justify-between gap-2 pt-1 flex-wrap text-xs">
                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      type="button"
                      onClick={handleCopyEmailText}
                      className="px-2.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 text-[11px] font-semibold flex items-center gap-1.5 transition"
                    >
                      {copiedEmailText ? (
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                      ) : (
                        <Copy className="w-3.5 h-3.5 text-slate-400" />
                      )}
                      <span>
                        {copiedEmailText ? 'Skopiowano treść e-maila!' : 'Kopiuj treść e-maila'}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={handleCopyJsonCode}
                      className="px-2.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 text-[11px] font-semibold flex items-center gap-1.5 transition"
                    >
                      {copiedJsonCode ? (
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                      ) : (
                        <FileJson className="w-3.5 h-3.5 text-slate-400" />
                      )}
                      <span>{copiedJsonCode ? 'Skopiowano kod JSON!' : 'Kopiuj kod JSON'}</span>
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => setShowEmailPreview(!showEmailPreview)}
                    className="text-[11px] text-amber-400 hover:text-amber-300 underline font-semibold flex items-center gap-1"
                  >
                    <Info className="w-3 h-3" />
                    <span>{showEmailPreview ? 'Ukryj podgląd e-maila' : 'Zobacz podgląd e-maila'}</span>
                  </button>
                </div>

                {/* Expandable Email Preview */}
                {showEmailPreview && (
                  <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-[11px] space-y-1.5 font-mono text-slate-300 max-h-48 overflow-y-auto whitespace-pre-wrap">
                    <div className="font-bold text-amber-400 border-b border-slate-800 pb-1">
                      Temat: {emailDraft.subject}
                    </div>
                    <div>{emailDraft.body}</div>
                  </div>
                )}
              </div>

              {/* Success Notification Banner */}
              {exportSuccessMessage && (
                <div className="p-3 rounded-xl bg-emerald-950/60 border border-emerald-500/40 text-emerald-300 flex items-center gap-2.5 text-xs font-semibold animate-in fade-in">
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
                  <span>{exportSuccessMessage}</span>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: IMPORT */}
          {(readOnly || activeTab === 'import') && (
            <div className="space-y-4">
              {readOnly && (
                <div className="p-3.5 rounded-2xl bg-emerald-950/40 border border-emerald-500/30 text-emerald-200 flex items-start gap-2.5 text-xs leading-relaxed">
                  <Shield className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  <div>
                    <strong className="text-emerald-300 block mb-0.5">Prywatność i bezpieczeństwo (RODO):</strong>
                    Serwer meczu przechowuje wyłącznie numery na koszulkach. Wczytaj tutaj plik JSON otrzymany od trenera, aby w Twojej przeglądarce (lokalnie) wyświetlały się imiona, nazwiska i zdjęcia zawodników — dane nie zostaną nigdzie wysłane.
                  </div>
                </div>
              )}
              {/* Import Source Switcher */}
              <div className="grid grid-cols-2 gap-2 p-1 rounded-2xl bg-slate-950 border border-slate-800">
                <button
                  type="button"
                  onClick={() => {
                    playClickSound();
                    setImportSource('lzkosz');
                    setImportErrorMsg(null);
                  }}
                  className={`py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition ${
                    importSource === 'lzkosz'
                      ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40 shadow-sm'
                      : 'text-slate-400 hover:text-white hover:bg-slate-900'
                  }`}
                >
                  <Globe className="w-4 h-4" />
                  <span>Import ze strony ŁZKosz.pl</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    playClickSound();
                    setImportSource('json');
                    setImportErrorMsg(null);
                  }}
                  className={`py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition ${
                    importSource === 'json'
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-sm'
                      : 'text-slate-400 hover:text-white hover:bg-slate-900'
                  }`}
                >
                  <FileJson className="w-4 h-4" />
                  <span>Import z pliku JSON</span>
                </button>
              </div>

              {/* SOURCE A: ŁZKOSZ.PL */}
              {importSource === 'lzkosz' && (
                <div className="space-y-3">
                  {/* Direct Team Link Box */}
                  <div className="p-4 rounded-2xl bg-slate-950/80 border border-sky-500/30 space-y-3">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2">
                        <Globe className="w-4 h-4 text-sky-400 shrink-0" />
                        <span className="font-bold text-white text-xs sm:text-sm">
                          Wklej link do drużyny na lzkosz.pl
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          const sample = 'https://lzkosz.pl/liga/232/sezon/29/d/11203/uks-akademia-gortata';
                          setLzkoszUrl(sample);
                          handleFetchLzkoszTeam(sample);
                        }}
                        className="text-[11px] font-semibold text-sky-400 hover:text-sky-300 underline"
                      >
                        Przykład: UKS Akademia Gortata (U15M)
                      </button>
                    </div>

                    <div className="flex flex-col sm:flex-row gap-2">
                      <input
                        type="text"
                        value={lzkoszUrl}
                        onChange={(e) => setLzkoszUrl(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleFetchLzkoszTeam();
                          }
                        }}
                        placeholder="https://lzkosz.pl/liga/232/sezon/29/d/11203/uks-akademia-gortata"
                        className="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-sky-500 font-mono"
                      />
                      <button
                        type="button"
                        disabled={isFetchingLzkoszTeam}
                        onClick={() => handleFetchLzkoszTeam()}
                        className="px-4 py-2 rounded-xl bg-gradient-to-r from-sky-500 to-cyan-500 hover:from-sky-400 hover:to-cyan-400 text-slate-950 font-black text-xs flex items-center justify-center gap-1.5 transition active:scale-95 disabled:opacity-50 shrink-0"
                      >
                        {isFetchingLzkoszTeam ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Download className="w-4 h-4" />
                        )}
                        <span>{isFetchingLzkoszTeam ? 'Pobieranie...' : 'Pobierz skład'}</span>
                      </button>
                    </div>

                    <label className="flex items-center gap-2 cursor-pointer select-none text-[11px] text-slate-300 hover:text-white">
                      <input
                        type="checkbox"
                        checked={lzkoszIncludePhotos}
                        onChange={(e) => setLzkoszIncludePhotos(e.target.checked)}
                        className="w-3.5 h-3.5 accent-sky-500 rounded cursor-pointer"
                      />
                      <Camera className="w-3.5 h-3.5 text-sky-400" />
                      <span>Pobierz zdjęcia zawodników i herb klubu (do pracy offline i eksportu PDF)</span>
                    </label>
                  </div>

                  {/* Club Browser from ŁZKosz.pl */}
                  <div className="p-4 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-3">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2">
                        <Building2 className="w-4 h-4 text-amber-400 shrink-0" />
                        <span className="font-bold text-white text-xs sm:text-sm">
                          Lub wybierz klub z listy ŁZKosz.pl
                        </span>
                      </div>
                      {lzkoszClubs.length > 0 && (
                        <span className="text-[11px] text-slate-400 font-mono">
                          {lzkoszClubs.length} klubów
                        </span>
                      )}
                    </div>

                    <div className="relative">
                      <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                      <input
                        type="text"
                        value={clubSearchQuery}
                        onChange={(e) => setClubSearchQuery(e.target.value)}
                        placeholder="Szukaj klubu po nazwie lub mieście (np. Akademia Gortata, Widzew, ŁKS, Pabianice)..."
                        className="w-full bg-slate-900 border border-slate-700 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
                      />
                    </div>

                    {isLoadingClubs && (
                      <div className="py-4 text-center text-xs text-slate-400 flex items-center justify-center gap-2">
                        <Loader2 className="w-4 h-4 animate-spin text-sky-400" />
                        <span>Wczytywanie listy klubów ŁZKosz.pl...</span>
                      </div>
                    )}

                    {clubsLoadError && (
                      <div className="p-2.5 rounded-xl bg-rose-950/50 border border-rose-500/30 text-rose-300 text-xs flex items-center justify-between gap-2">
                        <span>{clubsLoadError}</span>
                        <button
                          type="button"
                          onClick={() => {
                            void loadLzkoszClubsList(true);
                          }}
                          className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-white font-bold text-[11px]"
                        >
                          Ponów
                        </button>
                      </div>
                    )}

                    {!isLoadingClubs && lzkoszClubs.length > 0 && (
                      <div className="max-h-44 overflow-y-auto space-y-1 pr-1">
                        {filteredLzkoszClubs.length === 0 ? (
                          <div className="py-3 text-center text-xs text-slate-500">
                            Brak klubów pasujących do wyszukiwania.
                          </div>
                        ) : (
                          filteredLzkoszClubs.map((club) => {
                            const isSelected = selectedClub?.id === String(club.id);
                            return (
                              <button
                                key={club.id}
                                type="button"
                                onClick={() => handleSelectLzkoszClub(club)}
                                className={`w-full text-left px-3 py-2 rounded-xl border transition flex items-center justify-between gap-2 ${
                                  isSelected
                                    ? 'bg-amber-500/15 border-amber-500/50 text-white'
                                    : 'bg-slate-900/70 border-slate-800 hover:border-slate-600 text-slate-200'
                                }`}
                              >
                                <div className="min-w-0">
                                  <div className="font-bold text-xs truncate">
                                    {club.licenceName || club.name}
                                  </div>
                                  <div className="text-[11px] text-slate-400 truncate">
                                    {club.city || 'Łódzkie'}
                                    {club.teamsCount > 0 ? ` • ${club.teamsCount} drużyn` : ''}
                                  </div>
                                </div>
                                <ChevronRight className="w-4 h-4 text-slate-500 shrink-0" />
                              </button>
                            );
                          })
                        )}
                      </div>
                    )}

                    {/* Club Teams Selector */}
                    {selectedClub && (
                      <div className="pt-2 border-t border-slate-800 space-y-2">
                        <div className="text-[11px] font-bold text-amber-300 flex items-center justify-between gap-2">
                          <span>Drużyny klubu: {selectedClub.name}</span>
                          {isLoadingClubTeams && <Loader2 className="w-3.5 h-3.5 animate-spin text-sky-400" />}
                        </div>
                        {!isLoadingClubTeams && clubTeams.length > 0 && (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                            {clubTeams.map((team) => (
                              <button
                                key={`${team.leagueId}-${team.seasonId}-${team.teamId}`}
                                type="button"
                                disabled={isFetchingLzkoszTeam}
                                onClick={() => {
                                  setLzkoszUrl(team.teamUrl);
                                  handleFetchLzkoszTeam(team.teamUrl);
                                }}
                                className="px-3 py-2 rounded-xl bg-slate-900 hover:bg-sky-950/50 border border-slate-700 hover:border-sky-500/50 text-left transition flex items-center justify-between gap-2 disabled:opacity-50"
                              >
                                <div className="min-w-0">
                                  <div className="text-xs font-black text-sky-300 truncate">
                                    {team.leagueName}
                                  </div>
                                  <div className="text-[11px] text-slate-400 truncate">
                                    {team.teamName}
                                  </div>
                                </div>
                                <Download className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* SOURCE B: JSON FILE */}
              {importSource === 'json' && (
                <>
                  {/* File upload drag and drop zone */}
                  <div
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                    className={`p-6 sm:p-8 rounded-2xl border-2 border-dashed text-center cursor-pointer transition select-none ${
                      isDragOver
                        ? 'border-emerald-400 bg-emerald-950/30 text-emerald-200'
                        : 'border-slate-700 bg-slate-950/60 hover:border-slate-500 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <input
                      type="file"
                      ref={fileInputRef}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleFileSelect(file);
                      }}
                      accept=".json,application/json"
                      className="hidden"
                    />
                    <FileJson className="w-12 h-12 mx-auto mb-2 text-emerald-400 opacity-80" />
                    <h4 className="text-sm sm:text-base font-bold text-white mb-1">
                      Kliknij lub przeciągnij plik kopii zapasowej (.json)
                    </h4>
                    <p className="text-xs text-slate-400 max-w-md mx-auto">
                      Obsługuje pełny eksport drużyny: dane klubu, zdjęcia zawodników w wysokiej rozdzielczości oraz wszystkie protokoły meczowe.
                    </p>
                  </div>

                  {/* Direct Paste JSON Textarea Toggle */}
                  <div className="space-y-1">
                    <details className="group">
                      <summary className="text-[11px] font-semibold text-slate-400 hover:text-white cursor-pointer select-none">
                        ▶ Lub wklej zawartość tekstową JSON ze schowka
                      </summary>
                      <div className="pt-2 space-y-2">
                        <textarea
                          value={importJsonText}
                          onChange={(e) => {
                            const val = e.target.value;
                            setImportJsonText(val);
                            if (val.trim()) {
                              const preview = inspectImportJson(val);
                              setImportPreview(preview);
                              if (!preview.valid) setImportErrorMsg(preview.error || 'Błąd formatu');
                              else setImportErrorMsg(null);
                            } else {
                              setImportPreview(null);
                            }
                          }}
                          placeholder="Wklej tutaj kod JSON..."
                          rows={4}
                          className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs text-white font-mono focus:outline-none focus:border-emerald-500"
                        />
                      </div>
                    </details>
                  </div>
                </>
              )}

              {/* Import Preview Card (When file, JSON text, or ŁZKosz team is loaded and valid) */}
              {importPreview && importPreview.valid && (
                <div className="p-4 rounded-2xl bg-gradient-to-br from-slate-900 to-slate-950 border border-emerald-500/40 space-y-3.5 shadow-xl animate-in fade-in">
                  <div className="flex items-center justify-between flex-wrap gap-2 border-b border-slate-800 pb-2.5">
                    <div className="flex items-center gap-2 text-emerald-400 font-bold text-xs sm:text-sm">
                      <FileCheck className="w-5 h-5 shrink-0" />
                      <span>
                        {importPreview.exportType === 'lzkosz'
                          ? 'Pobrano skład drużyny z ŁZKosz.pl:'
                          : 'Rozpoznano poprawny plik drużyny:'}
                      </span>
                    </div>
                    {importPreview.sourceLabel ? (
                      <span className="text-[11px] text-sky-300 font-mono">
                        {importPreview.sourceLabel}
                      </span>
                    ) : importPreview.exportedAt ? (
                      <span className="text-[11px] text-slate-400 font-mono">
                        Data eksportu: {new Date(importPreview.exportedAt).toLocaleDateString('pl-PL')}
                      </span>
                    ) : null}
                  </div>

                  {importPreview.warnings && importPreview.warnings.length > 0 && (
                    <div className="p-2.5 rounded-xl bg-amber-950/40 border border-amber-500/30 text-amber-200 text-[11px] space-y-1">
                      {importPreview.warnings.map((w, idx) => (
                        <div key={idx} className="flex items-start gap-1.5">
                          <Info className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                          <span>{w}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Club info preview */}
                  {importPreview.clubProfile && (
                    <div className="flex items-center gap-3 p-2.5 rounded-xl bg-slate-950/80 border border-slate-800">
                      <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-xl shrink-0 overflow-hidden">
                        {importPreview.clubProfile.badgeLogoUrl ? (
                          <img
                            src={importPreview.clubProfile.badgeLogoUrl}
                            alt="Logo"
                            className="w-full h-full object-contain"
                          />
                        ) : (
                          <span>{importPreview.clubProfile.badgeEmoji || '🏀'}</span>
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="font-black text-white text-xs sm:text-sm truncate">
                          {importPreview.clubProfile.name}
                        </div>
                        <div className="text-[11px] text-slate-400 truncate">
                          {importPreview.clubProfile.city} • Sezon {importPreview.clubProfile.season}
                          {importPreview.clubProfile.headCoach
                            ? ` • Trener: ${importPreview.clubProfile.headCoach}`
                            : ''}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Summary grid */}
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="p-2 rounded-xl bg-slate-950/70 border border-slate-800">
                      <div className="text-[11px] text-slate-400">Zawodnicy</div>
                      <div className="font-mono font-black text-white text-base">
                        {importPreview.players.length}
                      </div>
                    </div>

                    <div className="p-2 rounded-xl bg-slate-950/70 border border-slate-800">
                      <div className="text-[11px] text-slate-400">Zdjęcia</div>
                      <div className="font-mono font-black text-amber-400 text-base">
                        {importPreview.photosCount}
                      </div>
                    </div>

                    <div className="p-2 rounded-xl bg-slate-950/70 border border-slate-800">
                      <div className="text-[11px] text-slate-400">Mecze</div>
                      <div className="font-mono font-black text-emerald-400 text-base">
                        {importPreview.matches.length}
                      </div>
                    </div>
                  </div>

                  {/* Preview Player Photos / Avatars */}
                  {importPreview.players.length > 0 && (
                    <div className="space-y-1.5">
                      <span className="text-[11px] font-bold text-slate-300 block">
                        Podgląd składu ({importPreview.players.length} graczy):
                      </span>
                      <div className="flex items-center gap-2 overflow-x-auto scrollbar-none py-1">
                        {importPreview.players.slice(0, 10).map((p) => (
                          <div
                            key={p.id}
                            className="flex flex-col items-center gap-1 shrink-0 p-1.5 rounded-xl bg-slate-950 border border-slate-800 w-16 text-center"
                          >
                            {p.photo ? (
                              <img
                                src={p.photo}
                                alt={getPlayerShortName(p)}
                                className="w-8 h-8 rounded-lg object-cover border border-amber-500/50"
                              />
                            ) : (
                              <div className="w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center font-mono font-bold text-amber-400 text-xs">
                                #{p.number}
                              </div>
                            )}
                            <span className="text-[9px] font-semibold text-slate-300 truncate w-full">
                              {getPlayerShortName(p)}
                            </span>
                          </div>
                        ))}
                        {importPreview.players.length > 10 && (
                          <div className="shrink-0 text-slate-500 text-xs font-bold px-2">
                            +{importPreview.players.length - 10} więcej
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Import Mode selection */}
                  <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                    <span className="text-[11px] font-bold text-slate-300 block">
                      Wybierz sposób importu danych:
                    </span>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <label
                        className={`p-2.5 rounded-xl border flex items-start gap-2.5 cursor-pointer transition ${
                          importMode === 'merge'
                            ? 'bg-emerald-950/40 border-emerald-500 text-white'
                            : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        <input
                          type="radio"
                          name="importMode"
                          checked={importMode === 'merge'}
                          onChange={() => setImportMode('merge')}
                          className="mt-0.5 accent-emerald-500"
                        />
                        <div className="text-xs">
                          <strong className="block text-emerald-300 font-bold">
                            Inteligentne scalanie (Zalecane)
                          </strong>
                          <span className="text-[11px] text-slate-400">
                            Dodaje nowych graczy, aktualizuje zdjęcia i mecze bez kasowania istniejących.
                          </span>
                        </div>
                      </label>

                      <label
                        className={`p-2.5 rounded-xl border flex items-start gap-2.5 cursor-pointer transition ${
                          importMode === 'overwrite'
                            ? 'bg-rose-950/40 border-rose-500 text-white'
                            : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        <input
                          type="radio"
                          name="importMode"
                          checked={importMode === 'overwrite'}
                          onChange={() => setImportMode('overwrite')}
                          className="mt-0.5 accent-rose-500"
                        />
                        <div className="text-xs">
                          <strong className="block text-rose-300 font-bold">
                            Pełne zastąpienie
                          </strong>
                          <span className="text-[11px] text-slate-400">
                            {importPreview.preserveExistingMatchesOnOverwrite
                              ? 'Zastępuje obecny skład zawodników i dane klubu (zapisane mecze pozostają bez zmian).'
                              : 'Zastępuje obecny skład i mecze zawartością wczytanego pliku.'}
                          </span>
                        </div>
                      </label>
                    </div>
                  </div>

                  {/* Submit Import Button */}
                  <button
                    type="button"
                    disabled={isImporting}
                    onClick={handleConfirmImport}
                    className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-black text-sm flex items-center justify-center gap-2 transition active:scale-98 shadow-lg shadow-emerald-950/50 disabled:opacity-50"
                  >
                    <CheckCircle2 className="w-5 h-5" />
                    <span>{isImporting ? 'Importowanie danych...' : 'Zatwierdź i Zaimportuj Dane Drużyny'}</span>
                  </button>
                </div>
              )}

              {/* Status & Error banners */}
              {importErrorMsg && (
                <div className="p-3.5 rounded-xl bg-rose-950/60 border border-rose-500/40 text-rose-300 flex items-center gap-2.5 text-xs font-semibold animate-in fade-in">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                  <span>{importErrorMsg}</span>
                </div>
              )}

              {importSuccessMsg && (
                <div className="p-3.5 rounded-xl bg-emerald-950/60 border border-emerald-500/40 text-emerald-300 flex items-center gap-2.5 text-xs font-semibold animate-in fade-in">
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
                  <span>{importSuccessMsg}</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-950 border-t border-slate-800 flex items-center justify-between shrink-0">
          <div className="text-[11px] text-slate-400 flex items-center gap-2">
            <span>BasketStats Pro</span>
            <span>•</span>
            <span>Eksport JSON + Zdjęcia Base64</span>
          </div>
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs transition"
          >
            Zamknij
          </button>
        </div>
      </div>
    </div>
  );
};

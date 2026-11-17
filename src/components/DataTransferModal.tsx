import React, { useState, useRef } from 'react';
import { Match, Player } from '../types/basketball';
import {
  exportAllDataAsJson,
  getCurrentRoomId,
  importDataFromJson,
  saveMatchesBulk,
} from '../services/db';
import {
  fetchServerState,
  pushServerStateImmediate,
} from '../services/syncService';
import { playClickSound, triggerHaptic } from '../services/tts';
import {
  Cloud,
  CloudUpload,
  CloudDownload,
  FileJson,
  Download,
  Upload,
  Smartphone,
  Monitor,
  CheckCircle2,
  AlertCircle,
  X,
  RefreshCw,
  ArrowRight,
  Share2,
  HelpCircle,
  FileCheck,
  Mail,
} from 'lucide-react';

interface DataTransferModalProps {
  isOpen: boolean;
  onClose: () => void;
  matches: Match[];
  players: Player[];
  activeMatchId: string | null;
  roomId?: string | null;
  onDataImported: (updatedMatches: Match[], updatedPlayers: Player[]) => void;
  onOpenTeamExportModal?: () => void;
}

export const DataTransferModal: React.FC<DataTransferModalProps> = ({
  isOpen,
  onClose,
  matches,
  players,
  activeMatchId,
  roomId,
  onDataImported,
  onOpenTeamExportModal,
}) => {
  const activeRoomId = roomId || getCurrentRoomId();
  const [activeTab, setActiveTab] = useState<'cloud' | 'file' | 'faq'>('cloud');
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<string | null>(null);
  const [syncSuccess, setSyncSuccess] = useState<boolean | null>(null);
  const [serverMatchesCount, setServerMatchesCount] = useState<number | null>(null);

  const [importStatus, setImportStatus] = useState<string | null>(null);
  const [importSuccess, setImportSuccess] = useState<boolean | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  // Manual Trigger: Push local data to server
  const handlePushToServer = async () => {
    playClickSound();
    triggerHaptic(30);
    setIsSyncing(true);
    setSyncStatus('Wysyłanie meczów i składu na serwer...');
    setSyncSuccess(null);

    try {
      const res = await pushServerStateImmediate(matches, players, activeMatchId);
      if (res.success) {
        setSyncSuccess(true);
        setSyncStatus(`Sukces! Wysłano mecze na serwer pokoju. Łącznie w chmurze: ${res.matchesCount ?? matches.length} meczów.`);
        setServerMatchesCount(res.matchesCount ?? matches.length);
        if (res.matches && res.matches.length > 0) {
          await saveMatchesBulk(res.matches);
          onDataImported(res.matches, players);
        }
      } else if (res.unauthorized) {
        setSyncSuccess(false);
        setSyncStatus('Brak uprawnień trenera — zaloguj się kodem PIN lub linkiem trenera, aby wysłać dane do pokoju.');
      } else {
        setSyncSuccess(false);
        setSyncStatus('Błąd połączenia z serwerem. Użyj eksportu do pliku JSON.');
      }
    } catch {
      setSyncSuccess(false);
      setSyncStatus('Nie udało się połączyć z serwerem. Sprawdź połączenie.');
    } finally {
      setIsSyncing(false);
    }
  };

  // Manual Trigger: Pull data from server to this device
  const handlePullFromServer = async () => {
    playClickSound();
    triggerHaptic(30);
    setIsSyncing(true);
    setSyncStatus('Pobieranie meczów z serwera...');
    setSyncSuccess(null);

    try {
      const serverData = await fetchServerState();
      if (!serverData) {
        setSyncSuccess(false);
        setSyncStatus('Serwer nie odpowiedział lub brak połączenia z siecią.');
        return;
      }

      const serverMatches = serverData.matches || [];
      const serverPlayers = serverData.players || [];
      setServerMatchesCount(serverMatches.length);

      if (serverMatches.length === 0) {
        setSyncSuccess(true);
        setSyncStatus('Serwer jest połączony, ale nie ma jeszcze zapisanych meczów w chmurze. Wyślij je najpierw z telefonu!');
        return;
      }

      // Merge server matches with local matches
      const mergedMap = new Map<string, Match>();
      for (const m of matches) {
        mergedMap.set(m.id, m);
      }
      for (const sm of serverMatches) {
        const local = mergedMap.get(sm.id);
        if (!local || (sm.updatedAt || 0) >= (local.updatedAt || 0)) {
          mergedMap.set(sm.id, sm);
        }
      }
      const finalMatches = Array.from(mergedMap.values()).sort(
        (a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)
      );

      // Save to IndexedDB
      await saveMatchesBulk(finalMatches);

      // Notify parent app
      onDataImported(finalMatches, serverPlayers.length > 0 ? serverPlayers : players);

      setSyncSuccess(true);
      setSyncStatus(`Pobrano pomyślnie! Masz teraz dostęp do ${finalMatches.length} meczów na tym komputerze.`);
    } catch {
      setSyncSuccess(false);
      setSyncStatus('Wystąpił błąd podczas pobierania danych.');
    } finally {
      setIsSyncing(false);
    }
  };

  // Export JSON file
  const handleExportJson = async () => {
    playClickSound();
    triggerHaptic(35);
    try {
      const jsonContent = await exportAllDataAsJson();
      const blob = new Blob([jsonContent], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const dateStr = new Date().toISOString().split('T')[0];
      a.href = url;
      a.download = `statystyki_koszykarskie_mecze_${dateStr}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setImportSuccess(true);
      setImportStatus(`Pobrano plik z ${matches.length} meczami! Możesz go teraz wysłać na komputer.`);
    } catch (err) {
      console.error(err);
      setImportSuccess(false);
      setImportStatus('Błąd podczas generowania pliku.');
    }
  };

  // Trigger file chooser
  const handleTriggerFileInput = () => {
    playClickSound();
    triggerHaptic(20);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
      fileInputRef.current.click();
    }
  };

  // Import JSON file
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    playClickSound();
    triggerHaptic(40);
    setImportStatus('Wczytywanie pliku...');
    setImportSuccess(null);

    try {
      const reader = new FileReader();
      reader.onload = async (event) => {
        try {
          const content = event.target?.result as string;
          if (!content) throw new Error('Pusty plik');

          const { importedMatches, importedPlayers, matchesCount } = await importDataFromJson(content);

          if (matchesCount === 0 && importedPlayers.length === 0) {
            setImportSuccess(false);
            setImportStatus('Plik nie zawiera poprawnych meczów ani zawodników.');
            return;
          }

          // Merge with current state
          const mergedMatchesMap = new Map<string, Match>();
          for (const m of matches) mergedMatchesMap.set(m.id, m);
          for (const m of importedMatches) mergedMatchesMap.set(m.id, m);
          const finalMatches = Array.from(mergedMatchesMap.values()).sort(
            (a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)
          );

          onDataImported(finalMatches, importedPlayers.length > 0 ? importedPlayers : players);

          // Also push to server so other devices see it
          pushServerStateImmediate(finalMatches, importedPlayers.length > 0 ? importedPlayers : players, activeMatchId);

          setImportSuccess(true);
          setImportStatus(`Sukces! Zaimportowano ${matchesCount} meczów. Są już widoczne w historii i statystykach.`);
        } catch {
          setImportSuccess(false);
          setImportStatus('Niepoprawny format pliku JSON.');
        }
      };
      reader.readAsText(file);
    } catch {
      setImportSuccess(false);
      setImportStatus('Błąd odczytu pliku.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/90">
      <div className="w-full max-w-2xl rounded-3xl bg-slate-900 border border-slate-800 shadow-2xl text-slate-100 flex flex-col max-h-[92vh] overflow-hidden">
        {/* Header */}
        <div className="p-4 sm:p-5 bg-gradient-to-r from-slate-950 via-slate-900 to-amber-950/40 border-b border-slate-800 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400">
              <RefreshCw className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black text-white flex items-center gap-2">
                <span>Transfer Danych</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30 font-bold">
                  Telefon 📱 ⇄ Komputer 💻
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Przesyłanie meczów i składu w pokoju{activeRoomId ? ` (${activeRoomId})` : ''}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition"
            title="Zamknij"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="flex border-b border-slate-800 bg-slate-950/60 p-1.5 gap-1 shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab('cloud')}
            className={`flex-1 py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition ${
              activeTab === 'cloud'
                ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-950/30'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <Cloud className="w-3.5 h-3.5" />
            <span>1. Synchronizacja w Chmurze</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('file')}
            className={`flex-1 py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition ${
              activeTab === 'file'
                ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-950/30'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <FileJson className="w-3.5 h-3.5" />
            <span>2. Plik JSON (Gwarancja 100%)</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('faq')}
            className={`py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition ${
              activeTab === 'faq'
                ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-950/30'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <HelpCircle className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Dlaczego tak to działa?</span>
          </button>
        </div>

        {/* Content body */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-4 text-xs sm:text-sm flex-1">
          {/* TAB 1: CLOUD SYNC */}
          {activeTab === 'cloud' && (
            <div className="space-y-4">
              <div className="bg-slate-950/80 p-4 rounded-2xl border border-slate-800 space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <Cloud className="w-5 h-5 text-amber-400" />
                    <span className="font-bold text-white text-sm sm:text-base">
                      Szybka synchronizacja jednym kliknięciem
                    </span>
                  </div>
                  <span className="text-[11px] px-2.5 py-1 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
                    Mecze na tym urządzeniu: <strong className="text-amber-400">{matches.length}</strong>
                  </span>
                </div>

                <p className="text-slate-300 leading-relaxed text-xs">
                  Jeśli prowadzisz mecz na telefonie i chcesz zobaczyć go na komputerze, wykonaj te 2 kroki:
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  {/* Step 1: Phone */}
                  <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-700/80 space-y-2">
                    <div className="flex items-center gap-2 font-bold text-amber-400 text-xs">
                      <Smartphone className="w-4 h-4 shrink-0" />
                      <span>KROK 1: Na telefonie</span>
                    </div>
                    <p className="text-slate-400 text-[11px]">
                      Kliknij przycisk poniżej, aby wysłać mecze z telefonu na serwer aplikacji:
                    </p>
                    <button
                      type="button"
                      disabled={isSyncing}
                      onClick={handlePushToServer}
                      className="w-full py-2.5 px-3 rounded-xl bg-amber-500 hover:bg-amber-400 active:scale-95 text-slate-950 font-black text-xs flex items-center justify-center gap-2 transition disabled:opacity-50 shadow-md shadow-amber-950/40"
                    >
                      <CloudUpload className="w-4 h-4" />
                      <span>{isSyncing ? 'Wysyłanie...' : 'Wyślij mecze na serwer'}</span>
                    </button>
                  </div>

                  {/* Step 2: Computer */}
                  <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-700/80 space-y-2">
                    <div className="flex items-center gap-2 font-bold text-sky-400 text-xs">
                      <Monitor className="w-4 h-4 shrink-0" />
                      <span>KROK 2: Na komputerze</span>
                    </div>
                    <p className="text-slate-400 text-[11px]">
                      Kliknij przycisk poniżej, aby pobrać mecze z serwera i zapisać w komputerze:
                    </p>
                    <button
                      type="button"
                      disabled={isSyncing}
                      onClick={handlePullFromServer}
                      className="w-full py-2.5 px-3 rounded-xl bg-sky-500 hover:bg-sky-400 active:scale-95 text-slate-950 font-black text-xs flex items-center justify-center gap-2 transition disabled:opacity-50 shadow-md shadow-sky-950/40"
                    >
                      <CloudDownload className="w-4 h-4" />
                      <span>{isSyncing ? 'Pobieranie...' : 'Pobierz mecze z serwera'}</span>
                    </button>
                  </div>
                </div>

                {/* Status banner */}
                {syncStatus && (
                  <div
                    className={`p-3 rounded-xl border flex items-center gap-2.5 text-xs font-semibold ${
                      syncSuccess
                        ? 'bg-emerald-950/60 border-emerald-500/40 text-emerald-300'
                        : 'bg-rose-950/60 border-rose-500/40 text-rose-300'
                    }`}
                  >
                    {syncSuccess ? (
                      <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
                    ) : (
                      <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                    )}
                    <span>{syncStatus}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 2: FILE JSON */}
          {activeTab === 'file' && (
            <div className="space-y-4">
              <div className="bg-slate-950/80 p-4 rounded-2xl border border-slate-800 space-y-3">
                <div className="flex items-center gap-2">
                  <FileJson className="w-5 h-5 text-amber-400" />
                  <span className="font-bold text-white text-sm sm:text-base">
                    Eksport & Import pliku kopii zapasowej (JSON)
                  </span>
                </div>

                <p className="text-slate-300 leading-relaxed text-xs">
                  To w 100% niezawodna metoda, która działa nawet wtedy, gdy na sali gimnastycznej nie ma internetu lub telefon i komputer są w innych sieciach:
                </p>

                {/* Direct Team Export & Email Feature Card */}
                {onOpenTeamExportModal && (
                  <div className="p-3.5 rounded-xl bg-gradient-to-r from-amber-500/15 via-orange-500/10 to-amber-500/15 border border-amber-500/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] uppercase font-black tracking-wider bg-amber-500 text-slate-950 px-2 py-0.5 rounded-md">
                          Nowość
                        </span>
                        <strong className="text-white text-xs font-bold">
                          Eksport drużyny (Klub, Zdjęcia zawodników, Wyniki) na e-mail
                        </strong>
                      </div>
                      <p className="text-[11px] text-slate-300 leading-snug">
                        Wyeksportuj całą drużynę wraz ze zdjęciami zawodników i wyślij gotowy plik JSON z podsumowaniem prosto na swoją skrzynkę e-mail.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        onOpenTeamExportModal();
                      }}
                      className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 active:scale-95 text-slate-950 font-black text-xs flex items-center justify-center gap-1.5 transition shrink-0 shadow-md shadow-amber-950/40"
                    >
                      <Mail className="w-3.5 h-3.5" />
                      <span>Otwórz kreator (JSON + E-mail)</span>
                    </button>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  {/* Export Box */}
                  <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-700/80 space-y-2">
                    <div className="flex items-center gap-2 font-bold text-amber-400 text-xs">
                      <Download className="w-4 h-4 shrink-0" />
                      <span>1. Eksportuj z telefonu</span>
                    </div>
                    <p className="text-slate-400 text-[11px]">
                      Zapisz plik z wszystkimi meczami i akcjami na telefonie:
                    </p>
                    <button
                      type="button"
                      onClick={handleExportJson}
                      className="w-full py-2.5 px-3 rounded-xl bg-amber-500 hover:bg-amber-400 active:scale-95 text-slate-950 font-black text-xs flex items-center justify-center gap-2 transition shadow-md shadow-amber-950/40"
                    >
                      <Download className="w-4 h-4" />
                      <span>Pobierz plik meczów (.json)</span>
                    </button>
                  </div>

                  {/* Import Box */}
                  <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-700/80 space-y-2">
                    <div className="flex items-center gap-2 font-bold text-emerald-400 text-xs">
                      <Upload className="w-4 h-4 shrink-0" />
                      <span>2. Wgraj na komputerze</span>
                    </div>
                    <p className="text-slate-400 text-[11px]">
                      Wybierz pobrany plik z telefonu (przesłany mailem lub AirDropem):
                    </p>
                    <input
                      type="file"
                      ref={fileInputRef}
                      onChange={handleFileChange}
                      accept=".json"
                      className="hidden"
                    />
                    <button
                      type="button"
                      onClick={handleTriggerFileInput}
                      className="w-full py-2.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white font-black text-xs flex items-center justify-center gap-2 transition shadow-md shadow-emerald-950/40"
                    >
                      <Upload className="w-4 h-4" />
                      <span>Wybierz i zaimportuj plik .json</span>
                    </button>
                  </div>
                </div>

                {/* Import Status banner */}
                {importStatus && (
                  <div
                    className={`p-3 rounded-xl border flex items-center gap-2.5 text-xs font-semibold ${
                      importSuccess
                        ? 'bg-emerald-950/60 border-emerald-500/40 text-emerald-300'
                        : 'bg-rose-950/60 border-rose-500/40 text-rose-300'
                    }`}
                  >
                    {importSuccess ? (
                      <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
                    ) : (
                      <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                    )}
                    <span>{importStatus}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 3: FAQ / EXPLANATION */}
          {activeTab === 'faq' && (
            <div className="bg-slate-950/80 p-4 rounded-2xl border border-slate-800 space-y-3.5 text-xs">
              <div className="flex items-center gap-2 font-bold text-amber-400 text-sm">
                <HelpCircle className="w-4 h-4" />
                <span>Dlaczego mecz prowadzony na telefonie nie pojawił się od razu na komputerze?</span>
              </div>

              <div className="space-y-2.5 text-slate-300 leading-relaxed">
                <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 space-y-1">
                  <strong className="text-white block">1. Bezpieczeństwo i Praca Offline (Hala sportowa)</strong>
                  <p className="text-slate-400">
                    Aplikacja została zaprojektowana jako nowoczesne PWA do pracy w halach sportowych, gdzie często nie ma zasięgu Wi-Fi ani sieci komórkowej. Dlatego każdy mecz jest natychmiast zapisywany w <strong>lokalnej pamięci Twojego telefonu (IndexedDB)</strong>. Nawet jeśli telefon straci zasięg, mecz nie przepadnie!
                  </p>
                </div>

                <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 space-y-1">
                  <strong className="text-white block">2. Dwa oddzielne urządzenia = dwie pamięci</strong>
                  <p className="text-slate-400">
                    Przeglądarka w telefonie i przeglądarka na komputerze to odrębne środowiska. Aby dane z telefonu trafiły na komputer, wystarczy:
                  </p>
                  <ul className="list-disc list-inside space-y-1 text-slate-300 pl-1 pt-1">
                    <li>
                      <strong className="text-amber-400">W Chmurze:</strong> na telefonie kliknąć <em>"Wyślij mecze na serwer"</em>, a na komputerze <em>"Pobierz mecze z serwera"</em>.
                    </li>
                    <li>
                      <strong className="text-emerald-400">Plikiem JSON:</strong> pobrać kopię z telefonu i wgrać na komputer.
                    </li>
                  </ul>
                </div>

                <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 space-y-1">
                  <strong className="text-white block">3. Podgląd na żywo podczas meczu (Kibic / Rodzice)</strong>
                  <p className="text-slate-400">
                    Jeśli prowadzisz mecz na telefonie, a rodzice lub kibice chcą śledzić wynik w czasie rzeczywistym, użyj przycisku <strong>"Udostępnij"</strong> w górnym pasku i wyślij im link z kodem pokoju. Wynik i akcje aktualizują się u nich na żywo!
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-950 border-t border-slate-800 flex items-center justify-between shrink-0">
          <div className="text-[11px] text-slate-400">
            Aplikacja Statystyk Meczowych • Sezon 2026/2027
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

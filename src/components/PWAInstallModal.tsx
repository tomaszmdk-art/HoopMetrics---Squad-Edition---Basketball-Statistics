import React, { useState } from 'react';
import { Download, Smartphone, CheckCircle, Share, PlusSquare, X } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

export const PWAInstallModal: React.FC<{ isOpen: boolean; onClose: () => void }> = ({
  isOpen,
  onClose,
}) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [installing, setInstalling] = useState(false);

  if (!isOpen) return null;

  const handleInstallClick = async () => {
    setInstalling(true);
    await install();
    setInstalling(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/90">
      <div className="relative w-full max-w-md rounded-2xl bg-slate-900 border border-slate-800 p-6 shadow-2xl text-slate-100">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition"
          aria-label="Zamknij"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 mb-4">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-lg shadow-orange-950/40">
            <Smartphone className="w-6 h-6 text-white" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-white">Zainstaluj na telefonie</h3>
            <p className="text-xs text-amber-400 font-medium">Aplikacja PWA do Statystyk Meczowych</p>
          </div>
        </div>

        {isInstalled ? (
          <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/30 p-4 text-emerald-300 text-sm flex items-center gap-3 mb-4">
            <CheckCircle className="w-5 h-5 text-emerald-400 shrink-0" />
            <span>Aplikacja jest już zainstalowana na Twoim urządzeniu w trybie pełnoekranowym!</span>
          </div>
        ) : (
          <p className="text-sm text-slate-300 mb-5 leading-relaxed">
            Dodaj aplikację do ekranu głównego telefonu z Androidem lub iOS. Zyskasz szybki start jednym kliknięciem, pełny ekran bez pasków przeglądarki oraz pełne działanie w hali sportowej bez dostępu do sieci.
          </p>
        )}

        {isInstallable && !isInstalled && (
          <button
            onClick={handleInstallClick}
            disabled={installing}
            className="w-full flex items-center justify-center gap-2.5 py-3.5 px-4 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 font-bold text-slate-950 shadow-lg shadow-orange-900/30 transition transform active:scale-98 mb-6"
          >
            <Download className="w-5 h-5" />
            {installing ? 'Instalowanie...' : 'Zainstaluj teraz (1 kliknięcie)'}
          </button>
        )}

        <div className="space-y-4 text-xs text-slate-300 border-t border-slate-800 pt-4">
          <div className="font-semibold text-slate-200 text-sm flex items-center gap-2">
            <span>📱 Instrukcja ręczna:</span>
          </div>

          <div className="rounded-xl bg-slate-950/60 p-3.5 border border-slate-800/80 space-y-2">
            <div className="font-bold text-amber-400 flex items-center gap-1.5">
              <span>Android (Google Chrome / Brave / Edge):</span>
            </div>
            <ol className="list-decimal list-inside space-y-1 text-slate-300 pl-1">
              <li>Otwórz menu przeglądarki (trzy kropki <strong>⋮</strong> w prawym górnym rogu).</li>
              <li>Wybierz opcję <strong>„Dodaj do ekranu głównego”</strong> lub <strong>„Zainstaluj aplikację”</strong>.</li>
              <li>Zatwierdź klikając <strong>„Dodaj”</strong>. Ikona pojawi się na pulpicie telefonu!</li>
            </ol>
          </div>

          {isIOS && (
            <div className="rounded-xl bg-slate-950/60 p-3.5 border border-slate-800/80 space-y-2">
              <div className="font-bold text-blue-400 flex items-center gap-1.5">
                <Share className="w-3.5 h-3.5" />
                <span>iPhone / iPad (Safari):</span>
              </div>
              <ol className="list-decimal list-inside space-y-1 text-slate-300 pl-1">
                <li>Kliknij przycisk <strong>Udostępnij</strong> (kwadrat ze strzałką w górę <Share className="w-3 h-3 inline" />).</li>
                <li>Przewiń w dół i wybierz <strong>„Do ekranu początkowego”</strong> (<PlusSquare className="w-3 h-3 inline" />).</li>
                <li>Kliknij <strong>„Dodaj”</strong> w prawym górnym rogu.</li>
              </ol>
            </div>
          )}
        </div>

        <button
          onClick={onClose}
          className="mt-6 w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium text-sm transition"
        >
          Rozumiem, zamknij
        </button>
      </div>
    </div>
  );
};

export const PWAInstallButton: React.FC = () => {
  const { isInstallable, isInstalled } = usePWAInstall();
  const [showModal, setShowModal] = useState(false);

  if (isInstalled) return null;

  return (
    <>
      <button
        onClick={() => setShowModal(true)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/40 text-amber-300 text-xs font-semibold transition active:scale-95"
        title="Zainstaluj aplikację na telefonie"
      >
        <Download className="w-3.5 h-3.5 text-amber-400" />
        <span className="hidden xs:inline">Instaluj</span> PWA
      </button>

      <PWAInstallModal isOpen={showModal} onClose={() => setShowModal(false)} />
    </>
  );
};

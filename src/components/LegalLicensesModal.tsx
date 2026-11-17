import React, { useState } from 'react';
import {
  Scale,
  ShieldCheck,
  Smartphone,
  ExternalLink,
  Copy,
  Check,
  FileText,
  AlertTriangle,
  Lock,
  Globe,
  Info,
  X,
} from 'lucide-react';
import { playClickSound, triggerHaptic } from '../services/tts';

interface LegalLicensesModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const LegalLicensesModal: React.FC<LegalLicensesModalProps> = ({ isOpen, onClose }) => {
  const [activeTab, setActiveTab] = useState<'google_play' | 'copyright' | 'privacy' | 'licenses'>('google_play');
  const [copiedText, setCopiedText] = useState(false);

  if (!isOpen) return null;

  const copyPrivacyPolicy = () => {
    playClickSound();
    triggerHaptic(20);
    const policy = `POLITYKA PRYWATNOŚCI I OCHRONA DANYCH - BASKETSTATS PRO
Wersja: 1.0 (Zgodna z RODO / GDPR oraz Google Play Families Policy)

1. Administrator Danych:
Aplikacja działa w modelu Local-First (przechowywanie na urządzeniu). Administratorem danych zawodników wprowadzonych do aplikacji jest klub sportowy, trener lub użytkownik obsługujący aplikację.

2. Zakres Przetwarzanych Danych:
Aplikacja umożliwia wprowadzanie danych meczowych: imię, nazwisko, numer na koszulce, pozycję na boisku oraz statystyki z gry (punkty, zbiórki, faule, asysty).

3. Brak Zewnętrznego Śledzenia i Reklam:
Aplikacja nie zawiera żadnych modułów reklamowych (brak SDK AdMob, Facebook Pixel itp.), nie profiluje użytkowników i nie sprzedaje danych podmiotom trzecim.

4. Ochrona Danych Osób Małoletnich (Google Play Families Policy):
W rozgrywkach młodzieżowych (np. kategorie U11, U13, U15) dane są wprowadzane wyłącznie za zgodą klubu sportowego/opiekunów prawnych w celu prowadzenia oficjalnego protokołu meczowego.

5. Prawa Użytkownika (RODO Art. 15-21):
Użytkownik ma pełne prawo do wglądu, modyfikacji, eksportu do pliku JSON/CSV oraz natychmiastowego usunięcia wszystkich danych jednym kliknięciem (opcja 'Usuń' w aplikacji).`;

    navigator.clipboard.writeText(policy);
    setCopiedText(true);
    setTimeout(() => setCopiedText(false), 2500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/90">
      <div className="w-full max-w-2xl rounded-2xl bg-slate-900 border border-slate-800 p-4 sm:p-6 shadow-2xl text-slate-100 max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-4 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-xl shadow-md border border-indigo-400/30">
              <Scale className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black text-white">Google Play, Licencje & Prawa Autorskie</h2>
              <p className="text-xs text-slate-400">Wytyczne prawne, sklep Google Play oraz polityka prywatności RODO</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg text-slate-400 hover:text-white transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Buttons */}
        <div className="flex items-center gap-1.5 p-1 bg-slate-950 rounded-xl border border-slate-800 mb-4 shrink-0 overflow-x-auto scrollbar-none text-xs font-bold">
          <button
            onClick={() => setActiveTab('google_play')}
            className={`px-3 py-2 rounded-lg transition whitespace-nowrap flex items-center gap-1.5 ${
              activeTab === 'google_play' ? 'bg-amber-500 text-slate-950 shadow' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Smartphone className="w-3.5 h-3.5" />
            <span>Sklep Google Play (TWA)</span>
          </button>
          <button
            onClick={() => setActiveTab('copyright')}
            className={`px-3 py-2 rounded-lg transition whitespace-nowrap flex items-center gap-1.5 ${
              activeTab === 'copyright' ? 'bg-amber-500 text-slate-950 shadow' : 'text-slate-400 hover:text-white'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Prawa do Nazw i Znaków</span>
          </button>
          <button
            onClick={() => setActiveTab('privacy')}
            className={`px-3 py-2 rounded-lg transition whitespace-nowrap flex items-center gap-1.5 ${
              activeTab === 'privacy' ? 'bg-amber-500 text-slate-950 shadow' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Lock className="w-3.5 h-3.5" />
            <span>Polityka RODO / Families</span>
          </button>
          <button
            onClick={() => setActiveTab('licenses')}
            className={`px-3 py-2 rounded-lg transition whitespace-nowrap flex items-center gap-1.5 ${
              activeTab === 'licenses' ? 'bg-amber-500 text-slate-950 shadow' : 'text-slate-400 hover:text-white'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Licencje Open Source</span>
          </button>
        </div>

        {/* Tab 1: Google Play publication */}
        <div className="flex-1 overflow-y-auto space-y-4 pr-1 text-xs">
          {activeTab === 'google_play' && (
            <div className="space-y-4">
              <div className="bg-emerald-500/10 border border-emerald-500/30 p-3.5 rounded-xl space-y-2">
                <div className="flex items-center gap-2 text-emerald-400 font-bold">
                  <Check className="w-4 h-4" />
                  <span>Aplikacja jest w 100% gotowa pod publikację w Google Play!</span>
                </div>
                <p className="text-slate-300 leading-relaxed">
                  Aplikacja spełnia wszystkie techniczne i formalne wymogi Google dla <strong>Trusted Web Activity (TWA)</strong>:
                  posiada poprawny plik manifestu PWA, Service Worker z buforowaniem offline, ikony maskowalne oraz politykę prywatności.
                </p>
              </div>

              <div className="bg-slate-950/80 p-4 rounded-xl border border-slate-800 space-y-3">
                <h4 className="font-bold text-white text-sm flex items-center gap-1.5">
                  <span className="w-5 h-5 rounded-full bg-amber-500 text-slate-950 font-black text-xs flex items-center justify-center">1</span>
                  <span>Jak wygenerować pakiet Android (.AAB) w 5 minut:</span>
                </h4>

                <div className="space-y-2.5 text-slate-300 leading-relaxed">
                  <div className="p-3 rounded-lg bg-slate-900 border border-slate-800">
                    <strong className="text-amber-400 block mb-1">Opcja A (Najprostsza - Bez instalacji narzędzi): PWABuilder</strong>
                    <ol className="list-decimal list-inside space-y-1 text-slate-400">
                      <li>Wejdź na stronę <code className="text-white bg-slate-950 px-1.5 py-0.5 rounded">https://pwabuilder.com</code></li>
                      <li>Wklej publiczny adres URL tej aplikacji (lub własną domenę).</li>
                      <li>Kliknij <strong>"Package for Google Play"</strong>.</li>
                      <li>Pobierz gotowy pakiet <strong>.AAB (Android App Bundle)</strong> podpisany Twoim kluczem.</li>
                    </ol>
                  </div>

                  <div className="p-3 rounded-lg bg-slate-900 border border-slate-800">
                    <strong className="text-amber-400 block mb-1">Opcja B (Oficjalne narzędzie Google): Bubblewrap CLI</strong>
                    <p className="text-slate-400 mb-2">Oficjalne narzędzie Google do konwersji PWA w natywną aplikację Android:</p>
                    <pre className="bg-slate-950 p-2.5 rounded-lg font-mono text-[11px] text-amber-300 overflow-x-auto">
{`npm install -g @bubblewrap/cli
bubblewrap init --manifest=https://twoja-domena.pl/manifest.webmanifest
bubblewrap build`}
                    </pre>
                  </div>
                </div>
              </div>

              <div className="bg-slate-950/80 p-4 rounded-xl border border-slate-800 space-y-2">
                <h4 className="font-bold text-white text-sm">Wymogi w Google Play Console:</h4>
                <ul className="space-y-1.5 text-slate-300">
                  <li className="flex items-center gap-2">
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    <span><strong>Konto Dewelopera Google Play:</strong> jednorazowa opłata rejestracyjna 25 USD.</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    <span><strong>Polityka Prywatności:</strong> link URL (skorzystaj z gotowego tekstu w zakładce obok).</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    <span><strong>Kategoria aplikacji:</strong> Sport / Narzędzia (Sports / Productivity).</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    <span><strong>Grupa docelowa:</strong> zaznacz 13+ (lub włącz Family Policy jeśli kierujesz do dzieci U11-U13).</span>
                  </li>
                </ul>
              </div>
            </div>
          )}

          {/* Tab 2: Copyright & Trademarks */}
          {activeTab === 'copyright' && (
            <div className="space-y-3">
              <div className="bg-slate-950/80 p-4 rounded-xl border border-slate-800 space-y-3">
                <div className="flex items-center gap-2 text-amber-400 font-bold text-sm">
                  <AlertTriangle className="w-4 h-4" />
                  <span>Kluczowa zasada: Neutralność i ochrona przed naruszeniem praw</span>
                </div>

                <div className="space-y-2 text-slate-300 leading-relaxed">
                  <p>
                    Publikując aplikację w Google Play, należy ściśle przestrzegać <strong>Google Play Impersonation & Intellectual Property Policy</strong>:
                  </p>
                  <ul className="space-y-2 list-disc list-inside text-slate-400 pl-1">
                    <li>
                      <strong className="text-white">Zakaz używania nazwisk znanych sportowców i znaków towarowych w tytule:</strong> Nie wolno publikować aplikacji komercyjnej z nazwą w stylu <em>"Gwiazdy Koszykówki Pro"</em>, <em>"NBA Tracker"</em> ani <em>"Oficjalna Aplikacja PZKosz"</em> bez oficjalnej pisemnej umowy licencyjnej z właścicielem praw.
                    </li>
                    <li>
                      <strong className="text-white">Architektura "White-Label" (Bezpieczna):</strong> Nasza aplikacja została zaprojektowana jako uniwersalne narzędzie <em>"BasketStats Pro - Protokół i Statystyki Koszykarskie"</em>. Aplikacja nie podszywa się pod żaden konkretny podmiot.
                    </li>
                    <li>
                      <strong className="text-white">Dane wprowadzane przez użytkownika (UGC):</strong> To trener lub klub sam konfiguruje nazwę swojego klubu i wgrywa herb. W świetle prawa i regulaminu Google jest to dozwolony użytek własny użytkownika.
                    </li>
                  </ul>
                </div>
              </div>

              <div className="bg-slate-950/80 p-4 rounded-xl border border-slate-800 space-y-2">
                <h4 className="font-bold text-white text-sm">Prawa do logotypów i herbów:</h4>
                <p className="text-slate-300 leading-relaxed">
                  Domyślne ikony w aplikacji to neutralne symbole sportowe (piłka do koszykówki, orzeł, lew, puchar). Klub korzystający z aplikacji może legalnie wgrać swój oficjalny herb, ponieważ posiada do niego prawa statutowe.
                </p>
              </div>
            </div>
          )}

          {/* Tab 3: Privacy & GDPR */}
          {activeTab === 'privacy' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-bold text-white text-sm">Polityka Prywatności (RODO / Google Play)</span>
                <button
                  type="button"
                  onClick={copyPrivacyPolicy}
                  className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 transition active:scale-95 shadow"
                >
                  {copiedText ? (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>Skopiowano!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Kopiuj treść polityki</span>
                    </>
                  )}
                </button>
              </div>

              <div className="bg-slate-950/90 p-4 rounded-xl border border-slate-800 font-mono text-[11px] leading-relaxed text-slate-300 space-y-2">
                <p className="font-bold text-amber-400">1. Przechowywanie danych (Local-First):</p>
                <p>Wszystkie dane meczowe i składy są przechowywane w pamięci urządzenia (IndexedDB / LocalStorage). Aplikacja nie wymaga logowania przez serwer centralny.</p>
                
                <p className="font-bold text-amber-400">2. Ochrona dzieci i młodzieży (U11 - U15):</p>
                <p>Aplikacja spełnia normy Google Play Families Policy: brak reklam, brak mikropłatności w trakcie meczu, brak geolokalizacji w tle.</p>

                <p className="font-bold text-amber-400">3. Prawo do bycia zapomnianym (RODO Art. 17):</p>
                <p>Trener lub rodzic może w dowolnym momencie usunąć profil zawodnika lub wyczyścić historię meczów jednym kliknięciem.</p>
              </div>
            </div>
          )}

          {/* Tab 4: Open Source Licenses */}
          {activeTab === 'licenses' && (
            <div className="space-y-3">
              <p className="text-slate-400">
                Aplikacja powstała w oparciu o sprawdzone, w pełni legalne biblioteki open-source na licencjach zezwalających na bezpłatną dystrybucję w Google Play:
              </p>

              <div className="space-y-2">
                {[
                  { name: 'React & React-DOM', license: 'MIT License', desc: 'Podstawa interfejsu użytkownika' },
                  { name: 'Tailwind CSS', license: 'MIT License', desc: 'Nowoczesny silnik stylów wizualnych' },
                  { name: 'Lucide Icons', license: 'ISC License', desc: 'Zestaw wektorowych ikon sportowych i narzędziowych' },
                  { name: 'jsPDF & jspdf-autotable', license: 'MIT License', desc: 'Generowanie raportów PDF protokołu meczowego' },
                  { name: 'Vite & vite-plugin-pwa', license: 'MIT License', desc: 'Budowanie PWA i obsługa trybu offline (Service Worker)' },
                  { name: 'Motion', license: 'MIT License', desc: 'Płynne animacje i przejścia' },
                ].map((lib) => (
                  <div key={lib.name} className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between">
                    <div>
                      <strong className="text-white block">{lib.name}</strong>
                      <span className="text-slate-500 text-[11px]">{lib.desc}</span>
                    </div>
                    <span className="px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 text-[10px] font-bold">
                      {lib.license}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="mt-4 pt-3 border-t border-slate-800 flex items-center justify-between shrink-0">
          <span className="text-[11px] text-slate-500 font-medium">
            BasketStats Pro • Gotowe do wdrożenia w Google Play
          </span>
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

import React, { useState, useEffect } from 'react';
import { ClubProfile, Player, TeamCategory } from '../types/basketball';
import { PRESET_CLUBS, parsePlayerText, bulkImportPlayers } from '../services/db';
import {
  Shield,
  Palette,
  Upload,
  Check,
  X,
  Plus,
  Sparkles,
  FileText,
  Trophy,
  Mail,
} from 'lucide-react';
import { playClickSound, triggerHaptic } from '../services/tts';

interface ClubProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  clubProfile: ClubProfile;
  onSaveClubProfile: (profile: ClubProfile) => Promise<void>;
  onApplyPreset?: (presetId: string) => Promise<void>;
  onPlayersUpdated?: () => Promise<void>;
  currentCategory?: TeamCategory;
  onOpenTeamExportModal?: () => void;
}

const EMOJI_OPTIONS = ['🏀', '🦅', '🦁', '⚡', '🏆', '🐺', '🛡️', '🔥', '🎯', '🚀', '👑', '🦈', '🐻', '⚔️'];

const COLOR_PRESETS = [
  { name: 'Pomarańczowy / Granat', primary: '#f97316', secondary: '#0a192f' },
  { name: 'Złoty / Ciemny Granat', primary: '#f59e0b', secondary: '#0a192f' },
  { name: 'Królewski Błękit / Grafit', primary: '#2563eb', secondary: '#0f172a' },
  { name: 'Szmaragd / Czerń', primary: '#10b981', secondary: '#090d16' },
  { name: 'Karmazyn / Złoto', primary: '#ef4444', secondary: '#18181b' },
  { name: 'Fiolet / Ciemny Świt', primary: '#8b5cf6', secondary: '#090d16' },
];

export const ClubProfileModal: React.FC<ClubProfileModalProps> = ({
  isOpen,
  onClose,
  clubProfile,
  onSaveClubProfile,
  onApplyPreset,
  onPlayersUpdated,
  onOpenTeamExportModal,
}) => {
  const [profile, setProfile] = useState<ClubProfile>(clubProfile);
  const [activeTab, setActiveTab] = useState<'info' | 'colors' | 'bulk_import' | 'presets'>('info');

  // Bulk import state
  const [bulkText, setBulkText] = useState('');
  const [previewPlayers, setPreviewPlayers] = useState<Player[]>([]);
  const [bulkSuccessMsg, setBulkSuccessMsg] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [pendingPresetId, setPendingPresetId] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setProfile(clubProfile);
      setPendingPresetId(null);
      setBulkSuccessMsg('');
    }
  }, [isOpen, clubProfile]);

  if (!isOpen) return null;

  const handleTextChange = (text: string) => {
    setBulkText(text);
    if (text.trim()) {
      const parsed = parsePlayerText(text, 'TEAM');
      setPreviewPlayers(parsed);
    } else {
      setPreviewPlayers([]);
    }
  };

  const handleBulkImportSubmit = async () => {
    if (!bulkText.trim()) return;
    playClickSound();
    triggerHaptic(30);
    setIsSaving(true);
    try {
      const imported = await bulkImportPlayers('TEAM', bulkText);
      setBulkSuccessMsg(`Dodano ${imported.length} zawodników do drużyny!`);
      setBulkText('');
      setPreviewPlayers([]);
      if (onPlayersUpdated) await onPlayersUpdated();
      setTimeout(() => setBulkSuccessMsg(''), 3000);
    } finally {
      setIsSaving(false);
    }
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = event.target?.result as string;
      setProfile((prev) => ({ ...prev, badgeLogoUrl: base64 }));
    };
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    setIsSaving(true);
    playClickSound();
    triggerHaptic(30);
    try {
      await onSaveClubProfile({
        ...profile,
        categories: ['TEAM'],
      });
      onClose();
    } finally {
      setIsSaving(false);
    }
  };

  const handleConfirmPreset = async (presetId: string) => {
    playClickSound();
    triggerHaptic(40);
    setIsSaving(true);
    try {
      if (onApplyPreset) {
        await onApplyPreset(presetId);
        setPendingPresetId(null);
        onClose();
      }
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/90">
      <div className="w-full max-w-2xl rounded-2xl bg-slate-900 border border-slate-800 p-4 sm:p-6 shadow-2xl text-slate-100 max-h-[92vh] flex flex-col">
        {/* Modal Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-4 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center text-xl shadow-md border border-amber-300/40">
              {profile.badgeLogoUrl ? (
                <img src={profile.badgeLogoUrl} alt="Logo" className="w-full h-full object-contain rounded-xl" />
              ) : (
                profile.badgeEmoji || '🏀'
              )}
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black text-white">Konfiguracja Drużyny & Składu</h2>
              <p className="text-xs text-slate-400">Dostosuj nazwę, herb, barwy oraz skład drużyny w tym pokoju</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg text-slate-400 hover:text-white transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Tabs inside modal */}
        <div className="flex items-center gap-1.5 p-1 bg-slate-950 rounded-xl border border-slate-800 mb-4 shrink-0 overflow-x-auto scrollbar-none text-xs font-bold">
          <button
            onClick={() => setActiveTab('info')}
            className={`px-3 py-2 rounded-lg transition whitespace-nowrap flex items-center gap-1.5 ${
              activeTab === 'info' ? 'bg-amber-500 text-slate-950 shadow' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Shield className="w-3.5 h-3.5" />
            <span>Dane & Herb</span>
          </button>
          <button
            onClick={() => setActiveTab('colors')}
            className={`px-3 py-2 rounded-lg transition whitespace-nowrap flex items-center gap-1.5 ${
              activeTab === 'colors' ? 'bg-amber-500 text-slate-950 shadow' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Palette className="w-3.5 h-3.5" />
            <span>Barwy & Wygląd</span>
          </button>
          <button
            onClick={() => setActiveTab('bulk_import')}
            className={`px-3 py-2 rounded-lg transition whitespace-nowrap flex items-center gap-1.5 ${
              activeTab === 'bulk_import' ? 'bg-amber-500 text-slate-950 shadow' : 'text-slate-400 hover:text-white'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Szybki Import Składu</span>
          </button>
          <button
            onClick={() => setActiveTab('presets')}
            className={`px-3 py-2 rounded-lg transition whitespace-nowrap flex items-center gap-1.5 ${
              activeTab === 'presets' ? 'bg-amber-500 text-slate-950 shadow' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Trophy className="w-3.5 h-3.5" />
            <span>Gotowe Szablony</span>
          </button>

          {onOpenTeamExportModal && (
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenTeamExportModal();
              }}
              className="px-3 py-2 rounded-lg transition whitespace-nowrap flex items-center gap-1.5 text-emerald-400 hover:text-white bg-slate-900 hover:bg-slate-800 border border-emerald-500/40 ml-auto"
              title="Eksportuj cały klub, zawodników ze zdjęciami i mecze do pliku JSON lub wyślij na e-mail"
            >
              <Mail className="w-3.5 h-3.5 text-emerald-400" />
              <span>Eksport / E-mail ✉️</span>
            </button>
          )}
        </div>

        {/* Tab 1: Club Info & Logo */}
        <div className="flex-1 overflow-y-auto space-y-4 pr-1 text-xs">
          {activeTab === 'info' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 font-semibold mb-1">Pełna Nazwa Klubu *</label>
                  <input
                    type="text"
                    value={profile.name}
                    onChange={(e) => setProfile({ ...profile, name: e.target.value })}
                    placeholder="np. MKS Dąbrowa Górnicza, Basket Team"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-white focus:outline-none focus:border-amber-500 font-semibold"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 font-semibold mb-1">Skrót na Tablicy Wyników (max 8 znaków) *</label>
                  <input
                    type="text"
                    value={profile.shortName}
                    maxLength={8}
                    onChange={(e) => setProfile({ ...profile, shortName: e.target.value.toUpperCase() })}
                    placeholder="np. MKS, BASKET, UKS"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-white focus:outline-none focus:border-amber-500 font-mono font-bold uppercase"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 font-semibold mb-1">Miasto / Siedziba</label>
                  <input
                    type="text"
                    value={profile.city}
                    onChange={(e) => setProfile({ ...profile, city: e.target.value })}
                    placeholder="np. Warszawa, Łódź, Sopot"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 font-semibold mb-1">Rozgrywki / Liga</label>
                  <input
                    type="text"
                    value={profile.leagueName || ''}
                    onChange={(e) => setProfile({ ...profile, leagueName: e.target.value })}
                    placeholder="np. Liga Wojewódzka PZKosz, Liga Młodzików"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 font-semibold mb-1">Trener Główny</label>
                  <input
                    type="text"
                    value={profile.headCoach || ''}
                    onChange={(e) => setProfile({ ...profile, headCoach: e.target.value })}
                    placeholder="Imię i nazwisko trenera"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 font-semibold mb-1">Sezon</label>
                  <input
                    type="text"
                    value={profile.season}
                    onChange={(e) => setProfile({ ...profile, season: e.target.value })}
                    placeholder="np. 2026/2027"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              {/* Herb i Logo */}
              <div className="bg-slate-950/70 p-4 rounded-xl border border-slate-800 space-y-3">
                <span className="font-bold text-white block">Herb / Emblemat Klubu</span>
                <div className="flex flex-col sm:flex-row items-center gap-4">
                  <div className="w-16 h-16 rounded-2xl bg-slate-900 border-2 border-amber-500/50 flex items-center justify-center text-3xl shadow-lg shrink-0 overflow-hidden">
                    {profile.badgeLogoUrl ? (
                      <img src={profile.badgeLogoUrl} alt="Logo" className="w-full h-full object-contain" />
                    ) : (
                      profile.badgeEmoji || '🏀'
                    )}
                  </div>

                  <div className="flex-1 space-y-2 text-center sm:text-left">
                    <div className="flex flex-wrap items-center justify-center sm:justify-start gap-1.5">
                      {EMOJI_OPTIONS.map((emoji) => (
                        <button
                          key={emoji}
                          type="button"
                          onClick={() => setProfile({ ...profile, badgeEmoji: emoji, badgeLogoUrl: undefined })}
                          className={`w-8 h-8 rounded-lg flex items-center justify-center text-base transition ${
                            !profile.badgeLogoUrl && profile.badgeEmoji === emoji
                              ? 'bg-amber-500 ring-2 ring-amber-300'
                              : 'bg-slate-900 hover:bg-slate-800 text-slate-200'
                          }`}
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>

                    <div className="pt-2 flex items-center gap-2">
                      <label className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-300 border border-amber-500/30 font-bold text-xs cursor-pointer flex items-center gap-1.5 transition">
                        <Upload className="w-3.5 h-3.5" />
                        <span>Wgraj plik z herbem (PNG/JPG)</span>
                        <input type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" />
                      </label>
                      {profile.badgeLogoUrl && (
                        <button
                          type="button"
                          onClick={() => setProfile({ ...profile, badgeLogoUrl: undefined })}
                          className="text-xs text-rose-400 hover:underline"
                        >
                          Usuń obrazek
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Tab 2: Color Palette */}
          {activeTab === 'colors' && (
            <div className="space-y-4">
              {/* Color Presets */}
              <div className="bg-slate-950/70 p-4 rounded-xl border border-slate-800 space-y-3">
                <span className="font-bold text-white block">Kolorystyka Drużyny</span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {COLOR_PRESETS.map((cp) => (
                    <button
                      key={cp.name}
                      type="button"
                      onClick={() => setProfile({ ...profile, primaryColor: cp.primary, secondaryColor: cp.secondary })}
                      className={`p-2.5 rounded-xl border text-left flex items-center justify-between transition ${
                        profile.primaryColor === cp.primary
                          ? 'border-amber-400 bg-amber-500/10'
                          : 'border-slate-800 bg-slate-900 hover:bg-slate-850'
                      }`}
                    >
                      <span className="font-semibold text-slate-200">{cp.name}</span>
                      <div className="flex items-center gap-1.5">
                        <span className="w-4 h-4 rounded-full border border-white/20" style={{ backgroundColor: cp.primary }} />
                        <span className="w-4 h-4 rounded-full border border-white/20" style={{ backgroundColor: cp.secondary }} />
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Tab 3: Bulk Import Players */}
          {activeTab === 'bulk_import' && (
            <div className="space-y-3">
              <div className="bg-amber-500/10 border border-amber-500/30 p-3 rounded-xl flex items-start gap-2.5 text-amber-200">
                <Sparkles className="w-4 h-4 shrink-0 mt-0.5 text-amber-400" />
                <div className="leading-relaxed">
                  <strong className="block text-white">Szybkie wprowadzanie składu w 30 sekund:</strong>
                  Wklej listę z Excela, notatnika lub protokołu meczowego. Parser sam rozpozna numery na koszulce, imię, nazwisko i pozycję!
                </div>
              </div>

              <div>
                <label className="block text-slate-400 font-semibold mb-1">
                  Wklej zawodników (jeden wiersz = jeden zawodnik):
                </label>
                <textarea
                  rows={6}
                  value={bulkText}
                  onChange={(e) => handleTextChange(e.target.value)}
                  placeholder={`Przykład formatu:
7 Jan Kowalski PG
#10 Adam Nowak SG
15 Piotr Wiśniewski C (Kapitan)
23 Karol Lewandowski SF`}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 font-mono text-xs text-white placeholder-slate-600 focus:outline-none focus:border-amber-500 resize-none"
                />
              </div>

              {previewPlayers.length > 0 && (
                <div className="bg-slate-950/80 p-3 rounded-xl border border-slate-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-white">Podgląd rozpoznanych graczy ({previewPlayers.length}):</span>
                  </div>
                  <div className="max-h-40 overflow-y-auto space-y-1">
                    {previewPlayers.map((p, idx) => (
                      <div key={idx} className="flex items-center justify-between p-1.5 rounded-lg bg-slate-900 text-xs">
                        <div className="flex items-center gap-2">
                          <span className="w-6 h-6 rounded-md bg-amber-500 text-slate-950 font-black flex items-center justify-center font-mono">
                            {p.number}
                          </span>
                          <span className="font-bold text-white">
                            {p.firstName} {p.lastName}
                          </span>
                          <span className="text-[10px] text-slate-400 px-1.5 py-0.2 rounded bg-slate-800">
                            {p.position}
                          </span>
                        </div>
                        {p.notes && <span className="text-[10px] text-slate-500 italic truncate max-w-[150px]">{p.notes}</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {bulkSuccessMsg && (
                <div className="p-2.5 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 font-bold flex items-center gap-2">
                  <Check className="w-4 h-4 text-emerald-400" />
                  <span>{bulkSuccessMsg}</span>
                </div>
              )}

              <button
                type="button"
                disabled={previewPlayers.length === 0 || isSaving}
                onClick={handleBulkImportSubmit}
                className="w-full py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 font-black text-xs transition active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg shadow-amber-950/40"
              >
                <Plus className="w-4 h-4" />
                <span>Zaimportuj {previewPlayers.length} zawodników do bazy</span>
              </button>
            </div>
          )}

          {/* Tab 4: Ready-made Templates */}
          {activeTab === 'presets' && (
            <div className="space-y-3">
              <p className="text-slate-400">
                Możesz w dowolnym momencie wczytać gotowy szablon z przykładowym składem albo wyczyścić skład:
              </p>

              <div className="space-y-2.5">
                {PRESET_CLUBS.map((preset) => (
                  <div
                    key={preset.id}
                    className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 hover:border-slate-700 transition space-y-2.5"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-slate-900 border border-slate-700 flex items-center justify-center text-xl shrink-0">
                          {preset.profile.badgeEmoji}
                        </div>
                        <div>
                          <h4 className="font-bold text-white text-sm">{preset.title}</h4>
                          <p className="text-slate-400 text-[11px] leading-tight">{preset.subtitle}</p>
                        </div>
                      </div>
                      {pendingPresetId !== preset.id && (
                        <button
                          type="button"
                          onClick={() => setPendingPresetId(preset.id)}
                          className="px-3.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs transition active:scale-95 shrink-0 shadow"
                        >
                          Wczytaj
                        </button>
                      )}
                    </div>

                    {pendingPresetId === preset.id && (
                      <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-between gap-2 flex-wrap">
                        <span className="text-[11px] text-amber-200 font-semibold">
                          Wczytanie szablonu zastąpi bieżącą nazwę drużyny i jej skład. Kontynuować?
                        </span>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => setPendingPresetId(null)}
                            className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-[11px]"
                          >
                            Anuluj
                          </button>
                          <button
                            type="button"
                            disabled={isSaving}
                            onClick={() => handleConfirmPreset(preset.id)}
                            className="px-3 py-1 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-[11px]"
                          >
                            Potwierdź
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="mt-4 pt-3 border-t border-slate-800 flex items-center justify-between shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs transition"
          >
            Anuluj
          </button>

          <button
            type="button"
            disabled={isSaving}
            onClick={handleSave}
            className="px-6 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 font-black text-xs transition active:scale-95 shadow-lg shadow-orange-950/40 flex items-center gap-1.5"
          >
            <Check className="w-4 h-4" />
            <span>Zapisz dane klubu</span>
          </button>
        </div>
      </div>
    </div>
  );
};

import React, { useState } from 'react';
import { ClubProfile, Match, Player, TeamCategory } from '../types/basketball';
import { calculateSeasonAverages } from '../services/statsCalculator';
import { PlayerProfileModal } from './PlayerProfileModal';
import {
  Plus,
  Edit2,
  Trash2,
  Users,
  Search,
  Shirt,
  Check,
  X,
  AlertTriangle,
  Eye,
  BarChart2,
  Award,
  Zap,
  Shield,
  Camera,
  Upload,
  Download,
  Mail,
  Share2,
  Image as ImageIcon,
} from 'lucide-react';
import { playClickSound, triggerHaptic } from '../services/tts';
import { compressFileToDataUrl, processPastedImage } from '../services/imageUtils';
import { useLanguage } from '../i18n/LanguageContext';

interface RosterManagementProps {
  players: Player[];
  activeCategory?: TeamCategory;
  onSelectCategory?: (cat: TeamCategory) => void;
  clubProfile?: ClubProfile;
  onOpenClubProfile?: () => void;
  onSavePlayer?: (player: Player) => Promise<void>;
  onDeletePlayer?: (id: string) => Promise<void>;
  onResetToLZKosz?: () => Promise<void>;
  matches?: Match[];
  readOnly?: boolean;
  onOpenTeamExport?: () => void;
  onOpenTeamImport?: () => void;
}

export const RosterManagement: React.FC<RosterManagementProps> = ({
  players,
  clubProfile,
  onOpenClubProfile,
  onSavePlayer,
  onDeletePlayer,
  matches = [],
  readOnly = false,
  onOpenTeamExport,
  onOpenTeamImport,
}) => {
  const { t } = useLanguage();
  const [search, setSearch] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingPlayer, setEditingPlayer] = useState<Player | null>(null);
  const [selectedProfilePlayer, setSelectedProfilePlayer] = useState<Player | null>(null);

  // Form fields
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [number, setNumber] = useState('');
  const [position, setPosition] = useState<string>('PG');
  const [notes, setNotes] = useState('');
  const [photo, setPhoto] = useState<string>('');
  const [formError, setFormError] = useState<string | null>(null);

  const filteredPlayers = players
    .filter((p) => {
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return (
        p.firstName.toLowerCase().includes(q) ||
        p.lastName.toLowerCase().includes(q) ||
        p.number.toString().includes(q)
      );
    })
    .sort((a, b) => a.number - b.number);

  const openAddModal = () => {
    playClickSound();
    triggerHaptic(20);
    setEditingPlayer(null);
    setFirstName('');
    setLastName('');
    setNumber('');
    setPosition('PG');
    setNotes('');
    setPhoto('');
    setFormError(null);
    setIsModalOpen(true);
  };

  const openEditModal = (player: Player) => {
    playClickSound();
    triggerHaptic(20);
    setEditingPlayer(player);
    setFirstName(player.firstName);
    setLastName(player.lastName);
    setNumber(player.number.toString());
    setPosition(player.position || 'PG');
    setNotes(player.notes || '');
    setPhoto(player.photo || '');
    setFormError(null);
    setIsModalOpen(true);
  };

  const handlePhotoFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const compressed = await compressFileToDataUrl(file);
      setPhoto(compressed);
      playClickSound();
    } catch (err) {
      console.error('Błąd wczytywania zdjęcia:', err);
    }
  };

  const handleModalPaste = async (e: React.ClipboardEvent) => {
    const pasted = await processPastedImage(e);
    if (pasted) {
      e.preventDefault();
      setPhoto(pasted);
      playClickSound();
      triggerHaptic(30);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!firstName.trim() || !lastName.trim() || !number.trim()) {
      setFormError('Wypełnij imię, nazwisko oraz numer na koszulce.');
      return;
    }

    const numVal = parseInt(number, 10);
    if (isNaN(numVal) || numVal < 0 || numVal > 99) {
      setFormError('Numer na koszulce musi być liczbą od 0 do 99.');
      return;
    }

    const playerToSave: Player = {
      id: editingPlayer ? editingPlayer.id : `player-${Date.now()}`,
      teamCategory: 'TEAM',
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      number: numVal,
      position: position as Player['position'],
      notes: notes.trim(),
      photo: photo.trim() || undefined,
      createdAt: editingPlayer ? editingPlayer.createdAt : Date.now(),
    };

    if (onSavePlayer) {
      await onSavePlayer(playerToSave);
    }
    playClickSound();
    triggerHaptic(30);
    setIsModalOpen(false);
  };

  const [playerToDelete, setPlayerToDelete] = useState<{ id: string; name: string } | null>(null);

  const handleDeleteClick = (id: string, name: string) => {
    playClickSound();
    triggerHaptic(25);
    setPlayerToDelete({ id, name });
  };

  const handleConfirmDelete = async () => {
    if (!playerToDelete) return;
    playClickSound();
    triggerHaptic(40);
    const id = playerToDelete.id;
    setPlayerToDelete(null);
    try {
      if (onDeletePlayer) {
        await onDeletePlayer(id);
      }
    } catch (err) {
      console.error('Błąd usuwania zawodnika:', err);
    }
  };

  const seasonStats = calculateSeasonAverages(filteredPlayers, matches);
  const getPlayerStats = (id: string) => seasonStats.find((s) => s.playerId === id);

  const clubName = clubProfile?.name || 'Moja Drużyna Koszykarska';
  const season = clubProfile?.season || '2026/2027';

  return (
    <div className="w-full max-w-5xl mx-auto space-y-5 text-slate-100">
      {/* Header bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 shadow-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
            <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight">
              {readOnly ? `${t('roster.titleReadOnly')} ${clubName}` : `${t('roster.title')} ${clubName}`}
            </h1>
            <span className="text-[10px] text-amber-300 font-black px-2.5 py-0.5 rounded-full bg-amber-500/20 border border-amber-500/40">
              {t('home.seasonBadge')} {season}
            </span>
            {readOnly && (
              <span className="text-[10px] text-emerald-400 font-bold px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30">
                {t('roster.readOnlyBadge')}
              </span>
            )}
          </div>
          <p className="text-xs sm:text-sm text-slate-400">
            {readOnly
              ? `${t('roster.subtitleReadOnly')} ${clubName} • ${t('home.seasonBadge')} ${season}`
              : `${t('roster.subtitleCoach')} ${clubName} • Liczba zawodników: ${players.length}`}
          </p>
        </div>

        <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-xs font-mono text-slate-300 shrink-0">
          <Users className="w-4 h-4 text-amber-400" />
          <span>Skład: <strong className="text-white">{players.length}</strong></span>
        </div>
      </div>

      {/* Action Toolbar: Search & Add Player */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-slate-900/60 border border-slate-800/80 p-3 rounded-xl">
        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            placeholder={t('roster.searchPlaceholder')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
          />
        </div>

        {!readOnly && (
          <div className="w-full sm:w-auto flex items-center gap-2 flex-wrap">
            {onOpenTeamExport && (
              <button
                type="button"
                onClick={onOpenTeamExport}
                className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-emerald-400 border border-emerald-500/40 font-bold text-xs transition active:scale-95 shadow-sm"
                title="Eksportuj drużynę (dane klubu, zdjęcia zawodników, mecze) do pliku JSON lub wyślij na e-mail"
              >
                <Mail className="w-3.5 h-3.5 text-emerald-400" />
                <span>Eksport (JSON / E-mail)</span>
              </button>
            )}

            {onOpenTeamImport && (
              <button
                type="button"
                onClick={onOpenTeamImport}
                className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-sky-400 border border-sky-500/40 font-bold text-xs transition active:scale-95 shadow-sm"
                title="Wczytaj drużynę z pliku JSON (przywraca zdjęcia i wyniki)"
              >
                <Upload className="w-3.5 h-3.5 text-sky-400" />
                <span>Importuj</span>
              </button>
            )}

            {onOpenClubProfile && (
              <button
                type="button"
                onClick={onOpenClubProfile}
                className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-400 border border-amber-500/40 font-bold text-xs transition active:scale-95 shadow-sm"
                title={t('roster.bulkImport')}
              >
                <Zap className="w-3.5 h-3.5 text-amber-400" />
                <span>{t('roster.bulkImport')}</span>
              </button>
            )}

            <button
              type="button"
              onClick={openAddModal}
              className="flex-1 sm:flex-initial flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs transition active:scale-95 shadow-lg shadow-amber-950/30"
            >
              <Plus className="w-4 h-4" />
              <span>{t('roster.addPlayer')}</span>
            </button>
          </div>
        )}

        {readOnly && (
          <div className="text-xs text-slate-400 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-amber-400" />
            <span>{t('roster.clickPrompt')}</span>
          </div>
        )}
      </div>

      {/* Players Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
        {filteredPlayers.length === 0 ? (
          <div className="col-span-full py-12 text-center text-slate-500 bg-slate-900/40 rounded-2xl border border-slate-800/60">
            <Users className="w-10 h-10 mx-auto mb-2 opacity-30" />
            <p className="text-sm font-semibold">{t('roster.empty')}</p>
            {!readOnly && (
              <p className="text-xs text-slate-600 mt-1">
                {t('roster.emptyPrompt')}
              </p>
            )}
          </div>
        ) : (
          filteredPlayers.map((player) => {
            const stats = getPlayerStats(player.id);
            return (
              <div
                key={player.id}
                onClick={readOnly ? () => setSelectedProfilePlayer(player) : undefined}
                className={`bg-slate-900 border border-slate-800 rounded-2xl p-4 transition shadow-lg flex flex-col justify-between gap-3 group ${
                  readOnly
                    ? 'hover:border-amber-500/60 hover:bg-slate-900/90 cursor-pointer'
                    : 'hover:border-slate-700/80'
                }`}
              >
                {/* Top: Jersey Badge & Name */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-3 min-w-0">
                    {player.photo ? (
                      <div className="relative w-12 h-12 rounded-xl overflow-hidden shrink-0 border border-amber-500/40 shadow-inner group-hover:border-amber-400 bg-slate-950">
                        <img
                          src={player.photo}
                          alt={player.lastName}
                          className="w-full h-full object-cover"
                        />
                        <span className="absolute bottom-0 right-0 bg-slate-950/85 text-amber-400 text-[9px] font-mono font-black px-1 rounded-tl">
                          #{player.number}
                        </span>
                      </div>
                    ) : (
                      <div className="w-12 h-12 rounded-xl bg-slate-950 border border-amber-500/30 flex flex-col items-center justify-center shrink-0 shadow-inner group-hover:border-amber-400 transition">
                        <span className="text-[9px] font-bold text-slate-500 leading-none">NR</span>
                        <span className="font-mono font-black text-amber-400 text-lg leading-none">
                          {player.number}
                        </span>
                      </div>
                    )}

                    <div className="min-w-0">
                      <h3 className="font-bold text-white text-sm sm:text-base truncate group-hover:text-amber-300 transition">
                        {player.firstName} {player.lastName}
                      </h3>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-800 text-slate-400">
                          {player.position || t('box.player')}
                        </span>
                        {player.notes && (
                          <span className="text-[10px] text-slate-500 truncate max-w-[100px]">
                            • {player.notes}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Actions for Coach vs Spectator */}
                  {!readOnly ? (
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => openEditModal(player)}
                        className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition"
                        title={t('common.edit')}
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteClick(player.id, `${player.firstName} ${player.lastName}`);
                        }}
                        className="p-2 rounded-xl text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 active:scale-90 transition cursor-pointer"
                        title={t('common.delete')}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedProfilePlayer(player);
                      }}
                      className="px-2.5 py-1 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 text-amber-400 border border-amber-500/30 text-[11px] font-bold flex items-center gap-1 transition shrink-0"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>{t('nav.rosterSpectator')}</span>
                    </button>
                  )}
                </div>

                {/* Season stats strip on player card */}
                {stats && (
                  <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-[11px] font-mono flex-wrap gap-1">
                    <span className="text-amber-300 font-bold">
                      {stats.totalPts} {t('selector.pts')} <span className="text-slate-500 font-normal">({stats.ppg}/m)</span>
                    </span>
                    <span
                      className={`font-bold ${
                        stats.totalPlusMinus > 0
                          ? 'text-emerald-400'
                          : stats.totalPlusMinus < 0
                          ? 'text-rose-400'
                          : 'text-slate-400'
                      }`}
                      title="Łączny bilans +/- na parkiecie"
                    >
                      +/- {stats.totalPlusMinus > 0 ? `+${stats.totalPlusMinus}` : stats.totalPlusMinus}
                    </span>
                    <span className="text-emerald-400 font-bold">
                      Eval: {stats.evalAvg}
                    </span>
                    <span className="text-slate-400">
                      {t('home.matchesPlayed')}: {stats.gamesPlayed}
                    </span>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Add / Edit Player Modal */}
      {isModalOpen && (
        <div
          onPaste={handleModalPaste}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/90"
        >
          <div className="w-full max-w-md rounded-2xl bg-slate-900 border border-slate-800 p-5 shadow-2xl text-slate-100 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4 border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Shirt className="w-5 h-5 text-amber-400" />
                <span>
                  {editingPlayer ? t('roster.editPlayer') : t('roster.addPlayer')}
                </span>
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-3.5">
              {/* Photo Upload / Paste Section */}
              <div className="p-3 rounded-2xl bg-slate-950 border border-slate-800 space-y-2.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                    <Camera className="w-4 h-4 text-amber-400" />
                    <span>{t('roster.photo')}:</span>
                  </label>
                  {photo && (
                    <button
                      type="button"
                      onClick={() => setPhoto('')}
                      className="text-[11px] font-bold text-rose-400 hover:text-rose-300 flex items-center gap-1"
                    >
                      <Trash2 className="w-3 h-3" />
                      <span>{t('roster.removePhoto')}</span>
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-3">
                  {/* Photo Preview */}
                  <div className="relative w-16 h-16 rounded-2xl bg-slate-900 border-2 border-amber-500/50 flex flex-col items-center justify-center shrink-0 overflow-hidden shadow-inner">
                    {photo ? (
                      <img src={photo} alt="Podgląd" className="w-full h-full object-cover" />
                    ) : (
                      <div className="text-center">
                        <ImageIcon className="w-6 h-6 text-slate-600 mx-auto" />
                        <span className="text-[9px] text-slate-500 font-bold block mt-0.5">-</span>
                      </div>
                    )}
                  </div>

                  {/* Actions: File upload & Paste hint */}
                  <div className="flex-1 space-y-1.5 min-w-0">
                    <div className="flex gap-2">
                      <label className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs cursor-pointer border border-slate-700 transition active:scale-95">
                        <Upload className="w-3.5 h-3.5 text-amber-400" />
                        <span>{t('roster.uploadPhoto')}</span>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handlePhotoFileChange}
                          className="hidden"
                        />
                      </label>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <input
                        type="text"
                        placeholder={t('roster.pasteHint')}
                        value={photo.startsWith('data:') ? '✓ Photo loaded' : photo}
                        onChange={(e) => {
                          if (!e.target.value.startsWith('✓')) setPhoto(e.target.value);
                        }}
                        className="w-full bg-slate-900 border border-slate-800 rounded-xl px-2.5 py-1.5 text-[11px] text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-500 truncate"
                      />
                    </div>
                  </div>
                </div>
                <div className="text-[10px] text-amber-300/80 italic">
                  💡 {t('roster.pasteHint')}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-400 mb-1">{t('roster.firstName')}:</label>
                  <input
                    type="text"
                    required
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    placeholder="np. Jan"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs font-semibold text-white focus:outline-none focus:border-amber-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-400 mb-1">{t('roster.lastName')}:</label>
                  <input
                    type="text"
                    required
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    placeholder="np. Kowalski"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs font-semibold text-white focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-400 mb-1">
                    {t('roster.jerseyNumber')} (0-99):
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="99"
                    required
                    value={number}
                    onChange={(e) => setNumber(e.target.value)}
                    placeholder="7"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs font-mono font-bold text-white focus:outline-none focus:border-amber-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-400 mb-1">{t('roster.position')}:</label>
                  <select
                    value={position}
                    onChange={(e) => setPosition(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs font-semibold text-white focus:outline-none focus:border-amber-500"
                  >
                    <option value="PG">PG (Point Guard 1)</option>
                    <option value="SG">SG (Shooting Guard 2)</option>
                    <option value="SF">SF (Small Forward 3)</option>
                    <option value="PF">PF (Power Forward 4)</option>
                    <option value="C">C (Center 5)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-400 mb-1">
                  {t('roster.notes')}:
                </label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Notes..."
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs font-semibold text-white focus:outline-none focus:border-amber-500"
                />
              </div>

              {formError && (
                <div className="p-2.5 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs font-semibold">
                  {formError}
                </div>
              )}

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs transition"
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs transition shadow-md"
                >
                  {editingPlayer ? t('common.save') : t('roster.addPlayer')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Player Confirmation Modal (custom dialog avoiding window.confirm block in iframes) */}
      {playerToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 animate-in fade-in duration-150">
          <div className="w-full max-w-sm rounded-2xl bg-slate-900 border border-slate-800 p-5 shadow-2xl text-slate-100 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center text-rose-400 shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">{t('common.delete')}</h3>
                <p className="text-xs text-slate-400">{t('roster.deleteConfirm')}</p>
              </div>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed bg-slate-950 p-3 rounded-xl border border-slate-800/80">
              {t('roster.deleteConfirm')} <span className="font-bold text-amber-400">{playerToDelete.name}</span>?
            </p>

            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={() => setPlayerToDelete(null)}
                className="flex-1 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs transition active:scale-95 cursor-pointer"
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                className="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs transition shadow-lg shadow-rose-950/50 active:scale-95 cursor-pointer flex items-center justify-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{t('common.delete')}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Player Profile Details Modal */}
      {selectedProfilePlayer && (
        <PlayerProfileModal
          player={selectedProfilePlayer}
          matches={matches}
          onClose={() => setSelectedProfilePlayer(null)}
        />
      )}
    </div>
  );
};

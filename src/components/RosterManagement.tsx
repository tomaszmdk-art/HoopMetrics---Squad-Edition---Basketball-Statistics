import React, { useState } from 'react';
import { ClubProfile, Match, Player, TeamCategory } from '../types/basketball';
import { calculateSeasonAverages } from '../services/statsCalculator';
import { parsePlayerText } from '../services/db';
import { PlayerProfileModal } from './PlayerProfileModal';
import {
  Plus,
  Edit2,
  Trash2,
  Users,
  Search,
  Shirt,
  X,
  AlertTriangle,
  Eye,
  Zap,
  Shield,
  Camera,
  Upload,
  Mail,
  Image as ImageIcon,
  Table2,
  FileText,
  Check,
} from 'lucide-react';
import { playClickSound, triggerHaptic } from '../services/tts';
import { compressFileToDataUrl, processPastedImage } from '../services/imageUtils';
import {
  getPlayerFullName,
  getPlayerShortName,
  hasPersonalData,
} from '../services/playerDisplay';
import { useLanguage } from '../i18n/LanguageContext';

interface RosterManagementProps {
  players: Player[];
  activeCategory?: TeamCategory;
  onSelectCategory?: (cat: TeamCategory) => void;
  clubProfile?: ClubProfile;
  onOpenClubProfile?: () => void;
  onSavePlayer?: (player: Player) => Promise<void>;
  onSavePlayersBulk?: (players: Player[]) => Promise<void>;
  onDeletePlayer?: (id: string) => Promise<void>;
  onResetToLZKosz?: () => Promise<void>;
  matches?: Match[];
  readOnly?: boolean;
  onOpenTeamExport?: () => void;
  onOpenTeamImport?: () => void;
}

interface BulkRowDraft {
  key: string;
  existingId?: string;
  isServerSynced: boolean;
  number: string;
  firstName: string;
  lastName: string;
  position: string;
  notes: string;
  photo: string;
  createdAt: number;
}

export const RosterManagement: React.FC<RosterManagementProps> = ({
  players,
  clubProfile,
  onOpenClubProfile,
  onSavePlayer,
  onSavePlayersBulk,
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

  // Single player form fields
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [number, setNumber] = useState('');
  const [position, setPosition] = useState<string>('PG');
  const [notes, setNotes] = useState('');
  const [photo, setPhoto] = useState<string>('');
  const [formError, setFormError] = useState<string | null>(null);

  // Full-team quick entry modal state
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
  const [bulkTab, setBulkTab] = useState<'table' | 'text'>('table');
  const [bulkRows, setBulkRows] = useState<BulkRowDraft[]>([]);
  const [bulkText, setBulkText] = useState('');
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [isBulkSaving, setIsBulkSaving] = useState(false);

  const filteredPlayers = players
    .filter((p) => {
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return (
        getPlayerFullName(p).toLowerCase().includes(q) ||
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

  const openBulkModal = () => {
    playClickSound();
    triggerHaptic(20);
    const sorted = [...players].sort((a, b) => a.number - b.number);
    const initialRows: BulkRowDraft[] =
      sorted.length > 0
        ? sorted.map((p) => ({
            key: p.id,
            existingId: p.id,
            isServerSynced: !p.id.startsWith('local-'),
            number: p.number.toString(),
            firstName: p.firstName || '',
            lastName: p.lastName || '',
            position: p.position || 'PG',
            notes: p.notes || '',
            photo: p.photo || '',
            createdAt: p.createdAt || Date.now(),
          }))
        : [4, 5, 6, 7, 8, 9, 10, 11].map((num, idx) => ({
            key: `draft-${Date.now()}-${idx}`,
            isServerSynced: false,
            number: num.toString(),
            firstName: '',
            lastName: '',
            position: 'PG',
            notes: '',
            photo: '',
            createdAt: Date.now() + idx,
          }));

    setBulkRows(initialRows);
    setBulkText('');
    setBulkError(null);
    setBulkTab('table');
    setIsBulkModalOpen(true);
  };

  const handleAddBulkRow = () => {
    const usedNums = new Set(
      bulkRows.map((r) => parseInt(r.number, 10)).filter((n) => !isNaN(n))
    );
    let candidate = 4;
    while (usedNums.has(candidate) && candidate < 99) {
      candidate++;
    }
    setBulkRows((prev) => [
      ...prev,
      {
        key: `draft-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        isServerSynced: false,
        number: usedNums.has(candidate) ? '' : candidate.toString(),
        firstName: '',
        lastName: '',
        position: 'PG',
        notes: '',
        photo: '',
        createdAt: Date.now(),
      },
    ]);
  };

  const handleBulkRowPhoto = async (
    rowKey: string,
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const compressed = await compressFileToDataUrl(file);
      setBulkRows((prev) =>
        prev.map((r) => (r.key === rowKey ? { ...r, photo: compressed } : r))
      );
      playClickSound();
    } catch (err) {
      console.error('Błąd wczytywania zdjęcia:', err);
    }
  };

  const handleSaveBulkTable = async (e: React.FormEvent) => {
    e.preventDefault();
    setBulkError(null);

    const activeRows = bulkRows.filter(
      (r) =>
        r.existingId ||
        r.firstName.trim() ||
        r.lastName.trim() ||
        r.photo.trim() ||
        r.notes.trim() ||
        r.number.trim()
    );

    if (activeRows.length === 0) {
      setBulkError('Dodaj przynajmniej jednego zawodnika przed zapisem.');
      return;
    }

    const seenNumbers = new Set<number>();
    const playersToSave: Player[] = [];

    for (let i = 0; i < activeRows.length; i++) {
      const row = activeRows[i];
      const numVal = parseInt(row.number.trim(), 10);
      if (isNaN(numVal) || numVal < 0 || numVal > 99) {
        setBulkError(
          `Wiersz ${i + 1}: podaj prawidłowy numer na koszulce (od 0 do 99).`
        );
        return;
      }
      if (seenNumbers.has(numVal)) {
        setBulkError(
          `Numer #${numVal} występuje więcej niż jeden raz na liście.`
        );
        return;
      }
      seenNumbers.add(numVal);

      playersToSave.push({
        id:
          row.existingId ||
          (readOnly
            ? `local-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 6)}`
            : `player-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 6)}`),
        teamCategory: 'TEAM',
        firstName: row.firstName.trim(),
        lastName: row.lastName.trim(),
        number: numVal,
        position: (row.position || 'PG') as Player['position'],
        notes: row.notes.trim() || undefined,
        photo: row.photo.trim() || undefined,
        createdAt: row.createdAt || Date.now() + i,
      });
    }

    setIsBulkSaving(true);
    try {
      if (onSavePlayersBulk) {
        await onSavePlayersBulk(playersToSave);
      } else if (onSavePlayer) {
        for (const p of playersToSave) {
          await onSavePlayer(p);
        }
      }
      playClickSound();
      triggerHaptic(35);
      setIsBulkModalOpen(false);
    } catch (err) {
      console.error('Błąd zapisu całej drużyny:', err);
      setBulkError('Nie udało się zapisać zmian lokalnie.');
    } finally {
      setIsBulkSaving(false);
    }
  };

  const parsedTextPreview = bulkText.trim()
    ? parsePlayerText(bulkText, 'TEAM')
    : [];

  const handleSaveBulkText = async () => {
    setBulkError(null);
    if (parsedTextPreview.length === 0) {
      setBulkError('Wklej co najmniej jednego zawodnika (np. "7 Jan Kowalski PG").');
      return;
    }

    setIsBulkSaving(true);
    try {
      const normalized = parsedTextPreview.map((p, idx) => ({
        ...p,
        id: readOnly
          ? `local-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 6)}`
          : p.id,
      }));
      if (onSavePlayersBulk) {
        await onSavePlayersBulk(normalized);
      } else if (onSavePlayer) {
        for (const p of normalized) {
          await onSavePlayer(p);
        }
      }
      playClickSound();
      triggerHaptic(35);
      setIsBulkModalOpen(false);
    } catch (err) {
      console.error('Błąd importu listy tekstowej:', err);
      setBulkError('Nie udało się zapisać listy zawodników.');
    } finally {
      setIsBulkSaving(false);
    }
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
    if (!number.trim()) {
      setFormError('Podaj numer zawodnika na koszulce.');
      return;
    }

    const numVal = parseInt(number, 10);
    if (isNaN(numVal) || numVal < 0 || numVal > 99) {
      setFormError('Numer na koszulce musi być liczbą od 0 do 99.');
      return;
    }

    const newPlayerId = readOnly
      ? `local-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
      : `player-${Date.now()}`;

    const playerToSave: Player = {
      id: editingPlayer ? editingPlayer.id : newPlayerId,
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

  const [playerToDelete, setPlayerToDelete] = useState<{
    id: string;
    name: string;
    isServerSynced: boolean;
  } | null>(null);

  const handleDeleteClick = (player: Player) => {
    playClickSound();
    triggerHaptic(25);
    setPlayerToDelete({
      id: player.id,
      name: getPlayerFullName(player),
      isServerSynced: !player.id.startsWith('local-'),
    });
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

  const parsedSingleNum = parseInt(number.trim(), 10);
  const matchingExistingPlayer =
    !editingPlayer && !isNaN(parsedSingleNum)
      ? players.find((p) => p.number === parsedSingleNum)
      : undefined;

  const isJerseyNumberLocked = Boolean(
    readOnly && editingPlayer && !editingPlayer.id.startsWith('local-')
  );

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
              {readOnly
                ? `${t('roster.titleReadOnly')} ${clubName}`
                : `${t('roster.title')} ${clubName}`}
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
          <span>
            Skład: <strong className="text-white">{players.length}</strong>
          </span>
        </div>
      </div>

      {/* Parent / Spectator local privacy note */}
      {readOnly && (
        <div className="p-3.5 rounded-2xl bg-emerald-950/30 border border-emerald-500/30 flex items-start gap-2.5 text-xs text-emerald-200 leading-relaxed">
          <Shield className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
          <div>
            <span className="font-bold text-emerald-300">
              Lokalny skład na Twoim telefonie (RODO):
            </span>{' '}
            Możesz ręcznie wpisać imiona, nazwiska i zdjęcia całej drużyny lub wczytać plik JSON od trenera. Wszystkie dane osobowe zostają wyłącznie w pamięci tego urządzenia — na serwerze drużyny nadal widnieją wyłącznie zanonimizowane numery.
          </div>
        </div>
      )}

      {/* Action Toolbar: Search & Roster Tools */}
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

        <div className="w-full sm:w-auto flex items-center gap-2 flex-wrap">
          {!readOnly && onOpenTeamExport && (
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
              className={`flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl font-bold text-xs transition active:scale-95 shadow-sm border ${
                readOnly
                  ? 'bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border-emerald-500/40'
                  : 'bg-slate-800 hover:bg-slate-700 text-sky-400 border-sky-500/40'
              }`}
              title="Importuj skład z serwisu ŁZKosz.pl lub wczytaj plik JSON z kopią zapasową"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>{readOnly ? 'Importuj (ŁZKosz / JSON)' : 'Importuj (ŁZKosz / JSON)'}</span>
            </button>
          )}

          {!readOnly && onOpenClubProfile && (
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

          {(onSavePlayersBulk || onSavePlayer) && (
            <button
              type="button"
              onClick={openBulkModal}
              className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-300 border border-amber-500/40 font-bold text-xs transition active:scale-95 shadow-sm"
              title="Szybko wpisz lub uzupełnij imiona, nazwiska i zdjęcia całej drużyny naraz"
            >
              <Table2 className="w-3.5 h-3.5 text-amber-400" />
              <span>Wprowadź całą drużynę</span>
            </button>
          )}

          {onSavePlayer && (
            <button
              type="button"
              onClick={openAddModal}
              className="flex-1 sm:flex-initial flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs transition active:scale-95 shadow-lg shadow-amber-950/30"
            >
              <Plus className="w-4 h-4" />
              <span>{t('roster.addPlayer')}</span>
            </button>
          )}
        </div>
      </div>

      {/* Players Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
        {filteredPlayers.length === 0 ? (
          <div className="col-span-full py-12 text-center text-slate-500 bg-slate-900/40 rounded-2xl border border-slate-800/60">
            <Users className="w-10 h-10 mx-auto mb-2 opacity-30" />
            <p className="text-sm font-semibold">{t('roster.empty')}</p>
            <p className="text-xs text-slate-500 mt-1">
              {readOnly
                ? 'Kliknij „Wprowadź całą drużynę” lub „Dodaj zawodnika”, aby zapisać lokalną kadrę.'
                : t('roster.emptyPrompt')}
            </p>
          </div>
        ) : (
          filteredPlayers.map((player) => {
            const stats = getPlayerStats(player.id);
            const isLocalOnly = player.id.startsWith('local-');
            const canDeleteOrClear =
              Boolean(onDeletePlayer) && (!readOnly || isLocalOnly || hasPersonalData(player));

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
                          alt={getPlayerShortName(player)}
                          className="w-full h-full object-cover"
                        />
                        <span className="absolute bottom-0 right-0 bg-slate-950/85 text-amber-400 text-[9px] font-mono font-black px-1 rounded-tl">
                          #{player.number}
                        </span>
                      </div>
                    ) : (
                      <div className="w-12 h-12 rounded-xl bg-slate-950 border border-amber-500/30 flex flex-col items-center justify-center shrink-0 shadow-inner group-hover:border-amber-400 transition">
                        <span className="text-[9px] font-bold text-slate-500 leading-none">
                          NR
                        </span>
                        <span className="font-mono font-black text-amber-400 text-lg leading-none">
                          {player.number}
                        </span>
                      </div>
                    )}

                    <div className="min-w-0">
                      <h3 className="font-bold text-white text-sm sm:text-base truncate group-hover:text-amber-300 transition">
                        {getPlayerFullName(player)}
                      </h3>
                      <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-800 text-slate-400">
                          {player.position || t('box.player')}
                        </span>
                        {readOnly && isLocalOnly && (
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                            Lokalnie
                          </span>
                        )}
                        {player.notes && (
                          <span className="text-[10px] text-slate-500 truncate max-w-[100px]">
                            • {player.notes}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 shrink-0">
                    {onSavePlayer && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          openEditModal(player);
                        }}
                        className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition"
                        title={
                          readOnly
                            ? 'Uzupełnij lokalne imię, nazwisko i zdjęcie'
                            : t('common.edit')
                        }
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                    )}

                    {canDeleteOrClear && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteClick(player);
                        }}
                        className="p-2 rounded-xl text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 active:scale-90 transition cursor-pointer"
                        title={
                          readOnly && !isLocalOnly
                            ? 'Wyczyść lokalne dane osobowe (numer i statystyki zostaną)'
                            : t('common.delete')
                        }
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}

                    {readOnly && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedProfilePlayer(player);
                        }}
                        className="px-2 py-1 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 text-amber-400 border border-amber-500/30 text-[11px] font-bold flex items-center gap-1 transition shrink-0"
                        title="Podgląd profilu i statystyk zawodnika"
                      >
                        <Eye className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Season stats strip on player card */}
                {stats && (
                  <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-[11px] font-mono flex-wrap gap-1">
                    <span className="text-amber-300 font-bold">
                      {stats.totalPts} {t('selector.pts')}{' '}
                      <span className="text-slate-500 font-normal">({stats.ppg}/m)</span>
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
                      +/-{' '}
                      {stats.totalPlusMinus > 0
                        ? `+${stats.totalPlusMinus}`
                        : stats.totalPlusMinus}
                    </span>
                    <span className="text-emerald-400 font-bold">Eval: {stats.evalAvg}</span>
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

      {/* Single Add / Edit Player Modal */}
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
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-3.5">
              <div className="p-2.5 rounded-xl bg-emerald-950/40 border border-emerald-500/30 text-[11px] text-emerald-200 flex items-start gap-2 leading-snug">
                <Shield className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                <span>
                  {readOnly
                    ? 'Wszystkie wpisane tu dane (imiona, nazwiska, zdjęcia i nowi zawodnicy) zapisują się wyłącznie lokalnie na Twoim telefonie. Na serwer nie trafiają żadne dane osobowe.'
                    : 'Imię, nazwisko, zdjęcie i notatki zapisywane są wyłącznie lokalnie na tym urządzeniu (RODO). Na serwer trafia tylko numer na koszulce.'}
                </span>
              </div>

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
                  <label className="block text-xs font-bold text-slate-400 mb-1">
                    {t('roster.firstName')} (opcjonalnie):
                  </label>
                  <input
                    type="text"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    placeholder="np. Jan"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs font-semibold text-white focus:outline-none focus:border-amber-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-400 mb-1">
                    {t('roster.lastName')} (opcjonalnie):
                  </label>
                  <input
                    type="text"
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
                    disabled={isJerseyNumberLocked}
                    value={number}
                    onChange={(e) => setNumber(e.target.value)}
                    placeholder="7"
                    className={`w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs font-mono font-bold text-white focus:outline-none focus:border-amber-500 ${
                      isJerseyNumberLocked ? 'opacity-60 cursor-not-allowed' : ''
                    }`}
                  />
                  {isJerseyNumberLocked && (
                    <span className="text-[10px] text-slate-500 mt-1 block">
                      Numer z protokołu trenera
                    </span>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-400 mb-1">
                    {t('roster.position')}:
                  </label>
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

              {matchingExistingPlayer && (
                <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-[11px] text-amber-200 leading-snug">
                  Zawodnik <strong className="font-mono">#{matchingExistingPlayer.number}</strong> istnieje już w składzie — zapis uzupełni jego lokalne imię, nazwisko i zdjęcie, zachowując powiązanie ze statystykami meczowymi.
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-400 mb-1">
                  {t('roster.notes')}:
                </label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Notatki (np. rocznik)..."
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

      {/* Full Team Quick Entry / Bulk Modal */}
      {isBulkModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/90 animate-in fade-in duration-150">
          <div className="w-full max-w-3xl rounded-2xl bg-slate-900 border border-slate-800 p-4 sm:p-5 shadow-2xl text-slate-100 max-h-[92vh] flex flex-col">
            <div className="flex items-center justify-between gap-2 pb-3 border-b border-slate-800 shrink-0">
              <div>
                <h3 className="text-base font-black text-white flex items-center gap-2">
                  <Table2 className="w-5 h-5 text-amber-400" />
                  <span>Wprowadź lub uzupełnij całą drużynę</span>
                </h3>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  {readOnly
                    ? 'Zapis wyłącznie w pamięci Twojego telefonu — uzupełnione nazwiska pojawią się w podglądzie na żywo, historii i pełnych raportach PDF.'
                    : 'Imiona, nazwiska i zdjęcia zapisują się lokalnie na Twoim urządzeniu. Na serwer trafiają wyłącznie numery koszulek.'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsBulkModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Mode Switcher */}
            <div className="flex items-center gap-2 bg-slate-950 p-1 rounded-xl border border-slate-800 mt-3 shrink-0">
              <button
                type="button"
                onClick={() => {
                  setBulkTab('table');
                  setBulkError(null);
                }}
                className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition ${
                  bulkTab === 'table'
                    ? 'bg-amber-500 text-slate-950 shadow'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Table2 className="w-3.5 h-3.5" />
                <span>Tabela całej drużyny</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setBulkTab('text');
                  setBulkError(null);
                }}
                className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition ${
                  bulkTab === 'text'
                    ? 'bg-amber-500 text-slate-950 shadow'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <FileText className="w-3.5 h-3.5" />
                <span>Wklej listę tekstową</span>
              </button>
            </div>

            {bulkTab === 'table' ? (
              <form
                onSubmit={handleSaveBulkTable}
                className="flex flex-col flex-1 min-h-0 mt-3"
              >
                <div className="flex-1 overflow-y-auto space-y-2 pr-1">
                  {bulkRows.map((row) => {
                    const lockRowNum = readOnly && row.isServerSynced;
                    return (
                      <div
                        key={row.key}
                        className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 flex flex-wrap sm:flex-nowrap items-center gap-2"
                      >
                        {/* Jersey Number */}
                        <div className="w-16 shrink-0">
                          <label className="text-[9px] text-slate-500 font-bold block mb-0.5">
                            NR
                          </label>
                          <input
                            type="number"
                            min="0"
                            max="99"
                            disabled={lockRowNum}
                            value={row.number}
                            onChange={(e) =>
                              setBulkRows((prev) =>
                                prev.map((r) =>
                                  r.key === row.key ? { ...r, number: e.target.value } : r
                                )
                              )
                            }
                            placeholder="#"
                            className={`w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-xs font-mono font-black text-amber-400 focus:outline-none focus:border-amber-500 ${
                              lockRowNum ? 'opacity-65 cursor-not-allowed' : ''
                            }`}
                          />
                        </div>

                        {/* Photo Picker */}
                        <div className="shrink-0 flex items-center gap-1">
                          <label
                            className="w-9 h-9 rounded-lg bg-slate-900 border border-slate-700 hover:border-amber-500/60 flex items-center justify-center overflow-hidden cursor-pointer relative"
                            title="Dodaj lub zmień zdjęcie"
                          >
                            {row.photo ? (
                              <img
                                src={row.photo}
                                alt="Foto"
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <Camera className="w-4 h-4 text-slate-500" />
                            )}
                            <input
                              type="file"
                              accept="image/*"
                              onChange={(e) => handleBulkRowPhoto(row.key, e)}
                              className="hidden"
                            />
                          </label>
                          {row.photo && (
                            <button
                              type="button"
                              onClick={() =>
                                setBulkRows((prev) =>
                                  prev.map((r) =>
                                    r.key === row.key ? { ...r, photo: '' } : r
                                  )
                                )
                              }
                              className="p-1 text-slate-500 hover:text-rose-400"
                              title="Usuń zdjęcie"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          )}
                        </div>

                        {/* First Name */}
                        <div className="flex-1 min-w-[110px]">
                          <label className="text-[9px] text-slate-500 font-bold block mb-0.5">
                            Imię
                          </label>
                          <input
                            type="text"
                            value={row.firstName}
                            onChange={(e) =>
                              setBulkRows((prev) =>
                                prev.map((r) =>
                                  r.key === row.key
                                    ? { ...r, firstName: e.target.value }
                                    : r
                                )
                              )
                            }
                            placeholder="Imię"
                            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-amber-500"
                          />
                        </div>

                        {/* Last Name */}
                        <div className="flex-1 min-w-[120px]">
                          <label className="text-[9px] text-slate-500 font-bold block mb-0.5">
                            Nazwisko
                          </label>
                          <input
                            type="text"
                            value={row.lastName}
                            onChange={(e) =>
                              setBulkRows((prev) =>
                                prev.map((r) =>
                                  r.key === row.key
                                    ? { ...r, lastName: e.target.value }
                                    : r
                                )
                              )
                            }
                            placeholder="Nazwisko"
                            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-amber-500"
                          />
                        </div>

                        {/* Position */}
                        <div className="w-20 shrink-0">
                          <label className="text-[9px] text-slate-500 font-bold block mb-0.5">
                            Poz.
                          </label>
                          <select
                            value={row.position}
                            onChange={(e) =>
                              setBulkRows((prev) =>
                                prev.map((r) =>
                                  r.key === row.key
                                    ? { ...r, position: e.target.value }
                                    : r
                                )
                              )
                            }
                            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-xs font-bold text-slate-200 focus:outline-none focus:border-amber-500"
                          >
                            <option value="PG">PG</option>
                            <option value="SG">SG</option>
                            <option value="SF">SF</option>
                            <option value="PF">PF</option>
                            <option value="C">C</option>
                          </select>
                        </div>

                        {/* Remove / Clear Row */}
                        <div className="shrink-0 pt-3.5 sm:pt-4">
                          {lockRowNum ? (
                            <button
                              type="button"
                              onClick={() =>
                                setBulkRows((prev) =>
                                  prev.map((r) =>
                                    r.key === row.key
                                      ? { ...r, firstName: '', lastName: '', photo: '', notes: '' }
                                      : r
                                  )
                                )
                              }
                              className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-500/10"
                              title="Wyczyść lokalne dane tego numeru"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() =>
                                setBulkRows((prev) =>
                                  prev.filter((r) => r.key !== row.key)
                                )
                              }
                              className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-500/10"
                              title="Usuń wiersz"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}

                  <button
                    type="button"
                    onClick={handleAddBulkRow}
                    className="w-full py-2.5 rounded-xl border border-dashed border-slate-700 hover:border-amber-500/60 text-xs font-bold text-amber-400 hover:bg-amber-500/5 transition flex items-center justify-center gap-1.5"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Dodaj kolejny numer do drużyny</span>
                  </button>
                </div>

                {bulkError && (
                  <div className="mt-3 p-2.5 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs font-semibold shrink-0">
                    {bulkError}
                  </div>
                )}

                <div className="flex gap-2 pt-3 mt-3 border-t border-slate-800 shrink-0">
                  <button
                    type="button"
                    onClick={() => setIsBulkModalOpen(false)}
                    className="flex-1 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs transition"
                  >
                    {t('common.cancel')}
                  </button>
                  <button
                    type="submit"
                    disabled={isBulkSaving}
                    className="flex-1 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 font-black text-xs transition shadow-md flex items-center justify-center gap-1.5"
                  >
                    <Check className="w-4 h-4" />
                    <span>
                      {isBulkSaving ? 'Zapisywanie...' : 'Zapisz całą drużynę'}
                    </span>
                  </button>
                </div>
              </form>
            ) : (
              <div className="flex flex-col flex-1 min-h-0 mt-3 space-y-3">
                <div className="text-xs text-slate-300">
                  Wklej listę z Excela, Messengera lub notatek (jedna linia = jeden zawodnik, np. <span className="font-mono text-amber-300">7 Jan Kowalski PG</span>):
                </div>
                <textarea
                  value={bulkText}
                  onChange={(e) => setBulkText(e.target.value)}
                  rows={7}
                  placeholder={`4 Kacper Zieliński PG\n7 Jan Kowalski SG\n12 Michał Nowak C\n23 Piotr Wiśniewski SF`}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-xs font-mono text-white placeholder-slate-600 focus:outline-none focus:border-amber-500"
                />

                <div className="flex-1 overflow-y-auto bg-slate-950 border border-slate-800 rounded-xl p-3 space-y-1.5">
                  <div className="text-[11px] font-bold text-slate-400">
                    Rozpoznano zawodników: <span className="text-amber-400">{parsedTextPreview.length}</span>
                  </div>
                  {parsedTextPreview.length === 0 ? (
                    <p className="text-[11px] text-slate-500">
                      Wpisz linie powyżej, aby zobaczyć podgląd dopasowania numerów.
                    </p>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                      {parsedTextPreview.map((p, idx) => {
                        const existingMatch = players.find((ep) => ep.number === p.number);
                        return (
                          <div
                            key={`${p.number}-${idx}`}
                            className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs"
                          >
                            <span className="truncate font-semibold text-white">
                              <strong className="font-mono text-amber-400">#{p.number}</strong>{' '}
                              {p.firstName} {p.lastName}
                            </span>
                            <span
                              className={`text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0 ${
                                existingMatch
                                  ? 'bg-emerald-500/15 text-emerald-300'
                                  : 'bg-sky-500/15 text-sky-300'
                              }`}
                            >
                              {existingMatch ? 'Uzupełni' : 'Nowy'}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {bulkError && (
                  <div className="p-2.5 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs font-semibold">
                    {bulkError}
                  </div>
                )}

                <div className="flex gap-2 pt-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => setIsBulkModalOpen(false)}
                    className="flex-1 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs transition"
                  >
                    {t('common.cancel')}
                  </button>
                  <button
                    type="button"
                    disabled={isBulkSaving || parsedTextPreview.length === 0}
                    onClick={handleSaveBulkText}
                    className="flex-1 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 font-black text-xs transition shadow-md flex items-center justify-center gap-1.5"
                  >
                    <Check className="w-4 h-4" />
                    <span>
                      {isBulkSaving ? 'Zapisywanie...' : `Zapisz listę (${parsedTextPreview.length})`}
                    </span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Delete / Clear PII Confirmation Modal */}
      {playerToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 animate-in fade-in duration-150">
          <div className="w-full max-w-sm rounded-2xl bg-slate-900 border border-slate-800 p-5 shadow-2xl text-slate-100 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center text-rose-400 shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">
                  {readOnly && playerToDelete.isServerSynced
                    ? 'Wyczyść dane osobowe'
                    : t('common.delete')}
                </h3>
                <p className="text-xs text-slate-400">
                  {readOnly && playerToDelete.isServerSynced
                    ? 'Usunięcie tylko lokalnego imienia, nazwiska i zdjęcia'
                    : t('roster.deleteConfirm')}
                </p>
              </div>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed bg-slate-950 p-3 rounded-xl border border-slate-800/80">
              {readOnly && playerToDelete.isServerSynced ? (
                <>
                  Czy usunąć lokalnie zapisane imię, nazwisko i zdjęcie zawodnika{' '}
                  <span className="font-bold text-amber-400">{playerToDelete.name}</span>? Numer na koszulce i statystyki z serwera zostaną zachowane.
                </>
              ) : (
                <>
                  {t('roster.deleteConfirm')}{' '}
                  <span className="font-bold text-amber-400">{playerToDelete.name}</span>?
                </>
              )}
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
                <span>
                  {readOnly && playerToDelete.isServerSynced
                    ? 'Wyczyść dane'
                    : t('common.delete')}
                </span>
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

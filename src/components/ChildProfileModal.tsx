import React, { useState, useEffect } from 'react';
import { ChildProfile, TeamCategory } from '../types/basketball';
import { X, User, Shield, Hash, Sparkles, Check, AlertCircle } from 'lucide-react';
import { playClickSound, triggerHaptic } from '../services/tts';

interface ChildProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  childToEdit?: ChildProfile | null;
  onSaveChild: (child: ChildProfile) => void;
  totalChildrenCount: number;
}

const AVATAR_OPTIONS = ['⚡', '🏀', '🌟', '👦', '👧', '🦁', '🔥', '🦅', '🎯', '🚀', '💪', '👑'];
const COLOR_OPTIONS = [
  '#f97316', // orange
  '#3b82f6', // blue
  '#10b981', // emerald
  '#8b5cf6', // purple
  '#ec4899', // pink
  '#eab308', // amber
  '#ef4444', // red
  '#06b6d4', // cyan
];
const POPULAR_CATEGORIES: TeamCategory[] = ['U10', 'U11', 'U12', 'U13', 'U14', 'U15', 'U16', 'U17', 'U18'];

export const ChildProfileModal: React.FC<ChildProfileModalProps> = ({
  isOpen,
  onClose,
  childToEdit,
  onSaveChild,
  totalChildrenCount,
}) => {
  const [name, setName] = useState('');
  const [number, setNumber] = useState<number>(7);
  const [clubName, setClubName] = useState('UKS Akademia Koszykówki');
  const [category, setCategory] = useState<TeamCategory>('U13');
  const [birthYear, setBirthYear] = useState<number>(2014);
  const [position, setPosition] = useState('SG - Rzucający Obrońca');
  const [color, setColor] = useState('#f97316');
  const [avatarEmoji, setAvatarEmoji] = useState('⚡');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (childToEdit) {
      setName(childToEdit.name);
      setNumber(childToEdit.number);
      setClubName(childToEdit.clubName);
      setCategory(childToEdit.category);
      setBirthYear(childToEdit.birthYear || 2014);
      setPosition(childToEdit.position || 'SG - Rzucający Obrońca');
      setColor(childToEdit.color || '#f97316');
      setAvatarEmoji(childToEdit.avatarEmoji || '⚡');
      setNotes(childToEdit.notes || '');
    } else {
      setName('');
      setNumber(10);
      setClubName('UKS Akademia Koszykówki');
      setCategory('U13');
      setBirthYear(2014);
      setPosition('Obrońca');
      setColor(COLOR_OPTIONS[Math.min(totalChildrenCount, COLOR_OPTIONS.length - 1)]);
      setAvatarEmoji(AVATAR_OPTIONS[Math.min(totalChildrenCount, AVATAR_OPTIONS.length - 1)]);
      setNotes('');
    }
    setError(null);
  }, [childToEdit, isOpen, totalChildrenCount]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Wprowadź imię i nazwisko dziecka.');
      return;
    }
    if (!clubName.trim()) {
      setError('Wprowadź nazwę klubu, w którym trenuje dziecko.');
      return;
    }

    playClickSound();
    triggerHaptic(40);

    const profile: ChildProfile = {
      id: childToEdit ? childToEdit.id : `child-${Date.now()}`,
      name: name.trim(),
      number: Number(number) || 0,
      clubName: clubName.trim(),
      category: category.trim() as TeamCategory,
      birthYear: Number(birthYear) || undefined,
      position: position.trim() || undefined,
      color,
      avatarEmoji,
      notes: notes.trim() || undefined,
      createdAt: childToEdit ? childToEdit.createdAt : Date.now(),
    };

    onSaveChild(profile);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/90 overflow-y-auto">
      <div className="relative w-full max-w-lg bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden my-6">
        {/* Header with selected color accent */}
        <div
          className="p-5 text-white flex items-center justify-between transition-colors"
          style={{
            background: `linear-gradient(135deg, ${color}33 0%, rgba(15,23,42,0.9) 100%)`,
            borderBottom: `2px solid ${color}`,
          }}
        >
          <div className="flex items-center gap-3">
            <div
              className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl shadow-lg border border-white/20"
              style={{ backgroundColor: color }}
            >
              {avatarEmoji}
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-black tracking-tight">
                {childToEdit ? 'Edytuj Profil Dziecka' : 'Dodaj Nowe Dziecko (Maks. 3)'}
              </h2>
              <p className="text-xs text-slate-300">
                Prowadź statystyki indywidualne z każdego meczu
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 sm:p-6 space-y-4 max-h-[75vh] overflow-y-auto">
          {error && (
            <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Child Name & Jersey Number */}
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                Imię i Nazwisko Dziecka *
              </label>
              <div className="relative">
                <input
                  type="text"
                  required
                  placeholder="np. Kacper Nowak"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white font-bold text-sm focus:outline-none focus:border-amber-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                Nr koszulki
              </label>
              <input
                type="number"
                min="0"
                max="99"
                value={number}
                onChange={(e) => setNumber(Number(e.target.value))}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white font-mono font-black text-center text-sm focus:outline-none focus:border-amber-500"
              />
            </div>
          </div>

          {/* Club & Category */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                Klub Dziecka *
              </label>
              <input
                type="text"
                required
                placeholder="np. UKS Basket, MKS Dąbrowa"
                value={clubName}
                onChange={(e) => setClubName(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white text-xs font-semibold focus:outline-none focus:border-amber-500"
              />
              <span className="text-[10px] text-slate-500 mt-0.5 block">
                Każde dziecko może trenować w innym klubie
              </span>
            </div>

            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                Kategoria wiekowa
              </label>
              <div className="flex flex-wrap gap-1">
                {POPULAR_CATEGORIES.map((cat) => (
                  <button
                    type="button"
                    key={cat}
                    onClick={() => setCategory(cat)}
                    className={`px-2 py-1 rounded-lg text-xs font-bold transition ${
                      category === cat
                        ? 'bg-amber-500 text-slate-950 font-black'
                        : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Birth Year & Position */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                Rocznik urodzenia
              </label>
              <input
                type="number"
                min="2005"
                max="2022"
                value={birthYear}
                onChange={(e) => setBirthYear(Number(e.target.value))}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white text-xs font-mono font-bold focus:outline-none focus:border-amber-500"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                Pozycja na boisku
              </label>
              <input
                type="text"
                placeholder="np. PG / Obrońca / Skrzydłowy"
                value={position}
                onChange={(e) => setPosition(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white text-xs font-semibold focus:outline-none focus:border-amber-500"
              />
            </div>
          </div>

          {/* Avatar Emoji & Color Accent */}
          <div className="space-y-3 pt-1 border-t border-slate-800/80">
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                Wybierz Ikonę / Awatar Dziecka
              </label>
              <div className="flex flex-wrap gap-2">
                {AVATAR_OPTIONS.map((em) => (
                  <button
                    type="button"
                    key={em}
                    onClick={() => setAvatarEmoji(em)}
                    className={`w-10 h-10 rounded-xl text-xl flex items-center justify-center transition ${
                      avatarEmoji === em
                        ? 'bg-amber-500 text-slate-950 ring-2 ring-amber-400 scale-105'
                        : 'bg-slate-950 text-slate-300 hover:bg-slate-800 border border-slate-800'
                    }`}
                  >
                    {em}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                Kolor Wiodący
              </label>
              <div className="flex flex-wrap gap-2">
                {COLOR_OPTIONS.map((c) => (
                  <button
                    type="button"
                    key={c}
                    onClick={() => setColor(c)}
                    className="w-8 h-8 rounded-full flex items-center justify-center transition border-2"
                    style={{
                      backgroundColor: c,
                      borderColor: color === c ? '#ffffff' : 'transparent',
                      transform: color === c ? 'scale(1.15)' : 'scale(1)',
                    }}
                  >
                    {color === c && <Check className="w-4 h-4 text-white stroke-[3]" />}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">
              Notatki rodzica (opcjonalnie)
            </label>
            <textarea
              rows={2}
              placeholder="np. Wzrost 152 cm, dominująca lewa ręka, cel na ten sezon: pewniejszy rzut z dystansu."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white text-xs focus:outline-none focus:border-amber-500"
            />
          </div>

          {/* Action buttons */}
          <div className="pt-3 border-t border-slate-800 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs transition"
            >
              Anuluj
            </button>
            <button
              type="submit"
              className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 font-black text-xs transition shadow-lg shadow-orange-950/40 active:scale-95"
            >
              {childToEdit ? 'Zapisz Zmiany' : 'Dodaj Dziecko'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

import React, { useState, useEffect } from 'react';
import { ClubProfile, Match, Player, TeamCategory, DEFAULT_SEASONS, getMatchSeason } from '../types/basketball';
import { X, Trophy, Users, MapPin, Calendar, Clock, Check, Award } from 'lucide-react';
import { playClickSound, triggerHaptic } from '../services/tts';

interface NewMatchModalProps {
  isOpen: boolean;
  onClose: () => void;
  players: Player[];
  defaultCategory?: TeamCategory;
  clubProfile?: ClubProfile;
  onStartMatch: (newMatch: Match) => void;
}

const OPPONENT_SUGGESTIONS = [
  'WKK Wrocław',
  'WKS Śląsk Wrocław',
  'Trefl Sopot',
  'MKS Dąbrowa Górnicza',
  'Enea Basket Poznań',
  'Enea Astoria Bydgoszcz',
  'ŁKS Koszykówka Męska Łódź',
  'PGE Spójnia Stargard',
  'Twarde Pierniki Toruń',
  'Korona 1919 Kraków',
  'Legia Warszawa',
  'Zastal Zielona Góra',
  'Start Lublin',
];

export const NewMatchModal: React.FC<NewMatchModalProps> = ({
  isOpen,
  onClose,
  players,
  clubProfile,
  onStartMatch,
}) => {
  const [opponent, setOpponent] = useState('');
  const [location, setLocation] = useState<'Dom' | 'Wyjazd'>('Dom');
  const [date, setDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [season, setSeason] = useState(() => clubProfile?.season || '2026/2027');
  const [quarterMinutes, setQuarterMinutes] = useState(8);
  const [selectedPlayerIds, setSelectedPlayerIds] = useState<string[]>([]);
  const [onCourtPlayerIds, setOnCourtPlayerIds] = useState<string[]>([]);
  const [formError, setFormError] = useState<string | null>(null);

  const teamPlayers = players;

  // Initialize roster when modal opens
  useEffect(() => {
    if (isOpen) {
      const allIds = players.map((p) => p.id);
      setSelectedPlayerIds(allIds);
      setOnCourtPlayerIds(allIds.slice(0, 5));
      setFormError(null);
    }
  }, [isOpen, players]);

  if (!isOpen) return null;

  const toggleRosterPlayer = (playerId: string) => {
    playClickSound();
    triggerHaptic(20);
    if (selectedPlayerIds.includes(playerId)) {
      setSelectedPlayerIds(selectedPlayerIds.filter((id: string) => id !== playerId));
      setOnCourtPlayerIds(onCourtPlayerIds.filter((id: string) => id !== playerId));
    } else {
      setSelectedPlayerIds([...selectedPlayerIds, playerId]);
      if (onCourtPlayerIds.length < 5) {
        setOnCourtPlayerIds([...onCourtPlayerIds, playerId]);
      }
    }
  };

  const toggleStarter = (playerId: string) => {
    playClickSound();
    triggerHaptic(20);
    if (onCourtPlayerIds.includes(playerId)) {
      setOnCourtPlayerIds(onCourtPlayerIds.filter((id: string) => id !== playerId));
    } else {
      if (onCourtPlayerIds.length >= 5) {
        // Replace oldest or limit
        return;
      }
      setOnCourtPlayerIds([...onCourtPlayerIds, playerId]);
    }
  };

  const handleStart = () => {
    setFormError(null);
    if (!opponent.trim()) {
      setFormError('Wpisz nazwę drużyny przeciwnej.');
      return;
    }

    if (selectedPlayerIds.length === 0) {
      setFormError('Wybierz przynajmniej jednego zawodnika do składu meczowego.');
      return;
    }

    // Ensure we have 5 starters, or take first 5 from selected
    let starters = [...onCourtPlayerIds];
    if (starters.length < 5) {
      const remaining = selectedPlayerIds.filter((id: string) => !starters.includes(id));
      starters = [...starters, ...remaining.slice(0, 5 - starters.length)];
    }

    const newMatch: Match = {
      id: `match-${Date.now()}`,
      teamCategory: 'TEAM',
      opponent: opponent.trim(),
      location: location,
      date: date,
      season: season.trim() || clubProfile?.season || '2026/2027',
      quarterMinutes: quarterMinutes,
      status: 'live',
      rosterPlayerIds: selectedPlayerIds,
      onCourtPlayerIds: starters,
      currentQuarter: 1,
      clockSeconds: quarterMinutes * 60,
      isClockRunning: false,
      ourScore: 0,
      opponentScore: 0,
      quarterScores: {
        q1: { our: 0, opp: 0 },
        q2: { our: 0, opp: 0 },
        q3: { our: 0, opp: 0 },
        q4: { our: 0, opp: 0 },
      },
      events: [],
      updatedAt: Date.now(),
    };

    onStartMatch(newMatch);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/90">
      <div className="w-full max-w-xl max-h-[92vh] flex flex-col rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl text-slate-100 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-800 bg-slate-950/70">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/40 flex items-center justify-center font-bold">
              <Trophy className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-bold text-white">Nowy Mecz Koszykówki</h3>
              <p className="text-xs text-amber-400/90 font-medium">{clubProfile?.name || 'Mój Klub Koszykarski'}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Form */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">

          {/* Opponent Input & Suggestions */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">
              Przeciwnik:
            </label>
            <input
              type="text"
              placeholder="np. WKK Wrocław, Trefl Sopot, Śląsk..."
              value={opponent}
              onChange={(e) => setOpponent(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm font-semibold text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
            />
            {/* Quick Suggestions Chips */}
            <div className="flex items-center gap-1.5 overflow-x-auto pt-2 pb-1 scrollbar-none">
              <span className="text-[10px] text-slate-500 uppercase font-bold shrink-0">
                Szybki wybór:
              </span>
              {OPPONENT_SUGGESTIONS.slice(0, 6).map((sug) => (
                <button
                  key={sug}
                  type="button"
                  onClick={() => setOpponent(sug)}
                  className="px-2 py-0.5 rounded-lg bg-slate-950 text-slate-400 hover:text-amber-400 border border-slate-800 text-[11px] font-medium shrink-0 transition"
                >
                  {sug}
                </button>
              ))}
            </div>
          </div>

          {/* Location & Date & Season & Quarter Length */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                Miejsce meczu:
              </label>
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() => setLocation('Dom')}
                  className={`py-2 text-xs font-bold rounded-xl border transition ${
                    location === 'Dom'
                      ? 'bg-slate-800 border-amber-500 text-amber-400'
                      : 'bg-slate-950 border-slate-800 text-slate-400'
                  }`}
                >
                  🏠 Dom
                </button>
                <button
                  type="button"
                  onClick={() => setLocation('Wyjazd')}
                  className={`py-2 text-xs font-bold rounded-xl border transition ${
                    location === 'Wyjazd'
                      ? 'bg-slate-800 border-amber-500 text-amber-400'
                      : 'bg-slate-950 border-slate-800 text-slate-400'
                  }`}
                >
                  🚌 Wyjazd
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                Data meczu:
              </label>
              <input
                type="date"
                value={date}
                onChange={(e) => {
                  const newDate = e.target.value;
                  setDate(newDate);
                  const inferred = getMatchSeason({ date: newDate }, clubProfile?.season);
                  if (inferred) setSeason(inferred);
                }}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs font-semibold text-white focus:outline-none focus:border-amber-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                Sezon:
              </label>
              <input
                type="text"
                placeholder="np. 2026/2027"
                value={season}
                onChange={(e) => setSeason(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs font-semibold text-white focus:outline-none focus:border-amber-500"
              />
              <div className="flex items-center gap-1 mt-1 overflow-x-auto scrollbar-none">
                {DEFAULT_SEASONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setSeason(s)}
                    className={`px-1.5 py-0.5 rounded text-[10px] font-bold border transition ${
                      season === s
                        ? 'bg-amber-500 text-slate-950 border-amber-500'
                        : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-white'
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                Czas kwarty:
              </label>
              <select
                value={quarterMinutes}
                onChange={(e) => setQuarterMinutes(parseInt(e.target.value, 10))}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs font-semibold text-white focus:outline-none focus:border-amber-500"
              >
                <option value={8}>4 x 8 min (Młodzież standard)</option>
                <option value={10}>4 x 10 min (FIBA standard)</option>
                <option value={6}>4 x 6 min (Szybki sparing)</option>
                <option value={12}>4 x 12 min (NBA)</option>
              </select>
            </div>
          </div>

          {/* Roster & Starting Five Selection */}
          <div className="border-t border-slate-800/80 pt-3">
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                <Users className="w-4 h-4 text-amber-400" />
                <span>Skład meczowy i Pierwsza Piątka:</span>
              </label>
              <span className="text-xs font-mono text-amber-400">
                Wybrano: {selectedPlayerIds.length} | Na boisku: {onCourtPlayerIds.length}/5
              </span>
            </div>

            <p className="text-[11px] text-slate-400 mb-2">
              Zaznacz zawodników powołanych na mecz. Gwiazdka ⭐ oznacza pierwszą piątkę (5 graczy rozpoczynających mecz).
            </p>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-56 overflow-y-auto pr-1">
              {teamPlayers.map((player) => {
                const isSelected = selectedPlayerIds.includes(player.id);
                const isStarter = onCourtPlayerIds.includes(player.id);

                return (
                  <div
                    key={player.id}
                    className={`p-2 rounded-xl border flex items-center justify-between transition ${
                      isSelected
                        ? isStarter
                          ? 'bg-amber-500/15 border-amber-500 text-white'
                          : 'bg-slate-950 border-slate-700 text-slate-200'
                        : 'bg-slate-950/40 border-slate-850 text-slate-600 opacity-60'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => toggleRosterPlayer(player.id)}
                      className="flex-1 text-left flex items-center gap-1.5 min-w-0"
                    >
                      <span className="font-mono font-bold text-amber-400 text-xs">
                        #{player.number}
                      </span>
                      <span className="text-xs font-semibold truncate">
                        {player.lastName?.trim() || player.firstName?.trim() || 'Zawodnik'}
                      </span>
                    </button>

                    {isSelected && (
                      <button
                        type="button"
                        onClick={() => toggleStarter(player.id)}
                        className={`p-1 rounded-md text-xs font-bold transition ml-1 shrink-0 ${
                          isStarter
                            ? 'bg-amber-500 text-slate-950 shadow-sm'
                            : 'bg-slate-800 text-slate-400 hover:text-amber-400'
                        }`}
                        title={isStarter ? 'W pierwszej piątce' : 'Ustaw w pierwszej piątce'}
                      >
                        {isStarter ? '⭐ 5' : 'Ławka'}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
          {formError && (
            <div className="p-2.5 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs font-semibold">
              {formError}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/70 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs transition"
          >
            Anuluj
          </button>
          <button
            type="button"
            onClick={handleStart}
            className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 font-black text-sm shadow-lg shadow-orange-950/40 transition active:scale-95"
          >
            🏀 Rozpocznij mecz na żywo
          </button>
        </div>
      </div>
    </div>
  );
};

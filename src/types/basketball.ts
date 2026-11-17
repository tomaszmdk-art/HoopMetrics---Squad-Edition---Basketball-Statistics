export type TeamCategory = string;

export type RoomRole = 'coach' | 'spectator';

export interface RoomSummary {
  roomId: string;
  teamName: string;
  shortName: string;
  city?: string;
  badgeEmoji: string;
  season: string;
  role: RoomRole;
  coachToken?: string;
  lastVisited: number;
}

export interface RoomPublicInfo {
  exists: boolean;
  roomId: string;
  teamName: string;
  shortName: string;
  city?: string;
  badgeEmoji: string;
  season: string;
  hasLiveMatch: boolean;
  liveOpponent?: string;
  liveScore?: string;
  playersCount: number;
  matchesCount: number;
}

export interface ClubProfile {
  id: string;
  name: string; // Pełna nazwa drużyny/klubu, np. "Basket Warszawa", "MKS Dąbrowa Górnicza"
  shortName: string; // Skrót na tablicy wyników (np. "BSK", "MKS", "UKS")
  city: string; // Miasto
  badgeEmoji: string; // 🏀, 🦅, 🦁, ⚡, 🏆, 🐺, 🛡️, 🔥, 🎯, 🚀
  badgeLogoUrl?: string; // Wgrany własny herb/logo drużyny (Data URL / base64)
  primaryColor: string; // Kolor akcentu (hex)
  secondaryColor: string; // Kolor tła / pomocniczy (hex)
  headCoach?: string; // Trener główny
  assistantCoach?: string; // Asystent trenera
  categories: string[]; // Zachowane dla kompatybilności wstecznej eksportów
  season: string; // np. "2026/2027"
  leagueName?: string; // np. "Rozgrywki Ligowe"
  updatedAt?: number;
}

export interface Player {
  id: string;
  teamCategory: TeamCategory;
  firstName: string;
  lastName: string;
  number: number;
  position?: 'PG' | 'SG' | 'SF' | 'PF' | 'C' | 'OBROŃCA' | 'SKRZYDŁOWY' | 'ŚRODKOWY';
  notes?: string;
  photo?: string; // base64 Data URL or Image URL
  createdAt: number;
}

export type ActionType =
  | '2PT_MADE'
  | '2PT_MISS'
  | '3PT_MADE'
  | '3PT_MISS'
  | 'FT_MADE'
  | 'FT_MISS'
  | 'OFF_REB'
  | 'DEF_REB'
  | 'ASSIST'
  | 'STEAL'
  | 'BLOCK'
  | 'TURNOVER'
  | 'FOUL'
  | 'OPP_1PT'
  | 'OPP_2PT'
  | 'OPP_3PT'
  | 'OPP_MINUS_1'
  | 'OPP_FOUL'
  | 'MANUAL_OUR_PLUS_1'
  | 'MANUAL_OUR_PLUS_2'
  | 'MANUAL_OUR_PLUS_3'
  | 'MANUAL_OUR_MINUS_1';

export interface MatchEvent {
  id: string;
  matchId: string;
  timestamp: number;
  quarter: number; // 1, 2, 3, 4, 5+ for OT
  gameClock: string; // e.g. "06:45"
  clockSeconds: number; // remaining seconds in quarter
  type: ActionType;
  team: 'our' | 'opp';
  points: number; // 0, 1, 2, 3, -1
  playerId?: string;
  playerName?: string;
  playerNumber?: number;
  assistedByPlayerId?: string;
  assistedByPlayerName?: string;
  subType?: string; // np. Błąd kozłowania, Kroki, Podanie w aut, Wybicie, Szarża, Layup itp.
  onCourtPlayerIds?: string[]; // IDs of players on court when this event occurred
  ourScoreAfter: number;
  oppScoreAfter: number;
}

export interface PlayerMatchStats {
  playerId: string;
  playerNumber: number;
  playerName: string;
  pts: number;
  plusMinus: number; // +/- bilans punktowy drużyny podczas obecności zawodnika na boisku
  fg2m: number;
  fg2a: number;
  fg2Pct: number; // 0-100
  fg3m: number;
  fg3a: number;
  fg3Pct: number; // 0-100
  fgm: number;
  fga: number;
  fgPct: number; // 0-100
  ftm: number;
  fta: number;
  ftPct: number; // 0-100
  offReb: number;
  defReb: number;
  totReb: number;
  ast: number;
  stl: number;
  blk: number;
  tov: number;
  fouls: number;
  eval: number; // FIBA evaluation
}

export interface PlayerCareerAverages {
  playerId: string;
  playerName: string;
  playerNumber: number;
  gamesPlayed: number;
  totalPts: number;
  ppg: number;
  totalPlusMinus: number;
  plusMinusAvg: number;
  totalReb: number;
  rpg: number;
  totalAst: number;
  apg: number;
  totalStl: number;
  spg: number;
  totalBlk: number;
  bpg: number;
  fgPct: number;
  ftPct: number;
  evalAvg: number;
  highScore: number;
}

export interface TeamMatchStats {
  pts: number;
  fg2m: number;
  fg2a: number;
  fg2Pct: number;
  fg3m: number;
  fg3a: number;
  fg3Pct: number;
  fgm: number;
  fga: number;
  fgPct: number;
  ftm: number;
  fta: number;
  ftPct: number;
  offReb: number;
  defReb: number;
  totReb: number;
  ast: number;
  stl: number;
  blk: number;
  tov: number;
  fouls: number;
  eval: number;
}

export interface QuarterScores {
  q1: { our: number; opp: number };
  q2: { our: number; opp: number };
  q3: { our: number; opp: number };
  q4: { our: number; opp: number };
  ot?: { our: number; opp: number };
}

export interface Match {
  id: string;
  teamCategory: TeamCategory;
  opponent: string;
  location: 'Dom' | 'Wyjazd';
  date: string; // YYYY-MM-DD
  season?: string; // np. "2026/2027", "2025/2026"
  quarterMinutes: number; // usually 8 or 10 min
  status: 'live' | 'finished';
  rosterPlayerIds: string[]; // selected players
  onCourtPlayerIds: string[]; // 5 on court
  currentQuarter: number; // 1, 2, 3, 4, 5 (OT)
  clockSeconds: number; // current countdown seconds in current quarter
  isClockRunning: boolean;
  ourScore: number;
  opponentScore: number;
  quarterScores: QuarterScores;
  events: MatchEvent[];
  aiCoachRecap?: string;
  notes?: string;
  updatedAt: number;
}

export const DEFAULT_SEASONS = ['2026/2027', '2025/2026', '2024/2025', '2023/2024'];

/**
 * Zwraca sezon meczu. Jeśli nie jest jawnie zapisany, wylicza go na podstawie daty (sezon koszykarski: wrzesień - sierpień).
 */
export function getMatchSeason(match: { season?: string; date?: string }, defaultSeason = '2026/2027'): string {
  if (match.season && match.season.trim()) {
    return match.season.trim();
  }
  if (match.date) {
    const parts = match.date.split('-');
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10);
    if (!isNaN(year) && !isNaN(month)) {
      if (month >= 8) {
        return `${year}/${year + 1}`;
      } else {
        return `${year - 1}/${year}`;
      }
    }
  }
  return defaultSeason;
}

export interface AppSettings {
  ttsEnabled: boolean;
  soundEffects: boolean;
  handMode: 'right' | 'left'; // thumb ergonomicity
  autoAdvanceQuarter: boolean;
  defaultQuarterMinutes: number;
  announcerVoice: 'Puck' | 'Kore' | 'Fenrir' | 'Zephyr';
  coachPin?: string; // PIN trenera do odblokowania edycji (domyślnie "1234")
}

// ==========================================
// PARENT MODE / WARIANT RODZICA (Maks. 3 dzieci)
// ==========================================

export interface ChildProfile {
  id: string; // e.g. "child-1", "child-2", "child-3"
  name: string; // Imię i nazwisko dziecka (np. "Kacper Nowak")
  number: number; // Numer na koszulce (np. 7)
  clubName: string; // Klub, w którym gra dziecko (np. "UKS Basket", "Basket Warszawa", "MKS Dąbrowa")
  category: TeamCategory; // Kategoria wiekowa (np. "U11", "U13", "U15", "U17")
  birthYear?: number; // Rocznik urodzenia (np. 2014)
  position?: string; // Pozycja (np. "PG", "SG", "SF", "PF", "C", "Obrońca", "Skrzydłowy", "Środkowy")
  color: string; // Kolor wiodący profilu (hex, np. "#f97316")
  avatarEmoji: string; // Ikona / Awatar (np. "🏀", "👦", "👧", "⚡", "🌟", "🦁", "🔥")
  notes?: string; // Notatki rodzica (np. wzrost, silna strona, cel na sezon)
  createdAt: number;
}

export interface ChildMatchEvent {
  id: string;
  timestamp: number;
  quarter: number; // 1..4, 5 (Dogrywka)
  timeFormatted: string; // np. "18:42"
  type:
    | '2PT_MADE'
    | '2PT_MISS'
    | '3PT_MADE'
    | '3PT_MISS'
    | 'FT_MADE'
    | 'FT_MISS'
    | 'OFF_REB'
    | 'DEF_REB'
    | 'ASSIST'
    | 'STEAL'
    | 'BLOCK'
    | 'TURNOVER'
    | 'FOUL'
    | 'PLUS_OUR'
    | 'MINUS_OPP'
    | 'SUB_IN'
    | 'SUB_OUT'
    | 'CLOCK_START'
    | 'CLOCK_PAUSE'
    | 'HIGHLIGHT';
  label: string;
  pointsDelta: number;
  highlightNote?: string;
}

export interface ChildMatchRecord {
  id: string;
  childId: string;
  childName: string;
  childNumber: number;
  childClub: string;
  childCategory: TeamCategory;
  opponent: string; // Rywal (np. "ŁKS Łódź")
  location: 'Dom' | 'Wyjazd';
  date: string; // YYYY-MM-DD
  competition?: string; // np. "Liga Wojewódzka", "Turniej", "Mecz Towarzyski"
  quarterMinutes: number; // czas trwania kwarty (np. 8 lub 10 min)
  status: 'live' | 'finished';
  currentQuarter: number;
  // Czas na parkiecie
  isOnCourt: boolean;
  isClockRunning?: boolean; // whether match clock is actively counting (manual start required)
  secondsPlayed: number;
  lastSubTimestamp?: number;
  // Statystyki indywidualne dziecka
  pts: number;
  fg2m: number;
  fg2a: number;
  fg3m: number;
  fg3a: number;
  ftm: number;
  fta: number;
  offReb: number;
  defReb: number;
  totReb: number;
  ast: number;
  stl: number;
  blk: number;
  tov: number;
  fouls: number;
  plusMinus: number;
  eval: number; // FIBA evaluation
  events: ChildMatchEvent[];
  quarterScores?: {
    q1: { pts: number; reb: number; ast: number };
    q2: { pts: number; reb: number; ast: number };
    q3: { pts: number; reb: number; ast: number };
    q4: { pts: number; reb: number; ast: number };
    ot?: { pts: number; reb: number; ast: number };
  };
  finalTeamScoreOur?: number;
  finalTeamScoreOpp?: number;
  notes?: string;
  highlights: string[];
  updatedAt: number;
}


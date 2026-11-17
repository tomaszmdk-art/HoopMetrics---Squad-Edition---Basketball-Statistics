import { Match, MatchEvent, Player } from '../src/types/basketball';
import { calculatePlayerStats, recalculateMatchScores, calculateTeamStats } from '../src/services/statsCalculator';

console.log('====================================================');
console.log('ROZPOCZĘCIE TESTU OBOWIĄZKOWEGO SCENARIUSZA PUNKTOWEGO');
console.log('====================================================');

const testPlayer: Player = {
  id: 'player-1',
  teamCategory: 'U13',
  firstName: 'Jan',
  lastName: 'Kowalski',
  number: 10,
  createdAt: Date.now(),
};

let match: any = {
  id: 'test-match-1',
  teamCategory: 'U13',
  opponent: 'WKK Wrocław',
  location: 'Dom',
  date: '2026-10-11',
  quarterMinutes: 8,
  status: 'live',
  rosterPlayerIds: ['player-1'],
  onCourtPlayerIds: ['player-1'],
  currentQuarter: 1,
  clockSeconds: 480,
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

function recordAction(type: any) {
  const isOpp = type.startsWith('OPP_');
  const pts = type === '2PT_MADE' || type === 'OPP_2PT' ? 2 : type === '3PT_MADE' || type === 'OPP_3PT' ? 3 : type === 'FT_MADE' || type === 'OPP_1PT' ? 1 : 0;
  const newEvt: MatchEvent = {
    id: `evt-${Date.now()}-${Math.random()}`,
    matchId: match.id,
    timestamp: Date.now(),
    quarter: 1,
    gameClock: '07:30',
    clockSeconds: 450,
    type: type,
    team: isOpp ? 'opp' : 'our',
    points: pts,
    playerId: !isOpp ? testPlayer.id : undefined,
    playerName: !isOpp ? `${testPlayer.firstName} ${testPlayer.lastName}` : undefined,
    playerNumber: !isOpp ? testPlayer.number : undefined,
    ourScoreAfter: 0,
    oppScoreAfter: 0,
  };

  const newEvents = [...match.events, newEvt];
  const recalculated = recalculateMatchScores(newEvents);
  match = {
    ...match,
    ourScore: recalculated.ourScore,
    opponentScore: recalculated.oppScore,
    quarterScores: recalculated.quarterScores,
    events: recalculated.updatedEvents,
  };
}

function undoAction() {
  const newEvents = match.events.slice(0, -1);
  const recalculated = recalculateMatchScores(newEvents);
  match = {
    ...match,
    ourScore: recalculated.ourScore,
    opponentScore: recalculated.oppScore,
    quarterScores: recalculated.quarterScores,
    events: recalculated.updatedEvents,
  };
}

// 1. Celny rzut za 2 punkty: zawodnik 2, drużyna 2.
recordAction('2PT_MADE');
let pStats: any = calculatePlayerStats(testPlayer, match.events);
console.log(`Krok 1 (2PT Celny): Zawodnik = ${pStats.pts} pkt, Drużyna = ${match.ourScore} pkt (Wynik: ${match.ourScore} - ${match.opponentScore})`);
if (pStats.pts !== 2 || match.ourScore !== 2) throw new Error(`Krok 1 nie powiódł się! Zawodnik: ${pStats.pts}, Drużyna: ${match.ourScore}`);

// 2. Celny rzut za 3 punkty: zawodnik 5, drużyna 5.
recordAction('3PT_MADE');
pStats = calculatePlayerStats(testPlayer, match.events);
console.log(`Krok 2 (3PT Celny): Zawodnik = ${pStats.pts} pkt, Drużyna = ${match.ourScore} pkt (Wynik: ${match.ourScore} - ${match.opponentScore})`);
if (pStats.pts !== 5 || match.ourScore !== 5) throw new Error(`Krok 2 nie powiódł się! Zawodnik: ${pStats.pts}, Drużyna: ${match.ourScore}`);

// 3. Celny rzut wolny: zawodnik 6, drużyna 6.
recordAction('FT_MADE');
pStats = calculatePlayerStats(testPlayer, match.events);
console.log(`Krok 3 (FT Celny): Zawodnik = ${pStats.pts} pkt, Drużyna = ${match.ourScore} pkt (Wynik: ${match.ourScore} - ${match.opponentScore})`);
if (pStats.pts !== 6 || match.ourScore !== 6) throw new Error(`Krok 3 nie powiódł się! Zawodnik: ${pStats.pts}, Drużyna: ${match.ourScore}`);

// 4. Niecelny rzut za 2 punkty: wynik nadal 6.
recordAction('2PT_MISS');
pStats = calculatePlayerStats(testPlayer, match.events);
console.log(`Krok 4 (2PT Niecelny): Zawodnik = ${pStats.pts} pkt, Drużyna = ${match.ourScore} pkt (Wynik: ${match.ourScore} - ${match.opponentScore})`);
if (pStats.pts !== 6 || match.ourScore !== 6) throw new Error(`Krok 4 nie powiódł się! Zawodnik: ${pStats.pts}, Drużyna: ${match.ourScore}`);

// 5. Cofnięcie ostatniej celnej akcji: zawodnik 5, drużyna 5.
// Undo miss first:
undoAction();
console.log(`Krok 5a (Cofnięcie pudła): Zawodnik = ${calculatePlayerStats(testPlayer, match.events).pts} pkt, Drużyna = ${match.ourScore} pkt`);
// Undo made free throw:
undoAction();
pStats = calculatePlayerStats(testPlayer, match.events);
console.log(`Krok 5b (Cofnięcie rzutu wolnego): Zawodnik = ${pStats.pts} pkt, Drużyna = ${match.ourScore} pkt (Wynik: ${match.ourScore} - ${match.opponentScore})`);
if (pStats.pts !== 5 || match.ourScore !== 5) throw new Error(`Krok 5 nie powiódł się! Zawodnik: ${pStats.pts}, Drużyna: ${match.ourScore}`);

// 6. Ręczne dodanie 2 punktów przeciwnikowi: wynik 5–2.
recordAction('OPP_2PT');
pStats = calculatePlayerStats(testPlayer, match.events);
console.log(`Krok 6 (+2 punkty rywal): Wynik: ${match.ourScore} – ${match.opponentScore} (Zawodnik: ${pStats.pts} pkt)`);
if (match.ourScore !== 5 || match.opponentScore !== 2 || pStats.pts !== 5) {
  throw new Error(`Krok 6 nie powiódł się! Wynik: ${match.ourScore} - ${match.opponentScore}`);
}

// 7. Zakończenie meczu i ponowne otwarcie historii: wynik nadal 5–2.
match.status = 'finished';
const finalRecalc = recalculateMatchScores(match.events);
const finalTeamStats = calculateTeamStats([calculatePlayerStats(testPlayer, match.events)]);
console.log(`Krok 7 (Zakończenie meczu i Boxscore): Wynik końcowy: ${finalRecalc.ourScore} – ${finalRecalc.oppScore}`);
console.log(`Nasz Zespół: ${finalRecalc.ourScore} – ${finalRecalc.oppScore} ${match.opponent}`);
console.log(`Suma punktów z Boxscore: ${finalTeamStats.pts} pkt (UKS) vs ${finalRecalc.oppScore} pkt (${match.opponent})`);
if (finalRecalc.ourScore !== 5 || finalRecalc.oppScore !== 2) {
  throw new Error(`Krok 7 nie powiódł się! Wynik: ${finalRecalc.ourScore} - ${finalRecalc.oppScore}`);
}

console.log('====================================================');
console.log('WSZYSTKIE 7 KROKÓW TESTU OBOWIĄZKOWEGO ZAKOŃCZONE SUKCESEM (100% PASS)');
console.log('====================================================');

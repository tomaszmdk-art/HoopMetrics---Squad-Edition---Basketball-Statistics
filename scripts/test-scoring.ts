import { calculatePlayerStats, recalculateMatchScores, getEventPoints } from '../src/services/statsCalculator.ts';
import { MatchEvent, Player, Match } from '../src/types/basketball.ts';

console.log('--- START TEST SCENARIUSZA OBOWIĄZKOWEGO ---');

const testPlayer: Player = {
  id: 'player-test-1',
  teamCategory: 'U13',
  firstName: 'Jan',
  lastName: 'Kowalski',
  number: 7,
  createdAt: Date.now(),
};

let events: MatchEvent[] = [];

function addEvent(type: any, isOpponent = false) {
  const { ourPts, oppPts } = getEventPoints({ type });
  const newEvt: MatchEvent = {
    id: `evt-${events.length + 1}`,
    matchId: 'match-1',
    timestamp: Date.now(),
    quarter: 1,
    gameClock: '08:00',
    clockSeconds: 480,
    type,
    team: isOpponent ? 'opp' : 'our',
    points: isOpponent ? oppPts : ourPts,
    playerId: !isOpponent ? testPlayer.id : undefined,
    playerName: !isOpponent ? `${testPlayer.firstName} ${testPlayer.lastName}` : undefined,
    playerNumber: !isOpponent ? testPlayer.number : undefined,
    ourScoreAfter: 0,
    oppScoreAfter: 0,
  };
  events.push(newEvt);
  const rec = recalculateMatchScores(events);
  events = rec.updatedEvents;
  const pStats = calculatePlayerStats(testPlayer, events);
  return {
    ourScore: rec.ourScore,
    oppScore: rec.oppScore,
    playerPts: pStats.pts,
  };
}

// 1. Celny rzut za 2 punkty: zawodnik 2, drużyna 2.
const step1 = addEvent('2PT_MADE');
console.log('Krok 1 (2PT Made):', `Zawodnik: ${step1.playerPts}, Drużyna: ${step1.ourScore}-${step1.oppScore}`);
if (step1.playerPts === 2 && step1.ourScore === 2) {
  console.log('✅ Krok 1 ZDANY');
} else {
  console.error('❌ Krok 1 OBLANY');
}

// 2. Celny rzut za 3 punkty: zawodnik 5, drużyna 5.
const step2 = addEvent('3PT_MADE');
console.log('Krok 2 (3PT Made):', `Zawodnik: ${step2.playerPts}, Drużyna: ${step2.ourScore}-${step2.oppScore}`);
if (step2.playerPts === 5 && step2.ourScore === 5) {
  console.log('✅ Krok 2 ZDANY');
} else {
  console.error('❌ Krok 2 OBLANY');
}

// 3. Celny rzut wolny: zawodnik 6, drużyna 6.
const step3 = addEvent('FT_MADE');
console.log('Krok 3 (FT Made):', `Zawodnik: ${step3.playerPts}, Drużyna: ${step3.ourScore}-${step3.oppScore}`);
if (step3.playerPts === 6 && step3.ourScore === 6) {
  console.log('✅ Krok 3 ZDANY');
} else {
  console.error('❌ Krok 3 OBLANY');
}

// 4. Niecelny rzut za 2 punkty: wynik nadal 6.
const step4 = addEvent('2PT_MISS');
console.log('Krok 4 (2PT Miss):', `Zawodnik: ${step4.playerPts}, Drużyna: ${step4.ourScore}-${step4.oppScore}`);
if (step4.playerPts === 6 && step4.ourScore === 6) {
  console.log('✅ Krok 4 ZDANY');
} else {
  console.error('❌ Krok 4 OBLANY');
}

// 5. Cofnięcie ostatniej celnej akcji (usunięcie rzutu wolnego FT_MADE, lub cofnięcie do stanu po 3PT):
// Jeśli cofnięto 2PT_MISS i FT_MADE:
events = events.filter(e => e.type !== '2PT_MISS' && e.type !== 'FT_MADE');
const rec5 = recalculateMatchScores(events);
events = rec5.updatedEvents;
const pStats5 = calculatePlayerStats(testPlayer, events);
console.log('Krok 5 (Cofnięcie ostatniej celnej akcji):', `Zawodnik: ${pStats5.pts}, Drużyna: ${rec5.ourScore}-${rec5.oppScore}`);
if (pStats5.pts === 5 && rec5.ourScore === 5) {
  console.log('✅ Krok 5 ZDANY');
} else {
  console.error('❌ Krok 5 OBLANY');
}

// 6. Ręczne dodanie 2 punktów przeciwnikowi: wynik 5–2.
const step6 = addEvent('OPP_2PT', true);
console.log('Krok 6 (Rywal +2):', `Zawodnik: ${step6.playerPts}, Drużyna: ${step6.ourScore}-${step6.oppScore}`);
if (step6.playerPts === 5 && step6.ourScore === 5 && step6.oppScore === 2) {
  console.log('✅ Krok 6 ZDANY');
} else {
  console.error('❌ Krok 6 OBLANY');
}

// 7. Zakończenie meczu i ponowne otwarcie historii: wynik nadal 5–2.
const savedMatch: Match = {
  id: 'match-1',
  teamCategory: 'U13',
  opponent: 'MKS Basket',
  date: '2026-10-11',
  location: 'Dom',
  quarterMinutes: 8,
  currentQuarter: 4,
  clockSeconds: 0,
  isClockRunning: false,
  status: 'finished',
  ourScore: step6.ourScore,
  opponentScore: step6.oppScore,
  quarterScores: rec5.quarterScores,
  rosterPlayerIds: [testPlayer.id],
  onCourtPlayerIds: [testPlayer.id],
  events: events,
  updatedAt: Date.now(),
};

// Ponowne przeliczenie z zapisanych zdarzeń meczu:
const reloadedRec = recalculateMatchScores(savedMatch.events);
console.log('Krok 7 (Wczytanie meczu z historii):', `Drużyna: ${reloadedRec.ourScore}-${reloadedRec.oppScore}, Zapisany: ${savedMatch.ourScore}-${savedMatch.opponentScore}`);
if (reloadedRec.ourScore === 5 && reloadedRec.oppScore === 2 && savedMatch.ourScore === 5 && savedMatch.opponentScore === 2) {
  console.log('✅ Krok 7 ZDANY');
} else {
  console.error('❌ Krok 7 OBLANY');
}

console.log('--- WSZYSTKIE TESTY ZAKOŃCZONE POMYŚLNIE ---');

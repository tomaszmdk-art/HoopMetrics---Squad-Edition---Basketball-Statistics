import { Match, Player, PlayerCareerAverages, PlayerMatchStats, TeamMatchStats } from '../types/basketball';
import { calculatePlayerStats, calculateTeamStats } from './statsCalculator';
import { getClubProfileSync } from './db';

// Helper to trigger CSV download with UTF-8 BOM
function downloadCsv(filename: string, content: string) {
  const bom = '\uFEFF'; // UTF-8 BOM for Microsoft Excel compatibility
  const blob = new Blob([bom + content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// 1. Export Match Box Score
export function exportMatchBoxScoreCsv(match: Match, rosterPlayers: Player[], clubName?: string) {
  const currentClub = clubName || getClubProfileSync()?.name || 'Drużyna Koszykarska';
  const categoryPart = match.teamCategory && match.teamCategory !== 'TEAM' ? ` ${match.teamCategory}` : '';

  const playerStatsList: PlayerMatchStats[] = rosterPlayers.map((p) =>
    calculatePlayerStats(p, match.events, match)
  );
  const teamTotals: TeamMatchStats = calculateTeamStats(playerStatsList);
  const teamDiff = match.ourScore - match.opponentScore;

  const lines: string[] = [];

  // Match Header
  lines.push(`${currentClub}${categoryPart} - Raport Meczowy`);
  lines.push(`Przeciwnik;${match.opponent}`);
  lines.push(`Miejsce;${match.location}`);
  lines.push(`Data;${match.date}`);
  lines.push(`Wynik końcowy;${match.ourScore} : ${match.opponentScore}`);
  lines.push(
    `Wyniki kwart;Q1: ${match.quarterScores.q1.our}-${match.quarterScores.q1.opp};Q2: ${match.quarterScores.q2.our}-${match.quarterScores.q2.opp};Q3: ${match.quarterScores.q3.our}-${match.quarterScores.q3.opp};Q4: ${match.quarterScores.q4.our}-${match.quarterScores.q4.opp}${
      match.quarterScores.ot ? `;OT: ${match.quarterScores.ot.our}-${match.quarterScores.ot.opp}` : ''
    }`
  );
  lines.push('');

  // Table Columns
  lines.push(
    'Nr;Zawodnik;PTS;+/-;2PT Cel;2PT Prób;2PT %;3PT Cel;3PT Prób;3PT %;FG Cel;FG Prób;FG %;FT Cel;FT Prób;FT %;ZB Of;ZB Def;ZB Suma;AST;PRZ;BLK;STR;FAULE;EVAL'
  );

  for (const s of playerStatsList) {
    lines.push(
      [
        s.playerNumber,
        `"${s.playerName}"`,
        s.pts,
        s.plusMinus > 0 ? `+${s.plusMinus}` : s.plusMinus,
        s.fg2m,
        s.fg2a,
        `${s.fg2Pct}%`,
        s.fg3m,
        s.fg3a,
        `${s.fg3Pct}%`,
        s.fgm,
        s.fga,
        `${s.fgPct}%`,
        s.ftm,
        s.fta,
        `${s.ftPct}%`,
        s.offReb,
        s.defReb,
        s.totReb,
        s.ast,
        s.stl,
        s.blk,
        s.tov,
        s.fouls,
        s.eval,
      ].join(';')
    );
  }

  // Team Totals Row
  lines.push(
    [
      '-',
      '"RAZEM DRUŻYNA"',
      teamTotals.pts,
      teamDiff > 0 ? `+${teamDiff}` : teamDiff,
      teamTotals.fg2m,
      teamTotals.fg2a,
      `${teamTotals.fg2Pct}%`,
      teamTotals.fg3m,
      teamTotals.fg3a,
      `${teamTotals.fg3Pct}%`,
      teamTotals.fgm,
      teamTotals.fga,
      `${teamTotals.fgPct}%`,
      teamTotals.ftm,
      teamTotals.fta,
      `${teamTotals.ftPct}%`,
      teamTotals.offReb,
      teamTotals.defReb,
      teamTotals.totReb,
      teamTotals.ast,
      teamTotals.stl,
      teamTotals.blk,
      teamTotals.tov,
      teamTotals.fouls,
      teamTotals.eval,
    ].join(';')
  );

  const cleanOpponent = match.opponent.replace(/[^a-zA-Z0-9_-]/g, '_');
  const catSlug = match.teamCategory && match.teamCategory !== 'TEAM' ? `${match.teamCategory}_` : '';
  const filename = `Mecz_${catSlug}vs_${cleanOpponent}_${match.date}.csv`;
  downloadCsv(filename, lines.join('\n'));
}

// 2. Export Match Play-by-Play
export function exportPlayByPlayCsv(match: Match) {
  const currentClub = getClubProfileSync()?.name || 'Drużyna';
  const titlePrefix = match.teamCategory && match.teamCategory !== 'TEAM' ? `${currentClub} ${match.teamCategory}` : currentClub;
  const lines: string[] = [];
  lines.push(`${titlePrefix} vs ${match.opponent} - Protokół Akcji (Play-by-Play)`);
  lines.push(`Data;${match.date}`);
  lines.push('');
  lines.push('Lp;Kwarta;Czas kwarty;Zawodnik;Numer;Akcja;Szczegół akcji;Wynik Nasz;Wynik Rywal');

  const actionLabels: Record<string, string> = {
    '2PT_MADE': 'Celny rzut za 2 pkt',
    '2PT_MISS': 'Niecelny rzut za 2 pkt',
    '3PT_MADE': 'Celny rzut za 3 pkt',
    '3PT_MISS': 'Niecelny rzut za 3 pkt',
    'FT_MADE': 'Celny rzut wolny (1 pkt)',
    'FT_MISS': 'Niecelny rzut wolny',
    'OFF_REB': 'Zbiórka ofensywna',
    'DEF_REB': 'Zbiórka defensywna',
    'ASSIST': 'Asysta',
    'STEAL': 'Przechwyt',
    'BLOCK': 'Blok',
    'TURNOVER': 'Strata',
    'FOUL': 'Faul osobisty',
    'OPP_1PT': 'Punkt przeciwnika (+1)',
    'OPP_2PT': 'Punkty przeciwnika (+2)',
    'OPP_3PT': 'Punkty przeciwnika (+3)',
    'OPP_MINUS_1': 'Korekta punktów przeciwnika (-1)',
    'OPP_FOUL': 'Faul przeciwnika',
    'MANUAL_OUR_PLUS_1': 'Ręczna korekta UKS (+1)',
    'MANUAL_OUR_PLUS_2': 'Ręczna korekta UKS (+2)',
    'MANUAL_OUR_PLUS_3': 'Ręczna korekta UKS (+3)',
    'MANUAL_OUR_MINUS_1': 'Ręczna korekta UKS (-1)',
  };

  match.events.forEach((e, idx) => {
    lines.push(
      [
        idx + 1,
        e.quarter > 4 ? 'Dogrywka (OT)' : `Kwarta ${e.quarter}`,
        e.gameClock,
        `"${e.playerName || (e.type.startsWith('OPP') ? 'Przeciwnik' : 'Drużyna')}"`,
        e.playerNumber || '-',
        `"${actionLabels[e.type] || e.type}"`,
        `"${e.subType || '-'}"`,
        e.ourScoreAfter,
        e.oppScoreAfter,
      ].join(';')
    );
  });

  const cleanOpponent = match.opponent.replace(/[^a-zA-Z0-9_-]/g, '_');
  const catSlug = match.teamCategory && match.teamCategory !== 'TEAM' ? `${match.teamCategory}_` : '';
  const filename = `PlayByPlay_${catSlug}vs_${cleanOpponent}_${match.date}.csv`;
  downloadCsv(filename, lines.join('\n'));
}

// 3. Export Season Stats
export function exportSeasonStatsCsv(
  category: string,
  seasonAverages: PlayerCareerAverages[],
  matchesCount: number,
  clubName?: string
) {
  const currentClub = clubName || getClubProfileSync()?.name || 'Drużyna Koszykarska';
  const cleanCat = category && category !== 'TEAM' ? category.trim() : '';

  const lines: string[] = [];
  lines.push(`${currentClub}${cleanCat ? ` ${cleanCat}` : ''} - Statystyki Sezonowe Drużyny`);
  lines.push(`Liczba rozegranych meczów;${matchesCount}`);
  lines.push('');
  lines.push(
    'Nr;Zawodnik;Mecze;Suma PTS;PPG (Śr. Pkt);Suma ZB;RPG (Śr. Zb);Suma AST;APG (Śr. Ast);Suma PRZ;SPG;Suma BLK;BPG;FG %;FT %;Śr. EVAL;Rekord Meczowy'
  );

  for (const p of seasonAverages) {
    lines.push(
      [
        p.playerNumber,
        `"${p.playerName}"`,
        p.gamesPlayed,
        p.totalPts,
        p.ppg,
        p.totalReb,
        p.rpg,
        p.totalAst,
        p.apg,
        p.totalStl,
        p.spg,
        p.totalBlk,
        p.bpg,
        `${p.fgPct}%`,
        `${p.ftPct}%`,
        p.evalAvg,
        p.highScore,
      ].join(';')
    );
  }

  const cleanClub = currentClub.replace(/[^a-zA-Z0-9]/g, '_');
  const catSlug = cleanCat ? `_${cleanCat}` : '';
  const filename = `${cleanClub}${catSlug}_Statystyki_Sezonowe.csv`;
  downloadCsv(filename, lines.join('\n'));
}

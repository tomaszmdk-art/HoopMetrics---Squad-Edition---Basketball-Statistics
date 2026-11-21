import { ActionType, Match, MatchEvent, Player, PlayerMatchStats, TeamMatchStats, QuarterScores, PlayerCareerAverages } from '../types/basketball';
import { getPlayerFullName } from './playerDisplay';

export function formatSecondsToMMSS(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds || 0));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function estimatePlayerQuarterSecondsFromEvents(
  playerId: string,
  events: MatchEvent[],
  matchObj: Match
): Record<number, number> {
  const perQuarter: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  if (!events || events.length === 0) return perQuarter;

  const eventsByQuarter = new Map<number, MatchEvent[]>();
  for (const ev of events) {
    const q = Math.min(ev.quarter || 1, 5);
    const list = eventsByQuarter.get(q);
    if (list) list.push(ev);
    else eventsByQuarter.set(q, [ev]);
  }

  let lastKnownLineup: string[] = [];

  const sortedQuarters = Array.from(eventsByQuarter.keys()).sort((a, b) => a - b);
  for (const q of sortedQuarters) {
    const qEvents = eventsByQuarter.get(q) || [];
    const qStartClock = (q >= 5 ? 5 : matchObj.quarterMinutes || 8) * 60;
    let prevClock = qStartClock;
    let qSeconds = 0;

    const firstWithCourt = qEvents.find(
      (ev) => Array.isArray(ev.onCourtPlayerIds) && ev.onCourtPlayerIds.length > 0
    );
    let currentLineup: string[] = [];
    if (firstWithCourt && firstWithCourt.onCourtPlayerIds) {
      currentLineup = [...firstWithCourt.onCourtPlayerIds];
      if (firstWithCourt === qEvents[0]) {
        if (
          firstWithCourt.type === 'SUBSTITUTION' &&
          firstWithCourt.playerId &&
          firstWithCourt.subOutPlayerId
        ) {
          currentLineup = currentLineup.map((id) =>
            id === firstWithCourt.playerId ? firstWithCourt.subOutPlayerId! : id
          );
        } else if (firstWithCourt.type === 'SUB_IN' && firstWithCourt.playerId) {
          currentLineup = currentLineup.filter((id) => id !== firstWithCourt.playerId);
        } else if (
          firstWithCourt.type === 'SUB_OUT' &&
          firstWithCourt.playerId &&
          !currentLineup.includes(firstWithCourt.playerId)
        ) {
          currentLineup = [...currentLineup, firstWithCourt.playerId];
        }
      }
    } else if (lastKnownLineup.length > 0) {
      currentLineup = [...lastKnownLineup];
    }

    for (const ev of qEvents) {
      const evClock = typeof ev.clockSeconds === 'number' ? ev.clockSeconds : prevClock;
      if (evClock < prevClock) {
        const delta = prevClock - evClock;
        if (currentLineup.includes(playerId)) {
          qSeconds += delta;
        }
        prevClock = evClock;
      }
      if (Array.isArray(ev.onCourtPlayerIds) && ev.onCourtPlayerIds.length > 0) {
        currentLineup = [...ev.onCourtPlayerIds];
      }
    }

    if (prevClock < qStartClock && currentLineup.includes(playerId)) {
      let endClock = 0;
      if (q === matchObj.currentQuarter) {
        endClock = Math.max(0, Math.min(prevClock, matchObj.clockSeconds ?? prevClock));
      } else if (q < matchObj.currentQuarter || matchObj.status === 'finished') {
        endClock = 0;
      } else {
        endClock = prevClock;
      }
      if (endClock < prevClock) {
        qSeconds += prevClock - endClock;
      }
    }

    perQuarter[q] = Math.max(0, Math.floor(qSeconds));

    if (currentLineup.length > 0) {
      lastKnownLineup = currentLineup;
    }
  }

  return perQuarter;
}

function estimatePlayerSecondsFromEvents(
  playerId: string,
  events: MatchEvent[],
  matchObj: Match
): number {
  const byQuarter = estimatePlayerQuarterSecondsFromEvents(playerId, events, matchObj);
  return Object.values(byQuarter).reduce((sum, s) => sum + s, 0);
}

export function calculatePlayerQuarterSeconds(
  playerId: string,
  events: MatchEvent[],
  matchObj?: Match
): Record<number, number> {
  const result: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  if (!matchObj) return result;

  const recorded = matchObj.playerQuarterSecondsPlayed;
  if (recorded && Object.keys(recorded).length > 0) {
    for (const [qStr, playerMap] of Object.entries(recorded)) {
      const qNum = Math.min(Math.max(1, Number(qStr) || 1), 5);
      result[qNum] = (result[qNum] || 0) + Math.max(0, Math.floor(playerMap?.[playerId] || 0));
    }
    return result;
  }

  const estimated = estimatePlayerQuarterSecondsFromEvents(playerId, events, matchObj);
  const estimatedTotal = Object.values(estimated).reduce((sum, s) => sum + s, 0);
  const totalRecorded = Math.max(0, Math.floor(matchObj.playerSecondsPlayed?.[playerId] || 0));

  if (estimatedTotal === 0 && totalRecorded > 0 && (matchObj.currentQuarter || 1) === 1) {
    result[1] = totalRecorded;
    return result;
  }

  return estimated;
}

export function calculatePlayerStats(
  player: Player,
  events: MatchEvent[],
  matchOrOnCourtIds?: Match | string[]
): PlayerMatchStats {
  const playerEvents = events.filter((e) => e.playerId === player.id);

  let pts = 0;
  let fg2m = 0;
  let fg2a = 0;
  let fg3m = 0;
  let fg3a = 0;
  let ftm = 0;
  let fta = 0;
  let offReb = 0;
  let defReb = 0;
  let ast = 0;
  let stl = 0;
  let blk = 0;
  let tov = 0;
  let fouls = 0;

  for (const e of playerEvents) {
    switch (e.type) {
      case '2PT_MADE':
        pts += 2;
        fg2m += 1;
        fg2a += 1;
        break;
      case '2PT_MISS':
        fg2a += 1;
        break;
      case '3PT_MADE':
        pts += 3;
        fg3m += 1;
        fg3a += 1;
        break;
      case '3PT_MISS':
        fg3a += 1;
        break;
      case 'FT_MADE':
        pts += 1;
        ftm += 1;
        fta += 1;
        break;
      case 'FT_MISS':
        fta += 1;
        break;
      case 'OFF_REB':
        offReb += 1;
        break;
      case 'DEF_REB':
        defReb += 1;
        break;
      case 'ASSIST':
        ast += 1;
        break;
      case 'STEAL':
        stl += 1;
        break;
      case 'BLOCK':
        blk += 1;
        break;
      case 'TURNOVER':
        tov += 1;
        break;
      case 'FOUL':
        fouls += 1;
        break;
    }
  }

  // Obliczenie statystyki +/- (bilans punktowy drużyny podczas obecności zawodnika na parkiecie):
  // Punkty zdobyte przez drużynę minus punkty stracone na rzecz przeciwnika
  let plusMinus = 0;
  for (const e of events) {
    const { ourPts, oppPts } = getEventPoints(e);
    const netPoints = ourPts - oppPts;
    if (netPoints === 0) continue;

    let wasOnCourt = false;
    if (e.onCourtPlayerIds && Array.isArray(e.onCourtPlayerIds) && e.onCourtPlayerIds.length > 0) {
      wasOnCourt = e.onCourtPlayerIds.includes(player.id);
    } else if (e.playerId === player.id || e.assistedByPlayerId === player.id) {
      wasOnCourt = true;
    } else if (Array.isArray(matchOrOnCourtIds)) {
      wasOnCourt = matchOrOnCourtIds.includes(player.id);
    } else if (matchOrOnCourtIds && typeof matchOrOnCourtIds === 'object') {
      const matchObj = matchOrOnCourtIds as Match;
      if (matchObj.onCourtPlayerIds?.includes(player.id)) {
        wasOnCourt = true;
      } else if (
        matchObj.rosterPlayerIds &&
        matchObj.rosterPlayerIds.length <= 5 &&
        matchObj.rosterPlayerIds.includes(player.id)
      ) {
        wasOnCourt = true;
      }
    }

    if (wasOnCourt) {
      plusMinus += netPoints;
    }
  }

  const fgm = fg2m + fg3m;
  const fga = fg2a + fg3a;
  const fgPct = fga > 0 ? Math.round((fgm / fga) * 100) : 0;
  const fg2Pct = fg2a > 0 ? Math.round((fg2m / fg2a) * 100) : 0;
  const fg3Pct = fg3a > 0 ? Math.round((fg3m / fg3a) * 100) : 0;
  const ftPct = fta > 0 ? Math.round((ftm / fta) * 100) : 0;
  const totReb = offReb + defReb;

  // FIBA Evaluation formula:
  // (PTS + REB + AST + STL + BLK) - ((FGA - FGM) + (FTA - FTM) + TOV)
  const missedFg = fga - fgm;
  const missedFt = fta - ftm;
  const evalScore = pts + totReb + ast + stl + blk - (missedFg + missedFt + tov);

  let secondsPlayed = 0;
  if (matchOrOnCourtIds && !Array.isArray(matchOrOnCourtIds) && typeof matchOrOnCourtIds === 'object') {
    const matchObj = matchOrOnCourtIds as Match;
    if (matchObj.playerSecondsPlayed && Object.keys(matchObj.playerSecondsPlayed).length > 0) {
      secondsPlayed = Math.max(0, Math.floor(matchObj.playerSecondsPlayed[player.id] || 0));
    } else {
      secondsPlayed = estimatePlayerSecondsFromEvents(player.id, events, matchObj);
    }
  }

  return {
    playerId: player.id,
    playerNumber: player.number,
    playerName: getPlayerFullName(player),
    pts,
    plusMinus,
    fg2m,
    fg2a,
    fg2Pct,
    fg3m,
    fg3a,
    fg3Pct,
    fgm,
    fga,
    fgPct,
    ftm,
    fta,
    ftPct,
    offReb,
    defReb,
    totReb,
    ast,
    stl,
    blk,
    tov,
    fouls,
    eval: evalScore,
    secondsPlayed,
  };
}

export function calculateTeamStats(playerStats: PlayerMatchStats[]): TeamMatchStats {
  const totals: TeamMatchStats = {
    pts: 0,
    fg2m: 0,
    fg2a: 0,
    fg2Pct: 0,
    fg3m: 0,
    fg3a: 0,
    fg3Pct: 0,
    fgm: 0,
    fga: 0,
    fgPct: 0,
    ftm: 0,
    fta: 0,
    ftPct: 0,
    offReb: 0,
    defReb: 0,
    totReb: 0,
    ast: 0,
    stl: 0,
    blk: 0,
    tov: 0,
    fouls: 0,
    eval: 0,
    secondsPlayed: 0,
  };

  for (const s of playerStats) {
    totals.pts += s.pts;
    totals.fg2m += s.fg2m;
    totals.fg2a += s.fg2a;
    totals.fg3m += s.fg3m;
    totals.fg3a += s.fg3a;
    totals.fgm += s.fgm;
    totals.fga += s.fga;
    totals.ftm += s.ftm;
    totals.fta += s.fta;
    totals.offReb += s.offReb;
    totals.defReb += s.defReb;
    totals.totReb += s.totReb;
    totals.ast += s.ast;
    totals.stl += s.stl;
    totals.blk += s.blk;
    totals.tov += s.tov;
    totals.fouls += s.fouls;
    totals.eval += s.eval;
    totals.secondsPlayed += s.secondsPlayed || 0;
  }

  totals.fg2Pct = totals.fg2a > 0 ? Math.round((totals.fg2m / totals.fg2a) * 100) : 0;
  totals.fg3Pct = totals.fg3a > 0 ? Math.round((totals.fg3m / totals.fg3a) * 100) : 0;
  totals.fgPct = totals.fga > 0 ? Math.round((totals.fgm / totals.fga) * 100) : 0;
  totals.ftPct = totals.fta > 0 ? Math.round((totals.ftm / totals.fta) * 100) : 0;

  return totals;
}

export function getEventPoints(e: Partial<MatchEvent> & { type: ActionType }): { ourPts: number; oppPts: number } {
  switch (e.type) {
    case '2PT_MADE':
      return { ourPts: 2, oppPts: 0 };
    case '3PT_MADE':
      return { ourPts: 3, oppPts: 0 };
    case 'FT_MADE':
      return { ourPts: 1, oppPts: 0 };
    case 'MANUAL_OUR_PLUS_1':
      return { ourPts: 1, oppPts: 0 };
    case 'MANUAL_OUR_PLUS_2':
      return { ourPts: 2, oppPts: 0 };
    case 'MANUAL_OUR_PLUS_3':
      return { ourPts: 3, oppPts: 0 };
    case 'MANUAL_OUR_MINUS_1':
      return { ourPts: -1, oppPts: 0 };
    case 'OPP_1PT':
      return { ourPts: 0, oppPts: 1 };
    case 'OPP_2PT':
      return { ourPts: 0, oppPts: 2 };
    case 'OPP_3PT':
      return { ourPts: 0, oppPts: 3 };
    case 'OPP_MINUS_1':
      return { ourPts: 0, oppPts: -1 };
    default:
      return { ourPts: 0, oppPts: 0 };
  }
}

export function recalculateMatchScores(
  events: MatchEvent[],
  manualAdjustOur = 0,
  manualAdjustOpp = 0
): {
  ourScore: number;
  oppScore: number;
  quarterScores: QuarterScores;
  updatedEvents: MatchEvent[];
} {
  const quarterScores: QuarterScores = {
    q1: { our: 0, opp: 0 },
    q2: { our: 0, opp: 0 },
    q3: { our: 0, opp: 0 },
    q4: { our: 0, opp: 0 },
    ot: { our: 0, opp: 0 },
  };

  let ourScore = 0;
  let oppScore = 0;

  const updatedEvents: MatchEvent[] = events.map((e) => {
    const { ourPts, oppPts } = getEventPoints(e);
    ourScore = Math.max(0, ourScore + ourPts);
    oppScore = Math.max(0, oppScore + oppPts);

    const q = e.quarter || 1;
    if (q === 1) {
      quarterScores.q1.our = Math.max(0, quarterScores.q1.our + ourPts);
      quarterScores.q1.opp = Math.max(0, quarterScores.q1.opp + oppPts);
    } else if (q === 2) {
      quarterScores.q2.our = Math.max(0, quarterScores.q2.our + ourPts);
      quarterScores.q2.opp = Math.max(0, quarterScores.q2.opp + oppPts);
    } else if (q === 3) {
      quarterScores.q3.our = Math.max(0, quarterScores.q3.our + ourPts);
      quarterScores.q3.opp = Math.max(0, quarterScores.q3.opp + oppPts);
    } else if (q === 4) {
      quarterScores.q4.our = Math.max(0, quarterScores.q4.our + ourPts);
      quarterScores.q4.opp = Math.max(0, quarterScores.q4.opp + oppPts);
    } else {
      if (!quarterScores.ot) quarterScores.ot = { our: 0, opp: 0 };
      quarterScores.ot.our = Math.max(0, quarterScores.ot.our + ourPts);
      quarterScores.ot.opp = Math.max(0, quarterScores.ot.opp + oppPts);
    }

    const isOurTeam = ourPts !== 0 || !e.type.startsWith('OPP_');
    const pts = isOurTeam ? ourPts : oppPts;

    return {
      ...e,
      team: (e.team || (isOurTeam ? 'our' : 'opp')) as 'our' | 'opp',
      points: typeof e.points === 'number' ? e.points : pts,
      ourScoreAfter: ourScore,
      oppScoreAfter: oppScore,
    };
  });

  ourScore = Math.max(0, ourScore + manualAdjustOur);
  oppScore = Math.max(0, oppScore + manualAdjustOpp);

  return {
    ourScore,
    oppScore,
    quarterScores,
    updatedEvents,
  };
}



export function calculateSeasonAverages(
  players: Player[],
  matches: Match[]
): PlayerCareerAverages[] {
  return players
    .map((player) => {
      let gamesPlayed = 0;
      let totalPts = 0;
      let totalPlusMinus = 0;
      let totalReb = 0;
      let totalAst = 0;
      let totalStl = 0;
      let totalBlk = 0;
      let totalFgm = 0;
      let totalFga = 0;
      let totalFtm = 0;
      let totalFta = 0;
      let totalEval = 0;
      let highScore = 0;
      let totalSecondsPlayed = 0;

      for (const m of matches) {
        // Did player participate?
        const isRostered = m.rosterPlayerIds?.includes(player.id);
        const hasEvents = m.events.some(
          (e) => e.playerId === player.id || e.subOutPlayerId === player.id
        );
        const hasSeconds = (m.playerSecondsPlayed?.[player.id] || 0) > 0;

        if (isRostered || hasEvents || hasSeconds) {
          gamesPlayed++;
          const pStats = calculatePlayerStats(player, m.events, m);
          totalPts += pStats.pts;
          totalPlusMinus += pStats.plusMinus;
          totalReb += pStats.totReb;
          totalAst += pStats.ast;
          totalStl += pStats.stl;
          totalBlk += pStats.blk;
          totalFgm += pStats.fgm;
          totalFga += pStats.fga;
          totalFtm += pStats.ftm;
          totalFta += pStats.fta;
          totalEval += pStats.eval;
          totalSecondsPlayed += pStats.secondsPlayed;
          if (pStats.pts > highScore) highScore = pStats.pts;
        }
      }

      const ppg = gamesPlayed > 0 ? Number((totalPts / gamesPlayed).toFixed(1)) : 0;
      const plusMinusAvg = gamesPlayed > 0 ? Number((totalPlusMinus / gamesPlayed).toFixed(1)) : 0;
      const rpg = gamesPlayed > 0 ? Number((totalReb / gamesPlayed).toFixed(1)) : 0;
      const apg = gamesPlayed > 0 ? Number((totalAst / gamesPlayed).toFixed(1)) : 0;
      const spg = gamesPlayed > 0 ? Number((totalStl / gamesPlayed).toFixed(1)) : 0;
      const bpg = gamesPlayed > 0 ? Number((totalBlk / gamesPlayed).toFixed(1)) : 0;
      const evalAvg = gamesPlayed > 0 ? Number((totalEval / gamesPlayed).toFixed(1)) : 0;
      const fgPct = totalFga > 0 ? Math.round((totalFgm / totalFga) * 100) : 0;
      const ftPct = totalFta > 0 ? Math.round((totalFtm / totalFta) * 100) : 0;
      const mpg = gamesPlayed > 0 ? Number((totalSecondsPlayed / gamesPlayed / 60).toFixed(1)) : 0;

      return {
        playerId: player.id,
        playerName: getPlayerFullName(player),
        playerNumber: player.number,
        gamesPlayed,
        totalPts,
        ppg,
        totalPlusMinus,
        plusMinusAvg,
        totalReb,
        rpg,
        totalAst,
        apg,
        totalStl,
        spg,
        totalBlk,
        bpg,
        fgPct,
        ftPct,
        evalAvg,
        highScore,
        totalSecondsPlayed,
        mpg,
      };
    })
    .sort((a, b) => b.ppg - a.ppg || b.totalPts - a.totalPts);
}

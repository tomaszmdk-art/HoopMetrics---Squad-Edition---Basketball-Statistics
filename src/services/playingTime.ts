import { Match } from '../types/basketball';

export function getQuarterMaxSeconds(quarterMinutes: number, quarter: number): number {
  return (quarter >= 5 ? 5 : quarterMinutes || 8) * 60;
}

function cloneQuarterMap(
  src?: Record<number, Record<string, number>>
): Record<number, Record<string, number>> {
  const out: Record<number, Record<string, number>> = {};
  if (!src) return out;
  for (const [qKey, pMap] of Object.entries(src)) {
    const qNum = Number(qKey);
    if (!isNaN(qNum) && pMap && typeof pMap === 'object') {
      out[qNum] = {};
      for (const [pid, sec] of Object.entries(pMap)) {
        out[qNum][pid] = Math.max(0, Math.floor(sec || 0));
      }
    }
  }
  return out;
}

function hasAnyRecordedTime(match: Match): boolean {
  if (match.playerQuarterSecondsPlayed) {
    for (const qMap of Object.values(match.playerQuarterSecondsPlayed)) {
      if (qMap && Object.values(qMap).some((v) => (v || 0) > 0)) {
        return true;
      }
    }
  }
  if (match.playerSecondsPlayed) {
    if (Object.values(match.playerSecondsPlayed).some((v) => (v || 0) > 0)) {
      return true;
    }
  }
  return false;
}

interface PlayingTimeBaseline {
  bankedQuarterSeconds: Record<number, Record<string, number>>;
  entryClock: Record<string, number>;
}

function ensurePlayingTimeBaseline(match: Match): PlayingTimeBaseline {
  const q = match.currentQuarter || 1;
  const onCourt = match.onCourtPlayerIds || [];
  const quarterStart = getQuarterMaxSeconds(match.quarterMinutes, q);

  if (
    match.playerBankedQuarterSeconds !== undefined &&
    match.onCourtEntryClock !== undefined
  ) {
    const bankedQuarterSeconds = cloneQuarterMap(match.playerBankedQuarterSeconds);
    const entryClock: Record<string, number> = {};
    const recorded = hasAnyRecordedTime(match);

    for (const pid of onCourt) {
      if (typeof match.onCourtEntryClock[pid] === 'number') {
        entryClock[pid] = match.onCourtEntryClock[pid];
      } else {
        entryClock[pid] = recorded ? match.clockSeconds : quarterStart;
      }
    }

    return { bankedQuarterSeconds, entryClock };
  }

  // Fallback migration for matches started before stint entry-clock tracking
  const bankedQuarterSeconds = cloneQuarterMap(match.playerQuarterSecondsPlayed);
  if (
    Object.keys(bankedQuarterSeconds).length === 0 &&
    match.playerSecondsPlayed &&
    Object.keys(match.playerSecondsPlayed).length > 0
  ) {
    bankedQuarterSeconds[q] = {};
    for (const [pid, sec] of Object.entries(match.playerSecondsPlayed)) {
      bankedQuarterSeconds[q][pid] = Math.max(0, Math.floor(sec || 0));
    }
  }

  const recorded = hasAnyRecordedTime(match);
  const entryClock: Record<string, number> = {};
  for (const pid of onCourt) {
    entryClock[pid] = recorded ? match.clockSeconds : quarterStart;
  }

  return { bankedQuarterSeconds, entryClock };
}

function buildTotalsFromBaseline(
  currentQuarter: number,
  clockSeconds: number,
  onCourtPlayerIds: string[],
  bankedQuarterSeconds: Record<number, Record<string, number>>,
  entryClock: Record<string, number>
): {
  playerQuarterSecondsPlayed: Record<number, Record<string, number>>;
  playerSecondsPlayed: Record<string, number>;
} {
  const playerQuarterSecondsPlayed = cloneQuarterMap(bankedQuarterSeconds);
  if (!playerQuarterSecondsPlayed[currentQuarter]) {
    playerQuarterSecondsPlayed[currentQuarter] = {};
  }

  for (const pid of onCourtPlayerIds) {
    const entry = typeof entryClock[pid] === 'number' ? entryClock[pid] : clockSeconds;
    const activeStintSeconds = Math.max(0, Math.floor(entry - clockSeconds));
    playerQuarterSecondsPlayed[currentQuarter][pid] =
      (playerQuarterSecondsPlayed[currentQuarter][pid] || 0) + activeStintSeconds;
  }

  const playerSecondsPlayed: Record<string, number> = {};
  for (const qMap of Object.values(playerQuarterSecondsPlayed)) {
    for (const [pid, sec] of Object.entries(qMap)) {
      playerSecondsPlayed[pid] = (playerSecondsPlayed[pid] || 0) + Math.max(0, Math.floor(sec || 0));
    }
  }

  return { playerQuarterSecondsPlayed, playerSecondsPlayed };
}

export function initializePlayingTimeForStarters(
  starters: string[],
  quarterMinutes: number
): Pick<
  Match,
  | 'playerSecondsPlayed'
  | 'playerQuarterSecondsPlayed'
  | 'playerBankedQuarterSeconds'
  | 'onCourtEntryClock'
> {
  const startClock = getQuarterMaxSeconds(quarterMinutes, 1);
  const onCourtEntryClock: Record<string, number> = {};
  const playerSecondsPlayed: Record<string, number> = {};
  const q1Map: Record<string, number> = {};

  for (const pid of starters) {
    onCourtEntryClock[pid] = startClock;
    playerSecondsPlayed[pid] = 0;
    q1Map[pid] = 0;
  }

  return {
    playerSecondsPlayed,
    playerQuarterSecondsPlayed: { 1: q1Map },
    playerBankedQuarterSeconds: {},
    onCourtEntryClock,
  };
}

/**
 * Updates match clockSeconds and recomputes each on-court player's playing time
 * from their entry second (onCourtEntryClock) to the new clock second.
 * Automatically handles 1s ticks as well as forward/backward manual clock corrections.
 */
export function applyMatchClockChange(match: Match, nextClockSeconds: number): Match {
  const clampedClock = Math.max(0, Math.floor(nextClockSeconds));
  const q = match.currentQuarter || 1;
  const onCourt = match.onCourtPlayerIds || [];
  const { bankedQuarterSeconds, entryClock } = ensurePlayingTimeBaseline(match);

  const totals = buildTotalsFromBaseline(
    q,
    clampedClock,
    onCourt,
    bankedQuarterSeconds,
    entryClock
  );

  return {
    ...match,
    clockSeconds: clampedClock,
    playerBankedQuarterSeconds: bankedQuarterSeconds,
    onCourtEntryClock: entryClock,
    ...totals,
  };
}

/**
 * Updates onCourtPlayerIds when players enter or leave the court:
 * - Leaving players bank (entryClock - currentClockSeconds) into current quarter
 * - Entering players record entryClock = currentClockSeconds
 * - Remaining players keep their existing entryClock
 */
export function applyMatchLineupChange(
  match: Match,
  nextOnCourtPlayerIds: string[]
): Match {
  const q = match.currentQuarter || 1;
  const nowClock = match.clockSeconds;
  const { bankedQuarterSeconds, entryClock } = ensurePlayingTimeBaseline(match);

  if (!bankedQuarterSeconds[q]) {
    bankedQuarterSeconds[q] = {};
  }

  const nextSet = new Set(nextOnCourtPlayerIds);

  // Bank stints for players leaving the court
  for (const pid of Object.keys(entryClock)) {
    if (!nextSet.has(pid)) {
      const entry = entryClock[pid];
      const stintSec = Math.max(0, Math.floor(entry - nowClock));
      bankedQuarterSeconds[q][pid] = (bankedQuarterSeconds[q][pid] || 0) + stintSec;
      delete entryClock[pid];
    }
  }

  // Record entry clock for players entering the court
  for (const pid of nextOnCourtPlayerIds) {
    if (typeof entryClock[pid] !== 'number') {
      entryClock[pid] = nowClock;
    }
  }

  const totals = buildTotalsFromBaseline(
    q,
    nowClock,
    nextOnCourtPlayerIds,
    bankedQuarterSeconds,
    entryClock
  );

  return {
    ...match,
    onCourtPlayerIds: nextOnCourtPlayerIds,
    playerBankedQuarterSeconds: bankedQuarterSeconds,
    onCourtEntryClock: entryClock,
    ...totals,
  };
}

/**
 * Transitions from currentQuarter to nextQuarter:
 * - Banks all active on-court stints in currentQuarter up to exitClockOfCurrentQuarter
 * - Resets entryClock for all on-court players to nextClockSeconds in nextQuarter
 */
export function applyMatchQuarterChange(
  match: Match,
  nextQuarter: number,
  nextClockSeconds: number,
  exitClockOfCurrentQuarter?: number
): Match {
  const oldQ = match.currentQuarter || 1;
  const exitClock = Math.max(
    0,
    Math.floor(exitClockOfCurrentQuarter ?? match.clockSeconds)
  );
  const nextClock = Math.max(0, Math.floor(nextClockSeconds));
  const onCourt = match.onCourtPlayerIds || [];
  const { bankedQuarterSeconds, entryClock } = ensurePlayingTimeBaseline(match);

  if (!bankedQuarterSeconds[oldQ]) {
    bankedQuarterSeconds[oldQ] = {};
  }

  for (const pid of onCourt) {
    const entry = typeof entryClock[pid] === 'number' ? entryClock[pid] : exitClock;
    const stintSec = Math.max(0, Math.floor(entry - exitClock));
    bankedQuarterSeconds[oldQ][pid] = (bankedQuarterSeconds[oldQ][pid] || 0) + stintSec;
  }

  const newEntryClock: Record<string, number> = {};
  for (const pid of onCourt) {
    newEntryClock[pid] = nextClock;
  }

  const totals = buildTotalsFromBaseline(
    nextQuarter,
    nextClock,
    onCourt,
    bankedQuarterSeconds,
    newEntryClock
  );

  return {
    ...match,
    currentQuarter: nextQuarter,
    clockSeconds: nextClock,
    isClockRunning: false,
    playerBankedQuarterSeconds: bankedQuarterSeconds,
    onCourtEntryClock: newEntryClock,
    ...totals,
  };
}

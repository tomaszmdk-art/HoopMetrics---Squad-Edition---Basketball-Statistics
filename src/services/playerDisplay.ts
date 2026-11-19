import { ClubProfile, Match, MatchEvent, Player } from '../types/basketball';

export const hasPersonalData = (p?: Partial<Player> | null): boolean => {
  if (!p) return false;
  return Boolean(
    p.firstName?.trim() ||
    p.lastName?.trim() ||
    p.photo?.trim() ||
    p.notes?.trim()
  );
};

export const hasAnyPersonalData = (players: Array<Partial<Player>> = []): boolean => {
  return players.some((p) => hasPersonalData(p));
};

export const getPlayerFullName = (p?: Partial<Player> | null): string => {
  if (!p) return 'Zawodnik';
  const full = `${p.firstName || ''} ${p.lastName || ''}`.trim();
  if (full) return full;
  return p.number !== undefined ? `Zawodnik #${p.number}` : 'Zawodnik';
};

export const getPlayerShortName = (p?: Partial<Player> | null): string => {
  if (!p) return 'Zawodnik';
  const last = p.lastName?.trim();
  if (last) return last;
  const first = p.firstName?.trim();
  if (first) return first;
  return p.number !== undefined ? `#${p.number}` : 'Zawodnik';
};

export const findPlayerForEvent = (
  event: Pick<MatchEvent, 'playerId' | 'playerNumber'>,
  players: Player[] = []
): Player | undefined => {
  if (event.playerId) {
    const byId = players.find((p) => p.id === event.playerId);
    if (byId) return byId;
  }
  if (event.playerNumber !== undefined) {
    const matchesByNumber = players.filter((p) => p.number === event.playerNumber);
    if (matchesByNumber.length === 1) return matchesByNumber[0];
  }
  return undefined;
};

export const resolveEventPlayerLabel = (
  event: MatchEvent,
  players: Player[] = [],
  includePersonalData: boolean = true
): string => {
  const numPrefix = event.playerNumber !== undefined ? `#${event.playerNumber}` : '';
  if (!includePersonalData) {
    return event.playerNumber !== undefined ? `Zawodnik #${event.playerNumber}` : 'Zawodnik';
  }

  const matched = findPlayerForEvent(event, players);
  if (matched) {
    const full = `${matched.firstName || ''} ${matched.lastName || ''}`.trim();
    if (full) {
      return numPrefix ? `${numPrefix} ${full}` : full;
    }
    return event.playerNumber !== undefined ? `Zawodnik #${event.playerNumber}` : `Zawodnik #${matched.number}`;
  }

  if (event.playerName?.trim()) {
    return numPrefix ? `${numPrefix} ${event.playerName.trim()}` : event.playerName.trim();
  }

  return event.playerNumber !== undefined ? `Zawodnik #${event.playerNumber}` : 'Zawodnik';
};

export const resolveEventAssistLabel = (
  event: MatchEvent,
  players: Player[] = [],
  includePersonalData: boolean = true
): string | undefined => {
  if (!event.assistedByPlayerId && !event.assistedByPlayerName) return undefined;

  const matched = event.assistedByPlayerId
    ? players.find((p) => p.id === event.assistedByPlayerId)
    : undefined;

  if (!includePersonalData) {
    if (matched) return `Zawodnik #${matched.number}`;
    return 'Kolega z drużyny';
  }

  if (matched) {
    const full = `${matched.firstName || ''} ${matched.lastName || ''}`.trim();
    return full ? `#${matched.number} ${full}` : `Zawodnik #${matched.number}`;
  }

  return event.assistedByPlayerName?.trim() || undefined;
};

export const stripPersonalDataFromPlayer = (p: Player): Player => ({
  id: p.id,
  teamCategory: p.teamCategory || 'TEAM',
  firstName: '',
  lastName: '',
  number: p.number,
  ...(p.position ? { position: p.position } : {}),
  createdAt: p.createdAt,
});

export const sanitizePlayerForServer = (p: Player): Player => stripPersonalDataFromPlayer(p);

export const sanitizeMatchEventForServer = (e: MatchEvent): MatchEvent => {
  const { playerName: _pn, assistedByPlayerName: _apn, ...rest } = e;
  return rest;
};

export const sanitizeMatchForServer = (m: Match): Match => ({
  ...m,
  events: (m.events || []).map(sanitizeMatchEventForServer),
});

export const sanitizeClubProfileForServer = (c: ClubProfile): ClubProfile => ({
  ...c,
  headCoach: '',
  assistantCoach: '',
});

export const mergeServerPlayersWithLocal = (
  serverPlayers: Player[] = [],
  localPlayers: Player[] = []
): Player[] => {
  const matchedLocalIds = new Set<string>();

  const mergedServer = serverPlayers.map((sp) => {
    const spCategory = sp.teamCategory || 'TEAM';
    const localMatch =
      localPlayers.find((lp) => lp.id === sp.id) ||
      localPlayers.find(
        (lp) => lp.number === sp.number && (lp.teamCategory || 'TEAM') === spCategory
      );

    if (!localMatch) {
      return {
        ...sp,
        firstName: sp.firstName || '',
        lastName: sp.lastName || '',
      };
    }

    matchedLocalIds.add(localMatch.id);
    localPlayers.forEach((lp) => {
      if (
        lp.id.startsWith('local-') &&
        lp.number === sp.number &&
        (lp.teamCategory || 'TEAM') === spCategory
      ) {
        matchedLocalIds.add(lp.id);
      }
    });

    return {
      ...sp,
      firstName: sp.firstName?.trim() ? sp.firstName : (localMatch.firstName || ''),
      lastName: sp.lastName?.trim() ? sp.lastName : (localMatch.lastName || ''),
      photo: sp.photo?.trim() ? sp.photo : localMatch.photo,
      notes: sp.notes?.trim() ? sp.notes : localMatch.notes,
      position: sp.position || localMatch.position,
    };
  });

  const unmatchedLocalExtras = localPlayers.filter(
    (lp) => lp.id.startsWith('local-') && !matchedLocalIds.has(lp.id)
  );

  return [...mergedServer, ...unmatchedLocalExtras].sort((a, b) => a.number - b.number);
};

export const mergeServerClubWithLocal = (
  serverClub: ClubProfile,
  localClub?: ClubProfile
): ClubProfile => {
  if (!localClub) return serverClub;
  return {
    ...serverClub,
    headCoach: serverClub.headCoach?.trim() ? serverClub.headCoach : (localClub.headCoach || ''),
    assistantCoach: serverClub.assistantCoach?.trim()
      ? serverClub.assistantCoach
      : (localClub.assistantCoach || ''),
  };
};

export const createSubstitutionEvent = (
  currentMatch: Match,
  params: {
    type: 'SUBSTITUTION' | 'SUB_IN' | 'SUB_OUT';
    inPlayer?: Player;
    outPlayer?: Player;
    nextOnCourt: string[];
    eventId?: string;
  }
): MatchEvent => {
  const clockMin = Math.floor(currentMatch.clockSeconds / 60);
  const clockSec = currentMatch.clockSeconds % 60;
  const formattedClock = `${String(clockMin).padStart(2, '0')}:${String(clockSec).padStart(2, '0')}`;

  if (params.type === 'SUBSTITUTION') {
    return {
      id: params.eventId || `evt-sub-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      matchId: currentMatch.id,
      timestamp: Date.now(),
      quarter: currentMatch.currentQuarter,
      gameClock: formattedClock,
      clockSeconds: currentMatch.clockSeconds,
      type: 'SUBSTITUTION',
      team: 'our',
      points: 0,
      playerId: params.inPlayer?.id,
      playerNumber: params.inPlayer?.number,
      subOutPlayerId: params.outPlayer?.id,
      subOutPlayerNumber: params.outPlayer?.number,
      onCourtPlayerIds: [...params.nextOnCourt],
      ourScoreAfter: currentMatch.ourScore,
      oppScoreAfter: currentMatch.opponentScore,
    };
  }

  const target = params.type === 'SUB_IN' ? params.inPlayer : params.outPlayer;
  return {
    id: params.eventId || `evt-sub-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    matchId: currentMatch.id,
    timestamp: Date.now(),
    quarter: currentMatch.currentQuarter,
    gameClock: formattedClock,
    clockSeconds: currentMatch.clockSeconds,
    type: params.type,
    team: 'our',
    points: 0,
    playerId: target?.id,
    playerNumber: target?.number,
    onCourtPlayerIds: [...params.nextOnCourt],
    ourScoreAfter: currentMatch.ourScore,
    oppScoreAfter: currentMatch.opponentScore,
  };
};

export const resolveSubstitutionLabels = (
  event: MatchEvent,
  players: Player[] = [],
  includePersonalData: boolean = true
): { inLabel?: string; outLabel?: string } => {
  if (event.type === 'SUBSTITUTION') {
    const inLabel =
      event.playerId || event.playerNumber !== undefined
        ? resolveEventPlayerLabel(event, players, includePersonalData)
        : undefined;
    const outLabel =
      event.subOutPlayerId || event.subOutPlayerNumber !== undefined
        ? resolveEventPlayerLabel(
            {
              ...event,
              playerId: event.subOutPlayerId,
              playerNumber: event.subOutPlayerNumber,
              playerName: undefined,
            },
            players,
            includePersonalData
          )
        : undefined;
    return { inLabel, outLabel };
  }

  if (event.type === 'SUB_IN') {
    return {
      inLabel:
        event.playerId || event.playerNumber !== undefined
          ? resolveEventPlayerLabel(event, players, includePersonalData)
          : undefined,
    };
  }

  if (event.type === 'SUB_OUT') {
    return {
      outLabel:
        event.playerId || event.playerNumber !== undefined
          ? resolveEventPlayerLabel(event, players, includePersonalData)
          : undefined,
    };
  }

  return {};
};


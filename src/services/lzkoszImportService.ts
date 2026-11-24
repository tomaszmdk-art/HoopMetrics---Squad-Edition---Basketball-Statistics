import { ClubProfile, Player } from '../types/basketball';
import { ImportPreviewResult } from './teamTransferService';

export interface LzkoszClubSummary {
  id: number;
  name: string;
  licenceName?: string;
  city: string;
  teamsCount: number;
  leagues: string[];
  logoUrl?: string;
}

export interface LzkoszClubTeamOption {
  teamId: string;
  leagueId: string;
  seasonId: string;
  teamName: string;
  shortName: string;
  leagueName: string;
  city: string;
  logoUrl?: string;
  teamUrl: string;
}

export interface LzkoszClubTeamsResponse {
  clubId: string;
  clubName: string;
  city: string;
  seasonName?: string;
  teams: LzkoszClubTeamOption[];
}

export interface LzkoszTeamPreviewApiResponse {
  kind: 'team';
  sourceUrl: string;
  teamId?: string;
  leagueId?: string;
  seasonId?: string;
  clubProfile: {
    name: string;
    shortName: string;
    city: string;
    headCoach: string;
    assistantCoach: string;
    leagueName: string;
    season: string;
    badgeLogoUrl?: string;
  };
  players: Array<{
    id: string;
    teamCategory: string;
    firstName: string;
    lastName: string;
    number: number;
    position: 'PG' | 'SG' | 'SF' | 'PF' | 'C';
    notes?: string;
    photo?: string;
    photoUrl?: string;
    createdAt: number;
  }>;
  photosLoaded: number;
  photosTotal: number;
  warnings: string[];
}

export interface LzkoszClubRedirectApiResponse {
  kind: 'club';
  clubId: string;
  clubName: string;
  city: string;
  teams: LzkoszClubTeamOption[];
}

export function isSafeDisplayImageSrc(src?: string): string | undefined {
  if (!src || typeof src !== 'string') return undefined;
  const trimmed = src.trim();
  if (/^data:image\/(jpeg|jpg|png|webp);base64,[a-z0-9+/=]+$/i.test(trimmed)) {
    return trimmed;
  }
  try {
    const parsed = new URL(trimmed);
    if (
      parsed.protocol === 'https:' &&
      (parsed.hostname === 'lzkosz.pl' ||
        parsed.hostname === 'www.lzkosz.pl' ||
        /^([a-z0-9-]+\.)*esor\.pzkosz\.pl$/i.test(parsed.hostname))
    ) {
      return parsed.toString();
    }
  } catch {
    return undefined;
  }
  return undefined;
}

async function parseJsonApiResponse<T>(res: Response, fallbackMsg: string): Promise<T> {
  const rawText = await res.text().catch(() => '');
  let parsed: any = null;
  if (rawText) {
    try {
      parsed = JSON.parse(rawText);
    } catch {
      parsed = null;
    }
  }
  if (!res.ok) {
    const serverMsg = typeof parsed?.error === 'string' && parsed.error.trim() ? parsed.error.trim() : '';
    throw new Error(serverMsg || `${fallbackMsg} (HTTP ${res.status})`);
  }
  if (!parsed || typeof parsed !== 'object') {
    throw new Error(`${fallbackMsg} (nieoczekiwana odpowiedź serwera)`);
  }
  return parsed as T;
}

export async function fetchLzkoszClubs(forceRefresh = false): Promise<{
  seasonName: string;
  clubs: LzkoszClubSummary[];
}> {
  const res = await fetch(`/api/lzkosz/clubs${forceRefresh ? '?refresh=1' : ''}`, {
    headers: { Accept: 'application/json' },
  });
  return parseJsonApiResponse<{ seasonName: string; clubs: LzkoszClubSummary[] }>(
    res,
    'Nie udało się pobrać listy klubów z lzkosz.pl.'
  );
}

export async function fetchLzkoszClubTeams(clubId: number | string): Promise<LzkoszClubTeamsResponse> {
  const cleanId = String(clubId).trim();
  const res = await fetch(`/api/lzkosz/club-teams?clubId=${encodeURIComponent(cleanId)}`, {
    headers: { Accept: 'application/json' },
  });
  return parseJsonApiResponse<LzkoszClubTeamsResponse>(
    res,
    'Nie udało się pobrać drużyn wybranego klubu.'
  );
}

export async function fetchLzkoszTeamPreview(
  url: string,
  includePhotos: boolean
): Promise<LzkoszTeamPreviewApiResponse | LzkoszClubRedirectApiResponse> {
  const res = await fetch('/api/lzkosz/team-preview', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ url: url.trim(), includePhotos }),
  });
  return parseJsonApiResponse<LzkoszTeamPreviewApiResponse | LzkoszClubRedirectApiResponse>(
    res,
    'Nie udało się pobrać składu ze strony lzkosz.pl.'
  );
}

export function buildImportPreviewFromLzkosz(
  data: LzkoszTeamPreviewApiResponse,
  currentClub: ClubProfile
): ImportPreviewResult {
  const safeLogo = isSafeDisplayImageSrc(data.clubProfile.badgeLogoUrl);
  const clubProfile: ClubProfile = {
    ...currentClub,
    name: data.clubProfile.name || currentClub.name,
    shortName: data.clubProfile.shortName || currentClub.shortName,
    city: data.clubProfile.city || currentClub.city,
    headCoach: data.clubProfile.headCoach || '',
    assistantCoach: data.clubProfile.assistantCoach || '',
    leagueName: data.clubProfile.leagueName || currentClub.leagueName || 'Rozgrywki ŁZKosz',
    season: data.clubProfile.season || currentClub.season || '2026/2027',
    badgeLogoUrl: safeLogo || currentClub.badgeLogoUrl,
    categories: ['TEAM'],
  };

  const players: Player[] = data.players.map((p) => ({
    id: p.id,
    teamCategory: 'TEAM',
    firstName: p.firstName || '',
    lastName: p.lastName || '',
    number: Number.isFinite(p.number) ? p.number : 0,
    position: p.position || 'SG',
    notes: p.notes || undefined,
    photo: isSafeDisplayImageSrc(p.photo) || isSafeDisplayImageSrc(p.photoUrl),
    createdAt: p.createdAt || Date.now(),
  }));

  const photosCount = players.filter((p) => Boolean(p.photo)).length;

  return {
    valid: true,
    exportType: 'lzkosz',
    sourceLabel: `ŁZKosz.pl • ${data.clubProfile.leagueName || 'Drużyna'}`,
    warnings: data.warnings,
    preserveExistingMatchesOnOverwrite: true,
    clubProfile,
    players,
    matches: [],
    photosCount,
    categories: ['TEAM'],
    totalPointsScored: 0,
    winsCount: 0,
    lossesCount: 0,
  };
}

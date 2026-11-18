import { ClubProfile, Match, Player, TeamCategory } from '../types/basketball';
import {
  getClubProfile,
  getMatches,
  getPlayers,
  saveClubProfile,
  saveMatchesBulk,
  savePlayer,
  deletePlayer,
  deleteMatch,
} from './db';
import { pushServerStateImmediate } from './syncService';
import { getPlayerFullName } from './playerDisplay';

export interface TeamExportMetadata {
  categoryFilter: string; // 'ALL' or specific e.g. 'U13'
  playersCount: number;
  photosCount: number;
  matchesCount: number;
  winsCount: number;
  lossesCount: number;
  pointsScored: number;
  pointsConceded: number;
  clubName: string;
  season: string;
  exportDate: string;
  deviceInfo: string;
}

export interface TeamExportPackage {
  app: 'BasketStats Pro';
  schemaVersion: '2.0';
  exportType: 'team_full' | 'team_category';
  exportedAt: string;
  clubProfile: ClubProfile;
  players: Player[];
  matches: Match[];
  metadata: TeamExportMetadata;
}

export interface ImportPreviewResult {
  valid: boolean;
  error?: string;
  exportType?: 'team_full' | 'team_category' | 'legacy';
  exportedAt?: string;
  clubProfile?: ClubProfile;
  players: Player[];
  matches: Match[];
  photosCount: number;
  categories: string[];
  totalPointsScored: number;
  winsCount: number;
  lossesCount: number;
}

/**
 * Creates the complete export payload for a team or entire club
 */
export function buildTeamExportPackage(
  club: ClubProfile,
  allPlayers: Player[],
  allMatches: Match[],
  categoryFilter: 'ALL' | TeamCategory = 'ALL',
  includePhotos: boolean = true
): TeamExportPackage {
  const filteredPlayers = (
    categoryFilter === 'ALL'
      ? allPlayers
      : allPlayers.filter((p) => p.teamCategory === categoryFilter)
  ).map((p) => {
    if (!includePhotos && p.photo) {
      const copy = { ...p };
      delete copy.photo;
      return copy;
    }
    return p;
  });

  const filteredMatches =
    categoryFilter === 'ALL'
      ? allMatches
      : allMatches.filter((m) => m.teamCategory === categoryFilter);

  const photosCount = filteredPlayers.filter((p) => Boolean(p.photo)).length;

  let winsCount = 0;
  let lossesCount = 0;
  let pointsScored = 0;
  let pointsConceded = 0;

  for (const m of filteredMatches) {
    pointsScored += m.ourScore || 0;
    pointsConceded += m.opponentScore || 0;
    if (m.ourScore > m.opponentScore) {
      winsCount++;
    } else if (m.ourScore < m.opponentScore) {
      lossesCount++;
    }
  }

  const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : 'Unknown';
  let deviceInfo = 'Przeglądarka internetowa';
  if (/Android/i.test(userAgent)) deviceInfo = 'Android Phone / Tablet';
  else if (/iPhone|iPad|iPod/i.test(userAgent)) deviceInfo = 'Apple iOS Device';
  else if (/Macintosh/i.test(userAgent)) deviceInfo = 'Apple macOS';
  else if (/Windows/i.test(userAgent)) deviceInfo = 'Windows PC';
  else if (/Linux/i.test(userAgent)) deviceInfo = 'Linux PC';

  const metadata: TeamExportMetadata = {
    categoryFilter,
    playersCount: filteredPlayers.length,
    photosCount,
    matchesCount: filteredMatches.length,
    winsCount,
    lossesCount,
    pointsScored,
    pointsConceded,
    clubName: club.name || 'Klub Koszykarski',
    season: club.season || '2026/2027',
    exportDate: new Date().toISOString(),
    deviceInfo,
  };

  return {
    app: 'BasketStats Pro',
    schemaVersion: '2.0',
    exportType: categoryFilter === 'ALL' ? 'team_full' : 'team_category',
    exportedAt: new Date().toISOString(),
    clubProfile: club,
    players: filteredPlayers,
    matches: filteredMatches,
    metadata,
  };
}

/**
 * Generate a friendly filename for the export JSON
 */
export function generateExportFilename(club: ClubProfile, categoryFilter: string): string {
  const sanitize = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^a-z0-9]/gi, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '');

  const clubShort = sanitize(club.shortName || club.name || 'druzyna');
  const cat = categoryFilter === 'ALL' || categoryFilter === 'TEAM' ? 'eksport' : sanitize(categoryFilter);
  const dateStr = new Date().toISOString().split('T')[0];

  return `druzyna_${clubShort}_${cat}_${dateStr}.json`;
}

/**
 * Downloads JSON file directly in the browser
 */
export function downloadJsonFile(jsonString: string, filename: string): void {
  const blob = new Blob([jsonString], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/**
 * Check if Web Share API with file attachments is supported on this browser
 */
export function canShareFiles(): boolean {
  if (typeof navigator === 'undefined' || !navigator.share || !navigator.canShare) {
    return false;
  }
  try {
    const testFile = new File(['test'], 'test.json', { type: 'application/json' });
    return navigator.canShare({ files: [testFile] });
  } catch {
    return false;
  }
}

/**
 * Shares the JSON file directly via Web Share API (native share dialog: Gmail, Outlook, Mail, Drive, etc.)
 */
export async function shareFileViaWebShare(
  jsonString: string,
  filename: string,
  title: string,
  text: string
): Promise<boolean> {
  if (!canShareFiles()) {
    return false;
  }
  try {
    const file = new File([jsonString], filename, { type: 'application/json' });
    await navigator.share({
      files: [file],
      title,
      text,
    });
    return true;
  } catch (err: unknown) {
    if ((err as Error)?.name === 'AbortError') {
      // User cancelled the share dialog
      return false;
    }
    console.warn('Web Share failed, fallback to mailto/download:', err);
    return false;
  }
}

/**
 * Builds email subject and structured text body for mailing
 */
export function buildEmailDraft(
  pkg: TeamExportPackage,
  recipientEmail: string = 'tomasz.mdk@gmail.com',
  filename: string
): { subject: string; body: string; mailtoUrl: string } {
  const club = pkg.clubProfile;
  const meta = pkg.metadata;
  const catLabel =
    meta.categoryFilter === 'ALL' || meta.categoryFilter === 'TEAM'
      ? ''
      : ` (${meta.categoryFilter})`;
  const dateStr = new Date().toLocaleDateString('pl-PL', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });

  const subject = `[${club.name}] Eksport drużyny${catLabel} - Skład, Zdjęcia i Wyniki (${dateStr})`;

  // Build match summaries
  let matchesSummaryText = '';
  if (pkg.matches.length > 0) {
    matchesSummaryText = pkg.matches
      .map((m, idx) => {
        const isWon = m.ourScore > m.opponentScore;
        const resultLabel = isWon ? 'WYGRANA' : m.ourScore === m.opponentScore ? 'REMIS' : 'PORAŻKA';
        const quarters = m.quarterScores
          ? ` (Q1: ${m.quarterScores.q1.our}-${m.quarterScores.q1.opp}, Q2: ${m.quarterScores.q2.our}-${m.quarterScores.q2.opp}, Q3: ${m.quarterScores.q3.our}-${m.quarterScores.q3.opp}, Q4: ${m.quarterScores.q4.our}-${m.quarterScores.q4.opp})`
          : '';
        const catPrefix = m.teamCategory && m.teamCategory !== 'TEAM' ? `[${m.teamCategory}] ` : '';
        return `  ${idx + 1}. ${catPrefix}vs ${m.opponent} — ${m.ourScore}:${m.opponentScore} [${resultLabel}] (${m.date || 'brak daty'}, ${m.location || 'Hala'})${quarters}`;
      })
      .join('\n');
  } else {
    matchesSummaryText = '  (Brak rozegranych meczów w tej paczce)';
  }

  // Build players roster list
  let rosterSummaryText = '';
  if (pkg.players.length > 0) {
    rosterSummaryText = pkg.players
      .sort((a, b) => a.number - b.number)
      .map((p) => {
        const photoInfo = p.photo ? '📸 [ze zdjęciem]' : '▫️ [brak zdjęcia]';
        const posInfo = p.position ? `(${p.position})` : '';
        const notesInfo = p.notes ? ` • ${p.notes}` : '';
        return `  #${p.number.toString().padStart(2, '0')} ${getPlayerFullName(p)} ${posInfo} ${photoInfo}${notesInfo}`;
      })
      .join('\n');
  } else {
    rosterSummaryText = '  (Brak zawodników w kadrze)';
  }

  const bodyLines = [
    `Cześć!`,
    ``,
    `Przesyłam kompletny eksport danych drużyny ${club.name}${catLabel}:`,
    ``,
    `🏀 DANE KLUBU:`,
    `- Klub: ${club.name} (${club.shortName || 'KLUB'})`,
    `- Miasto: ${club.city || 'Polska'}`,
    `- Sezon: ${club.season || '2026/2027'} • Liga: ${club.leagueName || 'Rozgrywki Młodzieżowe'}`,
    `- Sztab: ${club.headCoach ? 'Trener: ' + club.headCoach : ''} ${club.assistantCoach ? '• Asystent: ' + club.assistantCoach : ''}`.trim(),
    `- Herb/Logo: ${club.badgeLogoUrl ? 'Własne logo klubowe (w załączniku)' : club.badgeEmoji || '🏀'}`,
    ``,
    `📊 PODSUMOWANIE STATYSTYK:`,
    `- Zawodnicy w kadrze: ${meta.playersCount} (w tym ${meta.photosCount} posiada zdjęcia profilowe)`,
    `- Zarejestrowane mecze: ${meta.matchesCount}`,
    `- Bilans meczów: ${meta.winsCount}Z - ${meta.lossesCount}P (Punkty zdobyte/stracone: ${meta.pointsScored} : ${meta.pointsConceded})`,
    ``,
    `📋 SKŁAD ZAWODNIKÓW:`,
    rosterSummaryText,
    ``,
    `🏆 WYNIKI SPOTKAŃ:`,
    matchesSummaryText,
    ``,
    `----------------------------------------------------------------------`,
    `📥 INSTRUKCJA IMPORTU DO APLIKACJI:`,
    `Do wiadomości dołączony jest plik kopii zapasowej: ${filename}`,
    `Aby wgrać dane na innym telefonie lub komputerze:`,
    `1. Otwórz aplikację koszykarską (np. na telefonie lub komputerze).`,
    `2. W górnym pasku kliknij "Transfer / Sync" lub w kadrze kliknij "Importuj drużynę".`,
    `3. Wybierz plik ${filename} i kliknij "Zatwierdź import".`,
    `Wszystkie dane klubu, zdjęcia zawodników i protokoły meczowe zostaną natychmiast odtworzone!`,
    `----------------------------------------------------------------------`,
    `Wygenerowano automatycznie w aplikacji BasketStats Pro • ${new Date().toLocaleString('pl-PL')}`,
  ];

  const body = bodyLines.join('\n');

  // URL encode for mailto link
  // Keep body under 1900 chars in mailto URL to prevent browser mailto clipping issues,
  // while offering full body for copying or Web Share!
  let mailtoBody = body;
  if (mailtoBody.length > 1800) {
    const compactLines = [
      `Dzień dobry!`,
      ``,
      `Przesyłam eksport drużyny ${club.name}${catLabel}:`,
      `- Zawodnicy: ${meta.playersCount} (w tym ${meta.photosCount} ze zdjęciami)`,
      `- Mecze: ${meta.matchesCount} (Bilans: ${meta.winsCount}W - ${meta.lossesCount}L, punkty: ${meta.pointsScored}:${meta.pointsConceded})`,
      `- Sezon: ${club.season || '2026/2027'}`,
      ``,
      `W załączniku przesyłam plik: ${filename}`,
      `Dołącz go do tej wiadomości, a odbiorca zaimportuje dane jednym kliknięciem w aplikacji.`,
      ``,
      `Pozdrawiam!`,
    ];
    mailtoBody = compactLines.join('\n');
  }

  const cleanRecipient = (recipientEmail || '').trim();
  const mailtoUrl = `mailto:${encodeURIComponent(cleanRecipient)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(mailtoBody)}`;

  return { subject, body, mailtoUrl };
}

/**
 * Validates and inspects a JSON string to preview what will be imported
 */
export function inspectImportJson(jsonStr: string): ImportPreviewResult {
  try {
    if (!jsonStr || !jsonStr.trim()) {
      return {
        valid: false,
        error: 'Plik jest pusty.',
        players: [],
        matches: [],
        photosCount: 0,
        categories: [],
        totalPointsScored: 0,
        winsCount: 0,
        lossesCount: 0,
      };
    }

    const parsed = JSON.parse(jsonStr);

    let clubProfile: ClubProfile | undefined = undefined;
    if (parsed.clubProfile && typeof parsed.clubProfile.name === 'string') {
      clubProfile = parsed.clubProfile;
    }

    // Matches
    const rawMatches: unknown[] = Array.isArray(parsed)
      ? parsed
      : Array.isArray(parsed.matches)
        ? parsed.matches
        : [];

    const validMatches: Match[] = rawMatches.filter(
      (m: any): m is Match => m && typeof m.id === 'string' && typeof m.opponent === 'string'
    );

    // Players
    const rawPlayers: unknown[] = Array.isArray(parsed.players) ? parsed.players : [];
    const validPlayers: Player[] = rawPlayers
      .filter((p: any): p is Player => p && typeof p.id === 'string' && typeof p.number === 'number')
      .map((p) => ({
        ...p,
        teamCategory: p.teamCategory || 'TEAM',
        firstName: typeof p.firstName === 'string' ? p.firstName : '',
        lastName: typeof p.lastName === 'string' ? p.lastName : '',
      }));

    if (validMatches.length === 0 && validPlayers.length === 0 && !clubProfile) {
      return {
        valid: false,
        error: 'Plik nie zawiera poprawnych danych klubu, zawodników ani meczów.',
        players: [],
        matches: [],
        photosCount: 0,
        categories: [],
        totalPointsScored: 0,
        winsCount: 0,
        lossesCount: 0,
      };
    }

    const photosCount = validPlayers.filter((p) => Boolean(p.photo)).length;

    // Discover categories
    const catSet = new Set<string>();
    validPlayers.forEach((p) => catSet.add(p.teamCategory));
    validMatches.forEach((m) => catSet.add(m.teamCategory));
    if (clubProfile?.categories) {
      clubProfile.categories.forEach((c) => catSet.add(c));
    }

    let winsCount = 0;
    let lossesCount = 0;
    let totalPointsScored = 0;

    for (const m of validMatches) {
      totalPointsScored += m.ourScore || 0;
      if (m.ourScore > m.opponentScore) winsCount++;
      else if (m.ourScore < m.opponentScore) lossesCount++;
    }

    return {
      valid: true,
      exportType: parsed.exportType || (parsed.schemaVersion ? 'team_full' : 'legacy'),
      exportedAt: parsed.exportedAt || parsed.metadata?.exportDate,
      clubProfile,
      players: validPlayers,
      matches: validMatches,
      photosCount,
      categories: Array.from(catSet),
      totalPointsScored,
      winsCount,
      lossesCount,
    };
  } catch (err: unknown) {
    return {
      valid: false,
      error: `Niepoprawny plik JSON: ${(err as Error)?.message || 'Błąd składni'}`,
      players: [],
      matches: [],
      photosCount: 0,
      categories: [],
      totalPointsScored: 0,
      winsCount: 0,
      lossesCount: 0,
    };
  }
}

/**
 * Executes the actual import of team data into IndexedDB & syncs to cloud
 */
export async function executeTeamImport(
  preview: ImportPreviewResult,
  mode: 'merge' | 'overwrite',
  currentClub: ClubProfile,
  currentPlayers: Player[],
  currentMatches: Match[],
  pushToServer: boolean = true
): Promise<{
  updatedClub: ClubProfile;
  updatedPlayers: Player[];
  updatedMatches: Match[];
  importedPhotosCount: number;
  importedPlayersCount: number;
  importedMatchesCount: number;
}> {
  if (!preview.valid) {
    throw new Error(preview.error || 'Nieprawidłowe dane importu');
  }

  // 1. Club profile
  let finalClub = currentClub;
  if (preview.clubProfile) {
    finalClub = {
      ...currentClub,
      ...preview.clubProfile,
      updatedAt: Date.now(),
    };
    await saveClubProfile(finalClub);
  }

  // 2. Players
  let finalPlayers: Player[] = [];
  let importedPhotosCount = 0;

  if (mode === 'overwrite') {
    // Clear existing players and set imported players
    for (const p of currentPlayers) {
      await deletePlayer(p.id);
    }
    for (const p of preview.players) {
      const normalized = { ...p, teamCategory: p.teamCategory || 'TEAM' };
      await savePlayer(normalized);
      if (normalized.photo) importedPhotosCount++;
    }
    finalPlayers = preview.players.map((p) => ({ ...p, teamCategory: p.teamCategory || 'TEAM' }));
  } else {
    // Merge mode: match by id first, otherwise by (number, teamCategory) preserving existing room player id
    const playerMap = new Map<string, Player>();
    for (const p of currentPlayers) {
      playerMap.set(p.id, p);
    }

    for (const p of preview.players) {
      const pCategory = p.teamCategory || 'TEAM';
      const existingById = playerMap.get(p.id);
      const existingByNumber = !existingById
        ? Array.from(playerMap.values()).find(
            (cur) => cur.number === p.number && (cur.teamCategory || 'TEAM') === pCategory
          )
        : undefined;
      const existing = existingById || existingByNumber;

      if (existing) {
        const merged: Player = {
          ...existing,
          ...p,
          id: existing.id, // Preserve room player ID so live MatchEvent links keep resolving
          teamCategory: pCategory,
          firstName: p.firstName?.trim() ? p.firstName : (existing.firstName || ''),
          lastName: p.lastName?.trim() ? p.lastName : (existing.lastName || ''),
          photo: p.photo || existing.photo,
          notes: p.notes || existing.notes,
        };
        playerMap.set(existing.id, merged);
        await savePlayer(merged);
        if (merged.photo) importedPhotosCount++;
      } else {
        const normalized: Player = { ...p, teamCategory: pCategory };
        playerMap.set(normalized.id, normalized);
        await savePlayer(normalized);
        if (normalized.photo) importedPhotosCount++;
      }
    }
    finalPlayers = Array.from(playerMap.values()).sort((a, b) => a.number - b.number);
  }

  // 3. Matches
  let finalMatches: Match[] = [];
  if (mode === 'overwrite') {
    for (const m of currentMatches) {
      await deleteMatch(m.id);
    }
    if (preview.matches.length > 0) {
      await saveMatchesBulk(preview.matches);
    }
    finalMatches = preview.matches;
  } else {
    const matchMap = new Map<string, Match>();
    for (const m of currentMatches) {
      matchMap.set(m.id, m);
    }
    for (const m of preview.matches) {
      const existing = matchMap.get(m.id);
      if (!existing || (m.updatedAt || 0) >= (existing.updatedAt || 0)) {
        matchMap.set(m.id, m);
      }
    }
    finalMatches = Array.from(matchMap.values()).sort(
      (a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)
    );
    if (preview.matches.length > 0 && finalMatches.length > 0) {
      await saveMatchesBulk(finalMatches);
    }
  }

  // 4. Push to server state only when coach executes import (never push parent local PII to server)
  if (pushToServer) {
    try {
      const live = finalMatches.find((m) => m.status === 'live');
      pushServerStateImmediate(
        finalMatches,
        finalPlayers,
        live?.id || null,
        undefined,
        undefined,
        finalClub
      );
    } catch (err) {
      console.warn('Could not push imported state to server:', err);
    }
  }

  return {
    updatedClub: finalClub,
    updatedPlayers: finalPlayers,
    updatedMatches: finalMatches,
    importedPhotosCount,
    importedPlayersCount: preview.players.length,
    importedMatchesCount: preview.matches.length,
  };
}

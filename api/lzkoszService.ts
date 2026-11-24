import { URL } from 'url';

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

export interface LzkoszImportedPlayer {
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
}

export interface LzkoszTeamPreviewResponse {
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
  players: LzkoszImportedPlayer[];
  photosLoaded: number;
  photosTotal: number;
  warnings: string[];
}

export interface LzkoszClubRedirectResponse {
  kind: 'club';
  clubId: string;
  clubName: string;
  city: string;
  teams: LzkoszClubTeamOption[];
}

const MAX_HTML_BYTES = 5 * 1024 * 1024;
const MAX_IMAGE_BYTES = 1500 * 1024;
const PAGE_TIMEOUT_MS = 12000;
const IMAGE_TIMEOUT_MS = 6000;
const CLUBS_CACHE_TTL_MS = 30 * 60 * 1000;

let clubsCache: { fetchedAt: number; seasonName: string; clubs: LzkoszClubSummary[] } | null = null;

function isAllowedPageHost(hostname: string): boolean {
  const lower = hostname.toLowerCase();
  return lower === 'lzkosz.pl' || lower === 'www.lzkosz.pl';
}

function isAllowedImageHost(hostname: string): boolean {
  const lower = hostname.toLowerCase();
  if (lower === 'lzkosz.pl' || lower === 'www.lzkosz.pl') return true;
  return /^([a-z0-9-]+\.)*esor\.pzkosz\.pl$/i.test(lower);
}

export function normalizeAndValidateLzkoszUrl(
  rawUrl: string,
  hostChecker: (hostname: string) => boolean = isAllowedPageHost
): URL {
  if (!rawUrl || typeof rawUrl !== 'string') {
    throw new Error('Podaj adres strony z serwisu lzkosz.pl.');
  }
  let candidate = rawUrl.trim();
  if (!candidate) {
    throw new Error('Adres URL nie może być pusty.');
  }
  if (!/^https?:\/\//i.test(candidate)) {
    if (/^(www\.)?lzkosz\.pl(\/|$)/i.test(candidate)) {
      candidate = `https://${candidate}`;
    } else if (candidate.startsWith('/')) {
      candidate = `https://lzkosz.pl${candidate}`;
    } else {
      throw new Error('Adres musi wskazywać na domenę https://lzkosz.pl.');
    }
  }

  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    throw new Error('Nieprawidłowy format adresu URL.');
  }

  if (parsed.protocol === 'http:' && isAllowedPageHost(parsed.hostname)) {
    parsed.protocol = 'https:';
  }
  if (parsed.protocol !== 'https:') {
    throw new Error('Dozwolone są wyłącznie bezpieczne adresy HTTPS.');
  }
  if (parsed.username || parsed.password) {
    throw new Error('Niedozwolony format adresu URL.');
  }
  if (parsed.port && parsed.port !== '443') {
    throw new Error('Niedozwolony port w adresie URL.');
  }
  if (!hostChecker(parsed.hostname)) {
    throw new Error('Adres musi należeć do oficjalnej domeny lzkosz.pl (lub zasobów pzkosz.pl).');
  }
  return parsed;
}

async function readResponseBufferWithLimit(res: Response, maxBytes: number): Promise<Buffer> {
  const contentLengthHeader = res.headers.get('content-length');
  if (contentLengthHeader) {
    const declared = parseInt(contentLengthHeader, 10);
    if (!Number.isNaN(declared) && declared > maxBytes) {
      throw new Error('Pobierany zasób przekracza maksymalny dozwolony rozmiar.');
    }
  }

  if (!res.body) {
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.byteLength > maxBytes) {
      throw new Error('Pobierany zasób przekracza maksymalny dozwolony rozmiar.');
    }
    return buf;
  }

  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        total += value.byteLength;
        if (total > maxBytes) {
          throw new Error('Pobierany zasób przekracza maksymalny dozwolony rozmiar.');
        }
        chunks.push(value);
      }
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks, total);
}

async function safeFetchWithAllowlist(
  rawUrl: string,
  hostChecker: (hostname: string) => boolean,
  options: { maxBytes: number; timeoutMs: number; accept: string }
): Promise<{ url: URL; contentType: string; buffer: Buffer }> {
  let currentUrl = normalizeAndValidateLzkoszUrl(rawUrl, hostChecker);

  for (let hop = 0; hop <= 3; hop++) {
    const res = await fetch(currentUrl.toString(), {
      method: 'GET',
      redirect: 'manual',
      signal: AbortSignal.timeout(options.timeoutMs),
      headers: {
        'User-Agent': 'BasketStatsPro-RosterImporter/1.0 (+https://lzkosz.pl)',
        Accept: options.accept,
        'Accept-Language': 'pl-PL,pl;q=0.9,en;q=0.8',
      },
    });

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get('location');
      if (!location) {
        throw new Error('Niekompletne przekierowanie ze strony lzkosz.pl.');
      }
      const nextUrl = new URL(location, currentUrl);
      currentUrl = normalizeAndValidateLzkoszUrl(nextUrl.toString(), hostChecker);
      continue;
    }

    if (!res.ok) {
      throw new Error(`Serwer lzkosz.pl zwrócił kod błędu HTTP ${res.status}.`);
    }

    const contentType = (res.headers.get('content-type') || '').toLowerCase();
    const buffer = await readResponseBufferWithLimit(res, options.maxBytes);
    return { url: currentUrl, contentType, buffer };
  }

  throw new Error('Zbyt wiele przekierowań podczas pobierania danych z lzkosz.pl.');
}

async function fetchLzkoszHtml(rawUrl: string): Promise<{ url: URL; html: string }> {
  const { url, contentType, buffer } = await safeFetchWithAllowlist(rawUrl, isAllowedPageHost, {
    maxBytes: MAX_HTML_BYTES,
    timeoutMs: PAGE_TIMEOUT_MS,
    accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
  });
  if (contentType && !contentType.includes('text/html') && !contentType.includes('application/xhtml')) {
    throw new Error('Wskazany adres nie zwrócił strony HTML.');
  }
  return { url, html: buffer.toString('utf-8') };
}

async function fetchAllowedImageAsDataUrl(rawImageUrl: string): Promise<string | undefined> {
  try {
    const normalized = normalizeAndValidateLzkoszUrl(rawImageUrl, isAllowedImageHost);
    const { contentType, buffer } = await safeFetchWithAllowlist(
      normalized.toString(),
      isAllowedImageHost,
      {
        maxBytes: MAX_IMAGE_BYTES,
        timeoutMs: IMAGE_TIMEOUT_MS,
        accept: 'image/jpeg,image/png,image/webp,image/*;q=0.8',
      }
    );
    const mime = contentType.split(';')[0].trim();
    if (!['image/jpeg', 'image/jpg', 'image/png', 'image/webp'].includes(mime)) {
      return undefined;
    }
    const cleanMime = mime === 'image/jpg' ? 'image/jpeg' : mime;
    return `data:${cleanMime};base64,${buffer.toString('base64')}`;
  } catch {
    return undefined;
  }
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, Math.max(items.length, 1)) }, async () => {
    while (cursor < items.length) {
      const idx = cursor++;
      results[idx] = await worker(items[idx], idx);
    }
  });
  await Promise.all(workers);
  return results;
}

function decodeHtmlEntities(input: string): string {
  if (!input) return '';
  return input
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_m, dec) => {
      const code = Number(dec);
      return Number.isFinite(code) && code > 0 && code < 0x10ffff ? String.fromCodePoint(code) : '';
    })
    .replace(/\s+/g, ' ')
    .trim();
}

function stripTags(html: string): string {
  return decodeHtmlEntities(html.replace(/<[^>]+>/g, ' '));
}

function extractRscJoined(html: string): string {
  const re = /self\.__next_f\.push\(\[1,"((?:[^"\\]|\\.)*)"\]\)/g;
  const chunks: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = re.exec(html)) !== null) {
    try {
      chunks.push(JSON.parse(`"${match[1]}"`));
    } catch {
      // ignore malformed chunk
    }
  }
  return chunks.join('\n');
}

function extractJsonValueAfter<T = unknown>(source: string, key: string, fromIndex = 0): { value: T; endIndex: number } | null {
  const idx = source.indexOf(key, fromIndex);
  if (idx === -1) return null;
  let start = idx + key.length;
  while (start < source.length && /\s/.test(source[start])) start++;
  const open = source[start];
  const close = open === '{' ? '}' : open === '[' ? ']' : null;
  if (!close) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < source.length; i++) {
    const ch = source[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === '\\' && inString) {
      escaped = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (!inString) {
      if (ch === open) depth++;
      else if (ch === close) {
        depth--;
        if (depth === 0) {
          try {
            const value = JSON.parse(source.slice(start, i + 1)) as T;
            return { value, endIndex: i + 1 };
          } catch {
            return null;
          }
        }
      }
    }
  }
  return null;
}

function mapPolishPosition(positions: unknown): 'PG' | 'SG' | 'SF' | 'PF' | 'C' {
  if (!Array.isArray(positions)) return 'SG';
  for (const raw of positions) {
    if (typeof raw !== 'string') continue;
    const p = raw.toLowerCase().trim();
    if (p.includes('rozgryw')) return 'PG';
    if (p.includes('rzucaj')) return 'SG';
    if (p.includes('niski skrzyd')) return 'SF';
    if (p.includes('silny skrzyd')) return 'PF';
    if (p.includes('środk') || p.includes('srodk') || p === 'center') return 'C';
  }
  return 'SG';
}

function buildShortName(name: string, fallbackShort?: string): string {
  const cleanShort = (fallbackShort || '').trim();
  if (cleanShort && cleanShort.length <= 12) return cleanShort.toUpperCase();
  const words = name
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 0);
  if (words.length === 0) return 'KLUB';
  if (words.length === 1) return words[0].slice(0, 6).toUpperCase();
  const initials = words
    .filter((w) => !['w', 'z', 'i', 'im'].includes(w.toLowerCase()))
    .map((w) => w[0])
    .join('')
    .slice(0, 6)
    .toUpperCase();
  return initials || words[0].slice(0, 6).toUpperCase();
}

function extractImageUrlFromNextImageSrc(src: string): string | undefined {
  if (!src) return undefined;
  const decodedSrc = decodeHtmlEntities(src);
  if (decodedSrc.startsWith('/_next/image')) {
    try {
      const dummy = new URL(`https://lzkosz.pl${decodedSrc}`);
      const inner = dummy.searchParams.get('url');
      if (inner) {
        return normalizeAndValidateLzkoszUrl(inner, isAllowedImageHost).toString();
      }
    } catch {
      return undefined;
    }
  }
  if (/^https?:\/\//i.test(decodedSrc)) {
    try {
      return normalizeAndValidateLzkoszUrl(decodedSrc, isAllowedImageHost).toString();
    } catch {
      return undefined;
    }
  }
  return undefined;
}

export async function getLzkoszClubs(forceRefresh = false): Promise<{ seasonName: string; clubs: LzkoszClubSummary[] }> {
  if (!forceRefresh && clubsCache && Date.now() - clubsCache.fetchedAt < CLUBS_CACHE_TTL_MS) {
    return { seasonName: clubsCache.seasonName, clubs: clubsCache.clubs };
  }

  const { html } = await fetchLzkoszHtml('https://lzkosz.pl/zwiazek/kluby');
  const rsc = extractRscJoined(html);

  let seasonName = '2026/2027';
  const seasonMatch = extractJsonValueAfter<{ name?: string }>(rsc, '"season":');
  if (seasonMatch?.value?.name) {
    seasonName = String(seasonMatch.value.name).trim();
  }

  const clubsExtracted = extractJsonValueAfter<any[]>(rsc, '"clubs":');
  let clubs: LzkoszClubSummary[] = [];

  if (clubsExtracted && Array.isArray(clubsExtracted.value)) {
    const seenIds = new Set<number>();
    for (const c of clubsExtracted.value) {
      const id = Number(c?.id);
      const name = typeof c?.name === 'string' ? c.name.trim() : '';
      if (!Number.isInteger(id) || id <= 0 || !name || seenIds.has(id)) continue;
      seenIds.add(id);

      const leaguesSet = new Set<string>();
      if (Array.isArray(c?.leagues)) {
        for (const lg of c.leagues) {
          const label = (lg?.abbreviation || lg?.shortName || lg?.name || '').toString().trim();
          if (label) leaguesSet.add(label);
        }
      }

      let validLogoUrl: string | undefined;
      if (typeof c?.logoUrl === 'string' && c.logoUrl.trim()) {
        try {
          validLogoUrl = normalizeAndValidateLzkoszUrl(c.logoUrl.trim(), isAllowedImageHost).toString();
        } catch {
          validLogoUrl = undefined;
        }
      }

      clubs.push({
        id,
        name,
        licenceName: typeof c?.licenceName === 'string' ? c.licenceName.trim() : undefined,
        city: typeof c?.city === 'string' ? c.city.trim() : '',
        teamsCount: Array.isArray(c?.teams) ? c.teams.length : Number(c?.teamsCount) || 0,
        leagues: Array.from(leaguesSet),
        logoUrl: validLogoUrl,
      });
    }
  }

  // Fallback to HTML anchors if RSC array wasn't matched
  if (clubs.length === 0) {
    const linkRe = /href="\/zwiazek\/kluby\/(\d+)(?:\?[^"]*)?"[^>]*>([\s\S]*?)<\/a>/g;
    const seen = new Set<number>();
    let m: RegExpExecArray | null;
    while ((m = linkRe.exec(html)) !== null) {
      const id = Number(m[1]);
      if (!Number.isInteger(id) || seen.has(id)) continue;
      seen.add(id);
      const text = stripTags(m[2]);
      if (!text) continue;
      clubs.push({
        id,
        name: text,
        city: '',
        teamsCount: 0,
        leagues: [],
      });
    }
  }

  clubs.sort((a, b) => a.name.localeCompare(b.name, 'pl'));
  clubsCache = { fetchedAt: Date.now(), seasonName, clubs };
  return { seasonName, clubs };
}

export async function getLzkoszClubTeams(clubIdRaw: string): Promise<LzkoszClubTeamsResponse> {
  const clubId = String(clubIdRaw || '').trim();
  if (!/^\d{1,8}$/.test(clubId)) {
    throw new Error('Nieprawidłowy identyfikator klubu ŁZKosz.');
  }

  const { html } = await fetchLzkoszHtml(`https://lzkosz.pl/zwiazek/kluby/${clubId}`);
  const rsc = extractRscJoined(html);

  const h1Match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/);
  const desktopTitleMatch = h1Match?.[1].match(/<span[^>]*desktopTitle[^>]*>([\s\S]*?)<\/span>/i);
  const firstSpanMatch = h1Match?.[1].match(/<span[^>]*>([\s\S]*?)<\/span>/i);
  let clubName = desktopTitleMatch
    ? stripTags(desktopTitleMatch[1])
    : firstSpanMatch
      ? stripTags(firstSpanMatch[1])
      : h1Match
        ? stripTags(h1Match[1])
        : `Klub #${clubId}`;
  let city = '';
  let seasonName: string | undefined;

  const seasonRes = extractJsonValueAfter<{ name?: string }>(rsc, '"season":');
  if (seasonRes?.value?.name) {
    seasonName = String(seasonRes.value.name).trim();
  }

  // Extract metadata about teams belonging to this club from RSC
  const rscTeamsMeta = new Map<string, { name: string; shortName: string; city: string; logoUrl?: string; leagues: Map<string, string> }>();
  const teamsArrRes = extractJsonValueAfter<any[]>(rsc, '"teams":');
  if (teamsArrRes && Array.isArray(teamsArrRes.value)) {
    for (const t of teamsArrRes.value) {
      const tId = t?.id !== undefined ? String(t.id) : '';
      if (!tId) continue;
      const tName = typeof t?.name === 'string' ? t.name.trim() : clubName;
      const tShort = typeof t?.shortName === 'string' ? t.shortName.trim() : '';
      const tCity = typeof t?.city === 'string' ? t.city.trim() : '';
      if (!city && tCity) city = tCity;
      let tLogo: string | undefined;
      if (typeof t?.logoUrl === 'string' && t.logoUrl.trim()) {
        try {
          tLogo = normalizeAndValidateLzkoszUrl(t.logoUrl.trim(), isAllowedImageHost).toString();
        } catch {
          tLogo = undefined;
        }
      }
      const leagueMap = new Map<string, string>();
      if (Array.isArray(t?.leagues)) {
        for (const lg of t.leagues) {
          if (lg?.id !== undefined) {
            const label = (lg.name || lg.shortName || lg.abbreviation || '').toString().trim();
            if (label) leagueMap.set(String(lg.id), label);
          }
        }
      }
      rscTeamsMeta.set(tId, { name: tName, shortName: tShort, city: tCity, logoUrl: tLogo, leagues: leagueMap });
    }
  }

  if (!clubName || clubName.startsWith('Klub #')) {
    const clubMeta = extractJsonValueAfter<{ name?: string; city?: string }>(rsc, '"club":');
    if (clubMeta?.value?.name) clubName = String(clubMeta.value.name).trim();
    if (!city && clubMeta?.value?.city) city = String(clubMeta.value.city).trim();
  }

  // Parse team links on club page
  const linkRe = /href="(\/liga\/(\d+)\/sezon\/(\d+)\/d\/(\d+)\/[^"?#]+)"[^>]*>([\s\S]*?)<\/a>/g;
  const teams: LzkoszClubTeamOption[] = [];
  const seenKey = new Set<string>();
  let match: RegExpExecArray | null;

  while ((match = linkRe.exec(html)) !== null) {
    const [, href, leagueId, seasonId, teamId, innerHtml] = match;
    const dedupeKey = `${leagueId}:${seasonId}:${teamId}`;
    if (seenKey.has(dedupeKey)) continue;
    seenKey.add(dedupeKey);

    const rawText = stripTags(innerHtml)
      .replace(/Terminarz i tabela/gi, '')
      .replace(/\s+/g, ' ')
      .trim();

    const meta = rscTeamsMeta.get(teamId);
    const leagueFromMeta = meta?.leagues.get(leagueId);
    const leagueName = leagueFromMeta || rawText || `Liga #${leagueId}`;
    const teamName = meta?.name || clubName;
    const shortName = buildShortName(teamName, meta?.shortName);

    teams.push({
      teamId,
      leagueId,
      seasonId,
      teamName,
      shortName,
      leagueName,
      city: meta?.city || city,
      logoUrl: meta?.logoUrl,
      teamUrl: `https://lzkosz.pl${href}`,
    });
  }

  return {
    clubId,
    clubName,
    city,
    seasonName,
    teams,
  };
}

export async function previewLzkoszTeam(
  rawUrl: string,
  includePhotos = true
): Promise<LzkoszTeamPreviewResponse | LzkoszClubRedirectResponse> {
  const validatedUrl = normalizeAndValidateLzkoszUrl(rawUrl, isAllowedPageHost);

  // If user pasted a club profile URL (/zwiazek/kluby/{id}), redirect gracefully to club teams list
  const clubUrlMatch = validatedUrl.pathname.match(/^\/zwiazek\/kluby\/(\d+)\/?$/);
  if (clubUrlMatch) {
    const clubData = await getLzkoszClubTeams(clubUrlMatch[1]);
    return {
      kind: 'club',
      clubId: clubData.clubId,
      clubName: clubData.clubName,
      city: clubData.city,
      teams: clubData.teams,
    };
  }

  const { url: finalUrl, html } = await fetchLzkoszHtml(validatedUrl.toString());
  const rsc = extractRscJoined(html);
  const warnings: string[] = [];

  const pathMatch = finalUrl.pathname.match(/\/liga\/(\d+)\/sezon\/(\d+)\/d\/(\d+)/);
  const leagueId = pathMatch?.[1];
  const seasonId = pathMatch?.[2];
  const teamId = pathMatch?.[3];

  // 1. Team Name & Short Name
  const h1Match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/);
  let teamName = h1Match ? stripTags(h1Match[1]) : '';
  let shortName = '';

  let searchCursor = 0;
  while (true) {
    const teamObj = extractJsonValueAfter<any>(rsc, '"team":', searchCursor);
    if (!teamObj) break;
    searchCursor = teamObj.endIndex;
    const val = teamObj.value;
    if (val && typeof val === 'object' && typeof val.name === 'string') {
      if (!teamId || String(val.id) === teamId) {
        if (!teamName) teamName = val.name.trim();
        if (typeof val.shortName === 'string' && val.shortName.trim()) {
          shortName = val.shortName.trim();
        }
        break;
      }
    }
  }

  if (!teamName) {
    throw new Error('Nie znaleziono danych drużyny na wskazanej stronie lzkosz.pl.');
  }

  // 2. League Name & Season
  let leagueName = '';
  const leagueLinkMatch = html.match(/href="\/centrum-meczow\/liga\?leagueId=\d+[^"]*"[^>]*>([\s\S]*?)<\/a>/);
  if (leagueLinkMatch) {
    leagueName = stripTags(leagueLinkMatch[1]);
  }
  if (!leagueName && leagueId) {
    const boxscoreRes = extractJsonValueAfter<any[]>(rsc, '"boxscore":');
    if (boxscoreRes && Array.isArray(boxscoreRes.value)) {
      const matched = boxscoreRes.value.find((b) => String(b?.league?.id) === leagueId);
      if (matched?.league?.name) leagueName = String(matched.league.name).trim();
    }
  }

  let season = '2026/2027';
  const seasonsArrRes = extractJsonValueAfter<any[]>(rsc, '"seasons":');
  if (seasonsArrRes && Array.isArray(seasonsArrRes.value) && seasonId) {
    const matchedSeason = seasonsArrRes.value.find((s) => String(s?.id) === seasonId);
    if (matchedSeason?.name) season = String(matchedSeason.name).trim();
  }

  // 3. City from contacts HTML
  let city = '';
  const contactsMatch = html.match(/<div class="[^"]*contacts[^"]*">([\s\S]*?)<\/div>/);
  if (contactsMatch) {
    const contactsText = stripTags(contactsMatch[1]);
    const postalCityMatch = contactsText.match(/\b\d{2}-\d{3}\s+([^\n|]+)/);
    if (postalCityMatch) {
      city = postalCityMatch[1]
        .replace(/Arena:.*/i, '')
        .replace(/Trenerzy:.*/i, '')
        .trim();
    }
  }

  // 4. Coaches
  let headCoach = '';
  let assistantCoach = '';
  const coachesRes = extractJsonValueAfter<any[]>(rsc, '"coaches":');
  if (coachesRes && Array.isArray(coachesRes.value) && coachesRes.value.length > 0) {
    const coachNames = coachesRes.value
      .map((c) => `${(c?.firstName || '').toString().trim()} ${(c?.lastName || '').toString().trim()}`.trim())
      .filter(Boolean);
    headCoach = coachNames[0] || '';
    if (coachNames.length > 1) {
      assistantCoach = coachNames.slice(1).join(', ');
    }
  } else {
    const coachesHtmlMatch = html.match(/<strong>\s*Trenerzy:\s*<\/strong>([\s\S]*?)<\/(?:div|p|span)>/i);
    if (coachesHtmlMatch) {
      const list = stripTags(coachesHtmlMatch[1])
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      headCoach = list[0] || '';
      if (list.length > 1) assistantCoach = list.slice(1).join(', ');
    }
  }

  // 5. Team Logo URL
  let remoteLogoUrl: string | undefined;
  const profileImgMatch = html.match(/<section[^>]*teamProfile[\s\S]{0,1500}?<img[^>]+src="([^"]+)"/i);
  if (profileImgMatch) {
    remoteLogoUrl = extractImageUrlFromNextImageSrc(profileImgMatch[1]);
  }
  if (!remoteLogoUrl && teamId) {
    const rscLogoMatch = rsc.match(
      new RegExp(`"logoUrl":"(https:\\/\\/[^"]+\\/${teamId}\\.(?:jpg|jpeg|png|webp))"`, 'i')
    );
    if (rscLogoMatch) {
      try {
        remoteLogoUrl = normalizeAndValidateLzkoszUrl(rscLogoMatch[1], isAllowedImageHost).toString();
      } catch {
        remoteLogoUrl = undefined;
      }
    }
  }

  // 6. Players Roster from RSC
  const rosterRes = extractJsonValueAfter<{ players?: any[] }>(rsc, '"teamRoster":');
  const rawPlayers = Array.isArray(rosterRes?.value?.players) ? rosterRes.value.players : [];

  if (rawPlayers.length === 0) {
    throw new Error(
      'Na wskazanej stronie drużyny nie znaleziono jeszcze zgłoszonego składu zawodników.'
    );
  }

  // First pass: assign valid unique 0..99 jersey numbers, reserve fallback slots for missing/duplicate numbers
  const usedNumbers = new Set<number>();
  const parsedDrafts = rawPlayers.map((rp: any, idx: number) => {
    const firstName = typeof rp?.firstName === 'string' ? rp.firstName.trim() : '';
    const lastName = typeof rp?.lastName === 'string' ? rp.lastName.trim() : '';
    const rawShirt = typeof rp?.shirtNumber === 'string' || typeof rp?.shirtNumber === 'number'
      ? String(rp.shirtNumber).trim()
      : '';
    const parsedNum = rawShirt !== '' ? parseInt(rawShirt, 10) : NaN;
    let assignedNumber: number | null = null;
    let numberWasAutoAssigned = false;

    if (!Number.isNaN(parsedNum) && parsedNum >= 0 && parsedNum <= 99 && !usedNumbers.has(parsedNum)) {
      usedNumbers.add(parsedNum);
      assignedNumber = parsedNum;
    } else {
      numberWasAutoAssigned = true;
    }

    const heightVal = Number(rp?.height);
    const heightNote = Number.isFinite(heightVal) && heightVal > 100 && heightVal < 250 ? `${heightVal} cm` : '';
    const birthNote = typeof rp?.birthDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(rp.birthDate.trim())
      ? `ur. ${rp.birthDate.trim().slice(0, 4)}`
      : '';
    const noteParts = [heightNote, birthNote].filter(Boolean);
    if (numberWasAutoAssigned) {
      noteParts.push(rawShirt ? `ŁZKosz nr ${rawShirt}` : 'Brak nr na ŁZKosz');
    }

    let safePhotoUrl: string | undefined;
    if (typeof rp?.photoUrl === 'string' && rp.photoUrl.trim()) {
      try {
        safePhotoUrl = normalizeAndValidateLzkoszUrl(rp.photoUrl.trim(), isAllowedImageHost).toString();
      } catch {
        safePhotoUrl = undefined;
      }
    }

    return {
      idx,
      lzkoszId: rp?.id ? String(rp.id) : `${idx + 1}`,
      firstName,
      lastName,
      assignedNumber,
      numberWasAutoAssigned,
      position: mapPolishPosition(rp?.positions),
      notes: noteParts.join(' • ') || undefined,
      photoUrl: safePhotoUrl,
    };
  });

  let nextFallbackNum = 0;
  let autoAssignedCount = 0;
  for (const draft of parsedDrafts) {
    if (draft.assignedNumber === null) {
      autoAssignedCount++;
      while (usedNumbers.has(nextFallbackNum) && nextFallbackNum <= 99) {
        nextFallbackNum++;
      }
      draft.assignedNumber = nextFallbackNum <= 99 ? nextFallbackNum : 99;
      usedNumbers.add(draft.assignedNumber);
    }
  }

  if (autoAssignedCount > 0) {
    warnings.push(
      `U ${autoAssignedCount} zawodników brakowało numeru na koszulce w ŁZKosz — nadano wolne numery robocze (możesz je zmienić w Kadrze).`
    );
  }

  // 7. Download Logo + Player Photos as Base64 data URLs when requested (works offline & in PDF export)
  let badgeLogoDataUrl: string | undefined;
  let photosLoaded = 0;
  const photosTotal = parsedDrafts.filter((d) => Boolean(d.photoUrl)).length;

  if (includePhotos) {
    const [resolvedLogo, resolvedPhotos] = await Promise.all([
      remoteLogoUrl ? fetchAllowedImageAsDataUrl(remoteLogoUrl) : Promise.resolve(undefined),
      mapWithConcurrency(parsedDrafts, 6, async (draft) => {
        if (!draft.photoUrl) return undefined;
        return fetchAllowedImageAsDataUrl(draft.photoUrl);
      }),
    ]);

    badgeLogoDataUrl = resolvedLogo;
    const now = Date.now();
    const players: LzkoszImportedPlayer[] = parsedDrafts
      .map((draft, i) => {
        const dataPhoto = resolvedPhotos[i];
        if (dataPhoto) photosLoaded++;
        return {
          id: `lzkosz-${teamId || 'team'}-${draft.lzkoszId}`,
          teamCategory: 'TEAM',
          firstName: draft.firstName,
          lastName: draft.lastName,
          number: draft.assignedNumber ?? 0,
          position: draft.position,
          notes: draft.notes,
          photo: dataPhoto,
          photoUrl: draft.photoUrl,
          createdAt: now + i,
        };
      })
      .sort((a, b) => a.number - b.number);

    return {
      kind: 'team',
      sourceUrl: finalUrl.toString(),
      teamId,
      leagueId,
      seasonId,
      clubProfile: {
        name: leagueName ? `${teamName} (${leagueName})` : teamName,
        shortName: buildShortName(teamName, shortName),
        city: city || 'Łódzkie',
        headCoach,
        assistantCoach,
        leagueName: leagueName || 'Rozgrywki ŁZKosz',
        season,
        badgeLogoUrl: badgeLogoDataUrl,
      },
      players,
      photosLoaded,
      photosTotal,
      warnings,
    };
  }

  const now = Date.now();
  const players: LzkoszImportedPlayer[] = parsedDrafts
    .map((draft, i) => ({
      id: `lzkosz-${teamId || 'team'}-${draft.lzkoszId}`,
      teamCategory: 'TEAM',
      firstName: draft.firstName,
      lastName: draft.lastName,
      number: draft.assignedNumber ?? 0,
      position: draft.position,
      notes: draft.notes,
      photoUrl: draft.photoUrl,
      createdAt: now + i,
    }))
    .sort((a, b) => a.number - b.number);

  return {
    kind: 'team',
    sourceUrl: finalUrl.toString(),
    teamId,
    leagueId,
    seasonId,
    clubProfile: {
      name: leagueName ? `${teamName} (${leagueName})` : teamName,
      shortName: buildShortName(teamName, shortName),
      city: city || 'Łódzkie',
      headCoach,
      assistantCoach,
      leagueName: leagueName || 'Rozgrywki ŁZKosz',
      season,
      badgeLogoUrl: undefined,
    },
    players,
    photosLoaded: 0,
    photosTotal,
    warnings,
  };
}

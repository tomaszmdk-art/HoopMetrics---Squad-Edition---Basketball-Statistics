import { ActionType, Player } from '../types/basketball';

export interface ParsedVoiceAction {
  actionType: ActionType;
  playerId?: string;
  playerNumber?: number;
  playerName?: string;
  team: 'our' | 'opp';
  label: string;
  isUndo?: boolean;
  isSelectPlayerOnly?: boolean;
}

export interface ParsedVoiceResult {
  originalText: string;
  actions: ParsedVoiceAction[];
  confidence: 'high' | 'medium' | 'low' | 'none';
  feedbackMessage: string;
}

// Polish numbers mapping (spoken words and colloquial basketball slang)
const POLISH_NUMBER_WORDS: Record<string, number> = {
  zero: 0,
  jeden: 1, jedynka: 1, jedynki: 1, jedynkę: 1, pierwszy: 1,
  dwa: 2, dwójka: 2, dwójki: 2, dwójkę: 2, drugi: 2,
  trzy: 3, trójka: 3, trójki: 3, trójkę: 3, trzeci: 3,
  cztery: 4, czwórka: 4, czwórki: 4, czwórkę: 4, czwarty: 4,
  pięć: 5, piątka: 5, piątki: 5, piątkę: 5, piąty: 5,
  sześć: 6, szóstka: 6, szóstki: 6, szóstkę: 6, szósty: 6,
  siedem: 7, siódemka: 7, siódemki: 7, siódemkę: 7, siódmy: 7,
  osiem: 8, ósemka: 8, ósemki: 8, ósemkę: 8, ósmy: 8,
  dziewięć: 9, dziewiątka: 9, dziewiątki: 9, dziewiątkę: 9, dziewiąty: 9,
  dziesięć: 10, dziesiątka: 10, dziesiątki: 10, dziesiątkę: 10, dziesiąty: 10,
  jedenaście: 11, jedenastka: 11, jedenastki: 11, jedenastkę: 11,
  dwanaście: 12, dwunastka: 12, dwunastki: 12, dwunastkę: 12,
  trzynaście: 13, trzynastka: 13, trzynastki: 13, trzynastkę: 13,
  czternaście: 14, czternastka: 14, czternastki: 14, czternastkę: 14,
  piętnaście: 15, piętnastka: 15, piętnastki: 15, piętnastkę: 15,
  szesnaście: 16, szesnastka: 16, szesnastki: 16, szesnastkę: 16,
  siedemnaście: 17, siedemnastka: 17, siedemnastki: 17, siedemnastkę: 17,
  osiemnaście: 18, osiemnastka: 18, osiemnastki: 18, osiemnastkę: 18,
  dziewiętnaście: 19, dziewiętnastka: 19, dziewiętnastki: 19, dziewiętnastkę: 19,
  dwadzieścia: 20, dwudziestka: 20, dwudziestki: 20, dwudziestkę: 20,
  'dwadzieścia jeden': 21, 'dwadzieścia dwa': 22, 'dwadzieścia trzy': 23,
  'dwadzieścia cztery': 24, 'dwadzieścia pięć': 25, 'dwadzieścia sześć': 26,
  'dwadzieścia siedem': 27, 'dwadzieścia osiem': 28, 'dwadzieścia dziewięć': 29,
  trzydzieści: 30, trzydziestka: 30,
  'trzydzieści jeden': 31, 'trzydzieści dwa': 32, 'trzydzieści trzy': 33,
  'trzydzieści cztery': 34, 'trzydzieści pięć': 35,
  czterdzieści: 40, czterdziestka: 40,
  pięćdziesiąt: 50, pięćdziesiątka: 50,
  'dziewięćdziesiąt dziewięć': 99,
};

// Check if Web Speech API is supported
export function isSpeechRecognitionSupported(): boolean {
  if (typeof window === 'undefined') return false;
  return !!(
    (window as unknown as { SpeechRecognition?: unknown }).SpeechRecognition ||
    (window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition
  );
}

// Extract player number or reference from a Polish text fragment
export function extractPlayerNumber(
  fragment: string,
  roster: Player[]
): { number?: number; player?: Player } | null {
  const clean = fragment.toLowerCase().trim();

  // 1. Direct digits (e.g. "10", "nr 10", "#10", "numer 10")
  const digitMatch = clean.match(/(?:nr|numer|#)?\s*(\b\d{1,2}\b)/);
  if (digitMatch && digitMatch[1]) {
    const num = parseInt(digitMatch[1], 10);
    // Ignore stand-alone single 2 or 3 if they mean points ("za 2", "za 3")
    const isPointsContext =
      clean.includes(`za ${num}`) ||
      clean.includes(`pudło ${num}`) ||
      clean.includes(`kosz ${num}`);

    if (!isPointsContext || clean.includes(`numer ${num}`) || clean.includes(`nr ${num}`)) {
      const found = roster.find((p) => p.number === num);
      return { number: num, player: found };
    }
  }

  // 2. Word numbers (e.g. "dziesiątka", "dwudziestka", "siódemka")
  // Check multi-word first ("dwadzieścia trzy")
  for (const [word, val] of Object.entries(POLISH_NUMBER_WORDS)) {
    if (word.includes(' ')) {
      const reg = new RegExp(`\\b${word}\\b`, 'i');
      if (reg.test(clean)) {
        const found = roster.find((p) => p.number === val);
        return { number: val, player: found };
      }
    }
  }

  // Check single-word numbers
  const tokens = clean.split(/[\s,]+/);
  for (const token of tokens) {
    // skip words like "dwa" or "trzy" if preceded by "za" (za dwa, za trzy)
    if (token === 'dwa' || token === 'trzy' || token === 'jeden') {
      const prevIdx = clean.indexOf(token);
      const prefix = clean.substring(Math.max(0, prevIdx - 4), prevIdx).trim();
      if (prefix === 'za' || prefix === 'z') {
        continue; // this refers to points, e.g. "za dwa", "z wolnego"
      }
    }

    if (POLISH_NUMBER_WORDS[token] !== undefined) {
      const val = POLISH_NUMBER_WORDS[token];
      const found = roster.find((p) => p.number === val);
      return { number: val, player: found };
    }
  }

  // 3. Match by player last name or first name from roster
  for (const p of roster) {
    const last = p.lastName.toLowerCase();
    const first = p.firstName.toLowerCase();
    if (clean.includes(last) || clean.includes(first)) {
      return { number: p.number, player: p };
    }
  }

  return null;
}

// Action definition patterns for Polish basketball phrases
interface ActionPattern {
  type: ActionType;
  regexes: RegExp[];
  label: string;
  isOpponent?: boolean;
}

const ACTION_PATTERNS: ActionPattern[] = [
  // UNDO
  {
    type: 'MANUAL_OUR_MINUS_1', // placeholder, handled specifically
    regexes: [
      /\b(cofnij|anuluj|cofnij akcj[eę]|bł[aą]d|pomyłka)\b/i,
    ],
    label: 'Cofnij ostatnią akcję',
  },
  // REBOUNDS
  {
    type: 'OFF_REB',
    regexes: [
      /\bzbi[oó]rka\s+w\s+ataku\b/i,
      /\bzbi[oó]rka\s+ofensywn[aą]\b/i,
      /\bdeska\s+w\s+ataku\b/i,
      /\bofensywn[aą]\s+desk[aę]\b/i,
      /\bzebra[łl]\s+w\s+ataku\b/i,
      /\batak\s+zbi[oó]rka\b/i,
    ],
    label: 'Zbiórka w ataku',
  },
  {
    type: 'DEF_REB',
    regexes: [
      /\bzbi[oó]rka\s+w\s+obronie\b/i,
      /\bzbi[oó]rka\s+defensywn[aą]\b/i,
      /\bdeska\s+w\s+obronie\b/i,
      /\bdefensywn[aą]\s+desk[aę]\b/i,
      /\bzebra[łl]\s+w\s+obronie\b/i,
      /\bobrona\s+zbi[oó]rka\b/i,
      /\bzbi[oó]rka\b/i, // fallback if not offensive
      /\bdeska\b/i,
    ],
    label: 'Zbiórka w obronie',
  },

  // 2-POINT SHOTS
  {
    type: '2PT_MISS',
    regexes: [
      /\bpud[łl]o\s+za\s+dwa\b/i,
      /\bniecelny\s+za\s+dwa\b/i,
      /\bspud[łl]owa[łl]\s+za\s+dwa\b/i,
      /\bnie\s+trafi[łl]\s+za\s+dwa\b/i,
      /\bpud[łl]o\s+dw[oó]jka\b/i,
      /\bniecelna\s+dw[oó]jka\b/i,
      /\bblacha\s+za\s+dwa\b/i,
      /\bblacha\b/i,
    ],
    label: 'Pudło za 2 pkt',
  },
  {
    type: '2PT_MADE',
    regexes: [
      /\bcelny\s+za\s+dwa\b/i,
      /\bkosz\s+za\s+dwa\b/i,
      /\btrafi[łl]\s+za\s+dwa\b/i,
      /\bpunkty\s+za\s+dwa\b/i,
      /\bdwa\s+punkty\b/i,
      /\blayout?p\b/i,
      /\bwjazd\s+za\s+dwa\b/i,
      /\bwbi[łl]\s+za\s+dwa\b/i,
      /\bkosz\b/i, // default kosz = 2PT
    ],
    label: 'Celny rzut za 2 pkt',
  },

  // 3-POINT SHOTS
  {
    type: '3PT_MISS',
    regexes: [
      /\bpud[łl]o\s+za\s+trzy\b/i,
      /\bnieceln[ya]\s+tr[oó]jk[aęi]\b/i,
      /\bniecelny\s+za\s+trzy\b/i,
      /\bspud[łl]owa[łl]\s+za\s+trzy\b/i,
      /\bnie\s+trafi[łl]\s+za\s+trzy\b/i,
      /\bpud[łl]o\s+z\s+dystansu\b/i,
    ],
    label: 'Pudło za 3 pkt',
  },
  {
    type: '3PT_MADE',
    regexes: [
      /\bcelny\s+za\s+trzy\b/i,
      /\bceln[aą]\s+tr[oó]jk[aę]\b/i,
      /\btr[oó]jka\b/i,
      /\btrafi[łl]\s+za\s+trzy\b/i,
      /\btrzy\s+punkty\b/i,
      /\bkosz\s+za\s+trzy\b/i,
    ],
    label: 'Celna trójka (3 pkt)',
  },

  // FREE THROWS
  {
    type: 'FT_MISS',
    regexes: [
      /\bpud[łl]o\s+z\s+wolnego\b/i,
      /\bniecelny\s+wolny\b/i,
      /\bspud[łl]owa[łl]\s+wolny\b/i,
      /\bnie\s+trafi[łl]\s+wolnego\b/i,
      /\bpud[łl]o\s+za\s+jeden\b/i,
    ],
    label: 'Pudło z wolnego',
  },
  {
    type: 'FT_MADE',
    regexes: [
      /\bcelny\s+wolny\b/i,
      /\btrafi[łl]\s+wolny\b/i,
      /\btrafiony\s+wolny\b/i,
      /\bpunkt\s+z\s+wolnego\b/i,
      /\bjeden\s+celny\b/i,
      /\bosobisty\s+celny\b/i,
      /\bwolny\b/i,
    ],
    label: 'Celny wolny (1 pkt)',
  },

  // ASSISTS, STEALS, BLOCKS, TURNOVERS, FOULS
  {
    type: 'ASSIST',
    regexes: [
      /\basysta\b/i,
      /\basystowa[łl]\b/i,
      /\bdobre\s+podanie\b/i,
    ],
    label: 'Asysta',
  },
  {
    type: 'STEAL',
    regexes: [
      /\bprzechwyt\b/i,
      /\bprzechwyci[łl]\b/i,
      /\bukrad[łl]\b/i,
      /\bodbiera\s+pi[łl]k[eę]\b/i,
    ],
    label: 'Przechwyt',
  },
  {
    type: 'BLOCK',
    regexes: [
      /\bblok\b/i,
      /\bzablokowa[łl]\b/i,
      /\bczapa\b/i,
    ],
    label: 'Blok',
  },
  {
    type: 'TURNOVER',
    regexes: [
      /\bstrata\b/i,
      /\bstraci[łl]\s+pi[łl]k[eę]\b/i,
      /\bb[łl][aą]d\s+krok[oó]w\b/i,
      /\bkroki\b/i,
      /\bpodw[oó]jne\b/i,
      /\baut\b/i,
    ],
    label: 'Strata',
  },
  {
    type: 'FOUL',
    regexes: [
      /\bfaul\b/i,
      /\bfaulowa[łl]\b/i,
      /\bprzewinienie\b/i,
      /\bfaul\s+osobisty\b/i,
    ],
    label: 'Faul osobisty',
  },

  // OPPONENT ACTIONS
  {
    type: 'OPP_2PT',
    regexes: [
      /\b(?:przeciwnik|rywal)\s+(?:za\s+dwa|kosz|dwa\s+punkty)\b/i,
      /\bkosz\s+(?:przeciwnika|rywala)\b/i,
      /\bdwa\s+punkty\s+(?:przeciwnika|rywala)\b/i,
    ],
    label: 'Kosz przeciwnika (2 pkt)',
    isOpponent: true,
  },
  {
    type: 'OPP_3PT',
    regexes: [
      /\b(?:przeciwnik|rywal)\s+(?:za\s+trzy|tr[oó]jka|trzy\s+punkty)\b/i,
      /\btr[oó]jka\s+(?:przeciwnika|rywala)\b/i,
      /\btrzy\s+punkty\s+(?:przeciwnika|rywala)\b/i,
    ],
    label: 'Trójka przeciwnika (3 pkt)',
    isOpponent: true,
  },
  {
    type: 'OPP_1PT',
    regexes: [
      /\b(?:przeciwnik|rywal)\s+(?:wolny|punkt)\b/i,
      /\bpunkt\s+(?:przeciwnika|rywala)\b/i,
    ],
    label: 'Punkt przeciwnika (1 pkt)',
    isOpponent: true,
  },
  {
    type: 'OPP_FOUL',
    regexes: [
      /\bfaul\s+(?:przeciwnika|rywala)\b/i,
      /\bprzewinienie\s+(?:przeciwnika|rywala)\b/i,
      /\b(?:przeciwnik|rywal)\s+faul\b/i,
    ],
    label: 'Faul przeciwnika',
    isOpponent: true,
  },
];

// Helper to find action pattern in a text segment
function matchActionInSegment(segment: string): { action: ActionPattern; matchText: string } | null {
  for (const ap of ACTION_PATTERNS) {
    for (const rx of ap.regexes) {
      const m = segment.match(rx);
      if (m) {
        return { action: ap, matchText: m[0] };
      }
    }
  }
  return null;
}

/**
 * Main basketball natural language voice command parser
 * Handles compound sentences like: "dziesiątka zbiórka w ataku, pudło za dwa"
 */
export function parseBasketballVoiceCommand(
  rawText: string,
  roster: Player[],
  defaultPlayerId: string | null
): ParsedVoiceResult {
  const text = rawText.trim();
  if (!text) {
    return {
      originalText: rawText,
      actions: [],
      confidence: 'none',
      feedbackMessage: 'Nie rozpoznano mowy.',
    };
  }

  // Check for immediate UNDO command
  if (/\b(cofnij|anuluj|cofnij akcj[eę]|bł[aą]d|pomyłka)\b/i.test(text)) {
    return {
      originalText: text,
      actions: [
        {
          actionType: 'MANUAL_OUR_MINUS_1',
          team: 'our',
          label: 'Cofnij ostatnią akcję',
          isUndo: true,
        },
      ],
      confidence: 'high',
      feedbackMessage: 'Cofanie ostatniej akcji...',
    };
  }

  // Find default player object if provided
  const defaultPlayer = defaultPlayerId ? roster.find((p) => p.id === defaultPlayerId) : undefined;
  let activePlayerContext: Player | undefined = defaultPlayer;
  let activePlayerNumber: number | undefined = defaultPlayer?.number;

  // Split into clauses by comma, semicolons, or conjunctions ('i', 'oraz', 'a potem', 'potem')
  // But preserve the whole string context if no clause separator exists
  const rawClauses = text
    .split(/[,;.]|\s+(?:i|oraz|a potem|potem|następnie)\s+/i)
    .map((c) => c.trim())
    .filter(Boolean);

  const parsedActions: ParsedVoiceAction[] = [];

  for (const clause of rawClauses) {
    // Check if player is specified in this clause
    const playerInfo = extractPlayerNumber(clause, roster);
    if (playerInfo) {
      if (playerInfo.player) {
        activePlayerContext = playerInfo.player;
        activePlayerNumber = playerInfo.player.number;
      } else if (playerInfo.number !== undefined) {
        activePlayerNumber = playerInfo.number;
        const matched = roster.find((p) => p.number === playerInfo.number);
        activePlayerContext = matched;
      }
    }

    // Now check if this clause contains multiple sub-actions or single action
    // E.g. "zbiórka w ataku pudło za dwa" inside one clause
    const subMatches: { action: ActionPattern; index: number; matchText: string }[] = [];

    for (const ap of ACTION_PATTERNS) {
      if (ap.type === 'MANUAL_OUR_MINUS_1') continue;
      for (const rx of ap.regexes) {
        const m = rx.exec(clause);
        if (m && m.index !== undefined) {
          // avoid duplicate patterns overlapping
          const already = subMatches.some(
            (sm) => Math.abs(sm.index - m.index) < 4 || sm.action.type === ap.type
          );
          if (!already) {
            subMatches.push({ action: ap, index: m.index, matchText: m[0] });
          }
        }
      }
    }

    // Sort submatches by position in the clause
    subMatches.sort((a, b) => a.index - b.index);

    if (subMatches.length > 0) {
      for (const sm of subMatches) {
        const isOpp = sm.action.isOpponent || false;
        parsedActions.push({
          actionType: sm.action.type,
          playerId: !isOpp ? activePlayerContext?.id : undefined,
          playerNumber: !isOpp ? (activePlayerNumber ?? activePlayerContext?.number) : undefined,
          playerName: !isOpp && activePlayerContext
            ? `${activePlayerContext.firstName} ${activePlayerContext.lastName}`
            : undefined,
          team: isOpp ? 'opp' : 'our',
          label: isOpp
            ? sm.action.label
            : `${sm.action.label} ${activePlayerNumber ? `(#${activePlayerNumber})` : ''}`.trim(),
        });
      }
    } else if (playerInfo && parsedActions.length === 0) {
      // Clause had only player selection e.g. "wybierz dziesiątkę" or "numer dziesięć"
      parsedActions.push({
        actionType: 'MANUAL_OUR_PLUS_1', // dummy
        playerId: activePlayerContext?.id,
        playerNumber: activePlayerNumber,
        playerName: activePlayerContext ? `${activePlayerContext.firstName} ${activePlayerContext.lastName}` : undefined,
        team: 'our',
        label: `Wybór gracza #${activePlayerNumber}`,
        isSelectPlayerOnly: true,
      });
    }
  }

  // If no clauses matched through standard split, try searching whole text globally
  if (parsedActions.length === 0) {
    const globalPlayerInfo = extractPlayerNumber(text, roster);
    const num = globalPlayerInfo?.number ?? defaultPlayer?.number;
    const ply = globalPlayerInfo?.player ?? defaultPlayer;

    const matched = matchActionInSegment(text);
    if (matched) {
      const isOpp = matched.action.isOpponent || false;
      parsedActions.push({
        actionType: matched.action.type,
        playerId: !isOpp ? ply?.id : undefined,
        playerNumber: !isOpp ? num : undefined,
        playerName: !isOpp && ply ? `${ply.firstName} ${ply.lastName}` : undefined,
        team: isOpp ? 'opp' : 'our',
        label: isOpp ? matched.action.label : `${matched.action.label} ${num ? `(#${num})` : ''}`.trim(),
      });
    }
  }

  if (parsedActions.length > 0) {
    const summary = parsedActions.map((a) => a.label).join(' ➔ ');
    return {
      originalText: text,
      actions: parsedActions,
      confidence: 'high',
      feedbackMessage: `Rozpoznano: ${summary}`,
    };
  }

  return {
    originalText: text,
    actions: [],
    confidence: 'low',
    feedbackMessage: `Nie przypisano akcji koszykarskiej do: "${text}". Sprawdź podpowiedzi komend.`,
  };
}

/**
 * Optional server-side AI fallback parser using Gemini for complex natural language
 */
export async function parseWithGeminiFallback(
  text: string,
  roster: Player[]
): Promise<ParsedVoiceAction[]> {
  try {
    const response = await fetch('/api/parse-voice-command', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text,
        players: roster.map((p) => ({
          id: p.id,
          number: p.number,
          name: `${p.firstName} ${p.lastName}`,
        })),
      }),
    });

    if (!response.ok) return [];
    const data = await response.json();
    if (Array.isArray(data.actions)) {
      return data.actions;
    }
    return [];
  } catch (err) {
    console.warn('Gemini voice parse fallback failed:', err);
    return [];
  }
}

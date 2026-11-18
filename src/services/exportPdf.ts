import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  ChildMatchRecord,
  ChildProfile,
  Match,
  MatchEvent,
  Player,
  PlayerCareerAverages,
  PlayerMatchStats,
} from '../types/basketball';
import { calculatePlayerStats, calculateTeamStats } from './statsCalculator';
import { getClubProfile } from './db';
import { getPlayerFullName, resolveEventPlayerLabel } from './playerDisplay';

let cachedRegularFontBase64: string | null = null;
let cachedBoldFontBase64: string | null = null;

// Load font as Base64 for Polish Unicode characters (ą, ć, ę, ł, ń, ó, ś, ź, ż)
async function getFontBase64(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const buffer = await res.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    let binary = '';
    const chunk = 8192;
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)));
    }
    return btoa(binary);
  } catch (err) {
    console.warn('Nie udało się załadować czcionki z URL:', url, err);
    return null;
  }
}

async function preparePdfDocument(orientation: 'landscape' | 'portrait' = 'landscape'): Promise<jsPDF> {
  const doc = new jsPDF({
    orientation,
    unit: 'mm',
    format: 'a4',
  });

  if (!cachedRegularFontBase64) {
    cachedRegularFontBase64 = await getFontBase64('/fonts/LiberationSans-Regular.ttf');
  }
  if (!cachedBoldFontBase64) {
    cachedBoldFontBase64 = await getFontBase64('/fonts/LiberationSans-Bold.ttf');
  }

  if (cachedRegularFontBase64) {
    doc.addFileToVFS('LiberationSans-Regular.ttf', cachedRegularFontBase64);
    doc.addFont('LiberationSans-Regular.ttf', 'LiberationSans', 'normal');
  }
  if (cachedBoldFontBase64) {
    doc.addFileToVFS('LiberationSans-Bold.ttf', cachedBoldFontBase64);
    doc.addFont('LiberationSans-Bold.ttf', 'LiberationSans', 'bold');
  }

  // Set default font to LiberationSans if loaded, otherwise standard
  if (cachedRegularFontBase64) {
    doc.setFont('LiberationSans', 'normal');
  }

  return doc;
}

/**
 * Loads and prepares an image for jsPDF, supporting Base64 (PNG, JPEG, WebP) and URL sources.
 */
async function loadImageForPdf(src: string): Promise<{ data: string; format: string } | null> {
  if (!src) return null;
  if (src.startsWith('data:image/png')) {
    return { data: src, format: 'PNG' };
  }
  if (src.startsWith('data:image/jpeg') || src.startsWith('data:image/jpg')) {
    return { data: src, format: 'JPEG' };
  }
  // If it's a data URL of another type (e.g. webp) or a remote URL, render to canvas to convert to JPEG
  return new Promise((resolve) => {
    try {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = Math.min(img.width, 400);
          canvas.height = Math.round((img.height * canvas.width) / img.width);
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            resolve({ data: src, format: 'JPEG' });
            return;
          }
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          resolve({ data: canvas.toDataURL('image/jpeg', 0.85), format: 'JPEG' });
        } catch {
          resolve(null);
        }
      };
      img.onerror = () => resolve(null);
      img.src = src;
    } catch {
      resolve(null);
    }
  });
}

const ACTION_DESCRIPTIONS: Record<string, string> = {
  '2PT_MADE': 'Celny rzut za 2 pkt (+2)',
  '2PT_MISS': 'Niecelny rzut za 2 pkt',
  '3PT_MADE': 'Celny rzut za 3 pkt (+3)',
  '3PT_MISS': 'Niecelny rzut za 3 pkt',
  'FT_MADE': 'Celny rzut wolny (+1)',
  'FT_MISS': 'Niecelny rzut wolny',
  'OFF_REB': 'Zbiórka w ataku (ofensywna)',
  'DEF_REB': 'Zbiórka w obronie (defensywna)',
  'ASSIST': 'Asysta',
  'STEAL': 'Przechwyt piłki',
  'BLOCK': 'Blok',
  'TURNOVER': 'Strata piłki',
  'FOUL': 'Faul osobisty',
  'OPP_1PT': 'Punkt rywala (+1)',
  'OPP_2PT': 'Kosz rywala (+2)',
  'OPP_3PT': 'Trójka rywala (+3)',
  'OPP_MINUS_1': 'Korekta punktów rywala (-1)',
  'OPP_FOUL': 'Faul rywala',
  'MANUAL_OUR_PLUS_1': 'Ręczna korekta UKS (+1)',
  'MANUAL_OUR_PLUS_2': 'Ręczna korekta UKS (+2)',
  'MANUAL_OUR_PLUS_3': 'Ręczna korekta UKS (+3)',
  'MANUAL_OUR_MINUS_1': 'Ręczna korekta UKS (-1)',
};

// 1. Export Complete Match Report (Box Score + Leaders + Play-by-Play + Individual Player Pages with Photos)
export async function exportMatchPdf(
  match: Match,
  rosterPlayers: Player[],
  options: {
    includeBoxScore?: boolean;
    includePlayByPlay?: boolean;
    includePlayerPages?: boolean;
    includePersonalData?: boolean;
    titleSuffix?: string;
  } = { includeBoxScore: true, includePlayByPlay: true, includePlayerPages: true, includePersonalData: false }
) {
  const allowPii = Boolean(options.includePersonalData);
  const doc = await preparePdfDocument('landscape');
  const fontName = cachedRegularFontBase64 ? 'LiberationSans' : 'helvetica';
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  const clubProfile = await getClubProfile();
  const clubName = (clubProfile.name || 'Mój Klub Koszykarski').toUpperCase();
  const season = clubProfile.season || '2026/2027';

  const playerStatsList: PlayerMatchStats[] = rosterPlayers
    .map((p) => calculatePlayerStats(p, match.events, match))
    .sort((a, b) => b.eval - a.eval); // Default sorted by EVAL descending

  const teamTotals = calculateTeamStats(playerStatsList);

  // Top performers
  const topScorer = [...playerStatsList].sort((a, b) => b.pts - a.pts)[0];
  const topReb = [...playerStatsList].sort((a, b) => b.totReb - a.totReb)[0];
  const topAst = [...playerStatsList].sort((a, b) => b.ast - a.ast)[0];
  const topEval = playerStatsList[0];

  let currentY = 12;

  // Header Bar
  doc.setFillColor(10, 25, 47); // Dark Navy brand
  doc.rect(0, 0, pageWidth, 28, 'F');

  // Title & Club Branding
  doc.setFont(fontName, 'bold');
  doc.setFontSize(16);
  doc.setTextColor(245, 158, 11); // Amber
  doc.text(clubName, 14, 11);

  const categoryLabel =
    match.teamCategory && match.teamCategory !== 'TEAM'
      ? ` • KATEGORIA ${match.teamCategory}`
      : '';
  doc.setFontSize(10);
  doc.setTextColor(226, 232, 240); // Slate 200
  doc.text(`OFICJALNY PROTOKÓŁ STATYSTYCZNY MECZU${categoryLabel}`, 14, 18);

  doc.setFont(fontName, 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(148, 163, 184); // Slate 400
  doc.text(
    `Data: ${match.date}   |   Miejsce: ${match.location === 'Dom' ? 'Hala domowa (Dom)' : 'Wyjazd'}   |   Sezon: ${season}`,
    14,
    24
  );

  // Score Box on Right
  doc.setFont(fontName, 'bold');
  doc.setFontSize(12);
  doc.setTextColor(255, 255, 255);
  const scoreText = `WYNIK KOŃCOWY:  ${match.ourScore} : ${match.opponentScore}`;
  doc.text(scoreText, pageWidth - 14, 12, { align: 'right' });

  doc.setFontSize(9);
  doc.setTextColor(245, 158, 11);
  doc.text(
    `${clubProfile.shortName || clubProfile.name || 'Nasz Zespół'} vs ${match.opponent || 'Przeciwnik'}`,
    pageWidth - 14,
    18,
    { align: 'right' }
  );

  doc.setFont(fontName, 'normal');
  doc.setFontSize(8);
  doc.setTextColor(203, 213, 225);
  const quarterStr = `Q1: ${match.quarterScores.q1.our}-${match.quarterScores.q1.opp}   Q2: ${match.quarterScores.q2.our}-${match.quarterScores.q2.opp}   Q3: ${match.quarterScores.q3.our}-${match.quarterScores.q3.opp}   Q4: ${match.quarterScores.q4.our}-${match.quarterScores.q4.opp}${
    match.quarterScores.ot ? `   OT: ${match.quarterScores.ot.our}-${match.quarterScores.ot.opp}` : ''
  }`;
  doc.text(quarterStr, pageWidth - 14, 24, { align: 'right' });

  currentY = 32;

  // SECTION 1: BOX SCORE
  if (options.includeBoxScore) {
    doc.setFont(fontName, 'bold');
    doc.setFontSize(11);
    doc.setTextColor(15, 23, 42); // Slate 900
    doc.text('I. STATYSTYKI ZAWODNIKÓW (BOX SCORE - FIBA)', 14, currentY);

    const headers = [
      'Nr',
      'Zawodnik',
      'PTS',
      '+/-',
      '2PT (C/P)',
      '2P%',
      '3PT (C/P)',
      '3P%',
      'FG (C/P)',
      'FG%',
      'FT (C/P)',
      'FT%',
      'ZB Atak',
      'ZB Obr',
      'ZB Suma',
      'AST',
      'PRZ',
      'BLK',
      'STR',
      'FAULE',
      'EVAL',
    ];

    const bodyRows = playerStatsList.map((s) => [
      `#${s.playerNumber}`,
      allowPii ? s.playerName : `Zawodnik #${s.playerNumber}`,
      s.pts,
      s.plusMinus > 0 ? `+${s.plusMinus}` : `${s.plusMinus}`,
      `${s.fg2m}/${s.fg2a}`,
      `${s.fg2Pct}%`,
      `${s.fg3m}/${s.fg3a}`,
      `${s.fg3Pct}%`,
      `${s.fgm}/${s.fga}`,
      `${s.fgPct}%`,
      `${s.ftm}/${s.fta}`,
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
    ]);

    // Totals Row
    const teamDiff = match.ourScore - match.opponentScore;
    const totalsRow = [
      '-',
      'RAZEM DRUŻYNA',
      teamTotals.pts,
      teamDiff > 0 ? `+${teamDiff}` : `${teamDiff}`,
      `${teamTotals.fg2m}/${teamTotals.fg2a}`,
      `${teamTotals.fg2Pct}%`,
      `${teamTotals.fg3m}/${teamTotals.fg3a}`,
      `${teamTotals.fg3Pct}%`,
      `${teamTotals.fgm}/${teamTotals.fga}`,
      `${teamTotals.fgPct}%`,
      `${teamTotals.ftm}/${teamTotals.fta}`,
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
    ];

    autoTable(doc, {
      startY: currentY + 3,
      head: [headers],
      body: [...bodyRows, totalsRow],
      theme: 'grid',
      styles: {
        font: fontName,
        fontSize: 7.2,
        cellPadding: 1.3,
        textColor: [15, 23, 42],
        lineColor: [203, 213, 225],
        lineWidth: 0.1,
        valign: 'middle',
      },
      headStyles: {
        font: fontName,
        fontStyle: 'bold',
        fillColor: [15, 23, 42],
        textColor: [255, 255, 255],
        halign: 'center',
        fontSize: 7.2,
      },
      columnStyles: {
        0: { halign: 'center', fontStyle: 'bold', cellWidth: 9 },
        1: { halign: 'left', fontStyle: 'bold', cellWidth: 33 },
        2: { halign: 'center', fontStyle: 'bold', textColor: [180, 83, 9] }, // PTS
        3: { halign: 'center', fontStyle: 'bold' }, // +/-
        4: { halign: 'center' },
        5: { halign: 'center' },
        6: { halign: 'center' },
        7: { halign: 'center' },
        8: { halign: 'center' },
        9: { halign: 'center' },
        10: { halign: 'center' },
        11: { halign: 'center' },
        12: { halign: 'center' },
        13: { halign: 'center' },
        14: { halign: 'center', fontStyle: 'bold', textColor: [37, 99, 235] }, // ZB
        15: { halign: 'center', fontStyle: 'bold', textColor: [2, 132, 199] }, // AST
        16: { halign: 'center' },
        17: { halign: 'center' },
        18: { halign: 'center', textColor: [217, 119, 6] },
        19: { halign: 'center', textColor: [225, 29, 72] },
        20: { halign: 'center', fontStyle: 'bold', textColor: [5, 150, 105] }, // EVAL
      },
      didParseCell: (data) => {
        // Highlight totals row
        if (data.row.index === bodyRows.length) {
          data.cell.styles.fontStyle = 'bold';
          data.cell.styles.fillColor = [241, 245, 249];
        } else if (data.section === 'body' && data.column.index === 3) {
          const raw = String(data.cell.raw || '');
          if (raw.startsWith('+')) {
            data.cell.styles.textColor = [5, 150, 105]; // Emerald
          } else if (raw.startsWith('-')) {
            data.cell.styles.textColor = [225, 29, 72]; // Rose
          }
        }
      },
      margin: { left: 14, right: 14 },
    });

    // @ts-expect-error autoTable adds lastAutoTable to doc
    const autoTableFinalY: number = doc.lastAutoTable.finalY || 120;
    currentY = autoTableFinalY + 6;

    // Leaders Callout Strip
    doc.setFont(fontName, 'bold');
    doc.setFontSize(9);
    doc.setTextColor(15, 23, 42);
    doc.text('LIDERZY SPOTKANIA:', 14, currentY);

    doc.setFont(fontName, 'normal');
    doc.setFontSize(8);
    const leaderLabel = (s?: PlayerMatchStats) =>
      s ? (allowPii ? s.playerName : `Zawodnik #${s.playerNumber}`) : '-';
    const leadersText = `Punkty: ${topScorer ? `${leaderLabel(topScorer)} (${topScorer.pts} pkt)` : '-'}     |     Zbiórki: ${topReb ? `${leaderLabel(topReb)} (${topReb.totReb} zb)` : '-'}     |     Asysty: ${topAst ? `${leaderLabel(topAst)} (${topAst.ast} ast)` : '-'}     |     EVAL: ${topEval ? `${leaderLabel(topEval)} (${topEval.eval})` : '-'}`;
    doc.text(leadersText, 55, currentY);

    currentY += 5;

    // AI Coach Recap if available
    if (match.aiCoachRecap) {
      currentY += 2;
      doc.setFillColor(248, 250, 252);
      doc.setDrawColor(226, 232, 240);
      doc.roundedRect(14, currentY, pageWidth - 28, 18, 2, 2, 'FD');

      doc.setFont(fontName, 'bold');
      doc.setFontSize(8);
      doc.setTextColor(180, 83, 9);
      doc.text('KOMENTARZ TRENERSKI I ANALIZA MECZU:', 18, currentY + 5);

      doc.setFont(fontName, 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(51, 65, 85);
      const splitRecap = doc.splitTextToSize(match.aiCoachRecap, pageWidth - 36);
      doc.text(splitRecap.slice(0, 3), 18, currentY + 9.5);
    }
  }

  // SECTION 2: PLAY-BY-PLAY
  if (options.includePlayByPlay && match.events.length > 0) {
    // If we included Box Score, start Play-by-Play on a fresh page
    if (options.includeBoxScore) {
      doc.addPage('landscape');
    }

    let pbpY = 14;

    // Page Header for Play-by-Play
    doc.setFillColor(10, 25, 47);
    doc.rect(0, 0, pageWidth, 20, 'F');

    doc.setFont(fontName, 'bold');
    doc.setFontSize(13);
    doc.setTextColor(245, 158, 11);
    doc.text('PROTOKÓŁ ZDARZEŃ AKCJA PO AKCJI (PLAY-BY-PLAY)', 14, 10);

    doc.setFont(fontName, 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(226, 232, 240);
    doc.text(
      `Mecz: ${clubProfile.name} vs ${match.opponent}   |   Zarejestrowanych zdarzeń: ${match.events.length}`,
      14,
      16
    );

    pbpY = 26;

    const pbpHeaders = [
      'Lp.',
      'Kwarta',
      'Czas gry',
      'Wynik',
      'Drużyna / Zawodnik',
      'Zarejestrowana akcja / zdarzenie',
    ];

    const pbpRows = match.events.map((e, idx) => {
      const baseDesc = ACTION_DESCRIPTIONS[e.type] || e.type.replace('_', ' ');
      const desc = e.subType ? `${baseDesc} (${e.subType})` : baseDesc;
      const playerStr =
        e.team === 'opp' || e.type.startsWith('OPP')
          ? match.opponent || 'Przeciwnik'
          : e.playerId || e.playerNumber !== undefined
          ? resolveEventPlayerLabel(e, rosterPlayers, allowPii)
          : clubProfile.name;

      return [
        idx + 1,
        e.quarter > 4 ? 'OT' : `Q${e.quarter}`,
        e.gameClock,
        `${e.ourScoreAfter} : ${e.oppScoreAfter}`,
        playerStr,
        desc,
      ];
    });

    autoTable(doc, {
      startY: pbpY,
      head: [pbpHeaders],
      body: pbpRows,
      theme: 'striped',
      styles: {
        font: fontName,
        fontSize: 7.5,
        cellPadding: 1.5,
        textColor: [15, 23, 42],
        lineColor: [226, 232, 240],
        lineWidth: 0.1,
      },
      headStyles: {
        font: fontName,
        fontStyle: 'bold',
        fillColor: [15, 23, 42],
        textColor: [255, 255, 255],
        halign: 'center',
        fontSize: 8,
      },
      columnStyles: {
        0: { halign: 'center', cellWidth: 12 },
        1: { halign: 'center', fontStyle: 'bold', cellWidth: 18 },
        2: { halign: 'center', fontStyle: 'bold', cellWidth: 20 },
        3: { halign: 'center', fontStyle: 'bold', textColor: [180, 83, 9], cellWidth: 24 },
        4: { halign: 'left', fontStyle: 'bold', cellWidth: 60 },
        5: { halign: 'left' },
      },
      margin: { left: 14, right: 14, bottom: 14 },
    });
  }

  // ==============================================================
  // 3. INDIVIDUAL PLAYER STATS PAGES (KARTA ZAWODNIKA ZE ZDJĘCIEM)
  // ==============================================================
  if (options.includePlayerPages !== false && rosterPlayers && rosterPlayers.length > 0) {
    const sortedPlayersForPages = [...rosterPlayers].sort((a, b) => a.number - b.number);

    for (const player of sortedPlayersForPages) {
      doc.addPage('a4', 'landscape');
      const pStats = calculatePlayerStats(player, match.events, match);
      const pEvents = match.events.filter((e) => e.playerId === player.id);

      // Top Navy Header Bar
      doc.setFillColor(10, 25, 47);
      doc.rect(0, 0, pageWidth, 22, 'F');

      doc.setFont(fontName, 'bold');
      doc.setFontSize(13);
      doc.setTextColor(245, 158, 11); // Amber
      doc.text(`${clubName} • INDYWIDUALNY RAPORT MECZOWY ZAWODNIKA`, 14, 9);

      doc.setFont(fontName, 'normal');
      doc.setFontSize(8);
      doc.setTextColor(226, 232, 240);
      const playerMatchCat =
        match.teamCategory && match.teamCategory !== 'TEAM'
          ? `   |   Kategoria: ${match.teamCategory}`
          : '';
      doc.text(
        `Mecz: ${clubProfile.shortName || clubProfile.name || 'Nasz Zespół'} ${match.ourScore} : ${match.opponentScore} ${match.opponent || 'Rywal'}${playerMatchCat}   |   Data: ${match.date} (${match.location})   |   Sezon: ${season}`,
        14,
        16
      );

      // Score Callout Right
      doc.setFont(fontName, 'bold');
      doc.setFontSize(10);
      doc.setTextColor(255, 255, 255);
      doc.text(
        `WYNIK: ${match.ourScore} : ${match.opponentScore}`,
        pageWidth - 14,
        13,
        { align: 'right' }
      );

      // -------------------------------------------------------------
      // LEFT COLUMN: Player Identity Card & Photo (x: 14, y: 25, w: 72, h: 173)
      // -------------------------------------------------------------
      doc.setFillColor(248, 250, 252);
      doc.setDrawColor(226, 232, 240);
      doc.roundedRect(14, 25, 72, 173, 3, 3, 'FD');

      // Player Photo Frame (x: 20, y: 30, w: 60, h: 60) — rendered only when personal data opt-in is enabled
      let photoRendered = false;
      if (allowPii && player.photo) {
        try {
          const imgObj = await loadImageForPdf(player.photo);
          if (imgObj) {
            doc.addImage(imgObj.data, imgObj.format, 20, 30, 60, 60, undefined, 'FAST');
            doc.setDrawColor(245, 158, 11);
            doc.setLineWidth(0.6);
            doc.roundedRect(20, 30, 60, 60, 2, 2, 'D');
            photoRendered = true;
          }
        } catch (e) {
          console.warn('Could not render player photo in PDF:', e);
        }
      }

      if (!photoRendered) {
        // Fallback Jersey Box
        doc.setFillColor(15, 23, 42);
        doc.roundedRect(20, 30, 60, 60, 2, 2, 'F');
        doc.setDrawColor(245, 158, 11);
        doc.setLineWidth(0.8);
        doc.roundedRect(20, 30, 60, 60, 2, 2, 'D');

        doc.setFont(fontName, 'bold');
        doc.setFontSize(26);
        doc.setTextColor(245, 158, 11);
        doc.text(`#${player.number}`, 50, 62, { align: 'center' });

        doc.setFontSize(8.5);
        doc.setTextColor(148, 163, 184);
        doc.text(player.position || 'ZAWODNIK', 50, 74, { align: 'center' });
      }

      // Name & Number Banner below photo
      doc.setFillColor(15, 23, 42);
      doc.roundedRect(20, 93, 60, 13, 2, 2, 'F');

      doc.setFont(fontName, 'bold');
      doc.setFontSize(12);
      doc.setTextColor(245, 158, 11);
      doc.text(`#${player.number}`, 23, 102);

      doc.setFontSize(9.5);
      doc.setTextColor(255, 255, 255);
      const rawFullName = allowPii ? getPlayerFullName(player) : `Zawodnik #${player.number}`;
      const shortBannerName =
        allowPii && rawFullName.length > 17 && player.firstName?.trim() && player.lastName?.trim()
          ? `${player.firstName.trim()[0]}. ${player.lastName.trim()}`
          : rawFullName;
      doc.text(shortBannerName, 34, 102);

      // Player Meta Info
      doc.setFont(fontName, 'bold');
      doc.setFontSize(8);
      doc.setTextColor(71, 85, 105);
      doc.text('Pozycja:', 20, 114);
      doc.setFont(fontName, 'normal');
      doc.setTextColor(15, 23, 42);
      doc.text(player.position || 'Zawodnik', 45, 114);

      doc.setFont(fontName, 'bold');
      doc.setTextColor(71, 85, 105);
      doc.text('Klub:', 20, 120);
      doc.setFont(fontName, 'normal');
      doc.setTextColor(15, 23, 42);
      doc.text(clubProfile.shortName || clubProfile.name || 'Nasz Zespół', 45, 120);

      if (match.teamCategory && match.teamCategory !== 'TEAM') {
        doc.setFont(fontName, 'bold');
        doc.setTextColor(71, 85, 105);
        doc.text('Kategoria:', 20, 126);
        doc.setFont(fontName, 'normal');
        doc.setTextColor(15, 23, 42);
        doc.text(match.teamCategory, 45, 126);
      } else {
        doc.setFont(fontName, 'bold');
        doc.setTextColor(71, 85, 105);
        doc.text('Sezon:', 20, 126);
        doc.setFont(fontName, 'normal');
        doc.setTextColor(15, 23, 42);
        doc.text(season, 45, 126);
      }

      if (allowPii && player.notes) {
        doc.setFont(fontName, 'bold');
        doc.setTextColor(71, 85, 105);
        doc.text('Notatki:', 20, 132);
        doc.setFont(fontName, 'normal');
        doc.setFontSize(7);
        doc.setTextColor(51, 65, 85);
        const splitNotes = doc.splitTextToSize(player.notes, 58);
        doc.text(splitNotes, 20, 137);
      }

      // Summary Box at bottom of left card
      doc.setFillColor(241, 245, 249);
      doc.roundedRect(20, 150, 60, 42, 2, 2, 'F');

      doc.setFont(fontName, 'bold');
      doc.setFontSize(7.5);
      doc.setTextColor(15, 23, 42);
      doc.text('WPŁYW NA WYNIK MECZU:', 23, 156);

      doc.setFont(fontName, 'normal');
      doc.setFontSize(7);
      doc.setTextColor(71, 85, 105);
      const teamPoints = teamTotals.pts || match.ourScore;
      const sharePct = teamPoints > 0 ? Math.round((pStats.pts / teamPoints) * 100) : 0;
      doc.text(`• Udział w punktach: ${sharePct}% zespołu`, 23, 162);
      doc.text(`• Bilans na parkiecie (+/-): ${pStats.plusMinus > 0 ? `+${pStats.plusMinus}` : pStats.plusMinus} pkt`, 23, 168);
      doc.text(`• Skuteczność z gry: ${pStats.fgPct}% (${pStats.fgm}/${pStats.fga})`, 23, 174);
      doc.text(`• Akcje w meczu: ${pEvents.length} zarejestrowanych`, 23, 180);
      const evalRating = pStats.eval >= 15 ? 'MVP / Bardzo wysoka' : pStats.eval >= 8 ? 'Wysoka / Solidna' : pStats.eval >= 0 ? 'Pozytywna' : 'Wymaga poprawy';
      doc.text(`• Ocena efektywności: ${evalRating}`, 23, 186);

      // -------------------------------------------------------------
      // RIGHT COLUMN: Performance & Stats (x: 89, y: 25, w: 194)
      // -------------------------------------------------------------
      // 1. Big Hero KPI Tiles (5 tiles in a row)
      const kpis = [
        { label: 'PUNKTY (PTS)', val: `${pStats.pts}`, sub: `2P:${pStats.fg2m}/${pStats.fg2a} 3P:${pStats.fg3m}/${pStats.fg3a} FT:${pStats.ftm}/${pStats.fta}`, bg: [254, 243, 199], border: [245, 158, 11], text: [180, 83, 9] },
        { label: 'FIBA EVAL', val: `${pStats.eval}`, sub: `Bilans +/-: ${pStats.plusMinus > 0 ? `+${pStats.plusMinus}` : pStats.plusMinus}`, bg: [209, 250, 229], border: [16, 185, 129], text: [4, 120, 87] },
        { label: 'ZBIÓRKI (REB)', val: `${pStats.totReb}`, sub: `Atak: ${pStats.offReb} | Obrona: ${pStats.defReb}`, bg: [224, 242, 254], border: [14, 165, 233], text: [3, 105, 161] },
        { label: 'ASYSTY (AST)', val: `${pStats.ast}`, sub: 'Podania punktowe', bg: [243, 232, 255], border: [168, 85, 247], text: [126, 34, 206] },
        { label: 'OBRONA & FAULE', val: `${pStats.stl}S / ${pStats.blk}B`, sub: `Faule: ${pStats.fouls}/5 | Straty: ${pStats.tov}`, bg: [254, 226, 226], border: [239, 68, 68], text: [185, 28, 28] },
      ];

      const kpiW = 36.8;
      const kpiGap = 2.5;
      kpis.forEach((kpi, idx) => {
        const kX = 89 + idx * (kpiW + kpiGap);
        doc.setFillColor(kpi.bg[0], kpi.bg[1], kpi.bg[2]);
        doc.setDrawColor(kpi.border[0], kpi.border[1], kpi.border[2]);
        doc.roundedRect(kX, 25, kpiW, 22, 2, 2, 'FD');

        doc.setFont(fontName, 'bold');
        doc.setFontSize(6.2);
        doc.setTextColor(kpi.text[0], kpi.text[1], kpi.text[2]);
        doc.text(kpi.label, kX + kpiW / 2, 30, { align: 'center' });

        doc.setFontSize(12.5);
        doc.text(kpi.val, kX + kpiW / 2, 38.5, { align: 'center' });

        doc.setFont(fontName, 'normal');
        doc.setFontSize(5.8);
        doc.setTextColor(71, 85, 105);
        doc.text(kpi.sub, kX + kpiW / 2, 44, { align: 'center' });
      });

      // 2. Detailed Shooting & Element breakdown table
      const shootingHeaders = ['Kategoria rzutu / element', 'Celne (M)', 'Oddane (A)', 'Skuteczność %', 'Punkty'];
      const shootingRows = [
        ['Rzuty za 2 punkty (z gry)', pStats.fg2m, pStats.fg2a, `${pStats.fg2Pct}%`, `${pStats.fg2m * 2} pkt`],
        ['Rzuty za 3 punkty (trójki)', pStats.fg3m, pStats.fg3a, `${pStats.fg3Pct}%`, `${pStats.fg3m * 3} pkt`],
        ['Wszystkie rzuty z gry (FG)', pStats.fgm, pStats.fga, `${pStats.fgPct}%`, `${pStats.fg2m * 2 + pStats.fg3m * 3} pkt`],
        ['Rzuty wolne (osobiste FT)', pStats.ftm, pStats.fta, `${pStats.ftPct}%`, `${pStats.ftm} pkt`],
        ['Zbiórki (Ofensywne OREB / Defensywne DREB)', `${pStats.offReb} atak`, `${pStats.defReb} obrona`, '-', `${pStats.totReb} łącznie`],
        ['Podania i straty (AST / TOV)', `${pStats.ast} asyst`, `${pStats.tov} strat`, pStats.tov > 0 ? (pStats.ast / pStats.tov).toFixed(1) : `${pStats.ast}.0`, 'Wskaźnik AST/TO'],
        ['Obrona i dyscyplina (STL / BLK / FOULS)', `${pStats.stl} przechwyt`, `${pStats.blk} blok`, `${pStats.fouls}/5 fauli`, pStats.fouls >= 5 ? 'WYKLUCZONY' : 'Aktywny'],
      ];

      autoTable(doc, {
        startY: 50,
        head: [shootingHeaders],
        body: shootingRows,
        theme: 'grid',
        styles: {
          font: fontName,
          fontSize: 7,
          cellPadding: 1.1,
          textColor: [15, 23, 42],
          lineColor: [226, 232, 240],
          lineWidth: 0.1,
        },
        headStyles: {
          font: fontName,
          fontStyle: 'bold',
          fillColor: [15, 23, 42],
          textColor: [255, 255, 255],
          halign: 'center',
          fontSize: 7.2,
        },
        columnStyles: {
          0: { halign: 'left', fontStyle: 'bold', cellWidth: 72 },
          1: { halign: 'center', cellWidth: 28 },
          2: { halign: 'center', cellWidth: 28 },
          3: { halign: 'center', fontStyle: 'bold', cellWidth: 32 },
          4: { halign: 'center', fontStyle: 'bold', textColor: [180, 83, 9], cellWidth: 34 },
        },
        margin: { left: 89, right: 14 },
      });

      // 3. Per-Quarter Scoring Bar
      const qScores: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
      pEvents.forEach((ev) => {
        if (ev.points && ev.points > 0) {
          const q = Math.min(ev.quarter, 5);
          qScores[q] = (qScores[q] || 0) + ev.points;
        }
      });

      const qY = 99;
      doc.setFont(fontName, 'bold');
      doc.setFontSize(7.5);
      doc.setTextColor(15, 23, 42);
      doc.text('ZDOBYCZ PUNKTOWA WG KWART:', 89, qY);

      const qBoxW = 36.8;
      const qNames = ['1. Kwarta (Q1)', '2. Kwarta (Q2)', '3. Kwarta (Q3)', '4. Kwarta (Q4)', 'Dogrywka (OT)'];
      [1, 2, 3, 4, 5].forEach((qNum, idx) => {
        const qX = 89 + idx * (qBoxW + kpiGap);
        const pts = qScores[qNum] || 0;
        doc.setFillColor(pts > 0 ? 254 : 248, pts > 0 ? 243 : 250, pts > 0 ? 199 : 252);
        doc.setDrawColor(pts > 0 ? 245 : 226, pts > 0 ? 158 : 232, pts > 0 ? 11 : 240);
        doc.roundedRect(qX, qY + 2, qBoxW, 11, 1.5, 1.5, 'FD');

        doc.setFont(fontName, 'bold');
        doc.setFontSize(6.2);
        doc.setTextColor(71, 85, 105);
        doc.text(qNames[idx], qX + qBoxW / 2, qY + 6, { align: 'center' });

        doc.setFontSize(8.5);
        doc.setTextColor(pts > 0 ? 180 : 148, pts > 0 ? 83 : 163, pts > 0 ? 9 : 184);
        doc.text(`${pts} pkt`, qX + qBoxW / 2, qY + 10.5, { align: 'center' });
      });

      // 4. Chronological Play Log for this player in this match
      const pbpTitleY = 117;
      const totalPlayerEvents = pEvents.length;
      const MAX_PBP_PAGE_1 = 15;
      const hasContinuation = totalPlayerEvents > MAX_PBP_PAGE_1;

      doc.setFont(fontName, 'bold');
      doc.setFontSize(7.5);
      doc.setTextColor(15, 23, 42);
      if (hasContinuation) {
        doc.text(`KRONIKA AKCJI ZAWODNIKA W TYM MECZU (akcje 1–${MAX_PBP_PAGE_1} z ${totalPlayerEvents} • dalszy ciąg na str. 2):`, 89, pbpTitleY);
      } else {
        doc.text(`KRONIKA AKCJI ZAWODNIKA W TYM MECZU (${totalPlayerEvents} zdarzeń - pełna lista):`, 89, pbpTitleY);
      }

      const pEventsFormatted = pEvents.map((ev, idx) => {
        const actionLabel = ACTION_DESCRIPTIONS[ev.type] || ev.type.replace('_', ' ');
        return [
          idx + 1,
          ev.quarter > 4 ? 'OT' : `Q${ev.quarter}`,
          ev.gameClock,
          actionLabel,
          ev.points > 0 ? `+${ev.points}` : '-',
          `${ev.ourScoreAfter} : ${ev.oppScoreAfter}`,
        ];
      });

      if (pEventsFormatted.length === 0) {
        doc.setFillColor(248, 250, 252);
        doc.roundedRect(89, pbpTitleY + 2.5, 194, 18, 2, 2, 'F');
        doc.setFont(fontName, 'normal');
        doc.setFontSize(7.5);
        doc.setTextColor(148, 163, 184);
        doc.text('Zawodnik nie zanotował bezpośrednich akcji w protokole.', 186, pbpTitleY + 12, { align: 'center' });
      } else {
        const firstBatch = hasContinuation ? pEventsFormatted.slice(0, MAX_PBP_PAGE_1) : pEventsFormatted;
        const pageCountBefore = doc.getNumberOfPages();

        autoTable(doc, {
          startY: pbpTitleY + 2.5,
          head: [['Lp.', 'Kwarta', 'Czas', 'Zdarzenie meczowe', 'Punkty', 'Stan meczu']],
          body: firstBatch,
          theme: 'striped',
          styles: {
            font: fontName,
            fontSize: 6.2,
            cellPadding: { top: 0.65, bottom: 0.65, left: 0.8, right: 0.8 },
            textColor: [15, 23, 42],
            lineColor: [226, 232, 240],
            lineWidth: 0.1,
          },
          headStyles: {
            font: fontName,
            fontStyle: 'bold',
            fillColor: [30, 41, 59],
            textColor: [255, 255, 255],
            halign: 'center',
            fontSize: 6.6,
            cellPadding: { top: 0.8, bottom: 0.8, left: 0.8, right: 0.8 },
          },
          columnStyles: {
            0: { halign: 'center', cellWidth: 10 },
            1: { halign: 'center', fontStyle: 'bold', cellWidth: 18 },
            2: { halign: 'center', cellWidth: 18 },
            3: { halign: 'left', fontStyle: 'bold', cellWidth: 98 },
            4: { halign: 'center', fontStyle: 'bold', textColor: [16, 185, 129], cellWidth: 20 },
            5: { halign: 'center', fontStyle: 'bold', textColor: [180, 83, 9], cellWidth: 30 },
          },
          margin: { left: 89, right: 14, bottom: 12 },
        });

        // If player has more events than fit on Page 1, add footer note on Page 1 and continuation page
        if (hasContinuation) {
          doc.setPage(pageCountBefore);
          const finalY = (doc as any).lastAutoTable?.finalY || 178;
          doc.setFont(fontName, 'bold');
          doc.setFontSize(6.5);
          doc.setTextColor(180, 83, 9);
          doc.text(
            `* Wyświetlono akcje 1–${MAX_PBP_PAGE_1} z ${totalPlayerEvents}. Kompletny wykaz pozostałych ${totalPlayerEvents - MAX_PBP_PAGE_1} akcji znajduje się na kolejnej stronie ->`,
            89,
            Math.min(pageHeight - 11, finalY + 3.5)
          );

          // Continuation Page for remaining events
          doc.addPage('a4', 'landscape');

          // Top Navy Header Bar
          doc.setFillColor(10, 25, 47);
          doc.rect(0, 0, pageWidth, 22, 'F');

          doc.setFont(fontName, 'bold');
          doc.setFontSize(13);
          doc.setTextColor(245, 158, 11);
          const contHeaderName = allowPii
            ? `#${player.number} ${getPlayerFullName(player)}`
            : `Zawodnik #${player.number}`;
          doc.text(`${clubName} • ${contHeaderName} • PEŁNA KRONIKA AKCJI MECZOWYCH (KONTYNUACJA)`, 14, 9);

          doc.setFont(fontName, 'normal');
          doc.setFontSize(8);
          doc.setTextColor(226, 232, 240);
          const contCat =
            match.teamCategory && match.teamCategory !== 'TEAM'
              ? `   |   Kategoria: ${match.teamCategory}`
              : '';
          doc.text(
            `Mecz: ${clubProfile.shortName || clubProfile.name || 'Nasz Zespół'} ${match.ourScore} : ${match.opponentScore} ${match.opponent || 'Rywal'}${contCat}   |   Data: ${match.date}   |   Akcje ${MAX_PBP_PAGE_1 + 1}–${totalPlayerEvents} (łącznie ${totalPlayerEvents} w meczu)`,
            14,
            16
          );

          doc.setFont(fontName, 'bold');
          doc.setFontSize(10);
          doc.setTextColor(255, 255, 255);
          doc.text(
            `WYNIK: ${match.ourScore} : ${match.opponentScore}`,
            pageWidth - 14,
            13,
            { align: 'right' }
          );

          // Player KPI Summary Ribbon
          doc.setFillColor(248, 250, 252);
          doc.setDrawColor(226, 232, 240);
          doc.roundedRect(14, 25, pageWidth - 28, 9, 2, 2, 'FD');

          doc.setFont(fontName, 'bold');
          doc.setFontSize(7);
          doc.setTextColor(71, 85, 105);
          doc.text(
            `PODSUMOWANIE GRACZA:  PTS: ${pStats.pts} (${pStats.fgm}/${pStats.fga} FG, ${pStats.ftm}/${pStats.fta} FT)  •  +/-: ${pStats.plusMinus > 0 ? `+${pStats.plusMinus}` : pStats.plusMinus}  •  EVAL: ${pStats.eval}  •  ZBIÓRKI: ${pStats.totReb} (${pStats.offReb} atak / ${pStats.defReb} obrona)  •  ASYSTY: ${pStats.ast}  •  PRZECHWYTY: ${pStats.stl}  •  BLOKI: ${pStats.blk}  •  FAULE: ${pStats.fouls}/5  •  STRATY: ${pStats.tov}`,
            18,
            31
          );

          // Full-width Continuation Table with remaining events
          const remainingEvents = pEventsFormatted.slice(MAX_PBP_PAGE_1);
          autoTable(doc, {
            startY: 37,
            head: [['Lp.', 'Kwarta', 'Czas gry', 'Zdarzenie meczowe / akcja zawodnika', 'Punkty', 'Stan meczu po akcji']],
            body: remainingEvents,
            theme: 'striped',
            styles: {
              font: fontName,
              fontSize: 7,
              cellPadding: 1.2,
              textColor: [15, 23, 42],
              lineColor: [226, 232, 240],
              lineWidth: 0.1,
            },
            headStyles: {
              font: fontName,
              fontStyle: 'bold',
              fillColor: [30, 41, 59],
              textColor: [255, 255, 255],
              halign: 'center',
              fontSize: 7.5,
            },
            columnStyles: {
              0: { halign: 'center', cellWidth: 14 },
              1: { halign: 'center', fontStyle: 'bold', cellWidth: 24 },
              2: { halign: 'center', cellWidth: 26 },
              3: { halign: 'left', fontStyle: 'bold' },
              4: { halign: 'center', fontStyle: 'bold', textColor: [16, 185, 129], cellWidth: 28 },
              5: { halign: 'center', fontStyle: 'bold', textColor: [180, 83, 9], cellWidth: 38 },
            },
            margin: { left: 14, right: 14, bottom: 12, top: 26 },
            didDrawPage: (data) => {
              if (data.pageNumber > 1) {
                doc.setFillColor(10, 25, 47);
                doc.rect(0, 0, pageWidth, 22, 'F');
                doc.setFont(fontName, 'bold');
                doc.setFontSize(12);
                doc.setTextColor(245, 158, 11);
                const contHeaderName2 = allowPii
                  ? `#${player.number} ${getPlayerFullName(player)}`
                  : `Zawodnik #${player.number}`;
                doc.text(`${clubName} • ${contHeaderName2} • PEŁNA KRONIKA AKCJI (KONTYNUACJA)`, 14, 9);
                doc.setFont(fontName, 'normal');
                doc.setFontSize(8);
                doc.setTextColor(226, 232, 240);
                doc.text(`Mecz vs ${match.opponent || 'Rywal'} • Dalszy ciąg kroniki zdarzeń`, 14, 16);
              }
            },
          });
        }
      }
    }
  }

  // Footer on all pages
  const totalPages = doc.getNumberOfPages();
  const dateGenerated = new Date().toLocaleString('pl-PL');

  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFont(fontName, 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(148, 163, 184);
    doc.text(
      `${clubProfile.name} • Oficjalny protokół meczowy • Wygenerowano: ${dateGenerated}`,
      14,
      pageHeight - 6
    );
    doc.text(`Strona ${i} z ${totalPages}`, pageWidth - 14, pageHeight - 6, { align: 'right' });
  }

  // Trigger Save / Download
  const cleanOpponent = (match.opponent || 'Mecz').replace(/[^a-zA-Z0-9ąćęłńóśźżĄĆĘŁŃÓŚŹŻ_-]/g, '_');
  const cleanClub = (clubProfile.shortName || clubProfile.name || 'Druzyna').replace(/[^a-zA-Z0-9ąćęłńóśźżĄĆĘŁŃÓŚŹŻ_-]/g, '_');
  const catSlug = match.teamCategory && match.teamCategory !== 'TEAM' ? `_${match.teamCategory}` : '';
  const filename = `${cleanClub}${catSlug}_vs_${cleanOpponent}_${match.date || 'mecz'}.pdf`;

  doc.save(filename);
}

// 2. Export Only Box Score to PDF
export async function exportBoxScorePdf(
  match: Match,
  rosterPlayers: Player[],
  options?: { includePersonalData?: boolean }
) {
  return exportMatchPdf(match, rosterPlayers, {
    includeBoxScore: true,
    includePlayByPlay: false,
    includePersonalData: options?.includePersonalData ?? false,
    titleSuffix: 'BoxScore',
  });
}

// 3. Export Only Play-by-Play to PDF
export async function exportPlayByPlayPdf(
  match: Match,
  rosterPlayers: Player[] = [],
  options?: { includePersonalData?: boolean }
) {
  return exportMatchPdf(match, rosterPlayers, {
    includeBoxScore: false,
    includePlayByPlay: true,
    includePersonalData: options?.includePersonalData ?? false,
    titleSuffix: 'PlayByPlay',
  });
}

// 4. Export Season Averages Summary PDF (anonymized or with full names)
export async function exportSeasonStatsPdf(
  seasonAverages: PlayerCareerAverages[],
  matchesCount: number,
  options: {
    seasonLabel?: string;
    includePersonalData?: boolean;
    summary?: {
      wins: number;
      losses: number;
      ties: number;
      winRate: number;
      ppgScored: string;
      ppgConceded: string;
    };
  } = {}
) {
  const allowPii = Boolean(options.includePersonalData);
  const doc = await preparePdfDocument('landscape');
  const fontName = cachedRegularFontBase64 ? 'LiberationSans' : 'helvetica';
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  const clubProfile = await getClubProfile();
  const clubName = (clubProfile.name || 'Moja Drużyna Koszykarska').toUpperCase();
  const seasonLabel = options.seasonLabel && options.seasonLabel !== 'all'
    ? options.seasonLabel
    : (clubProfile.season || 'Wszystkie sezony');

  doc.setFillColor(10, 25, 47);
  doc.rect(0, 0, pageWidth, 28, 'F');

  doc.setFont(fontName, 'bold');
  doc.setFontSize(16);
  doc.setTextColor(245, 158, 11);
  doc.text(clubName, 14, 11);

  doc.setFontSize(10);
  doc.setTextColor(226, 232, 240);
  doc.text(
    `RAPORT STATYSTYK SEZONOWYCH (${allowPii ? 'PEŁNY' : 'ZANONIMIZOWANY'})`,
    14,
    18
  );

  doc.setFont(fontName, 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(148, 163, 184);
  doc.text(
    `Zakres: ${seasonLabel}   |   Rozegrane mecze: ${matchesCount}   |   Tryb: ${allowPii ? 'Pełne dane zawodników' : 'Tylko numery na koszulkach'}`,
    14,
    24
  );

  if (options.summary) {
    doc.setFont(fontName, 'bold');
    doc.setFontSize(11);
    doc.setTextColor(255, 255, 255);
    doc.text(
      `BILANS: ${options.summary.wins}W – ${options.summary.losses}L${options.summary.ties > 0 ? ` (${options.summary.ties}R)` : ''} (${options.summary.winRate}%)`,
      pageWidth - 14,
      13,
      { align: 'right' }
    );
    doc.setFont(fontName, 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(203, 213, 225);
    doc.text(
      `Śr. zdobyte: ${options.summary.ppgScored} pkt/mecz   |   Śr. stracone: ${options.summary.ppgConceded} pkt/mecz`,
      pageWidth - 14,
      20,
      { align: 'right' }
    );
  }

  const headers = [
    'Nr',
    'Zawodnik',
    'Mecze',
    'PPG',
    'Suma PTS',
    'RPG',
    'Suma ZB',
    'APG',
    'Suma AST',
    'SPG',
    'BPG',
    'FG %',
    'FT %',
    'Śr. EVAL',
    'Rekord',
  ];

  const rows = seasonAverages.map((p) => [
    `#${p.playerNumber}`,
    allowPii ? p.playerName : `Zawodnik #${p.playerNumber}`,
    p.gamesPlayed,
    p.ppg,
    p.totalPts,
    p.rpg,
    p.totalReb,
    p.apg,
    p.totalAst,
    p.spg,
    p.bpg,
    `${p.fgPct}%`,
    `${p.ftPct}%`,
    p.evalAvg,
    `${p.highScore} pkt`,
  ]);

  autoTable(doc, {
    startY: 34,
    head: [headers],
    body: rows,
    theme: 'grid',
    styles: {
      font: fontName,
      fontSize: 7.5,
      cellPadding: 1.5,
      textColor: [15, 23, 42],
      lineColor: [203, 213, 225],
      lineWidth: 0.1,
      valign: 'middle',
    },
    headStyles: {
      font: fontName,
      fontStyle: 'bold',
      fillColor: [15, 23, 42],
      textColor: [255, 255, 255],
      halign: 'center',
      fontSize: 7.5,
    },
    columnStyles: {
      0: { halign: 'center', fontStyle: 'bold', cellWidth: 12 },
      1: { halign: 'left', fontStyle: 'bold', cellWidth: 42 },
      2: { halign: 'center' },
      3: { halign: 'center', fontStyle: 'bold', textColor: [180, 83, 9] },
      4: { halign: 'center' },
      5: { halign: 'center', textColor: [37, 99, 235] },
      6: { halign: 'center' },
      7: { halign: 'center', textColor: [2, 132, 199] },
      8: { halign: 'center' },
      9: { halign: 'center' },
      10: { halign: 'center' },
      11: { halign: 'center' },
      12: { halign: 'center' },
      13: { halign: 'center', fontStyle: 'bold', textColor: [5, 150, 105] },
      14: { halign: 'center', fontStyle: 'bold', textColor: [180, 83, 9] },
    },
    margin: { left: 14, right: 14, bottom: 14 },
  });

  const totalPages = doc.getNumberOfPages();
  const dateGenerated = new Date().toLocaleString('pl-PL');
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFont(fontName, 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(148, 163, 184);
    doc.text(
      `${clubProfile.name} • Statystyki sezonowe • Wygenerowano: ${dateGenerated}`,
      14,
      pageHeight - 6
    );
    doc.text(`Strona ${i} z ${totalPages}`, pageWidth - 14, pageHeight - 6, { align: 'right' });
  }

  const cleanClub = (clubProfile.shortName || clubProfile.name || 'Druzyna').replace(/[^a-zA-Z0-9ąćęłńóśźżĄĆĘŁŃÓŚŹŻ_-]/g, '_');
  const cleanSeason = seasonLabel.replace(/[^a-zA-Z0-9_-]/g, '_');
  const privacyTag = allowPii ? 'Pelny' : 'Zanonimizowany';
  doc.save(`${cleanClub}_Srednie_${cleanSeason}_${privacyTag}.pdf`);
}

// ==========================================
// 5. Export Child Match Card / Performance Report
// ==========================================
export async function exportChildMatchPdf(
  record: ChildMatchRecord,
  child: ChildProfile,
  options: { includePersonalData?: boolean } = { includePersonalData: false }
) {
  const allowPii = Boolean(options.includePersonalData);
  // Portrait A4 certificate/stat-sheet
  const doc = await preparePdfDocument('portrait');
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  // Background Header Banner
  doc.setFillColor(15, 23, 42); // slate-900
  doc.rect(0, 0, pageWidth, 42, 'F');

  // Accent Line
  doc.setFillColor(249, 115, 22); // orange-500
  doc.rect(0, 42, pageWidth, 2.5, 'F');

  // Title in Banner
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(18);
  doc.text(`KARTA MECZOWA ZAWODNIKA`, 14, 18);

  doc.setFontSize(10);
  doc.setTextColor(203, 213, 225); // slate-300
  doc.text(
    `RAPORT RODZICA • ${allowPii ? 'WERSJA PEŁNA' : 'WERSJA ZANONIMIZOWANA'} • STATYSTYKI INDYWIDUALNE`,
    14,
    26
  );

  doc.setFontSize(9);
  doc.setTextColor(148, 163, 184); // slate-400
  doc.text(`Wygenerowano z aplikacji BasketStats Pro • Data: ${record.date}`, 14, 34);

  // Child Badge & Info Card
  doc.setFillColor(248, 250, 252); // slate-50
  doc.roundedRect(14, 50, pageWidth - 28, 38, 3, 3, 'F');
  doc.setDrawColor(226, 232, 240); // slate-200
  doc.roundedRect(14, 50, pageWidth - 28, 38, 3, 3, 'S');

  // Player Name & Number
  doc.setTextColor(15, 23, 42);
  doc.setFontSize(16);
  doc.text(
    allowPii ? `#${record.childNumber} ${record.childName}` : `Zawodnik #${record.childNumber}`,
    20,
    62
  );

  doc.setFontSize(10);
  doc.setTextColor(71, 85, 105);
  const birthInfo = allowPii ? `  •  Rocznik: ${child.birthYear || 'Młodzieżowy'}` : '';
  doc.text(`Klub: ${record.childClub}  •  Kategoria: ${record.childCategory}${birthInfo}`, 20, 70);
  doc.text(`Pozycja: ${child.position || 'Zawodnik'}  •  Mecz: ${record.location === 'Dom' ? 'U siebie' : 'Wyjazd'} vs ${record.opponent}`, 20, 77);

  if (record.finalTeamScoreOur !== undefined && record.finalTeamScoreOpp !== undefined) {
    doc.setFontSize(11);
    doc.setTextColor(15, 23, 42);
    doc.text(`Wynik końcowy drużyny: ${record.childClub} ${record.finalTeamScoreOur} : ${record.finalTeamScoreOpp} ${record.opponent}`, 20, 84);
  }

  // Key KPI Stat Boxes (PTS, FG%, FT%, REB, AST, STL, BLK, EVAL, +/-)
  let yPos = 94;
  const fga = record.fg2a + record.fg3a;
  const fgm = record.fg2m + record.fg3m;
  const fgPct = fga > 0 ? Math.round((fgm / fga) * 100) : 0;
  const ftPct = record.fta > 0 ? Math.round((record.ftm / record.fta) * 100) : 0;
  const minutesPlayed = Math.round(record.secondsPlayed / 60);

  const statBoxes = [
    { label: 'PUNKTY', value: `${record.pts}`, sub: `${fgm}/${fga} z gry (${fgPct}%)`, color: [249, 115, 22] },
    { label: 'FIBA EVAL', value: `${record.eval}`, sub: 'Efektywność ogólna', color: [16, 185, 129] },
    { label: 'ZBIÓRKI', value: `${record.totReb}`, sub: `Def: ${record.defReb} • Off: ${record.offReb}`, color: [59, 130, 246] },
    { label: 'ASYSTY', value: `${record.ast}`, sub: 'Kluczowe podania', color: [139, 92, 246] },
    { label: 'PRZECHWYTY', value: `${record.stl}`, sub: 'Obrona na piłce', color: [236, 72, 153] },
    { label: 'BLOKI', value: `${record.blk}`, sub: 'Zablokowane rzuty', color: [20, 184, 166] },
    { label: '+/- RATING', value: record.plusMinus > 0 ? `+${record.plusMinus}` : `${record.plusMinus}`, sub: 'Bilans na parkiecie', color: [234, 179, 8] },
    { label: 'CZAS GRY', value: `${minutesPlayed} min`, sub: `${record.fouls}/5 fauli • ${record.tov} strat`, color: [100, 116, 139] },
  ];

  const colWidth = (pageWidth - 28 - 9) / 4; // 4 columns
  const rowHeight = 22;

  statBoxes.forEach((box, i) => {
    const col = i % 4;
    const row = Math.floor(i / 4);
    const bx = 14 + col * (colWidth + 3);
    const by = yPos + row * (rowHeight + 3);

    doc.setFillColor(241, 245, 249); // slate-100
    doc.roundedRect(bx, by, colWidth, rowHeight, 2, 2, 'F');
    doc.setDrawColor(203, 213, 225);
    doc.roundedRect(bx, by, colWidth, rowHeight, 2, 2, 'S');

    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    doc.text(box.label, bx + 5, by + 6);

    doc.setFontSize(13);
    doc.setTextColor(box.color[0], box.color[1], box.color[2]);
    doc.text(box.value, bx + 5, by + 14);

    doc.setFontSize(6.5);
    doc.setTextColor(100, 116, 139);
    doc.text(box.sub, bx + 5, by + 19);
  });

  // Table with complete breakdown
  yPos += 52;

  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text('SZCZEGÓŁOWY PROTOKÓŁ ZDARZEŃ ZAWODNIKA', 14, yPos);

  const tableData = [
    [
      'Rzuty za 2 pkt',
      `${record.fg2m} celnych / ${record.fg2a} prób`,
      record.fg2a > 0 ? `${Math.round((record.fg2m / record.fg2a) * 100)}%` : '-',
      `${record.fg2m * 2} pkt`,
    ],
    [
      'Rzuty za 3 pkt',
      `${record.fg3m} celnych / ${record.fg3a} prób`,
      record.fg3a > 0 ? `${Math.round((record.fg3m / record.fg3a) * 100)}%` : '-',
      `${record.fg3m * 3} pkt`,
    ],
    [
      'Rzuty wolne (1 pkt)',
      `${record.ftm} celnych / ${record.fta} prób`,
      record.fta > 0 ? `${Math.round((record.ftm / record.fta) * 100)}%` : '-',
      `${record.ftm} pkt`,
    ],
    ['Zbiórki w obronie', `${record.defReb}`, '-', '-'],
    ['Zbiórki w ataku', `${record.offReb}`, '-', '-'],
    ['Asysty', `${record.ast}`, '-', '-'],
    ['Przechwyty piłki', `${record.stl}`, '-', '-'],
    ['Bloki', `${record.blk}`, '-', '-'],
    ['Straty', `${record.tov}`, '-', '-'],
    ['Faule osobiste', `${record.fouls} (limit 5)`, '-', '-'],
    ['Wskaźnik +/-', record.plusMinus > 0 ? `+${record.plusMinus}` : `${record.plusMinus}`, '-', '-'],
    ['Wskaźnik EVAL (FIBA)', `${record.eval}`, '-', '-'],
  ];

  autoTable(doc, {
    startY: yPos + 3,
    head: [['Element gry', 'Wynik / Próby', 'Skuteczność %', 'Punkty']],
    body: tableData,
    theme: 'grid',
    headStyles: {
      fillColor: [15, 23, 42],
      textColor: [255, 255, 255],
      fontSize: 8.5,
      halign: 'left',
    },
    bodyStyles: {
      fontSize: 8,
      textColor: [30, 41, 59],
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252],
    },
    margin: { left: 14, right: 14 },
  });

  // Highlights & Notes Section
  const finalY = (doc as any).lastAutoTable?.finalY || yPos + 75;

  if (record.highlights && record.highlights.length > 0) {
    doc.setFontSize(10);
    doc.setTextColor(15, 23, 42);
    doc.text('NAJLEPSZE MOMENTY & WYRÓŻNIENIA:', 14, finalY + 8);

    doc.setFontSize(8.5);
    doc.setTextColor(71, 85, 105);
    record.highlights.forEach((h, idx) => {
      doc.text(`• ${h}`, 18, finalY + 14 + idx * 5.5);
    });
  }

  if (record.notes) {
    const notesY = finalY + (record.highlights ? record.highlights.length * 5.5 : 0) + 16;
    doc.setFontSize(10);
    doc.setTextColor(15, 23, 42);
    doc.text('KOMENTARZ RODZICA:', 14, notesY);

    doc.setFontSize(8.5);
    doc.setTextColor(71, 85, 105);
    const splitNotes = doc.splitTextToSize(record.notes, pageWidth - 28);
    doc.text(splitNotes, 14, notesY + 5.5);
  }

  // Footer
  doc.setFontSize(7.5);
  doc.setTextColor(148, 163, 184);
  doc.text('BasketStats Pro • Dedykowany moduł statystyk dla rodziców młodych koszykarzy', 14, pageHeight - 8);

  const cleanChildName = allowPii
    ? record.childName.replace(/[^a-zA-Z0-9ąćęłńóśźżĄĆĘŁŃÓŚŹŻ_-]/g, '_')
    : `Zawodnik_${record.childNumber}`;
  const cleanOpponent = record.opponent.replace(/[^a-zA-Z0-9ąćęłńóśźżĄĆĘŁŃÓŚŹŻ_-]/g, '_');
  doc.save(`Karta_${cleanChildName}_vs_${cleanOpponent}_${record.date}.pdf`);
}


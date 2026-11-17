export type TileFontFamily = 'mono' | 'sans' | 'display' | 'serif';
export type TileFontWeight = 'normal' | 'semibold' | 'bold' | 'extrabold' | 'black';
export type TileCornerRadius = 'rounded-none' | 'rounded-lg' | 'rounded-xl' | 'rounded-2xl' | 'rounded-3xl' | 'rounded-full';

export interface ActionTileStyle {
  id: string;
  name: string;
  bgGradient: string; // CSS background (e.g. gradient or hex)
  borderColor: string;
  textColor: string;
  subTextColor: string;
  height: number; // in pixels (e.g. 56, 64, 76, 88)
  fontSizePrimary: number; // main score/abbrev text in px
  fontSizeSecondary: number; // sub label text in px
  fontFamily: TileFontFamily;
  fontWeight: TileFontWeight;
  borderRadius: TileCornerRadius;
  shadow: string;
}

export interface ScoreboardStyle {
  bgStyle: string;
  borderColor: string;
  scoreColorOur: string;
  scoreColorOpp: string;
  scoreFontSize: number; // in px
  clockColor: string;
  clockFontSize: number; // in px
  clockBg: string;
  fontFamily: TileFontFamily;
  borderRadius: TileCornerRadius;
}

export interface PlayerCardStyle {
  cardMinHeight: number;
  bgSelected: string;
  bgUnselected: string;
  borderSelected: string;
  borderUnselected: string;
  textSelected: string;
  textUnselected: string;
  nameFontSize: number;
  numberFontSize: number;
  ptsFontSize: number;
  evalFontSize: number;
  plusMinusFontSize: number;
  fontFamily: TileFontFamily;
  borderRadius: TileCornerRadius;
}

export type ActionTileKey =
  | 'twoPointMade'
  | 'twoPointMiss'
  | 'threePointMade'
  | 'threePointMiss'
  | 'ftMade'
  | 'ftMiss'
  | 'offReb'
  | 'defReb'
  | 'assist'
  | 'steal'
  | 'block'
  | 'turnover'
  | 'foul'
  | 'oppScoring'
  | 'undo';

export interface LiveMatchTheme {
  id: string;
  name: string;
  scoreboard: ScoreboardStyle;
  playerCards: PlayerCardStyle;
  actionTiles: Record<ActionTileKey, ActionTileStyle>;
}

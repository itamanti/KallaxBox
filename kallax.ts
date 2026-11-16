export type ShelfOrientation = 'vertical' | 'horizontal' | 'frontal';

export interface GameBox {
  id: string;
  name: string;
  bggId?: number;
  width: number; // in cm (scatola larghezza)
  height: number; // in cm (scatola altezza)
  depth: number; // in cm (scatola spessore / profondità)
  thumbnail?: string;
  image?: string;
  year?: number;
  players?: string;
  playtime?: number;
  minAge?: number;
  weight?: number; // 1-5 complexity
  rating?: number; // 1-10 BGG rating
  description?: string; // Sinossi / descrizione da BGG
  dimensionSource?: string; // Fonte delle dimensioni (es. "BGG", "Ricerca Web", "BG Stats", "Note BG Stats", "Catalogo", "Manuale")
  color?: string; // Hex color for 3D spine visualization
  notes?: string;
}

export interface PlacedBox {
  id: string; // unique placement id
  gameId: string;
  cubeRow: number;
  cubeCol: number;
  orientation: ShelfOrientation;
  rotation90: number; // 0, 90, 180, 270
  order: number; // stack or row index
  posX?: number; // cm from left edge of cube [0, cubeWidth - boxWidth]
  posY?: number; // cm from floor of cube [0, cubeHeight - boxHeight]
  lastMovedAt?: number; // Timestamp of user interaction/drag for tie-breaking
}

export interface KallaxConfig {
  rows: number;
  cols: number;
  cubeWidth: number; // standard 33.5 cm
  cubeHeight: number; // standard 33.5 cm
  cubeDepth: number; // standard 39.0 cm
  shelfColor: 'white' | 'black-brown' | 'oak' | 'grey';
  name: string;
}

export interface ShelfUnit {
  id: string;
  name: string;
  config: KallaxConfig;
  placedBoxes: PlacedBox[];
}

export interface EffectiveDimensions {
  displayWidth: number; // cm visible across the cube width (max 33.5)
  displayHeight: number; // cm visible along the cube height (max 33.5)
  shelfDepth: number; // cm extending into the cube depth (max 39.0)
}

export interface CubeSpaceAnalysis {
  row: number;
  col: number;
  totalVolumeCm3: number;
  usedVolumeCm3: number;
  volumePercent: number; // Practical shelf capacity occupied % (e.g. 66% instead of raw 15%)
  rawVolumePercent: number; // Raw volumetric ratio %
  usableSpacePercent: number;
  remainingVolumeLiters: number;
  usedVolumeLiters: number;
  totalVolumeLiters: number;
  
  // Linear measurements for spatial fit
  totalWidthUsed: number;
  remainingWidth: number;
  totalHeightUsed: number;
  remainingHeight: number;
  maxDepthUsed: number;
  remainingDepth: number;

  isWidthOverflow: boolean;
  isHeightOverflow: boolean;
  isDepthOverflow: boolean;
  isOverflowing: boolean;
  
  boxCount: number;
  dominantLayout: 'vertical' | 'horizontal' | 'frontal' | 'mixed' | 'empty';
}

export interface FitCheckResult {
  canFit: boolean;
  reason?: string;
  suggestedOrientation?: ShelfOrientation;
  suggestedRotation?: number;
}

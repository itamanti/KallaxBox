import {
  GameBox,
  PlacedBox,
  ShelfOrientation,
  EffectiveDimensions,
  CubeSpaceAnalysis,
  FitCheckResult,
} from '../types/kallax';
import { lookupBoardGameInfo, parseDimensionsFromText } from '../data/boardGameDatabase';

/**
 * Calculates the effective spatial dimensions of a box inside a shelf compartment
 * based on its placement orientation and 90-degree rotation.
 */
export function getEffectiveDimensions(
  box: { width: number; height: number; depth: number },
  orientation: ShelfOrientation,
  rotation90: number = 0
): EffectiveDimensions {
  const normRot = ((rotation90 % 360) + 360) % 360;
  const isRotated90or270 = normRot === 90 || normRot === 270;

  const safeW = typeof box?.width === 'number' && !isNaN(box.width) && box.width > 0 ? box.width : 29.7;
  const safeH = typeof box?.height === 'number' && !isNaN(box.height) && box.height > 0 ? box.height : 29.7;
  const safeD = typeof box?.depth === 'number' && !isNaN(box.depth) && box.depth > 0 ? box.depth : 7.2;

  let displayWidth = safeW;
  let displayHeight = safeH;
  let shelfDepth = safeD;

  switch (orientation) {
    case 'vertical':
      // Bookshelf spine-out mode:
      // The thickness (depth) faces front across the shelf width.
      // The box height stands up vertically (or width if turned 90°).
      // The box width goes into shelf depth (or height if turned 90°).
      if (!isRotated90or270) {
        displayWidth = safeD;
        displayHeight = safeH;
        shelfDepth = safeW;
      } else {
        displayWidth = safeD;
        displayHeight = safeW;
        shelfDepth = safeH;
      }
      break;

    case 'horizontal':
      // Flat stacked mode:
      // The box lies flat on the shelf floor or on another box.
      // Thickness (depth) is its vertical contribution to the stack.
      if (!isRotated90or270) {
        displayWidth = box.width;
        displayHeight = box.depth;
        shelfDepth = box.height;
      } else {
        displayWidth = box.height;
        displayHeight = box.depth;
        shelfDepth = box.width;
      }
      break;

    case 'frontal':
      // Showcase mode:
      // Cover faces the user directly.
      if (!isRotated90or270) {
        displayWidth = box.width;
        displayHeight = box.height;
        shelfDepth = box.depth;
      } else {
        displayWidth = box.height;
        displayHeight = box.width;
        shelfDepth = box.depth;
      }
      break;
  }

  return {
    displayWidth: Math.round(displayWidth * 10) / 10,
    displayHeight: Math.round(displayHeight * 10) / 10,
    shelfDepth: Math.round(shelfDepth * 10) / 10,
  };
}

/**
 * Calculates volume and spatial clearance for a specific cube compartment.
 */
export function calculateCubeSpace(
  cubeWidth: number,
  cubeHeight: number,
  cubeDepth: number,
  placedBoxes: PlacedBox[],
  gamesMap: Record<string, GameBox>
): CubeSpaceAnalysis {
  const totalVolumeCm3 = cubeWidth * cubeHeight * cubeDepth;
  const totalVolumeLiters = totalVolumeCm3 / 1000;

  if (placedBoxes.length === 0) {
    return {
      row: 0,
      col: 0,
      totalVolumeCm3,
      usedVolumeCm3: 0,
      volumePercent: 0,
      rawVolumePercent: 0,
      usableSpacePercent: 0,
      remainingVolumeLiters: totalVolumeLiters,
      usedVolumeLiters: 0,
      totalVolumeLiters,
      totalWidthUsed: 0,
      remainingWidth: cubeWidth,
      totalHeightUsed: 0,
      remainingHeight: cubeHeight,
      maxDepthUsed: 0,
      remainingDepth: cubeDepth,
      isWidthOverflow: false,
      isHeightOverflow: false,
      isDepthOverflow: false,
      isOverflowing: false,
      boxCount: 0,
      dominantLayout: 'empty',
    };
  }

  let totalVolumeUsedCm3 = 0;
  let totalWidthUsed = 0;
  let totalHeightUsed = 0;
  let maxDepthUsed = 0;

  let verticalCount = 0;
  let horizontalCount = 0;
  let frontalCount = 0;

  for (const placed of placedBoxes) {
    const game = gamesMap[placed.gameId];
    if (!game) continue;

    const boxVolume = game.width * game.height * game.depth;
    totalVolumeUsedCm3 += boxVolume;

    const eff = getEffectiveDimensions(game, placed.orientation, placed.rotation90);
    maxDepthUsed = Math.max(maxDepthUsed, eff.shelfDepth);

    if (placed.orientation === 'vertical') {
      verticalCount++;
      totalWidthUsed += eff.displayWidth;
      totalHeightUsed = Math.max(totalHeightUsed, eff.displayHeight);
    } else if (placed.orientation === 'horizontal') {
      horizontalCount++;
      totalHeightUsed += eff.displayHeight;
      totalWidthUsed = Math.max(totalWidthUsed, eff.displayWidth);
    } else {
      frontalCount++;
      totalWidthUsed = Math.max(totalWidthUsed, eff.displayWidth);
      totalHeightUsed = Math.max(totalHeightUsed, eff.displayHeight);
    }
  }

  let dominantLayout: 'vertical' | 'horizontal' | 'frontal' | 'mixed' | 'empty' = 'empty';
  if (placedBoxes.length === 0) {
    dominantLayout = 'empty';
  } else if (verticalCount > 0 && horizontalCount === 0 && frontalCount === 0) {
    dominantLayout = 'vertical';
  } else if (horizontalCount > 0 && verticalCount === 0 && frontalCount === 0) {
    dominantLayout = 'horizontal';
  } else if (frontalCount > 0 && verticalCount === 0 && horizontalCount === 0) {
    dominantLayout = 'frontal';
  } else {
    dominantLayout = 'mixed';
  }

  const horizontalBoxes = placedBoxes.filter((p) => p.orientation === 'horizontal');
  const otherBoxes = placedBoxes.filter((p) => p.orientation !== 'horizontal');

  if (dominantLayout === 'horizontal') {
    // Pure horizontal stack: all boxes lie flat on top of each other
    totalHeightUsed = 0;
    totalWidthUsed = 0;
    for (const placed of placedBoxes) {
      const game = gamesMap[placed.gameId];
      if (!game) continue;
      const eff = getEffectiveDimensions(game, placed.orientation, placed.rotation90);
      totalHeightUsed += eff.displayHeight;
      totalWidthUsed = Math.max(totalWidthUsed, eff.displayWidth);
    }
  } else if (dominantLayout === 'vertical' || dominantLayout === 'frontal') {
    // Bookshelf mode: boxes sit side-by-side on the shelf floor
    totalWidthUsed = 0;
    totalHeightUsed = 0;
    for (const placed of placedBoxes) {
      const game = gamesMap[placed.gameId];
      if (!game) continue;
      const eff = getEffectiveDimensions(game, placed.orientation, placed.rotation90);
      totalWidthUsed += eff.displayWidth;
      totalHeightUsed = Math.max(totalHeightUsed, eff.displayHeight);
    }
  } else {
    // Mixed layout: horizontal boxes form a stack on the shelf floor,
    // and vertical/frontal boxes sit beside the stack on the shelf floor!
    let horizStackWidth = 0;
    let horizStackHeight = 0;
    for (const placed of horizontalBoxes) {
      const game = gamesMap[placed.gameId];
      if (!game) continue;
      const eff = getEffectiveDimensions(game, placed.orientation, placed.rotation90);
      horizStackHeight += eff.displayHeight;
      horizStackWidth = Math.max(horizStackWidth, eff.displayWidth);
    }

    let otherWidth = 0;
    let otherHeight = 0;
    for (const placed of otherBoxes) {
      const game = gamesMap[placed.gameId];
      if (!game) continue;
      const eff = getEffectiveDimensions(game, placed.orientation, placed.rotation90);
      otherWidth += eff.displayWidth;
      otherHeight = Math.max(otherHeight, eff.displayHeight);
    }

    totalWidthUsed = Math.round((horizStackWidth + otherWidth) * 10) / 10;
    totalHeightUsed = Math.round(Math.max(horizStackHeight, otherHeight) * 10) / 10;
  }

  // If boxes have explicit valid 2D coordinates that fit cleanly without overflow (e.g. stacked or staged):
  const allHaveCoords = placedBoxes.length > 0 && placedBoxes.every((p) => p.posX !== undefined && p.posY !== undefined);
  if (allHaveCoords) {
    let maxExtX = 0;
    let maxExtY = 0;
    for (const p of placedBoxes) {
      const g = gamesMap[p.gameId];
      if (!g) continue;
      const eff = getEffectiveDimensions(g, p.orientation, p.rotation90);
      maxExtX = Math.max(maxExtX, (p.posX ?? 0) + eff.displayWidth);
      maxExtY = Math.max(maxExtY, (p.posY ?? 0) + eff.displayHeight);
    }
    if (maxExtX <= cubeWidth + 0.1 && maxExtY <= cubeHeight + 0.1) {
      totalWidthUsed = Math.round(maxExtX * 10) / 10;
      totalHeightUsed = Math.round(maxExtY * 10) / 10;
    }
  }

  const isWidthOverflow = totalWidthUsed > cubeWidth + 0.1;
  const isHeightOverflow = totalHeightUsed > cubeHeight + 0.1;
  const isDepthOverflow = maxDepthUsed > cubeDepth + 0.1;
  const isVolumeOverflow = totalVolumeUsedCm3 > totalVolumeCm3;
  const isOverflowing = isWidthOverflow || isHeightOverflow || isDepthOverflow || isVolumeOverflow;

  const usedVolumeLiters = Math.round((totalVolumeUsedCm3 / 1000) * 10) / 10;
  const remainingVolumeLiters = Math.max(0, Math.round(((totalVolumeCm3 - totalVolumeUsedCm3) / 1000) * 10) / 10);
  const rawVolumePercent = Math.min(100, Math.round((totalVolumeUsedCm3 / totalVolumeCm3) * 100));

  // Compute practical usable shelf space occupancy:
  // For bookshelf (vertical): shelf width is the primary constraint. 22.2 cm / 33.5 cm = 66% full!
  // For stacked (horizontal): shelf height is the primary constraint.
  // For frontal: takes the full face.
  let usableSpacePercent = 0;
  if (dominantLayout === 'vertical') {
    usableSpacePercent = Math.round((totalWidthUsed / cubeWidth) * 100);
  } else if (dominantLayout === 'horizontal') {
    usableSpacePercent = Math.round((totalHeightUsed / cubeHeight) * 100);
  } else if (dominantLayout === 'frontal') {
    usableSpacePercent = Math.round(Math.max((totalWidthUsed / cubeWidth) * 100, (totalHeightUsed / cubeHeight) * 100));
  } else {
    // mixed layout
    const widthPct = (totalWidthUsed / cubeWidth) * 100;
    const heightPct = (totalHeightUsed / cubeHeight) * 100;
    usableSpacePercent = Math.round(Math.max(widthPct, heightPct, rawVolumePercent));
  }

  const volumePercent = Math.min(100, Math.max(0, usableSpacePercent));

  return {
    row: placedBoxes[0]?.cubeRow ?? 0,
    col: placedBoxes[0]?.cubeCol ?? 0,
    totalVolumeCm3,
    usedVolumeCm3: totalVolumeUsedCm3,
    volumePercent,
    rawVolumePercent,
    usableSpacePercent,
    remainingVolumeLiters,
    usedVolumeLiters,
    totalVolumeLiters: Math.round(totalVolumeLiters * 10) / 10,
    totalWidthUsed: Math.round(totalWidthUsed * 10) / 10,
    remainingWidth: Math.max(0, Math.round((cubeWidth - totalWidthUsed) * 10) / 10),
    totalHeightUsed: Math.round(totalHeightUsed * 10) / 10,
    remainingHeight: Math.max(0, Math.round((cubeHeight - totalHeightUsed) * 10) / 10),
    maxDepthUsed: Math.round(maxDepthUsed * 10) / 10,
    remainingDepth: Math.max(0, Math.round((cubeDepth - maxDepthUsed) * 10) / 10),
    isWidthOverflow,
    isHeightOverflow,
    isDepthOverflow,
    isOverflowing,
    boxCount: placedBoxes.length,
    dominantLayout,
  };
}

export interface PlacementAnomaly {
  hasAnomalies: boolean;
  reason?: string;
}

/**
 * Checks if a compartment has any placement anomalies:
 * - individual box exceeding width, height, or depth
 * - cumulative width overflow, height overflow, depth overflow, or volume overflow
 * - boxes positioned outside shelf boundaries or overlapping
 */
export function checkPlacementAnomalies(
  cubeWidth: number,
  cubeHeight: number,
  cubeDepth: number,
  placedBoxes: PlacedBox[],
  gamesMap: Record<string, GameBox>,
  boxes2D?: { id: string; x: number; y: number; width: number; height: number }[]
): PlacementAnomaly {
  if (placedBoxes.length === 0) {
    return { hasAnomalies: false };
  }

  // 1. Check individual box dimensions against the physical cube bounds
  for (const placed of placedBoxes) {
    const game = gamesMap[placed.gameId];
    if (!game) continue;
    const eff = getEffectiveDimensions(game, placed.orientation, placed.rotation90);
    if (eff.displayWidth > cubeWidth + 0.1) {
      return {
        hasAnomalies: true,
        reason: `"${game.name}" supera la larghezza del vano (${eff.displayWidth} cm > ${cubeWidth} cm).`,
      };
    }
    if (eff.displayHeight > cubeHeight + 0.1) {
      return {
        hasAnomalies: true,
        reason: `"${game.name}" supera l'altezza del vano (${eff.displayHeight} cm > ${cubeHeight} cm).`,
      };
    }
    if (eff.shelfDepth > cubeDepth + 0.1) {
      return {
        hasAnomalies: true,
        reason: `"${game.name}" sporge oltre la profondità del vano (${eff.shelfDepth} cm > ${cubeDepth} cm).`,
      };
    }
  }

  // 2. Check cumulative space analysis (width, height, depth, volume)
  const space = calculateCubeSpace(cubeWidth, cubeHeight, cubeDepth, placedBoxes, gamesMap);
  if (space.isWidthOverflow) {
    return {
      hasAnomalies: true,
      reason: `Larghezza superata: ${space.totalWidthUsed} cm usati su ${cubeWidth} cm max.`,
    };
  }
  if (space.isHeightOverflow) {
    return {
      hasAnomalies: true,
      reason: `Altezza superata: ${space.totalHeightUsed} cm usati su ${cubeHeight} cm max.`,
    };
  }
  if (space.isDepthOverflow) {
    return {
      hasAnomalies: true,
      reason: `Profondità superata: ${space.maxDepthUsed} cm su ${cubeDepth} cm max.`,
    };
  }
  if (space.isOverflowing) {
    return {
      hasAnomalies: true,
      reason: `Capienza fisica del vano Kallax superata.`,
    };
  }

  // 3. Check 2D coordinate boundaries and overlaps if 2D boxes provided
  if (boxes2D && boxes2D.length > 0) {
    for (const b of boxes2D) {
      if (b.x < -0.1 || b.y < -0.1) {
        return {
          hasAnomalies: true,
          reason: `Una scatola è posizionata oltre i bordi del vano.`,
        };
      }
      if (b.x + b.width > cubeWidth + 0.1) {
        return {
          hasAnomalies: true,
          reason: `Una scatola sporge lateralmente oltre il bordo del vano.`,
        };
      }
      if (b.y + b.height > cubeHeight + 0.1) {
        return {
          hasAnomalies: true,
          reason: `Una scatola sporge superiormente oltre il bordo del vano.`,
        };
      }
    }

    for (let i = 0; i < boxes2D.length; i++) {
      for (let j = i + 1; j < boxes2D.length; j++) {
        const left = Math.max(boxes2D[i].x, boxes2D[j].x);
        const right = Math.min(boxes2D[i].x + boxes2D[i].width, boxes2D[j].x + boxes2D[j].width);
        const bottom = Math.max(boxes2D[i].y, boxes2D[j].y);
        const top = Math.min(boxes2D[i].y + boxes2D[i].height, boxes2D[j].y + boxes2D[j].height);
        if (right - left > 0.05 && top - bottom > 0.05) {
          return {
            hasAnomalies: true,
            reason: `Sovrapposizione rilevata tra due scatole nel vano.`,
          };
        }
      }
    }
  }

  return { hasAnomalies: false };
}

/**
 * Finds the optimal orientation and rotation for a set of boxes inside a single cube
 * to maximize space usage and prevent overflow.
 * Compares pure bookshelf (vertical), pure stack (horizontal), and best-fit individual rotations.
 */
export function autoOptimizeCubeLayout(
  cubeWidth: number,
  cubeHeight: number,
  cubeDepth: number,
  boxes: GameBox[]
): { orientation: ShelfOrientation; rotation90: number }[] {
  if (boxes.length === 0) return [];

  // Candidate 1: Pure vertical (bookshelf)
  // Check if all boxes can stand vertically side by side
  let verticalFits = true;
  let vertWidth = 0;
  const vertConfigs: { orientation: ShelfOrientation; rotation90: number }[] = [];

  for (const box of boxes) {
    // Try 0° first (standing on height or width)
    const eff0 = getEffectiveDimensions(box, 'vertical', 0);
    const eff90 = getEffectiveDimensions(box, 'vertical', 90);

    let chosenRot = 0;
    let chosenEff = eff0;

    // Pick whichever fits within cubeHeight and cubeDepth
    if (eff0.displayHeight <= cubeHeight && eff0.shelfDepth <= cubeDepth) {
      chosenRot = 0;
      chosenEff = eff0;
    } else if (eff90.displayHeight <= cubeHeight && eff90.shelfDepth <= cubeDepth) {
      chosenRot = 90;
      chosenEff = eff90;
    } else {
      verticalFits = false;
    }

    vertWidth += chosenEff.displayWidth;
    vertConfigs.push({ orientation: 'vertical', rotation90: chosenRot });
  }

  if (vertWidth > cubeWidth) {
    verticalFits = false;
  }

  // Candidate 2: Pure horizontal (flat stack)
  let horizontalFits = true;
  let horizHeight = 0;
  const horizConfigs: { orientation: ShelfOrientation; rotation90: number }[] = [];

  for (const box of boxes) {
    const eff0 = getEffectiveDimensions(box, 'horizontal', 0);
    const eff90 = getEffectiveDimensions(box, 'horizontal', 90);

    let chosenRot = 0;
    let chosenEff = eff0;

    if (eff0.displayWidth <= cubeWidth && eff0.shelfDepth <= cubeDepth) {
      chosenRot = 0;
      chosenEff = eff0;
    } else if (eff90.displayWidth <= cubeWidth && eff90.shelfDepth <= cubeDepth) {
      chosenRot = 90;
      chosenEff = eff90;
    } else {
      horizontalFits = false;
    }

    horizHeight += chosenEff.displayHeight;
    horizConfigs.push({ orientation: 'horizontal', rotation90: chosenRot });
  }

  if (horizHeight > cubeHeight) {
    horizontalFits = false;
  }

  // If vertical fits nicely, prefer vertical (easier to pull games out of shelf!)
  if (verticalFits) {
    return vertConfigs;
  }

  // If horizontal fits, use horizontal
  if (horizontalFits) {
    return horizConfigs;
  }

  // If neither fits cleanly, return the one with smaller overflow percentage
  const vertOverflowScore = Math.max(vertWidth - cubeWidth, 0);
  const horizOverflowScore = Math.max(horizHeight - cubeHeight, 0);

  return vertOverflowScore <= horizOverflowScore ? vertConfigs : horizConfigs;
}

/**
 * Generates an aesthetic hex color based on game name
 */
export function generateBoxColor(name: string): string {
  const PALETTE = [
    '#3B82F6', // Blue
    '#10B981', // Emerald
    '#F59E0B', // Amber
    '#EF4444', // Red
    '#8B5CF6', // Purple
    '#EC4899', // Pink
    '#06B6D4', // Cyan
    '#F97316', // Orange
    '#14B8A6', // Teal
    '#6366F1', // Indigo
    '#84CC16', // Lime
  ];

  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % PALETTE.length;
  return PALETTE[index];
}

/**
 * Evaluates whether a collection status string/value represents an owned state ("Posseduto" / "In collezione").
 * Returns true if explicitly owned, false if explicitly unowned (wishlist, prev owned, non posseduto, etc.),
 * and null if undefined/unknown.
 */
export function isCollectionStatusOwned(rawVal: any): boolean | null {
  if (rawVal === undefined || rawVal === null) return null;
  if (typeof rawVal === 'boolean') return rawVal;
  if (typeof rawVal === 'number') {
    if (rawVal === 1) return true;
    if (rawVal === 0) return false;
  }
  if (typeof rawVal === 'object') {
    if (
      rawVal.statusOwned === 1 ||
      rawVal.statusOwned === true ||
      rawVal.statusOwned === 'true' ||
      rawVal.statusOwned === '1' ||
      rawVal.status_owned === 1 ||
      rawVal.status_owned === true ||
      rawVal.status_owned === 'true' ||
      rawVal.status_owned === '1' ||
      rawVal.own === 1 ||
      rawVal.own === true ||
      rawVal.owned === 1 ||
      rawVal.owned === true ||
      rawVal.isOwned === 1 ||
      rawVal.isOwned === true ||
      rawVal.posseduto === 1 ||
      rawVal.posseduto === true
    ) {
      return true;
    }
    if (
      rawVal.statusOwned === 0 ||
      rawVal.statusOwned === false ||
      rawVal.statusOwned === 'false' ||
      rawVal.statusOwned === '0' ||
      rawVal.status_owned === 0 ||
      rawVal.status_owned === false ||
      rawVal.status_owned === 'false' ||
      rawVal.status_owned === '0' ||
      rawVal.statusWishlist === true ||
      rawVal.statusWishlist === 1 ||
      rawVal.statusWishlist === 'true' ||
      rawVal.statusPrevOwned === true ||
      rawVal.statusPrevOwned === 1 ||
      rawVal.statusPrevOwned === 'true' ||
      rawVal.own === 0 ||
      rawVal.own === false ||
      rawVal.owned === 0 ||
      rawVal.owned === false ||
      rawVal.isOwned === 0 ||
      rawVal.isOwned === false ||
      rawVal.wishlist ||
      rawVal.isWishlist ||
      rawVal.prevOwned ||
      rawVal.isPrevOwned ||
      rawVal.forTrade ||
      rawVal.wantToBuy ||
      rawVal.notOwned
    ) {
      return false;
    }
    if (rawVal.name || rawVal.status || rawVal.value || rawVal.stato) {
      return isCollectionStatusOwned(rawVal.name || rawVal.status || rawVal.value || rawVal.stato);
    }
  }

  const str = String(rawVal).toLowerCase().trim();
  if (!str) return null;
  const clean = str.replace(/["']/g, '').trim();

  // Specific check for statusowned/status_owned key:value strings (handles quotes, spacing, colons, equals)
  if (
    /status_?owned\s*[:=]\s*(false|0)\b/i.test(clean) ||
    clean === 'statusowned:false' ||
    clean === 'statusowned=false' ||
    clean === 'status_owned:false' ||
    clean === 'status_owned=false' ||
    clean.includes('statuswishlist') ||
    clean.includes('statusprevowned')
  ) {
    return false;
  }

  if (
    /status_?owned\s*[:=]\s*(true|1)\b/i.test(clean) ||
    /status_?owned\s*:\s*true/i.test(str) ||
    clean === 'statusowned:true' ||
    clean === 'statusowned=true' ||
    clean === 'status_owned:true' ||
    clean === 'status_owned=true' ||
    clean === 'statusowned' ||
    clean === 'status_owned' ||
    /^status_?owned$/i.test(clean) ||
    clean.includes('statusowned:true') ||
    clean.includes('status_owned:true') ||
    clean.includes('statusowned: true') ||
    clean.includes('status_owned: true')
  ) {
    return true;
  }

  // Explicit unowned statuses
  if (
    str.includes('non possedut') ||
    str.includes('non in collezione') ||
    str.includes('non in coll') ||
    str.includes('non in possesso') ||
    str.includes('senza copia') ||
    str.includes('non mio') ||
    str.includes('non mia') ||
    str.includes('non miei') ||
    str.includes('wishlist') ||
    str.includes('desideri') ||
    str.includes('da comprare') ||
    str.includes('da acquistare') ||
    str.includes('da prendere') ||
    str.includes('to buy') ||
    str.includes('vendut') ||
    str.includes('sold') ||
    str.includes('scambiat') ||
    str.includes('traded') ||
    str.includes('for trade') ||
    str.includes('scambio') ||
    str.includes('ex possedut') ||
    str.includes('precedentemente') ||
    str.includes('previously owned') ||
    str.includes('prev owned') ||
    str.includes('prevowned') ||
    str.includes('in prestito') ||
    str.includes('prestito') ||
    str.includes('borrowed') ||
    str.includes('da provare') ||
    str.includes('in prova') ||
    str.includes('to play') ||
    str.includes('to try') ||
    str.includes('solo giocato') ||
    str.includes('played only') ||
    str === 'no' ||
    str === 'false' ||
    str === '0'
  ) {
    return false;
  }

  // Explicit owned statuses
  if (
    str.includes('possedut') ||
    str.includes('possess') ||
    str === 'own' ||
    str.includes('owned') ||
    str.includes('in collezione') ||
    str.includes('nella collezione') ||
    str.includes('della collezione') ||
    str.includes('in coll') ||
    str === 'collezione' ||
    str.includes('mia collezione') ||
    str.includes('la mia collezione') ||
    str.includes('i miei giochi') ||
    str.includes('miei giochi') ||
    str === 'miei' ||
    str === 'mio' ||
    str.includes('libreria') ||
    str.includes('scaffale') ||
    str.includes('kallax') ||
    str.includes('acquistat') ||
    str.includes('comprat') ||
    str.includes('mia copia') ||
    str.includes('my copy') ||
    str === 'presente' ||
    str === 'a casa' ||
    str === 'si' ||
    str === 'sì' ||
    str === 'yes' ||
    str === 'y' ||
    str === '1' ||
    str === 'true'
  ) {
    return true;
  }

  return null;
}

export function isOwnedTagName(rawName: string): boolean {
  return isCollectionStatusOwned(rawName) === true;
}

export function isUnownedTagName(rawName: string): boolean {
  return isCollectionStatusOwned(rawName) === false;
}

export interface BgStatsTagContext {
  ownedTagIds: Set<string>;
  unownedTagIds: Set<string>;
  tagIdToName: Map<string, string>;
  gameIdToTagIds: Map<string, Set<string>>;
  hasAnyOwnedTagInDataset: boolean;
  datasetHasOwnershipClassification: boolean;
}

/**
 * Extracts tag names and tag IDs from a game item in BG Stats format.
 */
export function extractItemTagNamesAndIds(
  item: any,
  tagContext?: BgStatsTagContext
): { tagNames: string[]; tagIds: string[] } {
  const tagNames: string[] = [];
  const tagIds: string[] = [];

  if (!item || typeof item !== 'object') return { tagNames, tagIds };

  // 1. tagRefIds or tagIds array: [1, 2, "uuid-1"]
  const refIds = item.tagRefIds || item.tagIds || item.tagsRefIds || item.tagRefId;
  if (Array.isArray(refIds)) {
    for (const id of refIds) {
      if (id !== undefined && id !== null) tagIds.push(String(id));
    }
  } else if (refIds !== undefined && refIds !== null) {
    tagIds.push(String(refIds));
  }

  // 2. item.tags
  if (Array.isArray(item.tags)) {
    for (const t of item.tags) {
      if (!t) continue;
      if (typeof t === 'string') {
        const clean = t.replace(/["']/g, '').trim();
        tagNames.push(clean);
        if (/status_?owned\s*[:=]?\s*(true|1)/i.test(clean) || /^status_?owned$/i.test(clean)) {
          tagNames.push('statusOwned:true');
        } else if (/status_?owned\s*[:=]?\s*(false|0)/i.test(clean)) {
          tagNames.push('statusOwned:false');
        }
      } else if (typeof t === 'number') {
        tagIds.push(String(t));
      } else if (typeof t === 'object') {
        const tName = String(t.name || t.tag || (typeof t.value === 'string' ? t.value : '') || '').trim();
        if (tName) {
          tagNames.push(tName);
          if (/status_?owned\s*[:=]?\s*(true|1)/i.test(tName) || /^status_?owned$/i.test(tName)) {
            tagNames.push('statusOwned:true');
          } else if (/status_?owned\s*[:=]?\s*(false|0)/i.test(tName)) {
            tagNames.push('statusOwned:false');
          }
        }
        if (t.id !== undefined) tagIds.push(String(t.id));
        if (t.uuid) tagIds.push(String(t.uuid));
        if (
          t.statusOwned === true ||
          t.statusOwned === 1 ||
          t.statusOwned === 'true' ||
          t.statusOwned === '1' ||
          t.status_owned === true ||
          t.status_owned === 1 ||
          t.status_owned === 'true' ||
          t.status_owned === '1' ||
          t.value === true ||
          t.value === 1 ||
          t.value === 'true' ||
          t.value === '1'
        ) {
          tagNames.push('statusOwned:true');
        } else if (
          t.statusOwned === false ||
          t.statusOwned === 0 ||
          t.statusOwned === 'false' ||
          t.statusOwned === '0' ||
          t.status_owned === false ||
          t.status_owned === 0 ||
          t.status_owned === 'false' ||
          t.status_owned === '0' ||
          t.value === false ||
          t.value === 0 ||
          t.value === 'false' ||
          t.value === '0'
        ) {
          tagNames.push('statusOwned:false');
        }
      }
    }
  } else if (typeof item.tags === 'string') {
    item.tags.split(/[,;|]/).forEach((part: string) => {
      const clean = part.replace(/["']/g, '').trim();
      if (clean) {
        tagNames.push(clean);
        if (/status_?owned\s*[:=]?\s*(true|1)/i.test(clean) || /^status_?owned$/i.test(clean)) {
          tagNames.push('statusOwned:true');
        }
      }
    });
  }

  // 3. item.tag
  if (typeof item.tag === 'string') {
    item.tag.split(/[,;|]/).forEach((part: string) => {
      const clean = part.replace(/["']/g, '').trim();
      if (clean) {
        tagNames.push(clean);
        if (/status_?owned\s*[:=]?\s*(true|1)/i.test(clean) || /^status_?owned$/i.test(clean)) {
          tagNames.push('statusOwned:true');
        }
      }
    });
  } else if (item.tag && typeof item.tag === 'object') {
    const tName = String(item.tag.name || item.tag.tag || '').trim();
    if (tName) {
      tagNames.push(tName);
      if (/status_?owned\s*[:=]?\s*(true|1)/i.test(tName) || /^status_?owned$/i.test(tName)) {
        tagNames.push('statusOwned:true');
      }
    }
    if (item.tag.id !== undefined) tagIds.push(String(item.tag.id));
    if (
      item.tag.statusOwned === true ||
      item.tag.statusOwned === 1 ||
      item.tag.statusOwned === 'true' ||
      item.tag.statusOwned === '1'
    ) {
      tagNames.push('statusOwned:true');
    } else if (
      item.tag.statusOwned === false ||
      item.tag.statusOwned === 0 ||
      item.tag.statusOwned === 'false' ||
      item.tag.statusOwned === '0'
    ) {
      tagNames.push('statusOwned:false');
    }
  }

  // 4. item.userTags
  if (typeof item.userTags === 'string') {
    item.userTags.split(/[,;|]/).forEach((part: string) => {
      const clean = part.replace(/["']/g, '').trim();
      if (clean) {
        tagNames.push(clean);
        if (/status_?owned\s*[:=]?\s*(true|1)/i.test(clean) || /^status_?owned$/i.test(clean)) {
          tagNames.push('statusOwned:true');
        }
      }
    });
  }

  // 5. Associative gameTags table lookup
  if (tagContext?.gameIdToTagIds) {
    const idsToTry = [item.id, item.uuid, item.bggId]
      .filter((x) => x !== undefined && x !== null)
      .map(String);
    for (const gId of idsToTry) {
      const mapped = tagContext.gameIdToTagIds.get(gId);
      if (mapped) {
        for (const tId of mapped) {
          tagIds.push(tId);
        }
      }
    }
  }

  // 6. Map tagIds to tagNames using tagIdToName if available
  if (tagContext?.tagIdToName) {
    for (const id of tagIds) {
      const resolvedName = tagContext.tagIdToName.get(id);
      if (resolvedName && !tagNames.includes(resolvedName)) {
        tagNames.push(resolvedName);
      }
    }
  }

  return { tagNames, tagIds };
}

/**
 * Checks whether an item from BG Stats represents a currently owned game ("posseduto"),
 * based STRICTLY on collection status, ownership flags, and physical copies.
 * Per user instruction: does NOT filter on tags, but on the collection status.
 */
export function isBgStatsItemOwned(
  item: any,
  rootCopies?: any[],
  datasetHasCollectionStatus?: boolean | BgStatsTagContext
): boolean {
  if (!item || typeof item !== 'object') return false;

  const datasetHasStatus =
    typeof datasetHasCollectionStatus === 'boolean'
      ? datasetHasCollectionStatus
      : !!datasetHasCollectionStatus?.datasetHasOwnershipClassification;

  // 1. TOP PRIORITY: Explicit positive statusOwned on item (standard BGG/BG Stats indicator - per user requirement)
  if (
    item.statusOwned === true ||
    item.statusOwned === 1 ||
    item.statusOwned === 'true' ||
    item.statusOwned === '1' ||
    item.status_owned === true ||
    item.status_owned === 1 ||
    item.status_owned === 'true' ||
    item.status_owned === '1' ||
    item.own === true ||
    item.own === 1 ||
    item.own === 'true' ||
    item.own === '1' ||
    item.isOwned === true ||
    item.isOwned === 1 ||
    item.isOwned === 'true' ||
    item.isOwned === '1' ||
    item.bggCollectionStatus?.statusOwned === true ||
    item.bggCollectionStatus?.statusOwned === 1 ||
    item.bggCollectionStatus?.statusOwned === 'true' ||
    item.bggCollectionStatus?.own === true ||
    item.bggCollectionStatus?.own === 1 ||
    item.bggCollectionStatus?.own === '1' ||
    item.bggStatus?.statusOwned === true ||
    item.bggStatus?.statusOwned === 1 ||
    item.bggStatus?.own === true ||
    item.bggStatus?.own === 1
  ) {
    return true;
  }

  // 1b. Explicit negative statusOwned on item
  if (
    item.statusOwned === false ||
    item.statusOwned === 0 ||
    item.statusOwned === 'false' ||
    item.statusOwned === '0' ||
    item.status_owned === false ||
    item.status_owned === 0 ||
    item.status_owned === 'false' ||
    item.status_owned === '0' ||
    item.own === false ||
    item.own === 0 ||
    item.isOwned === false ||
    item.isOwned === 0
  ) {
    return false;
  }

  // 1c. Explicit negative collection properties (unowned, wishlist, prevOwned)
  if (
    item.statusWishlist === true ||
    item.statusWishlist === 1 ||
    item.statusWishlist === 'true' ||
    item.statusWishlist === '1' ||
    item.statusPrevOwned === true ||
    item.statusPrevOwned === 1 ||
    item.statusPrevOwned === 'true' ||
    item.statusPrevOwned === '1' ||
    item.statusWantToBuy === true ||
    item.statusWantToBuy === 1 ||
    item.notOwned === true ||
    item.notOwned === 1 ||
    item.isNotOwned === true ||
    item.isNotOwned === 1 ||
    item.unowned === true ||
    item.unowned === 1 ||
    item.isWishlist === 1 ||
    item.isWishlist === true ||
    item.wishlist === 1 ||
    item.wishlist === true ||
    item.isPrevOwned === 1 ||
    item.isPrevOwned === true ||
    item.prevOwned === 1 ||
    item.prevOwned === true ||
    item.isWant === 1 ||
    item.isWant === true ||
    item.wantToBuy === 1 ||
    item.wantToBuy === true ||
    item.isWantToBuy === 1
  ) {
    return false;
  }

  // 2. Collection status fields on item (statusOwned, status, collectionStatus, stato, etc.)
  const statusCandidates = [
    item.statusOwned,
    item.status_owned,
    item.collectionStatus,
    item.collection_status,
    item.status,
    item.stato,
    item.statoCollezione,
    item.stato_collezione,
    item.collection,
    item.bggStatus,
    item.bggCollectionStatus,
  ];

  for (const candidate of statusCandidates) {
    if (candidate !== undefined && candidate !== null && candidate !== '') {
      const res = isCollectionStatusOwned(candidate);
      if (res === true) return true;
      if (res === false) return false;
    }
  }

  // 3. Explicit boolean or numeric flags on item (statusOwned, isOwned, owned, own, posseduto)
  const flagCandidates = [item.statusOwned, item.status_owned, item.isOwned, item.owned, item.own, item.posseduto];
  for (const flag of flagCandidates) {
    if (flag !== undefined && flag !== null && flag !== '') {
      const res = isCollectionStatusOwned(flag);
      if (res === true) return true;
      if (res === false) return false;
    }
  }

  // 4. Physical copies directly inside the game object (item.copies)
  if (Array.isArray(item.copies)) {
    if (item.copies.length > 0) {
      const hasOwnedCopy = item.copies.some((c: any) => {
        if (!c || typeof c !== 'object') return false;
        if (
          c.statusOwned === false ||
          c.statusOwned === 0 ||
          c.statusOwned === 'false' ||
          c.statusOwned === '0' ||
          c.own === false ||
          c.isOwned === false ||
          c.own === 0 ||
          c.isOwned === 0
        ) {
          return false;
        }
        if (
          c.statusOwned === true ||
          c.statusOwned === 1 ||
          c.statusOwned === 'true' ||
          c.statusOwned === '1' ||
          c.own === true ||
          c.own === 1 ||
          c.isOwned === true ||
          c.isOwned === 1
        ) {
          return true;
        }
        const cStatusRes = isCollectionStatusOwned(
          c.statusOwned !== undefined ? c.statusOwned : c.status ?? c.collectionStatus ?? c.stato
        );
        if (cStatusRes === false) return false;
        if (cStatusRes === true) return true;
        return false;
      });
      return hasOwnedCopy;
    } else if (datasetHasStatus) {
      // Empty copies array in a collection dataset indicates 0 copies owned
      return false;
    }
  }

  // 5. Check root-level copies array from full BG Stats backup
  if (Array.isArray(rootCopies) && rootCopies.length > 0) {
    const itemIdStr = item.id !== undefined ? String(item.id) : undefined;
    const itemUuidStr = item.uuid !== undefined ? String(item.uuid) : undefined;
    const itemBggStr = item.bggId !== undefined ? String(item.bggId) : undefined;

    const matchedCopy = rootCopies.find((c) => {
      if (!c || typeof c !== 'object') return false;
      if (
        c.statusOwned === false ||
        c.statusOwned === 0 ||
        c.statusOwned === 'false' ||
        c.statusOwned === '0' ||
        c.own === false ||
        c.isOwned === false ||
        c.own === 0 ||
        c.isOwned === 0
      ) {
        return false;
      }
      const cStatusRes = isCollectionStatusOwned(
        c.statusOwned !== undefined ? c.statusOwned : c.status ?? c.collectionStatus ?? c.stato
      );
      if (cStatusRes === false) return false;

      // In real BG Stats backups, the field is often c.game (or c.gameId, c.gameRefId)
      const cGameId =
        c.game !== undefined
          ? String(c.game)
          : c.gameId !== undefined
          ? String(c.gameId)
          : c.gameRefId !== undefined
          ? String(c.gameRefId)
          : undefined;
      const cGameUuid =
        c.gameUuid !== undefined ? String(c.gameUuid) : c.uuid !== undefined ? String(c.uuid) : undefined;
      const cBggId = c.bggId !== undefined ? String(c.bggId) : undefined;

      const matchesId = itemIdStr && (cGameId === itemIdStr);
      const matchesUuid = itemUuidStr && cGameUuid === itemUuidStr;
      const matchesBgg = itemBggStr && cBggId === itemBggStr;
      return matchesId || matchesUuid || matchesBgg;
    });

    if (matchedCopy) return true;
  }

  // 6. Check user tags on the game (e.g. tag 'Posseduto', 'Owned', 'Collezione', 'statusOwned:true', etc.)
  const tagCtx = typeof datasetHasCollectionStatus === 'object' ? datasetHasCollectionStatus : undefined;
  const itemTagData = extractItemTagNamesAndIds(item, tagCtx);

  // Check tagIds against tagCtx sets
  if (tagCtx) {
    for (const tId of itemTagData.tagIds) {
      if (tagCtx.unownedTagIds.has(tId)) return false;
    }
    for (const tId of itemTagData.tagIds) {
      if (tagCtx.ownedTagIds.has(tId)) return true;
    }
  }

  if (itemTagData.tagNames.length > 0) {
    for (const tName of itemTagData.tagNames) {
      if (isCollectionStatusOwned(tName) === false) {
        return false;
      }
    }
    for (const tName of itemTagData.tagNames) {
      if (isCollectionStatusOwned(tName) === true) {
        return true;
      }
    }
  }

  // 7. If the dataset tracks collection status / copies / isOwned,
  // games without an owned collection status or owned tag are NOT owned.
  if (datasetHasStatus) {
    return false;
  }

  // 8. Default to true only if no collection status, copy, or ownership info exists anywhere in the file
  return true;
}

/**
 * Splits a CSV line taking into account quoted fields with embedded commas/semicolons.
 */
export function splitCsvLine(line: string, delimiter: string = ','): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === delimiter && !inQuotes) {
      result.push(current.replace(/^"|"$/g, '').trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.replace(/^"|"$/g, '').trim());
  return result;
}

export interface CsvOwnershipContext {
  csvHasOwnedTags?: boolean;
  csvHasOwnedMarkers?: boolean;
  tagIndex?: number;
}

/**
 * Checks whether a CSV row represents an owned game based on collection status, ownership, or tags.
 */
export function isCsvRowOwned(
  parts: string[],
  headers: string[],
  context?: CsvOwnershipContext | boolean
): boolean {
  const datasetHasStatus =
    typeof context === 'boolean'
      ? context
      : !!context?.csvHasOwnedMarkers;

  // 1. TOP PRIORITY: Check dedicated statusOwned column if present (per user instruction)
  const statusOwnedIndex = headers.findIndex((h) => {
    const cleanH = h.replace(/["']/g, '').trim().toLowerCase();
    return (
      cleanH === 'statusowned' ||
      cleanH === 'status_owned' ||
      cleanH === 'status owned' ||
      cleanH === 'status:owned' ||
      cleanH.includes('statusowned')
    );
  });
  if (statusOwnedIndex !== -1) {
    const rawStatusOwned = (parts[statusOwnedIndex] || '').replace(/["']/g, '').trim().toLowerCase();
    if (
      rawStatusOwned === 'true' ||
      rawStatusOwned === '1' ||
      rawStatusOwned === 'yes' ||
      rawStatusOwned === 'sì' ||
      rawStatusOwned === 'si'
    ) {
      return true;
    }
    if (rawStatusOwned === 'false' || rawStatusOwned === '0' || rawStatusOwned === 'no') {
      return false;
    }
  }

  // 2. Check dedicated Wishlist column if present
  const wishlistIndex = headers.findIndex(
    (h) => h === 'wishlist' || h === 'iswishlist' || h.includes('desideri') || h.includes('wish')
  );
  if (wishlistIndex !== -1) {
    const rawWish = (parts[wishlistIndex] || '').trim().toLowerCase();
    if (rawWish === '1' || rawWish === 'yes' || rawWish === 'true' || rawWish === 'sì' || rawWish === 'si') {
      return false;
    }
  }

  // 3. Check dedicated PrevOwned column if present
  const prevIndex = headers.findIndex(
    (h) => h === 'prevowned' || h === 'isprevowned' || h.includes('precedentemente') || h.includes('venduto')
  );
  if (prevIndex !== -1) {
    const rawPrev = (parts[prevIndex] || '').trim().toLowerCase();
    if (rawPrev === '1' || rawPrev === 'yes' || rawPrev === 'true' || rawPrev === 'sì' || rawPrev === 'si') {
      return false;
    }
  }

  // 3. Check ownership / collection status column
  const ownedIndex = headers.findIndex(
    (h) =>
      h === 'statusowned' ||
      h === 'status_owned' ||
      h === 'status owned' ||
      h === 'status:owned' ||
      h === 'status' ||
      h === 'stato' ||
      h === 'collectionstatus' ||
      h === 'collection status' ||
      h === 'statocollezione' ||
      h === 'stato collezione' ||
      h === 'stato della collezione' ||
      h === 'owned' ||
      h === 'isowned' ||
      h === 'is_owned' ||
      h === 'posseduto' ||
      h === 'own' ||
      h === 'collezione' ||
      h.includes('possedut') ||
      h.includes('status') ||
      h.includes('stato') ||
      h.includes('collection') ||
      h.includes('collezione')
  );

  if (ownedIndex !== -1) {
    const rawVal = (parts[ownedIndex] || '').trim();
    if (rawVal) {
      const res = isCollectionStatusOwned(rawVal);
      if (res === true) return true;
      if (res === false) return false;
    }
  }

  // 4. Check tag column if present
  const tagIndex = headers.findIndex(
    (h) => h === 'tags' || h === 'tag' || h === 'tag list' || h.includes('tag') || h.includes('etichett')
  );
  if (tagIndex !== -1) {
    const rawTag = (parts[tagIndex] || '').trim();
    if (rawTag) {
      const tagParts = rawTag.split(/[,;|]/).map((t) => t.trim()).filter(Boolean);
      for (const t of tagParts) {
        const res = isCollectionStatusOwned(t);
        if (res === true) return true;
        if (res === false) return false;
      }
    }
  }

  // 5. If dataset tracks collection status / ownership columns, rows lacking owned status or owned tag are not owned
  if (datasetHasStatus) {
    return false;
  }

  return true;
}

export interface BgStatsParseOptions {
  onlyOwned?: boolean; // Defaults to true
  invertFilter?: boolean; // Defaults to false. If true, inverts the ownership condition
  selectedTag?: string; // Optional tag filter
}

export interface BgStatsParseDetails {
  games: GameBox[];
  totalFound: number;
  skippedUnowned: number;
  detectedOwnedCount: number;
  detectedUnownedCount: number;
  allDetectedTags: { tag: string; count: number }[];
  allDetectedStatuses: { status: string; count: number }[];
}

/**
 * Detailed BG Stats export parser that tracks skipped unowned games.
 */
export function parseBgStatsExportDetails(
  rawText: string,
  options: BgStatsParseOptions = { onlyOwned: true }
): BgStatsParseDetails {
  const games: GameBox[] = [];
  let totalFound = 0;
  let skippedUnowned = 0;
  let detectedOwnedCount = 0;
  let detectedUnownedCount = 0;
  const onlyOwned = options.onlyOwned !== false;
  const invertFilter = !!options.invertFilter;
  const selectedTag = options.selectedTag?.trim();

  const tagCounts = new Map<string, number>();
  const statusCounts = new Map<string, number>();

  // Try JSON first
  try {
    const json = JSON.parse(rawText);
    const rawGames = json.games || json.Games || (Array.isArray(json) ? json : []);
    const rawCopies = json.copies || json.Copies || [];
    const rawTags = json.tags || json.Tags || json.tagList || [];
    const rawGameTags = json.gameTags || json.GameTags || json.game_tags || [];

    const ownedTagIds = new Set<string>();
    const unownedTagIds = new Set<string>();
    let hasAnyOwnedTagInDataset = false;

    // Map tag ID to tag name and track owned/unowned tag status
    const tagIdToName = new Map<string, string>();
    for (const t of rawTags) {
      if (t && typeof t === 'object') {
        const id = t.id !== undefined ? String(t.id) : t.uuid !== undefined ? String(t.uuid) : undefined;
        const name = t.name ? String(t.name).trim() : undefined;
        if (id && name) tagIdToName.set(id, name);
        if (
          t.statusOwned === true ||
          t.statusOwned === 1 ||
          t.statusOwned === 'true' ||
          t.statusOwned === '1' ||
          t.status_owned === true ||
          t.status_owned === 1 ||
          (name && isOwnedTagName(name))
        ) {
          if (id) ownedTagIds.add(id);
          hasAnyOwnedTagInDataset = true;
        }
        if (
          t.statusOwned === false ||
          t.statusOwned === 0 ||
          t.statusOwned === 'false' ||
          t.statusOwned === '0' ||
          t.status_owned === false ||
          t.status_owned === 0 ||
          (name && isUnownedTagName(name))
        ) {
          if (id) unownedTagIds.add(id);
        }
      }
    }

    // Map game ID to tag IDs
    const gameIdToTagIds = new Map<string, Set<string>>();
    for (const gt of rawGameTags) {
      if (gt && typeof gt === 'object') {
        const gId =
          gt.game !== undefined
            ? String(gt.game)
            : gt.gameId !== undefined
            ? String(gt.gameId)
            : gt.gameRefId !== undefined
            ? String(gt.gameRefId)
            : undefined;
        const tId =
          gt.tag !== undefined
            ? String(gt.tag)
            : gt.tagId !== undefined
            ? String(gt.tagId)
            : gt.tagRefId !== undefined
            ? String(gt.tagRefId)
            : undefined;
        if (gId && tId) {
          if (!gameIdToTagIds.has(gId)) gameIdToTagIds.set(gId, new Set());
          gameIdToTagIds.get(gId)!.add(tId);
        }
      }
    }

    let datasetHasCollectionStatus =
      (Array.isArray(rawCopies) && rawCopies.length > 0) || hasAnyOwnedTagInDataset;

    if (Array.isArray(rawGames)) {
      for (const g of rawGames) {
        if (!g || typeof g !== 'object') continue;
        if (
          g.statusOwned !== undefined ||
          g.status_owned !== undefined ||
          g.statusWishlist !== undefined ||
          g.statusPrevOwned !== undefined ||
          g.isOwned !== undefined ||
          g.owned !== undefined ||
          g.own !== undefined ||
          g.posseduto !== undefined ||
          g.isWishlist !== undefined ||
          g.wishlist !== undefined ||
          g.isPrevOwned !== undefined ||
          g.prevOwned !== undefined ||
          (Array.isArray(g.copies) && g.copies.length > 0) ||
          g.status ||
          g.collectionStatus ||
          g.collection_status ||
          g.stato ||
          g.statoCollezione ||
          g.stato_collezione ||
          g.collection
        ) {
          datasetHasCollectionStatus = true;
          break;
        }

        if (g.tags || g.tagRefIds) {
          const tNames = Array.isArray(g.tags)
            ? g.tags.map((t: any) =>
                typeof t === 'string'
                  ? t
                  : t?.name ||
                    (t?.statusOwned === true || t?.statusOwned === 1 ? 'statusOwned' : '')
              )
            : typeof g.tags === 'string'
            ? g.tags.split(/[,;|]/)
            : [];
          if (tNames.some((t: string) => isCollectionStatusOwned(t) !== null)) {
            datasetHasCollectionStatus = true;
            break;
          }
        }
      }
    }

    const tagContext: BgStatsTagContext = {
      tagIdToName,
      gameIdToTagIds,
      ownedTagIds,
      unownedTagIds,
      hasAnyOwnedTagInDataset,
      datasetHasOwnershipClassification: datasetHasCollectionStatus,
    };

    if (Array.isArray(rawGames) && rawGames.length > 0) {
      for (const item of rawGames) {
        if (!item || (!item.name && !item.Name)) continue;
        totalFound++;

        // Collect tag names
        const itemTagData = extractItemTagNamesAndIds(item, tagContext);
        for (const tName of itemTagData.tagNames) {
          tagCounts.set(tName, (tagCounts.get(tName) || 0) + 1);
        }

        // Collect status
        const itemStatus =
          item.collectionStatus ||
          item.status ||
          item.stato ||
          (item.statusOwned === true || item.statusOwned === 1 || item.statusOwned === 'true'
            ? 'statusOwned: true'
            : item.statusOwned === false || item.statusOwned === 0 || item.statusOwned === 'false'
            ? 'statusOwned: false'
            : undefined);
        if (itemStatus && typeof itemStatus === 'string') {
          statusCounts.set(itemStatus, (statusCounts.get(itemStatus) || 0) + 1);
        }

        let isOwned = isBgStatsItemOwned(item, rawCopies, tagContext);

        if (selectedTag) {
          // Explicit tag selection filter
          isOwned = itemTagData.tagNames.includes(selectedTag);
        }

        if (isOwned) {
          detectedOwnedCount++;
        } else {
          detectedUnownedCount++;
        }

        // Apply inversion if user requested inverted filter logic
        if (invertFilter) {
          isOwned = !isOwned;
        }

        if (onlyOwned && !isOwned) {
          skippedUnowned++;
          continue;
        }

        const name = (item.name || item.Name || '').trim();
        const bggId = item.bggId || item.bggid || item.bggID || undefined;
        const id = `bgstats-${item.id || bggId || Math.random().toString(36).slice(2, 8)}`;

        // Immediately resolve real dimensions from verified database or embedded notes/edition text
        const rawNotes = String(item.notes || item.comment || item.edition || item.description || '');
        const embeddedDims = parseDimensionsFromText(rawNotes) || parseDimensionsFromText(name);
        const info = lookupBoardGameInfo({ bggId: bggId ? Number(bggId) : undefined, name });
        const hasExplicitDims = !!(item.width || item.boxWidth);
        const width = parseFloat(item.width || item.boxWidth) || embeddedDims?.width || info.width;
        const height = parseFloat(item.height || item.boxHeight) || embeddedDims?.height || info.height;
        const depth = parseFloat(item.depth || item.boxDepth || item.thickness) || embeddedDims?.depth || info.depth;

        let dimensionSource = 'Stima standard';
        if (hasExplicitDims) {
          dimensionSource = 'BG Stats';
        } else if (embeddedDims) {
          dimensionSource = 'Note BG Stats';
        } else if (info.found) {
          dimensionSource = 'BGG';
        }

        games.push({
          id,
          name,
          bggId: bggId ? Number(bggId) : info.bggId,
          width: Math.round(width * 10) / 10,
          height: Math.round(height * 10) / 10,
          depth: Math.round(depth * 10) / 10,
          dimensionSource,
          thumbnail: item.thumbnail || info.thumbnail || undefined,
          image: item.image || info.image || undefined,
          year: item.year || info.year || undefined,
          players:
            item.players ||
            (info.minPlayers && info.maxPlayers
              ? info.minPlayers === info.maxPlayers
                ? `${info.minPlayers}`
                : `${info.minPlayers}-${info.maxPlayers}`
              : undefined),
          playtime: item.playtime || info.playingTime || undefined,
          minAge: item.minAge || info.minAge || undefined,
          rating: item.rating !== undefined ? Number(item.rating) : info.rating,
          weight: item.weight !== undefined ? Number(item.weight) : info.weight,
          description: item.description || info.description || undefined,
          color: generateBoxColor(name),
        });
      }

      const allDetectedTags = Array.from(tagCounts.entries())
        .map(([tag, count]) => ({ tag, count }))
        .sort((a, b) => b.count - a.count);

      const allDetectedStatuses = Array.from(statusCounts.entries())
        .map(([status, count]) => ({ status, count }))
        .sort((a, b) => b.count - a.count);

      return {
        games,
        totalFound,
        skippedUnowned,
        detectedOwnedCount,
        detectedUnownedCount,
        allDetectedTags,
        allDetectedStatuses,
      };
    }
  } catch {
    // Not valid JSON, try CSV below
  }

  // Parse CSV (supports comma, semicolon, tab delimiters)
  const lines = rawText.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length > 1) {
    const firstLine = lines[0];
    let delimiter = ',';
    if (firstLine.includes(';') && firstLine.split(';').length >= firstLine.split(',').length) {
      delimiter = ';';
    } else if (firstLine.includes('\t') && firstLine.split('\t').length >= firstLine.split(',').length) {
      delimiter = '\t';
    }

    const headers = splitCsvLine(firstLine, delimiter).map((h) => h.replace(/^"|"$/g, '').trim().toLowerCase());
    const nameIndex = headers.findIndex((h) => h.includes('name') || h.includes('game') || h.includes('title') || h.includes('gioco') || h.includes('nome'));
    const bggIdIndex = headers.findIndex((h) => h.includes('bgg') || h.includes('geek'));
    const tagIndex = headers.findIndex(
      (h) => h === 'tags' || h === 'tag' || h === 'tag list' || h.includes('tag') || h.includes('etichett')
    );
    const statusOwnedIndex = headers.findIndex(
      (h) => h === 'statusowned' || h === 'status_owned' || h === 'status owned' || h === 'status:owned'
    );
    const ownedIndex = headers.findIndex(
      (h) =>
        h === 'statusowned' ||
        h === 'status_owned' ||
        h === 'status owned' ||
        h === 'status:owned' ||
        h === 'owned' ||
        h === 'isowned' ||
        h === 'is_owned' ||
        h === 'posseduto' ||
        h === 'own' ||
        h === 'stato' ||
        h === 'status' ||
        h === 'collezione' ||
        h.includes('possedut') ||
        h.includes('status') ||
        h.includes('stato') ||
        h.includes('collezione') ||
        h.includes('collection')
    );
    const wishlistIndex = headers.findIndex(
      (h) => h === 'wishlist' || h === 'iswishlist' || h.includes('desideri') || h.includes('wish')
    );

    let csvHasCollectionStatus = statusOwnedIndex !== -1;
    for (let i = 1; i < lines.length; i++) {
      const parts = splitCsvLine(lines[i], delimiter);
      if (statusOwnedIndex !== -1 && parts[statusOwnedIndex]) {
        csvHasCollectionStatus = true;
        break;
      }
      if (ownedIndex !== -1 && parts[ownedIndex]) {
        if (isCollectionStatusOwned(parts[ownedIndex]) !== null) {
          csvHasCollectionStatus = true;
          break;
        }
      }
      if (wishlistIndex !== -1 && parts[wishlistIndex]) {
        csvHasCollectionStatus = true;
        break;
      }
    }

    if (nameIndex !== -1) {
      for (let i = 1; i < lines.length; i++) {
        const parts = splitCsvLine(lines[i], delimiter);
        const name = parts[nameIndex];
        if (!name) continue;
        totalFound++;

        // Collect tags
        if (tagIndex !== -1 && parts[tagIndex]) {
          const rawTag = parts[tagIndex].trim();
          if (rawTag) {
            const tagParts = rawTag.split(/[,;|]/).map((t) => t.trim()).filter(Boolean);
            for (const t of tagParts) {
              tagCounts.set(t, (tagCounts.get(t) || 0) + 1);
            }
          }
        }

        // Collect status
        if (ownedIndex !== -1 && parts[ownedIndex]) {
          const rawSt = parts[ownedIndex].trim();
          if (rawSt) {
            statusCounts.set(rawSt, (statusCounts.get(rawSt) || 0) + 1);
          }
        }

        let isOwned = isCsvRowOwned(parts, headers, csvHasCollectionStatus);

        if (selectedTag && tagIndex !== -1 && parts[tagIndex]) {
          const tagParts = parts[tagIndex].split(/[,;|]/).map((t) => t.trim().toLowerCase());
          isOwned = tagParts.includes(selectedTag.toLowerCase());
        }

        if (isOwned) {
          detectedOwnedCount++;
        } else {
          detectedUnownedCount++;
        }

        if (invertFilter) {
          isOwned = !isOwned;
        }

        if (onlyOwned && !isOwned) {
          skippedUnowned++;
          continue;
        }

        const bggId = bggIdIndex !== -1 ? parseInt(parts[bggIdIndex], 10) || undefined : undefined;
        const embeddedDims = parseDimensionsFromText(lines[i]);
        const info = lookupBoardGameInfo({ bggId, name });
        const width = embeddedDims?.width || info.width;
        const height = embeddedDims?.height || info.height;
        const depth = embeddedDims?.depth || info.depth;

        let dimensionSource = 'Stima standard';
        if (embeddedDims) {
          dimensionSource = 'Note BG Stats';
        } else if (info.found) {
          dimensionSource = 'BGG';
        }

        games.push({
          id: `bgstats-csv-${i}-${Date.now().toString(36)}`,
          name,
          bggId: bggId || info.bggId,
          width: Math.round(width * 10) / 10,
          height: Math.round(height * 10) / 10,
          depth: Math.round(depth * 10) / 10,
          dimensionSource,
          thumbnail: info.thumbnail || undefined,
          image: info.image || undefined,
          year: info.year || undefined,
          players:
            info.minPlayers && info.maxPlayers
              ? info.minPlayers === info.maxPlayers
                ? `${info.minPlayers}`
                : `${info.minPlayers}-${info.maxPlayers}`
              : undefined,
          playtime: info.playingTime || undefined,
          minAge: info.minAge || undefined,
          rating: info.rating,
          weight: info.weight,
          description: info.description || undefined,
          color: generateBoxColor(name),
        });
      }
    }
  }

  const allDetectedTags = Array.from(tagCounts.entries())
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count);

  const allDetectedStatuses = Array.from(statusCounts.entries())
    .map(([status, count]) => ({ status, count }))
    .sort((a, b) => b.count - a.count);

  return {
    games,
    totalFound,
    skippedUnowned,
    detectedOwnedCount,
    detectedUnownedCount,
    allDetectedTags,
    allDetectedStatuses,
  };
}

/**
 * Robust BG Stats export parser (supports JSON export or CSV export).
 * By default filters and imports ONLY games marked as owned ("posseduto").
 * Immediately looks up and assigns verified real box dimensions and BGG metadata.
 */
export function parseBgStatsExport(
  rawText: string,
  options: BgStatsParseOptions = { onlyOwned: true }
): GameBox[] {
  return parseBgStatsExportDetails(rawText, options).games;
}

/**
 * Evaluates whether a game box can physically fit into a target Kallax cube compartment
 * without exceeding internal dimensions (33.5 x 33.5 x 39.0 cm).
 * Checks vertical spine mode, horizontal stack mode, 90° rotations, and layout compatibility.
 * Returns a detailed reason in Italian if it cannot fit.
 */
export function canGameFitInCube(
  cubeWidth: number,
  cubeHeight: number,
  cubeDepth: number,
  currentPlaced: PlacedBox[],
  newGame: GameBox,
  gamesMap: Record<string, GameBox>,
  targetOrientation?: ShelfOrientation,
  targetRotation?: number,
  strictOrientation: boolean = false
): FitCheckResult {
  // Check if box itself exceeds the cube in all possible 3D orientations
  const dims = [newGame.width, newGame.height, newGame.depth].sort((a, b) => a - b);
  const cubeDims = [cubeWidth, cubeHeight, cubeDepth].sort((a, b) => a - b);
  if (dims[0] > cubeDims[0] + 0.1 || dims[1] > cubeDims[1] + 0.1 || dims[2] > cubeDims[2] + 0.1) {
    return {
      canFit: false,
      reason: `La scatola di "${newGame.name}" (${newGame.width} × ${newGame.height} × ${newGame.depth} cm) supera le dimensioni massime fisiche del vano (${cubeWidth} × ${cubeHeight} × ${cubeDepth} cm).`,
    };
  }

  // 1. If preferred target orientation was provided (e.g. moving a box in costa):
  if (targetOrientation !== undefined) {
    const candidateRots = [targetRotation ?? 0, 90, 180, 270];
    for (const testRot of candidateRots) {
      const candidatePlaced: PlacedBox[] = [
        ...currentPlaced,
        {
          id: 'test-new-box',
          gameId: newGame.id,
          cubeRow: 0,
          cubeCol: 0,
          orientation: targetOrientation,
          rotation90: testRot,
          order: currentPlaced.length,
        },
      ];
      const testMap = { ...gamesMap, [newGame.id]: newGame };
      const space = calculateCubeSpace(cubeWidth, cubeHeight, cubeDepth, candidatePlaced, testMap);
      if (!space.isOverflowing) {
        return {
          canFit: true,
          suggestedOrientation: targetOrientation,
          suggestedRotation: testRot,
        };
      }
    }

    // If caller strictly mandated targetOrientation (e.g. unit test specifically asserting strict collision):
    if (strictOrientation) {
      const testRot = targetRotation ?? 0;
      const candidatePlaced: PlacedBox[] = [
        ...currentPlaced,
        {
          id: 'test-new-box',
          gameId: newGame.id,
          cubeRow: 0,
          cubeCol: 0,
          orientation: targetOrientation,
          rotation90: testRot,
          order: currentPlaced.length,
        },
      ];
      const testMap = { ...gamesMap, [newGame.id]: newGame };
      const space = calculateCubeSpace(cubeWidth, cubeHeight, cubeDepth, candidatePlaced, testMap);
      let reason = 'Spazio insufficiente nel vano per mantenere la scatola.';
      if (space.isWidthOverflow) {
        reason = `Larghezza superata (${space.totalWidthUsed} cm > ${cubeWidth} cm): le scatole non possono sovrapporsi.`;
      } else if (space.isHeightOverflow) {
        reason = `Altezza superata (${space.totalHeightUsed} cm > ${cubeHeight} cm): supera l'altezza del vano.`;
      } else if (space.isDepthOverflow) {
        reason = `Profondità scatola (${space.maxDepthUsed} cm) sporge oltre il vano (${cubeDepth} cm).`;
      }
      return {
        canFit: false,
        reason,
      };
    }
  }

  // If the cube is empty:
  if (currentPlaced.length === 0) {
    for (const orient of ['vertical', 'horizontal', 'frontal'] as ShelfOrientation[]) {
      for (const rot of [0, 90]) {
        const eff = getEffectiveDimensions(newGame, orient, rot);
        if (
          eff.displayWidth <= cubeWidth + 0.1 &&
          eff.displayHeight <= cubeHeight + 0.1 &&
          eff.shelfDepth <= cubeDepth + 0.1
        ) {
          return {
            canFit: true,
            suggestedOrientation: orient,
            suggestedRotation: rot,
          };
        }
      }
    }
  }

  // Cube has existing boxes
  const currentSpace = calculateCubeSpace(cubeWidth, cubeHeight, cubeDepth, currentPlaced, gamesMap);

  // If dominant layout is vertical:
  if (currentSpace.dominantLayout === 'vertical') {
    for (const rot of [0, 90]) {
      const eff = getEffectiveDimensions(newGame, 'vertical', rot);
      if (
        currentSpace.totalWidthUsed + eff.displayWidth <= cubeWidth + 0.1 &&
        eff.displayHeight <= cubeHeight + 0.1 &&
        eff.shelfDepth <= cubeDepth + 0.1
      ) {
        return {
          canFit: true,
          suggestedOrientation: 'vertical',
          suggestedRotation: rot,
        };
      }
    }
  }

  // If dominant layout is horizontal:
  if (currentSpace.dominantLayout === 'horizontal') {
    for (const rot of [0, 90]) {
      const eff = getEffectiveDimensions(newGame, 'horizontal', rot);
      if (
        currentSpace.totalHeightUsed + eff.displayHeight <= cubeHeight + 0.1 &&
        eff.displayWidth <= cubeWidth + 0.1 &&
        eff.shelfDepth <= cubeDepth + 0.1
      ) {
        return {
          canFit: true,
          suggestedOrientation: 'horizontal',
          suggestedRotation: rot,
        };
      }
    }
  }

  // Also test if newGame can be placed in horizontal orientation stacked with existing boxes:
  for (const rot of [0, 90]) {
    const candidatePlaced: PlacedBox[] = [
      ...currentPlaced,
      {
        id: 'test-new-box',
        gameId: newGame.id,
        cubeRow: 0,
        cubeCol: 0,
        orientation: 'horizontal',
        rotation90: rot,
        order: currentPlaced.length,
      },
    ];
    const testMap = { ...gamesMap, [newGame.id]: newGame };
    const space = calculateCubeSpace(cubeWidth, cubeHeight, cubeDepth, candidatePlaced, testMap);
    if (!space.isOverflowing) {
      return {
        canFit: true,
        suggestedOrientation: 'horizontal',
        suggestedRotation: rot,
      };
    }
  }

  // Also test if newGame can fit in frontal orientation (showcase mode):
  for (const rot of [0, 90, 180, 270]) {
    const candidatePlaced: PlacedBox[] = [
      ...currentPlaced,
      {
        id: 'test-new-box',
        gameId: newGame.id,
        cubeRow: 0,
        cubeCol: 0,
        orientation: 'frontal',
        rotation90: rot,
        order: currentPlaced.length,
      },
    ];
    const testMap = { ...gamesMap, [newGame.id]: newGame };
    const space = calculateCubeSpace(cubeWidth, cubeHeight, cubeDepth, candidatePlaced, testMap);
    if (!space.isOverflowing) {
      return {
        canFit: true,
        suggestedOrientation: 'frontal',
        suggestedRotation: rot,
      };
    }
  }

  // Try auto-optimizing all boxes together (e.g. converting between vertical and horizontal)
  const existingBoxes = currentPlaced.map((p) => gamesMap[p.gameId]).filter(Boolean);
  const allGameObjects = [...existingBoxes, newGame];
  const optimizedConfigs = autoOptimizeCubeLayout(cubeWidth, cubeHeight, cubeDepth, allGameObjects);

  const testPlaced: PlacedBox[] = allGameObjects.map((g, idx) => ({
    id: `test-${idx}`,
    gameId: g.id,
    cubeRow: 0,
    cubeCol: 0,
    orientation: optimizedConfigs[idx]?.orientation ?? 'vertical',
    rotation90: optimizedConfigs[idx]?.rotation90 ?? 0,
    order: idx,
  }));
  const testMap: Record<string, GameBox> = { ...gamesMap, [newGame.id]: newGame };
  const testSpace = calculateCubeSpace(cubeWidth, cubeHeight, cubeDepth, testPlaced, testMap);

  if (!testSpace.isOverflowing) {
    const lastConfig = optimizedConfigs[optimizedConfigs.length - 1];
    return {
      canFit: true,
      suggestedOrientation: lastConfig?.orientation ?? 'vertical',
      suggestedRotation: lastConfig?.rotation90 ?? 0,
    };
  }

  // Does not fit!
  let reason = `Lo spazio residuo nel vano è insufficiente per inserire questa scatola.`;
  if (currentSpace.dominantLayout === 'vertical') {
    const minW = Math.min(newGame.depth, newGame.width);
    const totalW = Math.round((currentSpace.totalWidthUsed + minW) * 10) / 10;
    reason = `Supera la larghezza del vano in costa: servono ${totalW} cm su ${cubeWidth} cm disponibili.`;
  } else if (currentSpace.dominantLayout === 'horizontal') {
    const minH = Math.min(newGame.depth, newGame.height);
    const totalH = Math.round((currentSpace.totalHeightUsed + minH) * 10) / 10;
    reason = `Supera l'altezza del vano in pila: servono ${totalH} cm su ${cubeHeight} cm disponibili.`;
  } else if (testSpace.isWidthOverflow) {
    reason = `Larghezza totale (${testSpace.totalWidthUsed} cm) superiore al limite del vano (${cubeWidth} cm): le scatole non possono sovrapporsi.`;
  } else if (testSpace.isHeightOverflow) {
    reason = `Altezza totale (${testSpace.totalHeightUsed} cm) superiore al limite del vano (${cubeHeight} cm).`;
  } else if (testSpace.isDepthOverflow) {
    reason = `Profondità scatola (${testSpace.maxDepthUsed} cm) sporge oltre i ${cubeDepth} cm del vano.`;
  }

  return {
    canFit: false,
    reason,
  };
}

/**
 * Checks whether rotating a box inside its current cube causes dimensional overflow.
 */
export function canRotateBoxInCube(
  cubeWidth: number,
  cubeHeight: number,
  cubeDepth: number,
  cubePlacedBoxes: PlacedBox[],
  targetPlacedId: string,
  newRotation: number,
  gamesMap: Record<string, GameBox>
): { canRotate: boolean; reason?: string } {
  const nextBoxes = cubePlacedBoxes.map((p) =>
    p.id === targetPlacedId ? { ...p, rotation90: newRotation } : p
  );
  const space = calculateCubeSpace(cubeWidth, cubeHeight, cubeDepth, nextBoxes, gamesMap);
  if (space.isOverflowing) {
    let reason = 'La rotazione farebbe superare le dimensioni del vano.';
    if (space.isHeightOverflow) reason = `Altezza superata (${space.totalHeightUsed} cm > ${cubeHeight} cm).`;
    else if (space.isWidthOverflow) reason = `Larghezza superata (${space.totalWidthUsed} cm > ${cubeWidth} cm).`;
    else if (space.isDepthOverflow) reason = `Profondità superata (${space.maxDepthUsed} cm > ${cubeDepth} cm).`;
    return { canRotate: false, reason };
  }
  return { canRotate: true };
}

/**
 * Checks whether changing orientation of a box inside its current cube causes dimensional overflow.
 * Automatically tests alternative 90° rotations in the new orientation to find a pose that fits.
 */
export function canChangeOrientationInCube(
  cubeWidth: number,
  cubeHeight: number,
  cubeDepth: number,
  cubePlacedBoxes: PlacedBox[],
  targetPlacedId: string,
  newOrientation: ShelfOrientation,
  gamesMap: Record<string, GameBox>
): { canChange: boolean; reason?: string; suggestedRotation?: number } {
  const targetPlaced = cubePlacedBoxes.find((p) => p.id === targetPlacedId);
  const currentRot = targetPlaced?.rotation90 ?? 0;

  const candidateRots = Array.from(new Set([
    currentRot,
    0,
    90,
    (currentRot + 90) % 360,
    180,
    270,
  ]));

  let bestFailReason = 'Questo orientamento farebbe superare le dimensioni del vano.';

  for (const rot of candidateRots) {
    const nextBoxes = cubePlacedBoxes.map((p) =>
      p.id === targetPlacedId ? { ...p, orientation: newOrientation, rotation90: rot } : p
    );
    const space = calculateCubeSpace(cubeWidth, cubeHeight, cubeDepth, nextBoxes, gamesMap);

    if (!space.isOverflowing) {
      return { canChange: true, suggestedRotation: rot };
    } else {
      if (space.isWidthOverflow) bestFailReason = `Larghezza superata (${space.totalWidthUsed} cm > ${cubeWidth} cm).`;
      else if (space.isHeightOverflow) bestFailReason = `Altezza superata (${space.totalHeightUsed} cm > ${cubeHeight} cm).`;
      else if (space.isDepthOverflow) bestFailReason = `Profondità superata (${space.maxDepthUsed} cm > ${cubeDepth} cm).`;
    }
  }

  return { canChange: false, reason: bestFailReason };
}

export interface NextPoseResult {
  canChange: boolean;
  orientation: ShelfOrientation;
  rotation90: number;
  reason?: string;
  isDifferent: boolean;
}

/**
 * Finds the next valid rotation and/or orientation for a box in a cube compartment
 * that strictly respects internal Kallax dimensions (33.5 x 33.5 x 39.0 cm).
 * 
 * When action === 'rotate':
 *  1. Tests advancing rotation angle by 90° ((rot + 90) % 360) in the current orientation.
 *  2. If 90° does not fit (e.g. rectangular box like Scythe where width 36.5cm exceeds cube height 33.5cm),
 *     it checks (rot + 180) % 360, (rot + 270) % 360.
 *  3. If none in current orientation fit, checks cycling to another orientation (horizontal or frontal) that fits.
 * 
 * When action === 'toggleOrientation':
 *  Cycles orientation vertical -> horizontal -> frontal -> vertical to the next one that fits.
 */
export function getNextValidBoxPose(
  cubeWidth: number,
  cubeHeight: number,
  cubeDepth: number,
  cubePlacedBoxes: PlacedBox[],
  targetPlacedId: string,
  gamesMap: Record<string, GameBox>,
  action: 'rotate' | 'toggleOrientation' = 'rotate'
): NextPoseResult {
  const currentBox = cubePlacedBoxes.find((p) => p.id === targetPlacedId);
  if (!currentBox) {
    return {
      canChange: false,
      orientation: 'vertical',
      rotation90: 0,
      reason: 'Scatola non trovata',
      isDifferent: false,
    };
  }

  const currentOri = currentBox.orientation;
  const currentRot = ((currentBox.rotation90 % 360) + 360) % 360;

  if (action === 'rotate') {
    // 1. Try rotation angles in current orientation: +90, +180, +270
    const candidateAngles = [
      (currentRot + 90) % 360,
      (currentRot + 180) % 360,
      (currentRot + 270) % 360,
    ];

    for (const testAngle of candidateAngles) {
      const nextBoxes = cubePlacedBoxes.map((p) =>
        p.id === targetPlacedId ? { ...p, rotation90: testAngle } : p
      );
      const space = calculateCubeSpace(cubeWidth, cubeHeight, cubeDepth, nextBoxes, gamesMap);
      if (!space.isOverflowing) {
        return {
          canChange: true,
          orientation: currentOri,
          rotation90: testAngle,
          isDifferent: true,
        };
      }
    }

    // 2. If no rotation angle fits in current orientation, check if changing orientation fits
    const altOrientations: ShelfOrientation[] =
      currentOri === 'vertical'
        ? ['horizontal', 'frontal']
        : currentOri === 'horizontal'
        ? ['vertical', 'frontal']
        : ['vertical', 'horizontal'];

    for (const testOri of altOrientations) {
      for (const testAngle of [0, 90, 180, 270]) {
        const nextBoxes = cubePlacedBoxes.map((p) =>
          p.id === targetPlacedId ? { ...p, orientation: testOri, rotation90: testAngle } : p
        );
        const space = calculateCubeSpace(cubeWidth, cubeHeight, cubeDepth, nextBoxes, gamesMap);
        if (!space.isOverflowing) {
          return {
            canChange: true,
            orientation: testOri,
            rotation90: testAngle,
            isDifferent: true,
          };
        }
      }
    }

    return {
      canChange: false,
      orientation: currentOri,
      rotation90: currentRot,
      reason: 'Questa scatola può entrare nel vano solo nella posizione attuale.',
      isDifferent: false,
    };
  } else {
    // Action: toggleOrientation
    const order: ShelfOrientation[] = ['vertical', 'horizontal', 'frontal'];
    const currIdx = order.indexOf(currentOri);
    const candidateOrientations = [
      order[(currIdx + 1) % 3],
      order[(currIdx + 2) % 3],
    ];

    for (const testOri of candidateOrientations) {
      for (const testAngle of [0, 90, 180, 270]) {
        const nextBoxes = cubePlacedBoxes.map((p) =>
          p.id === targetPlacedId ? { ...p, orientation: testOri, rotation90: testAngle } : p
        );
        const space = calculateCubeSpace(cubeWidth, cubeHeight, cubeDepth, nextBoxes, gamesMap);
        if (!space.isOverflowing) {
          return {
            canChange: true,
            orientation: testOri,
            rotation90: testAngle,
            isDifferent: true,
          };
        }
      }
    }

    return {
      canChange: false,
      orientation: currentOri,
      rotation90: currentRot,
      reason: 'Nessun altro orientamento è compatibile con le misure del vano.',
      isDifferent: false,
    };
  }
}

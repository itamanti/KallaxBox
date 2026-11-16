import { GameBox, PlacedBox, ShelfOrientation } from '../types/kallax';
import { getEffectiveDimensions } from './kallaxMath';

/**
 * 2D AABB Box Collision and Stacking Physics Engine for Kallax Cube Compartments.
 * Coordinates are represented in centimeters (cm):
 * x: [0, cubeWidth - boxWidth] (distance from left wall)
 * y: [0, cubeHeight - boxHeight] (distance from bottom floor)
 */

export interface Box2D {
  id: string;
  x: number; // cm from left
  y: number; // cm from floor (0 = sitting on shelf floor)
  width: number; // displayWidth in cm
  height: number; // displayHeight in cm
}

export interface ShelfBounds {
  width: number; // 33.5 cm
  height: number; // 33.5 cm
}

export const clamp = (val: number, min: number, max: number): number => {
  if (min > max) return min;
  return Math.max(min, Math.min(val, max));
};

/**
 * Clamps a box to remain strictly within the physical boundaries of the Kallax shelf compartment.
 * Keeps x between 0 and (shelf.width - box.width), and y between 0 and (shelf.height - box.height).
 */
export const clampToShelf = (box: Box2D, shelf: ShelfBounds): { x: number; y: number } => {
  const minX = 0;
  const maxX = Math.max(0, shelf.width - box.width);
  const minY = 0;
  const maxY = Math.max(0, shelf.height - box.height);

  return {
    x: clamp(box.x, minX, maxX),
    y: clamp(box.y, minY, maxY),
  };
};

/**
 * Computes 2D axis-aligned bounding box (AABB) overlap between two boxes.
 * Returns { overlapX, overlapY } if overlapping, or null if separated.
 */
export const getOverlap = (
  boxA: Box2D,
  boxB: Box2D
): { overlapX: number; overlapY: number } | null => {
  const left = Math.max(boxA.x, boxB.x);
  const right = Math.min(boxA.x + boxA.width, boxB.x + boxB.width);
  const bottom = Math.max(boxA.y, boxB.y);
  const top = Math.min(boxA.y + boxA.height, boxB.y + boxB.height);

  const overlapX = right - left;
  const overlapY = top - bottom;

  // Numerical epsilon of 0.05 cm (0.5 mm) prevents false positive edge contacts
  if (overlapX > 0.05 && overlapY > 0.05) {
    return { overlapX, overlapY };
  }
  return null;
};

/**
 * Checks whether targetBox overlaps with any box in others array.
 */
export const hasAnyOverlap = (targetBox: Box2D, others: Box2D[]): boolean => {
  for (const other of others) {
    if (other.id === targetBox.id) continue;
    if (getOverlap(targetBox, other) !== null) return true;
  }
  return false;
};

/**
 * Finds the closest canonical contact point (wall, floor, or surface of other boxes)
 * where targetBox fits with zero overlap inside the shelf compartment.
 * If no zero-overlap point exists, finds the position that minimizes overlap area.
 */
export const findBestCanonicalPosition = (
  targetBox: Box2D,
  otherBoxes: Box2D[],
  shelf: ShelfBounds
): { x: number; y: number } | null => {
  const maxX = Math.max(0, shelf.width - targetBox.width);
  const maxY = Math.max(0, shelf.height - targetBox.height);

  const xs = new Set<number>([0]);
  const ys = new Set<number>([0]);

  for (const other of otherBoxes) {
    if (other.id === targetBox.id) continue;
    xs.add(other.x);
    xs.add(other.x + other.width);
    xs.add(other.x - targetBox.width);
    ys.add(other.y);
    ys.add(other.y + other.height);
    ys.add(other.y - targetBox.height);
  }

  let bestZeroOverlapPos: { x: number; y: number } | null = null;
  let bestDistSq = Infinity;
  let minOverlapArea = Infinity;
  let bestFallbackPos: { x: number; y: number } | null = null;

  const validXs = Array.from(xs).map((x) => clamp(x, 0, maxX));
  const validYs = Array.from(ys).map((y) => clamp(y, 0, maxY));

  for (const cx of validXs) {
    for (const cy of validYs) {
      const candidate: Box2D = { ...targetBox, x: cx, y: cy };
      let totalOverlap = 0;

      for (const other of otherBoxes) {
        if (other.id === candidate.id) continue;
        const ov = getOverlap(candidate, other);
        if (ov) {
          totalOverlap += ov.overlapX * ov.overlapY;
        }
      }

      if (totalOverlap === 0) {
        const dx = candidate.x - targetBox.x;
        const dy = candidate.y - targetBox.y;
        const distSq = dx * dx + dy * dy;
        if (distSq < bestDistSq) {
          bestDistSq = distSq;
          bestZeroOverlapPos = { x: candidate.x, y: candidate.y };
        }
      } else if (totalOverlap < minOverlapArea) {
        minOverlapArea = totalOverlap;
        bestFallbackPos = { x: candidate.x, y: candidate.y };
      }
    }
  }

  return bestZeroOverlapPos || bestFallbackPos;
};

/**
 * Minimum-penetration separating axis push-away collision resolution.
 * When targetBox is dragged onto otherBoxes, it pushes away along the closest valid
 * boundary outside the colliding obstacles (e.g. stacking above, sliding beside)
 * while strictly adhering to shelf compartment borders.
 */
export const resolveCollisionsAndClamp = (
  targetBox: Box2D,
  otherBoxes: Box2D[],
  shelf: ShelfBounds,
  maxIterations: number = 20
): Box2D => {
  let resolved: Box2D = { ...targetBox };

  // Limit immediately within shelf boundaries
  const initialClamped = clampToShelf(resolved, shelf);
  resolved.x = initialClamped.x;
  resolved.y = initialClamped.y;

  const maxX = Math.max(0, shelf.width - resolved.width);
  const maxY = Math.max(0, shelf.height - resolved.height);

  for (let iter = 0; iter < maxIterations; iter++) {
    let hasCollided = false;

    for (const other of otherBoxes) {
      if (other.id === resolved.id) continue;

      const overlap = getOverlap(resolved, other);
      if (overlap) {
        hasCollided = true;
        const { overlapX, overlapY } = overlap;

        // Candidate placement positions strictly outside the collided box:
        // 1. Stack on top of other
        // 2. Beside other on the right
        // 3. Beside other on the left
        // 4. Slide under other
        interface Candidate {
          x: number;
          y: number;
          bias: number;
        }
        const candidates: Candidate[] = [];

        // Top candidate (stack above) - slight bias for natural top stacking
        const topY = other.y + other.height;
        if (topY <= maxY + 0.05) {
          candidates.push({
            x: clamp(resolved.x, 0, maxX),
            y: clamp(topY, 0, maxY),
            bias: 0.85,
          });
        }

        // Right candidate (beside right)
        const rightX = other.x + other.width;
        if (rightX <= maxX + 0.05) {
          candidates.push({
            x: clamp(rightX, 0, maxX),
            y: clamp(resolved.y, 0, maxY),
            bias: 1.0,
          });
        }

        // Left candidate (beside left)
        const leftX = other.x - resolved.width;
        if (leftX >= -0.05) {
          candidates.push({
            x: clamp(leftX, 0, maxX),
            y: clamp(resolved.y, 0, maxY),
            bias: 1.0,
          });
        }

        // Bottom candidate (under other, if other was suspended)
        const bottomY = other.y - resolved.height;
        if (bottomY >= -0.05) {
          candidates.push({
            x: clamp(resolved.x, 0, maxX),
            y: clamp(bottomY, 0, maxY),
            bias: 1.1,
          });
        }

        if (candidates.length > 0) {
          let bestCand: Candidate | null = null;
          let minScore = Infinity;

          for (const cand of candidates) {
            // Verify candidate is actually separated from this other box
            const testBox: Box2D = { ...resolved, x: cand.x, y: cand.y };
            if (!getOverlap(testBox, other)) {
              const dx = cand.x - resolved.x;
              const dy = cand.y - resolved.y;
              const score = Math.sqrt(dx * dx + dy * dy) * cand.bias;
              if (score < minScore) {
                minScore = score;
                bestCand = cand;
              }
            }
          }

          if (bestCand) {
            resolved.x = bestCand.x;
            resolved.y = bestCand.y;
          }
        } else {
          // Boundary push-away fallback if direct placement candidates hit shelf boundaries
          if (overlapX < overlapY) {
            if (resolved.x + resolved.width / 2 < other.x + other.width / 2) {
              resolved.x = Math.max(0, other.x - resolved.width);
            } else {
              resolved.x = Math.min(maxX, other.x + other.width);
            }
          } else {
            if (resolved.y + resolved.height / 2 < other.y + other.height / 2) {
              resolved.y = Math.max(0, other.y - resolved.height);
            } else {
              resolved.y = Math.min(maxY, other.y + other.height);
            }
          }
        }

        // Re-clamp to shelf borders
        const clamped = clampToShelf(resolved, shelf);
        resolved.x = clamped.x;
        resolved.y = clamped.y;
      }
    }

    if (!hasCollided) break;
  }

  // If still colliding after direct iterations, perform canonical contact point placement
  if (hasAnyOverlap(resolved, otherBoxes)) {
    const canonical = findBestCanonicalPosition(targetBox, otherBoxes, shelf);
    if (canonical) {
      resolved.x = canonical.x;
      resolved.y = canonical.y;
    }
  }

  // Round coordinates to 1 decimal place (millimeter precision)
  resolved.x = Math.round(resolved.x * 10) / 10;
  resolved.y = Math.round(resolved.y * 10) / 10;

  return resolved;
};

/**
 * Snaps a box onto the floor (y = 0) or onto the top surface of a supporting box below it.
 * Re-validates that the snapped position does not produce overlaps with any other box.
 */
export const snapToSupportOrFloor = (
  box: Box2D,
  otherBoxes: Box2D[],
  snapThreshold: number = 1.8 // cm threshold
): Box2D => {
  let bestY = 0; // default floor

  // Find if there is any box directly underneath whose top surface can support this box
  for (const other of otherBoxes) {
    if (other.id === box.id) continue;

    // Check if horizontal spans overlap significantly
    const spanOverlapLeft = Math.max(box.x, other.x);
    const spanOverlapRight = Math.min(box.x + box.width, other.x + other.width);

    if (spanOverlapRight - spanOverlapLeft > 1.0) {
      const otherTop = other.y + other.height;
      if (box.y >= otherTop - 0.5 && box.y <= otherTop + snapThreshold) {
        bestY = Math.max(bestY, otherTop);
      }
    }
  }

  let candidateY = box.y;
  if (bestY === 0 && box.y <= snapThreshold) {
    candidateY = 0;
  } else if (bestY > 0) {
    candidateY = Math.round(bestY * 10) / 10;
  }

  const snapped: Box2D = { ...box, y: candidateY };

  // Verify snap does not cause collision
  if (hasAnyOverlap(snapped, otherBoxes)) {
    return box; // Reject snap if collision created
  }

  return snapped;
};

/**
 * Resolves all box positions within a compartment to guarantee zero overlaps among all boxes.
 */
export const resolveAllCubePositions = (
  boxes: Box2D[],
  shelf: ShelfBounds
): Box2D[] => {
  // Sort boxes to settle lower boxes first
  const sorted = [...boxes].sort((a, b) => {
    if (Math.abs(a.y - b.y) > 0.5) return a.y - b.y;
    return a.x - b.x;
  });

  const settled: Box2D[] = [];
  for (const box of sorted) {
    const resolved = resolveCollisionsAndClamp(box, settled, shelf);
    settled.push(resolved);
  }

  // Return boxes preserving their original IDs and order
  return boxes.map((b) => settled.find((s) => s.id === b.id) || b);
};

/**
 * Synchronizes and updates PlacedBox instances in a cube with non-overlapping physical positions.
 */
export const syncCubePlacedBoxesPositions = (
  cubeBoxes: PlacedBox[],
  gamesMap: Record<string, GameBox>,
  shelf: ShelfBounds
): PlacedBox[] => {
  if (cubeBoxes.length === 0) return [];

  const horizBoxes = cubeBoxes.filter((p) => p.orientation === 'horizontal');
  const sortedHoriz = [...horizBoxes].sort((a, b) => a.order - b.order);
  const nonHoriz = cubeBoxes
    .filter((p) => p.orientation !== 'horizontal')
    .sort((a, b) => a.order - b.order);

  // 1. Convert to initial Box2D representation
  const initialBoxes2D: Box2D[] = cubeBoxes.map((placed) => {
    const game = gamesMap[placed.gameId];
    const eff = game
      ? getEffectiveDimensions(game, placed.orientation, placed.rotation90)
      : { displayWidth: 10, displayHeight: 10, shelfDepth: 10 };

    let x = placed.posX;
    let y = placed.posY;

    if (x === undefined || y === undefined) {
      if (placed.orientation === 'horizontal') {
        let accumulatedY = 0;
        for (const h of sortedHoriz) {
          if (h.id === placed.id) break;
          const hg = gamesMap[h.gameId];
          if (hg) {
            const he = getEffectiveDimensions(hg, h.orientation, h.rotation90);
            accumulatedY += he.displayHeight;
          }
        }
        x = 0;
        y = accumulatedY;
      } else {
        let accumulatedX = 0;
        if (horizBoxes.length > 0) {
          let maxHW = 0;
          for (const h of horizBoxes) {
            const hg = gamesMap[h.gameId];
            if (hg) {
              const he = getEffectiveDimensions(hg, h.orientation, h.rotation90);
              maxHW = Math.max(maxHW, he.displayWidth);
            }
          }
          accumulatedX = maxHW;
        }
        for (const nh of nonHoriz) {
          if (nh.id === placed.id) break;
          const nhGame = gamesMap[nh.gameId];
          if (nhGame) {
            const nhEff = getEffectiveDimensions(nhGame, nh.orientation, nh.rotation90);
            accumulatedX += nhEff.displayWidth;
          }
        }
        x = accumulatedX;
        y = 0;
      }
    }

    return {
      id: placed.id,
      x,
      y,
      width: eff.displayWidth,
      height: eff.displayHeight,
    };
  });

  // 2. Resolve all collisions and clamps
  const resolved2D = resolveAllCubePositions(initialBoxes2D, shelf);

  // 3. Map back to PlacedBox
  return cubeBoxes.map((p) => {
    const r = resolved2D.find((b) => b.id === p.id);
    if (!r) return p;
    return {
      ...p,
      posX: r.x,
      posY: r.y,
    };
  });
};

/**
 * Packs boxes without leaving gaps between them (affiancamento perfetto a contatto).
 * Orders columns and boxes according to the exact positions the user placed them on screen:
 * - Eliminates all gaps by packing columns flush from left to right (currentX += col.width).
 * - Preserves vertical stacking within columns from bottom to top (currentY += box.height).
 * - Distinguishes between stacks and side-by-side boxes.
 * - Handles ties using user interaction timestamps (lastMovedAt) and initial order.
 */
export const packAndAlignWithoutGaps = (
  cubeBoxes: PlacedBox[],
  gamesMap: Record<string, GameBox>,
  shelf: ShelfBounds
): PlacedBox[] => {
  if (cubeBoxes.length === 0) return [];

  // Compute effective dimensions and visual coordinates for every box
  const items = cubeBoxes.map((b) => {
    const g = gamesMap[b.gameId];
    const eff = g
      ? getEffectiveDimensions(g, b.orientation, b.rotation90)
      : { displayWidth: 10, displayHeight: 10, shelfDepth: 10 };
    const x = b.posX ?? 0;
    const y = b.posY ?? 0;
    return {
      placed: b,
      eff,
      x,
      y,
      width: eff.displayWidth,
      height: eff.displayHeight,
      centerX: x + eff.displayWidth / 2,
      centerY: y + eff.displayHeight / 2,
    };
  });

  // Check if ALL boxes are horizontal
  const allHorizontal = cubeBoxes.every((b) => b.orientation === 'horizontal');
  if (allHorizontal) {
    // Sort vertically by centerY (bottom to top: ascending Y)
    const sortedByY = [...items].sort((a, b) => {
      if (Math.abs(a.centerY - b.centerY) > 0.3) {
        return a.centerY - b.centerY;
      }
      if (Math.abs(a.y - b.y) > 0.3) {
        return a.y - b.y;
      }
      const tA = a.placed.lastMovedAt ?? 0;
      const tB = b.placed.lastMovedAt ?? 0;
      if (tA !== tB) return tA - tB;
      return a.placed.order - b.placed.order;
    });

    let currentY = 0;
    return sortedByY.map((item, idx) => {
      const placedY = Math.round(currentY * 10) / 10;
      currentY += item.height;
      return {
        ...item.placed,
        order: idx,
        posX: 0,
        posY: placedY,
      };
    });
  }

  // Mixed or side-by-side:
  // Detect if any box is stacked vertically on top of another box.
  // Two boxes A and B belong to the same vertical stack/column if:
  // 1. One is noticeably above the other: |a.y - b.y| >= min(a.height, b.height) * 0.4
  // 2. They overlap significantly horizontally:
  //    overlapX >= min(a.width, b.width) * 0.35 || overlapX >= 2.5
  // 3. Their combined height can reasonably fit within shelf: a.height + b.height <= shelf.height + 2.0
  const n = items.length;
  const parent = Array.from({ length: n }, (_, i) => i);
  const find = (i: number): number => {
    if (parent[i] === i) return i;
    parent[i] = find(parent[i]);
    return parent[i];
  };
  const union = (i: number, j: number) => {
    const rootI = find(i);
    const rootJ = find(j);
    if (rootI !== rootJ) parent[rootI] = rootJ;
  };

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const itA = items[i];
      const itB = items[j];
      const vertDiff = Math.abs(itA.y - itB.y);
      const minH = Math.min(itA.height, itB.height);
      const isVertSeparated = vertDiff >= minH * 0.4;

      const overlapX = Math.min(itA.x + itA.width, itB.x + itB.width) - Math.max(itA.x, itB.x);
      const minW = Math.min(itA.width, itB.width);
      const isHorizOverlapping = overlapX >= minW * 0.35 || overlapX >= 2.5;

      const fitsInHeight = itA.height + itB.height <= shelf.height + 2.0;

      if (isVertSeparated && isHorizOverlapping && fitsInHeight) {
        union(i, j);
      }
    }
  }

  // Group items into columns
  const columnMap = new Map<number, typeof items>();
  for (let i = 0; i < n; i++) {
    const root = find(i);
    if (!columnMap.has(root)) {
      columnMap.set(root, []);
    }
    columnMap.get(root)!.push(items[i]);
  }

  // Inside each column, sort items from bottom to top (ascending Y)
  const columns = Array.from(columnMap.values()).map((colItems) => {
    const sortedCol = [...colItems].sort((a, b) => {
      if (Math.abs(a.centerY - b.centerY) > 0.3) {
        return a.centerY - b.centerY;
      }
      if (Math.abs(a.y - b.y) > 0.3) {
        return a.y - b.y;
      }
      const tA = a.placed.lastMovedAt ?? 0;
      const tB = b.placed.lastMovedAt ?? 0;
      if (tA !== tB) return tA - tB;
      return a.placed.order - b.placed.order;
    });

    const minX = Math.min(...colItems.map((c) => c.x));
    const avgCenterX = colItems.reduce((acc, c) => acc + c.centerX, 0) / colItems.length;
    const maxLastMoved = Math.max(...colItems.map((c) => c.placed.lastMovedAt ?? 0));
    const minOrder = Math.min(...colItems.map((c) => c.placed.order));
    const width = Math.max(...colItems.map((c) => c.width));

    return {
      items: sortedCol,
      minX,
      avgCenterX,
      maxLastMoved,
      minOrder,
      width,
    };
  });

  // Sort columns from left to right by their horizontal position
  columns.sort((colA, colB) => {
    // If centers are noticeably different, use horizontal center
    if (Math.abs(colA.avgCenterX - colB.avgCenterX) > 0.8) {
      return colA.avgCenterX - colB.avgCenterX;
    }
    // If centers are very close, compare minX
    if (Math.abs(colA.minX - colB.minX) > 0.5) {
      return colA.minX - colB.minX;
    }
    // If both are near the left edge (e.g. minX <= 1.5 cm) and virtually identical,
    // the one moved more recently by the user takes precedence (placed first)
    if (colA.minX <= 1.5 && colB.minX <= 1.5 && colA.maxLastMoved !== colB.maxLastMoved) {
      return colB.maxLastMoved - colA.maxLastMoved;
    }
    // Fallback: original order
    return colA.minOrder - colB.minOrder;
  });

  // Pack columns sequentially flush against each other from left (x = 0) to right
  let currentX = 0;
  let globalOrder = 0;
  const result: PlacedBox[] = [];

  for (const col of columns) {
    let currentY = 0;
    for (const item of col.items) {
      result.push({
        ...item.placed,
        order: globalOrder++,
        posX: Math.round(currentX * 10) / 10,
        posY: Math.round(currentY * 10) / 10,
      });
      currentY += item.height;
    }
    currentX += col.width;
  }

  return result;
};

export interface PackingValidationResult {
  isValid: boolean;
  errorMessage?: string;
  packedBoxes?: PlacedBox[];
}

/**
 * Validates whether boxes in a cube can be packed flush without exceeding Kallax shelf limits (width, height, depth).
 * Returns isValid: false with an explanatory error message if dimensions are exceeded.
 */
export const validateAndPackCubeBoxes = (
  cubeBoxes: PlacedBox[],
  gamesMap: Record<string, GameBox>,
  shelf: ShelfBounds,
  shelfDepth: number = 39.0
): PackingValidationResult => {
  if (cubeBoxes.length === 0) {
    return { isValid: true, packedBoxes: [] };
  }

  // 1. Pack boxes flush without gaps
  const packed = packAndAlignWithoutGaps(cubeBoxes, gamesMap, shelf);

  // 2. Check each packed box's physical bounds against the Kallax shelf
  let maxPackedX = 0;
  let maxPackedY = 0;
  for (const p of packed) {
    const g = gamesMap[p.gameId];
    if (!g) continue;
    const eff = getEffectiveDimensions(g, p.orientation, p.rotation90);
    const right = (p.posX ?? 0) + eff.displayWidth;
    const top = (p.posY ?? 0) + eff.displayHeight;
    if (right > maxPackedX) maxPackedX = right;
    if (top > maxPackedY) maxPackedY = top;

    if (eff.shelfDepth > shelfDepth + 0.1) {
      return {
        isValid: false,
        errorMessage: `La scatola "${g.name}" supera la profondità del vano (${eff.shelfDepth} cm su ${shelfDepth} cm max).`,
      };
    }
  }

  // Check if width is exceeded (33.5 cm)
  if (maxPackedX > shelf.width + 0.1) {
    const excess = Math.round((maxPackedX - shelf.width) * 10) / 10;
    return {
      isValid: false,
      errorMessage: `Larghezza superata di ${excess} cm: le scatole affiancate occupano ${Math.round(maxPackedX * 10) / 10} cm su ${shelf.width} cm max. Ruota o sposta una scatola.`,
    };
  }

  // Check if height is exceeded (33.5 cm)
  if (maxPackedY > shelf.height + 0.1) {
    const excess = Math.round((maxPackedY - shelf.height) * 10) / 10;
    return {
      isValid: false,
      errorMessage: `Altezza superata di ${excess} cm: le scatole impilate occupano ${Math.round(maxPackedY * 10) / 10} cm su ${shelf.height} cm max. Ruota o sposta una scatola.`,
    };
  }

  return {
    isValid: true,
    packedBoxes: packed,
  };
};


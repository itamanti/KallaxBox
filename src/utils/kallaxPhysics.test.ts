import test from 'node:test';
import assert from 'node:assert/strict';
import {
  clampToShelf,
  getOverlap,
  hasAnyOverlap,
  resolveCollisionsAndClamp,
  snapToSupportOrFloor,
  resolveAllCubePositions,
  syncCubePlacedBoxesPositions,
  packAndAlignWithoutGaps,
  validateAndPackCubeBoxes,
  Box2D,
  ShelfBounds,
} from './kallaxPhysics';
import { GameBox, PlacedBox } from '../types/kallax';

test('clampToShelf prevents boxes from leaving shelf borders', () => {
  const shelf: ShelfBounds = { width: 33.5, height: 33.5 };
  const box: Box2D = { id: 'box1', x: -5, y: 40, width: 20, height: 10 };

  const clamped = clampToShelf(box, shelf);
  assert.equal(clamped.x, 0); // clamped from -5 to 0
  assert.equal(clamped.y, 23.5); // 33.5 - 10 = 23.5 max height
});

test('getOverlap detects overlapping boxes and returns overlap vector', () => {
  const boxA: Box2D = { id: 'a', x: 0, y: 0, width: 20, height: 10 };
  const boxB: Box2D = { id: 'b', x: 10, y: 5, width: 20, height: 10 };

  const overlap = getOverlap(boxA, boxB);
  assert.ok(overlap !== null);
  assert.equal(overlap.overlapX, 10);
  assert.equal(overlap.overlapY, 5);

  const separatedBox: Box2D = { id: 'c', x: 25, y: 0, width: 5, height: 5 };
  assert.equal(getOverlap(boxA, separatedBox), null);
});

test('resolveCollisionsAndClamp resolves penetration when dragged directly over another box at (0, 0)', () => {
  const shelf: ShelfBounds = { width: 33.5, height: 33.5 };
  // Catan resting on floor: x=0, y=0, width=29.6, height=7.6
  const catan: Box2D = { id: 'catan', x: 0, y: 0, width: 29.6, height: 7.6 };

  // Azul dragged directly at x=0, y=0 (same origin as Catan)
  const azul: Box2D = { id: 'azul', x: 0, y: 0, width: 26.0, height: 7.0 };

  const resolved = resolveCollisionsAndClamp(azul, [catan], shelf);

  // Stacks vertically on top of Catan at y = 7.6
  assert.equal(resolved.x, 0);
  assert.equal(resolved.y, 7.6);
  assert.equal(getOverlap(resolved, catan), null);
});

test('resolveCollisionsAndClamp resolves 3 stacked games with zero overlap', () => {
  const shelf: ShelfBounds = { width: 33.5, height: 33.5 };
  const catan: Box2D = { id: 'catan', x: 0, y: 0, width: 29.6, height: 7.6 };
  const azul: Box2D = { id: 'azul', x: 0, y: 7.6, width: 26.0, height: 7.0 };
  // Third box dragged over
  const terra: Box2D = { id: 'terra', x: 0, y: 0, width: 29.6, height: 7.0 };

  const resolvedTerra = resolveCollisionsAndClamp(terra, [catan, azul], shelf);
  assert.equal(getOverlap(resolvedTerra, catan), null);
  assert.equal(getOverlap(resolvedTerra, azul), null);
  assert.equal(resolvedTerra.y, 14.6);
});

test('snapToSupportOrFloor snaps box onto lower box top surface without collision', () => {
  const catan: Box2D = { id: 'catan', x: 0, y: 0, width: 29.6, height: 7.6 };
  // Azul hovering slightly above Catan (y=8.0, threshold 1.8 -> snaps to 7.6)
  const azul: Box2D = { id: 'azul', x: 0, y: 8.0, width: 26.0, height: 7.0 };

  const snapped = snapToSupportOrFloor(azul, [catan]);
  assert.equal(snapped.y, 7.6);
  assert.equal(getOverlap(snapped, catan), null);
});

test('resolveAllCubePositions guarantees no pair of boxes overlaps', () => {
  const shelf: ShelfBounds = { width: 33.5, height: 33.5 };
  const b1: Box2D = { id: '1', x: 0, y: 0, width: 29.6, height: 7.6 };
  const b2: Box2D = { id: '2', x: 0, y: 0, width: 26.0, height: 7.0 };
  const b3: Box2D = { id: '3', x: 0, y: 0, width: 29.6, height: 7.0 };

  const resolved = resolveAllCubePositions([b1, b2, b3], shelf);
  for (let i = 0; i < resolved.length; i++) {
    for (let j = i + 1; j < resolved.length; j++) {
      assert.equal(getOverlap(resolved[i], resolved[j]), null);
    }
  }
});

test('syncCubePlacedBoxesPositions ensures PlacedBox array has valid non-overlapping coordinates', () => {
  const shelf: ShelfBounds = { width: 33.5, height: 33.5 };
  const catanGame: GameBox = {
    id: 'g-catan',
    name: 'Catan',
    width: 29.6,
    height: 29.6,
    depth: 7.6,
    weight: 1.5,
    color: '#D97706',
  };
  const azulGame: GameBox = {
    id: 'g-azul',
    name: 'Azul',
    width: 26.0,
    height: 26.0,
    depth: 7.0,
    weight: 1.2,
    color: '#0284C7',
  };

  const gamesMap = {
    'g-catan': catanGame,
    'g-azul': azulGame,
  };

  const placed: PlacedBox[] = [
    {
      id: 'p-catan',
      gameId: 'g-catan',
      cubeRow: 0,
      cubeCol: 0,
      orientation: 'horizontal',
      rotation90: 0,
      order: 0,
    },
    {
      id: 'p-azul',
      gameId: 'g-azul',
      cubeRow: 0,
      cubeCol: 0,
      orientation: 'horizontal',
      rotation90: 0,
      order: 1,
    },
  ];

  const synced = syncCubePlacedBoxesPositions(placed, gamesMap, shelf);
  assert.equal(synced[0].posY, 0);
  assert.equal(synced[1].posY, 7.6);
});

test('packAndAlignWithoutGaps packs boxes side-by-side without leaving gaps and orders them by posX', () => {
  const shelf: ShelfBounds = { width: 33.5, height: 33.5 };
  const wingspan: GameBox = { id: 'g-w', name: 'Wingspan', width: 29.6, height: 29.6, depth: 7.5 };
  const ticket: GameBox = { id: 'g-t', name: 'Ticket', width: 29.8, height: 29.8, depth: 7.2 };
  const everdell: GameBox = { id: 'g-e', name: 'Everdell', width: 29.7, height: 29.7, depth: 7.2 };
  const gamesMap = { 'g-w': wingspan, 'g-t': ticket, 'g-e': everdell };

  // Boxes deliberately shifted with arbitrary gaps and inverted positions:
  // Ticket is at x=2, Everdell is at x=10, Wingspan is at x=20
  const placed: PlacedBox[] = [
    { id: 'p-w', gameId: 'g-w', cubeRow: 0, cubeCol: 0, orientation: 'vertical', rotation90: 0, order: 0, posX: 20, posY: 0 },
    { id: 'p-t', gameId: 'g-t', cubeRow: 0, cubeCol: 0, orientation: 'vertical', rotation90: 0, order: 1, posX: 2, posY: 0 },
    { id: 'p-e', gameId: 'g-e', cubeRow: 0, cubeCol: 0, orientation: 'vertical', rotation90: 0, order: 2, posX: 10, posY: 0 },
  ];

  const packed = packAndAlignWithoutGaps(placed, gamesMap, shelf);

  // Should re-sort by posX: Ticket first (0 to 7.2), then Everdell (7.2 to 14.4), then Wingspan (14.4 to 21.9)
  assert.equal(packed[0].id, 'p-t');
  assert.equal(packed[0].posX, 0);
  assert.equal(packed[0].order, 0);

  assert.equal(packed[1].id, 'p-e');
  assert.equal(packed[1].posX, 7.2);
  assert.equal(packed[1].order, 1);

  assert.equal(packed[2].id, 'p-w');
  assert.equal(packed[2].posX, 14.4);
  assert.equal(packed[2].order, 2);
});

test('packAndAlignWithoutGaps handles dragging last box to left wall with lastMovedAt', () => {
  const shelf: ShelfBounds = { width: 33.5, height: 33.5 };
  const wingspan: GameBox = { id: 'g-w', name: 'Wingspan', width: 29.6, height: 29.6, depth: 7.5 };
  const ticket: GameBox = { id: 'g-t', name: 'Ticket', width: 29.8, height: 29.8, depth: 7.2 };
  const everdell: GameBox = { id: 'g-e', name: 'Everdell', width: 29.7, height: 29.7, depth: 7.0 };
  const gamesMap = { 'g-w': wingspan, 'g-t': ticket, 'g-e': everdell };

  // Wingspan was at 0, Ticket at 7.5, Everdell at 14.7.
  // User dragged Everdell all the way to left wall (x = 0).
  const placed: PlacedBox[] = [
    { id: 'p-w', gameId: 'g-w', cubeRow: 0, cubeCol: 0, orientation: 'vertical', rotation90: 0, order: 0, posX: 0, posY: 0, lastMovedAt: 100 },
    { id: 'p-t', gameId: 'g-t', cubeRow: 0, cubeCol: 0, orientation: 'vertical', rotation90: 0, order: 1, posX: 7.5, posY: 0, lastMovedAt: 100 },
    { id: 'p-e', gameId: 'g-e', cubeRow: 0, cubeCol: 0, orientation: 'vertical', rotation90: 0, order: 2, posX: 0, posY: 0, lastMovedAt: 200 },
  ];

  const packed = packAndAlignWithoutGaps(placed, gamesMap, shelf);

  // Everdell was moved most recently to x=0, so it should be packed first!
  assert.equal(packed[0].id, 'p-e');
  assert.equal(packed[0].posX, 0);

  // Wingspan was next at x=0
  assert.equal(packed[1].id, 'p-w');
  assert.equal(packed[1].posX, 7.0);

  // Ticket was at x=7.5
  assert.equal(packed[2].id, 'p-t');
  assert.equal(packed[2].posX, 14.5);
});

test('packAndAlignWithoutGaps preserves vertical stacking in mixed layouts without flattening', () => {
  const shelf: ShelfBounds = { width: 33.5, height: 33.5 };
  // Two horizontal boxes stacked on top of each other
  const catan: GameBox = { id: 'g-c', name: 'Catan', width: 20.0, height: 20.0, depth: 7.0 };
  const azul: GameBox = { id: 'g-a', name: 'Azul', width: 20.0, height: 20.0, depth: 6.0 };
  // One vertical box beside them
  const wingspan: GameBox = { id: 'g-w', name: 'Wingspan', width: 29.5, height: 29.5, depth: 7.5 };
  const gamesMap = { 'g-c': catan, 'g-a': azul, 'g-w': wingspan };

  const placed: PlacedBox[] = [
    { id: 'p-c', gameId: 'g-c', cubeRow: 0, cubeCol: 0, orientation: 'horizontal', rotation90: 0, order: 0, posX: 0, posY: 0 },
    { id: 'p-a', gameId: 'g-a', cubeRow: 0, cubeCol: 0, orientation: 'horizontal', rotation90: 0, order: 1, posX: 0, posY: 7.5 },
    { id: 'p-w', gameId: 'g-w', cubeRow: 0, cubeCol: 0, orientation: 'vertical', rotation90: 0, order: 2, posX: 21, posY: 0 },
  ];

  const packed = packAndAlignWithoutGaps(placed, gamesMap, shelf);

  // Catan should be at bottom of Col 1
  const catanPlaced = packed.find(p => p.id === 'p-c')!;
  assert.equal(catanPlaced.posX, 0);
  assert.equal(catanPlaced.posY, 0);

  // Azul should be stacked on top of Catan (height 7.0)
  const azulPlaced = packed.find(p => p.id === 'p-a')!;
  assert.equal(azulPlaced.posX, 0);
  assert.equal(azulPlaced.posY, 7.0);

  // Wingspan should be in Col 2 packed flush beside Col 1 (width 20.0)
  const wingspanPlaced = packed.find(p => p.id === 'p-w')!;
  assert.equal(wingspanPlaced.posX, 20.0);
  assert.equal(wingspanPlaced.posY, 0);
});

test('validateAndPackCubeBoxes succeeds and packs valid arrangement', () => {
  const shelf: ShelfBounds = { width: 33.5, height: 33.5 };
  const wingspan: GameBox = { id: 'g-w', name: 'Wingspan', width: 29.6, height: 29.6, depth: 7.5 };
  const ticket: GameBox = { id: 'g-t', name: 'Ticket to Ride', width: 29.8, height: 29.8, depth: 7.2 };
  const everdell: GameBox = { id: 'g-e', name: 'Everdell', width: 29.7, height: 29.7, depth: 7.0 };
  const gamesMap = { 'g-w': wingspan, 'g-t': ticket, 'g-e': everdell };

  const placed: PlacedBox[] = [
    { id: 'p-w', gameId: 'g-w', cubeRow: 0, cubeCol: 0, orientation: 'vertical', rotation90: 0, order: 0, posX: 0, posY: 0 },
    { id: 'p-t', gameId: 'g-t', cubeRow: 0, cubeCol: 0, orientation: 'vertical', rotation90: 0, order: 1, posX: 5, posY: 0 }, // overlapping
    { id: 'p-e', gameId: 'g-e', cubeRow: 0, cubeCol: 0, orientation: 'vertical', rotation90: 0, order: 2, posX: 10, posY: 0 },
  ];

  const validation = validateAndPackCubeBoxes(placed, gamesMap, shelf);
  assert.equal(validation.isValid, true);
  assert.ok(validation.packedBoxes);
  assert.equal(validation.packedBoxes.length, 3);
  assert.equal(validation.packedBoxes[0].posX, 0);
});

test('validateAndPackCubeBoxes returns error when width is exceeded on lock', () => {
  const shelf: ShelfBounds = { width: 33.5, height: 33.5 };
  const gameA: GameBox = { id: 'g-a', name: 'Game A', width: 29.0, height: 29.0, depth: 10.0 };
  const gameB: GameBox = { id: 'g-b', name: 'Game B', width: 29.0, height: 29.0, depth: 10.0 };
  const gameC: GameBox = { id: 'g-c', name: 'Game C', width: 29.0, height: 29.0, depth: 10.0 };
  const gameD: GameBox = { id: 'g-d', name: 'Game D', width: 29.0, height: 29.0, depth: 10.0 };
  const gamesMap = { 'g-a': gameA, 'g-b': gameB, 'g-c': gameC, 'g-d': gameD };

  // Total width 4 * 10 = 40 cm > 33.5 cm
  const placed: PlacedBox[] = [
    { id: 'p-a', gameId: 'g-a', cubeRow: 0, cubeCol: 0, orientation: 'vertical', rotation90: 0, order: 0, posX: 0, posY: 0 },
    { id: 'p-b', gameId: 'g-b', cubeRow: 0, cubeCol: 0, orientation: 'vertical', rotation90: 0, order: 1, posX: 0, posY: 0 },
    { id: 'p-c', gameId: 'g-c', cubeRow: 0, cubeCol: 0, orientation: 'vertical', rotation90: 0, order: 2, posX: 0, posY: 0 },
    { id: 'p-d', gameId: 'g-d', cubeRow: 0, cubeCol: 0, orientation: 'vertical', rotation90: 0, order: 3, posX: 0, posY: 0 },
  ];

  const validation = validateAndPackCubeBoxes(placed, gamesMap, shelf);
  assert.equal(validation.isValid, false);
  assert.ok(validation.errorMessage?.includes('Larghezza superata'));
});

test('validateAndPackCubeBoxes returns error when height is exceeded on lock', () => {
  const shelf: ShelfBounds = { width: 33.5, height: 33.5 };
  // 5 games stacked horizontally: 5 * 8 = 40 cm > 33.5 cm
  const bigGame: GameBox = { id: 'g-1', name: 'Stack Game', width: 28.0, height: 28.0, depth: 8.0 };
  const gamesMap = { 'g-1': bigGame };

  const placed: PlacedBox[] = [
    { id: 'p-1', gameId: 'g-1', cubeRow: 0, cubeCol: 0, orientation: 'horizontal', rotation90: 0, order: 0, posX: 0, posY: 0 },
    { id: 'p-2', gameId: 'g-1', cubeRow: 0, cubeCol: 0, orientation: 'horizontal', rotation90: 0, order: 1, posX: 0, posY: 8 },
    { id: 'p-3', gameId: 'g-1', cubeRow: 0, cubeCol: 0, orientation: 'horizontal', rotation90: 0, order: 2, posX: 0, posY: 16 },
    { id: 'p-4', gameId: 'g-1', cubeRow: 0, cubeCol: 0, orientation: 'horizontal', rotation90: 0, order: 3, posX: 0, posY: 24 },
    { id: 'p-5', gameId: 'g-1', cubeRow: 0, cubeCol: 0, orientation: 'horizontal', rotation90: 0, order: 4, posX: 0, posY: 32 },
  ];

  const validation = validateAndPackCubeBoxes(placed, gamesMap, shelf);
  assert.equal(validation.isValid, false);
  assert.ok(validation.errorMessage?.includes('Altezza superata'));
});


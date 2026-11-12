import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getEffectiveDimensions,
  calculateCubeSpace,
  autoOptimizeCubeLayout,
  parseBgStatsExport,
  parseBgStatsExportDetails,
  canGameFitInCube,
  getNextValidBoxPose,
  checkPlacementAnomalies,
  canChangeOrientationInCube,
} from './kallaxMath';
import { lookupBoardGameInfo } from '../data/boardGameDatabase';
import { GameBox, PlacedBox } from '../types/kallax';

test('getEffectiveDimensions calculates vertical bookshelf orientation accurately', () => {
  const box = { width: 29.5, height: 29.5, depth: 7.0 };
  
  // Normal vertical bookshelf: spine faces front
  const eff0 = getEffectiveDimensions(box, 'vertical', 0);
  assert.equal(eff0.displayWidth, 7.0); // thickness
  assert.equal(eff0.displayHeight, 29.5); // standing height
  assert.equal(eff0.shelfDepth, 29.5); // depth into shelf

  // Turned 90 degrees
  const eff90 = getEffectiveDimensions(box, 'vertical', 90);
  assert.equal(eff90.displayWidth, 7.0);
  assert.equal(eff90.displayHeight, 29.5);
  assert.equal(eff90.shelfDepth, 29.5);
});

test('getEffectiveDimensions calculates rectangular box orientation with 90 deg rotation', () => {
  const rectangularBox = { width: 36.5, height: 30.0, depth: 9.9 }; // Scythe box
  
  // Horizontal flat 0 deg
  const eff0 = getEffectiveDimensions(rectangularBox, 'horizontal', 0);
  assert.equal(eff0.displayWidth, 36.5);
  assert.equal(eff0.displayHeight, 9.9);
  assert.equal(eff0.shelfDepth, 30.0);

  // Horizontal flat rotated 90 deg (swaps width and shelf depth)
  const eff90 = getEffectiveDimensions(rectangularBox, 'horizontal', 90);
  assert.equal(eff90.displayWidth, 30.0);
  assert.equal(eff90.displayHeight, 9.9);
  assert.equal(eff90.shelfDepth, 36.5);
});

test('calculateCubeSpace computes remaining volume and dimensions correctly', () => {
  const cubeW = 33.5;
  const cubeH = 33.5;
  const cubeD = 39.0;
  // Total volume = 33.5 * 33.5 * 39 = 43767.75 cm3 ~= 43.8 Liters

  const game1: GameBox = {
    id: 'g1',
    name: 'Ticket to Ride',
    width: 29.8,
    height: 29.8,
    depth: 7.2,
  };
  const placed1: PlacedBox = {
    id: 'p1',
    gameId: 'g1',
    cubeRow: 0,
    cubeCol: 0,
    orientation: 'vertical',
    rotation90: 0,
    order: 0,
  };

  const gamesMap = { g1: game1 };
  const space = calculateCubeSpace(cubeW, cubeH, cubeD, [placed1], gamesMap);

  assert.equal(space.boxCount, 1);
  assert.equal(space.totalWidthUsed, 7.2);
  assert.equal(space.remainingWidth, Math.round((33.5 - 7.2) * 10) / 10); // 26.3
  assert.equal(space.isOverflowing, false);
  assert.ok(space.volumePercent > 0 && space.volumePercent < 100);
});

test('calculateCubeSpace flags overflow when boxes exceed width or height', () => {
  const cubeW = 33.5;
  const cubeH = 33.5;
  const cubeD = 39.0;

  // 5 standard boxes of 7.2 cm thickness placed vertically = 36 cm > 33.5 cm
  const game: GameBox = {
    id: 'g1',
    name: 'Wingspan',
    width: 29.6,
    height: 29.6,
    depth: 7.5,
  };

  const placedBoxes: PlacedBox[] = [0, 1, 2, 3, 4].map((i) => ({
    id: `p${i}`,
    gameId: 'g1',
    cubeRow: 0,
    cubeCol: 0,
    orientation: 'vertical',
    rotation90: 0,
    order: i,
  }));

  const gamesMap = { g1: game };
  const space = calculateCubeSpace(cubeW, cubeH, cubeD, placedBoxes, gamesMap);

  assert.equal(space.isWidthOverflow, true);
  assert.equal(space.isOverflowing, true);
});

test('autoOptimizeCubeLayout chooses orientation that fits boxes without overflow', () => {
  const cubeW = 33.5;
  const cubeH = 33.5;
  const cubeD = 39.0;

  const boxes: GameBox[] = [
    { id: '1', name: 'Game A', width: 29.5, height: 29.5, depth: 7.0 },
    { id: '2', name: 'Game B', width: 29.5, height: 29.5, depth: 7.0 },
    { id: '3', name: 'Game C', width: 29.5, height: 29.5, depth: 7.0 },
    { id: '4', name: 'Game D', width: 29.5, height: 29.5, depth: 7.0 },
  ];

  // 4 * 7.0 = 28.0 cm width <= 33.5 cm. Fits in vertical bookshelf!
  const layout = autoOptimizeCubeLayout(cubeW, cubeH, cubeD, boxes);
  assert.equal(layout.length, 4);
  assert.equal(layout[0].orientation, 'vertical');
});

test('parseBgStatsExport parses JSON and CSV formats and immediately retrieves real box dimensions', () => {
  // Test JSON format: game without explicit dimensions (Dune Imperium) must get real dimensions immediately
  const jsonSample = JSON.stringify({
    games: [
      { id: 101, name: 'Brass Birmingham', bggId: 224517, width: 30, height: 30, depth: 5.5 },
      { id: 102, name: 'Dune Imperium', bggId: 316554 },
    ],
  });

  const parsedJson = parseBgStatsExport(jsonSample);
  assert.equal(parsedJson.length, 2);
  assert.equal(parsedJson[0].name, 'Brass Birmingham');
  assert.equal(parsedJson[0].bggId, 224517);
  assert.equal(parsedJson[0].width, 30);
  assert.equal(parsedJson[1].name, 'Dune Imperium');
  assert.equal(parsedJson[1].bggId, 316554);
  assert.equal(parsedJson[1].width, 29.8);
  assert.equal(parsedJson[1].depth, 8.2);

  // Test CSV format: Catan without explicit dimensions must get real dimensions (29.6 x 24.1 x 7.6) immediately
  const csvSample = `Name,BGG ID,Plays
"Catan",13,5
"Carcassonne",822,12`;

  const parsedCsv = parseBgStatsExport(csvSample);
  assert.equal(parsedCsv.length, 2);
  assert.equal(parsedCsv[0].name, 'Catan');
  assert.equal(parsedCsv[0].bggId, 13);
  assert.equal(parsedCsv[0].width, 29.6);
  assert.equal(parsedCsv[0].height, 24.1);
  assert.equal(parsedCsv[0].depth, 7.6);
  assert.equal(parsedCsv[1].name, 'Carcassonne');
  assert.equal(parsedCsv[1].bggId, 822);
  assert.equal(parsedCsv[1].width, 19.0);
  assert.equal(parsedCsv[1].height, 27.5);
  assert.equal(parsedCsv[1].depth, 6.8);
});

test('lookupBoardGameInfo immediately retrieves real box dimensions for BGG games', () => {
  // Wingspan
  const wingspan = lookupBoardGameInfo({ bggId: 266192 });
  assert.equal(wingspan.found, true);
  assert.equal(wingspan.width, 29.6);
  assert.equal(wingspan.height, 29.6);
  assert.equal(wingspan.depth, 7.5);

  // Scythe by name
  const scythe = lookupBoardGameInfo({ name: 'Scythe' });
  assert.equal(scythe.found, true);
  assert.equal(scythe.width, 36.5);
  assert.equal(scythe.height, 30.0);
  assert.equal(scythe.depth, 9.9);

  // 7 Wonders Duel
  const duel = lookupBoardGameInfo({ name: '7 Wonders Duel' });
  assert.equal(duel.found, true);
  assert.equal(duel.width, 20.5);
  assert.equal(duel.height, 20.5);
  assert.equal(duel.depth, 5.2);

  // Scout (small card game)
  const scout = lookupBoardGameInfo({ bggId: 291453 });
  assert.equal(scout.found, true);
  assert.equal(scout.width, 11.0);
  assert.equal(scout.height, 6.5);
  assert.equal(scout.depth, 3.5);
});

test('canGameFitInCube prevents insertion when dimensions are exceeded', () => {
  const cubeW = 33.5;
  const cubeH = 33.5;
  const cubeD = 39.0;

  // Games already occupying 28.0 cm width in vertical orientation
  const gameA: GameBox = { id: 'gA', name: 'Game A', width: 29.5, height: 29.5, depth: 14.0 };
  const gameB: GameBox = { id: 'gB', name: 'Game B', width: 29.5, height: 29.5, depth: 14.0 };
  const placed: PlacedBox[] = [
    { id: 'pA', gameId: 'gA', cubeRow: 0, cubeCol: 0, orientation: 'vertical', rotation90: 0, order: 0 },
    { id: 'pB', gameId: 'gB', cubeRow: 0, cubeCol: 0, orientation: 'vertical', rotation90: 0, order: 1 },
  ];
  const gamesMap = { gA: gameA, gB: gameB };

  // New game that needs 8.0 cm width: 28.0 + 8.0 = 36.0 cm > 33.5 cm
  const oversizedGame: GameBox = { id: 'gC', name: 'Big Game', width: 29.5, height: 29.5, depth: 8.0 };
  const checkOversized = canGameFitInCube(cubeW, cubeH, cubeD, placed, oversizedGame, { ...gamesMap, gC: oversizedGame });
  assert.equal(checkOversized.canFit, false);
  assert.ok(checkOversized.reason?.includes('Supera la larghezza') || checkOversized.reason?.includes('superiore al limite'));

  // Small game that needs 4.0 cm width: 28.0 + 4.0 = 32.0 cm <= 33.5 cm. Should fit!
  const fittingGame: GameBox = { id: 'gD', name: 'Small Card Game', width: 20.0, height: 20.0, depth: 4.0 };
  const checkFitting = canGameFitInCube(cubeW, cubeH, cubeD, placed, fittingGame, { ...gamesMap, gD: fittingGame });
  assert.equal(checkFitting.canFit, true);
  assert.equal(checkFitting.suggestedOrientation, 'vertical');
});

test('canGameFitInCube prevents inserting a single box larger than the entire cube', () => {
  const cubeW = 33.5;
  const cubeH = 33.5;
  const cubeD = 39.0;

  // Giant box 50 x 50 x 50 cm
  const giantGame: GameBox = { id: 'gGiant', name: 'Giant Deluxe Edition', width: 50.0, height: 50.0, depth: 50.0 };
  const checkGiant = canGameFitInCube(cubeW, cubeH, cubeD, [], giantGame, { gGiant: giantGame });
  assert.equal(checkGiant.canFit, false);
});

test('getNextValidBoxPose rotates square box to 90 deg and rectangular box appropriately', () => {
  const cubeW = 33.5;
  const cubeH = 33.5;
  const cubeD = 39.0;

  // Square game Wingspan
  const wingspan: GameBox = { id: 'gw', name: 'Wingspan', width: 29.6, height: 29.6, depth: 7.5 };
  const pWingspan: PlacedBox = { id: 'pw', gameId: 'gw', cubeRow: 0, cubeCol: 0, orientation: 'vertical', rotation90: 0, order: 0 };
  const res1 = getNextValidBoxPose(cubeW, cubeH, cubeD, [pWingspan], 'pw', { gw: wingspan }, 'rotate');
  assert.equal(res1.canChange, true);
  assert.equal(res1.rotation90, 90);

  // Rectangular game Scythe (36.5 x 30.0 x 10.0 cm)
  // At vertical 0°, height is 30.0 cm <= 33.5 cm (fits).
  // At vertical 90°, height would be 36.5 cm > 33.5 cm (does NOT fit).
  // getNextValidBoxPose should advance to 180° which fits!
  const scythe: GameBox = { id: 'gs', name: 'Scythe', width: 36.5, height: 30.0, depth: 10.0 };
  const pScythe: PlacedBox = { id: 'ps', gameId: 'gs', cubeRow: 0, cubeCol: 0, orientation: 'vertical', rotation90: 0, order: 0 };
  const resScythe = getNextValidBoxPose(cubeW, cubeH, cubeD, [pScythe], 'ps', { gs: scythe }, 'rotate');
  assert.equal(resScythe.canChange, true);
  assert.equal(resScythe.rotation90, 180); // skips 90° because 36.5 exceeds 33.5 height!
});

test('canGameFitInCube enforces no overlapping: Cascadia does not go on top of Catan when total width exceeds compartment', () => {
  const cubeW = 33.5;
  const cubeH = 33.5;
  const cubeD = 39.0;

  // Catan lying flat: displayWidth = 29.6 cm, displayHeight = 7.6 cm
  const catan: GameBox = { id: 'g-catan', name: 'Catan', width: 29.6, height: 24.1, depth: 7.6 };
  const pCatan: PlacedBox = { id: 'p-catan', gameId: 'g-catan', cubeRow: 0, cubeCol: 0, orientation: 'horizontal', rotation90: 0, order: 0 };

  // Cascadia vertical: displayWidth = 7.0 cm, displayHeight = 24.0 cm
  // Side-by-side width = 29.6 + 7.0 = 36.6 cm > 33.5 cm (exceeds compartment width!)
  // In Kallax storage, boxes NEVER overlap or stack vertically in mixed mode ("le scatole non si sovrappongono. cascadia non si mette su catan")!
  const cascadia: GameBox = { id: 'g-cascadia', name: 'Cascadia', width: 24.0, height: 24.0, depth: 7.0 };
  const gamesMap = { 'g-catan': catan, 'g-cascadia': cascadia };

  const checkFit = canGameFitInCube(
    cubeW,
    cubeH,
    cubeD,
    [pCatan],
    cascadia,
    gamesMap,
    'vertical',
    0,
    true
  );

  // Must NOT fit because boxes cannot overlap or stack on each other
  assert.equal(checkFit.canFit, false);
  assert.ok(checkFit.reason?.includes('superata') || checkFit.reason?.includes('sovrapporsi'));

  // Also verify calculateCubeSpace marks this mixed combination as overflowing
  const pCascadia: PlacedBox = { id: 'p-cascadia', gameId: 'g-cascadia', cubeRow: 0, cubeCol: 0, orientation: 'vertical', rotation90: 0, order: 1 };
  const space = calculateCubeSpace(cubeW, cubeH, cubeD, [pCatan, pCascadia], gamesMap);
  assert.equal(space.dominantLayout, 'mixed');
  assert.equal(space.isWidthOverflow, true);
  assert.equal(space.isOverflowing, true);
  assert.equal(space.totalWidthUsed, 36.6);
  assert.equal(space.totalHeightUsed, 24.0);
});

test('calculateCubeSpace places mixed boxes side-by-side on shelf floor without vertical stacking', () => {
  const cubeW = 33.5;
  const cubeH = 33.5;
  const cubeD = 39.0;

  // Small horizontal box: 15.0 x 15.0 x 5.0 cm (lying flat -> displayWidth = 15.0 cm, displayHeight = 5.0 cm)
  const horizGame: GameBox = { id: 'gH', name: 'Small Box Flat', width: 15.0, height: 15.0, depth: 5.0 };
  const pHoriz: PlacedBox = { id: 'pH', gameId: 'gH', cubeRow: 0, cubeCol: 0, orientation: 'horizontal', rotation90: 0, order: 0 };

  // Small vertical box in costa: 20.0 x 20.0 x 6.0 cm (vertical -> displayWidth = 6.0 cm, displayHeight = 20.0 cm)
  // Side-by-side width = 15.0 + 6.0 = 21.0 cm <= 33.5 cm!
  // Side-by-side height = max(5.0, 20.0) = 20.0 cm <= 33.5 cm!
  const vertGame: GameBox = { id: 'gV', name: 'Small Box Costa', width: 20.0, height: 20.0, depth: 6.0 };
  const gamesMap = { gH: horizGame, gV: vertGame };

  const checkFit = canGameFitInCube(
    cubeW,
    cubeH,
    cubeD,
    [pHoriz],
    vertGame,
    gamesMap,
    'vertical',
    0
  );

  assert.equal(checkFit.canFit, true);

  const pVert: PlacedBox = { id: 'pV', gameId: 'gV', cubeRow: 0, cubeCol: 0, orientation: 'vertical', rotation90: 0, order: 1 };
  const space = calculateCubeSpace(cubeW, cubeH, cubeD, [pHoriz, pVert], gamesMap);
  assert.equal(space.dominantLayout, 'mixed');
  assert.equal(space.isOverflowing, false);
  // Total width is side-by-side sum: 15.0 + 6.0 = 21.0 cm
  assert.equal(space.totalWidthUsed, 21.0);
  // Total height is maximum standing height: max(5.0, 20.0) = 20.0 cm
  assert.equal(space.totalHeightUsed, 20.0);
});

test('Azul can be stacked horizontally on top of Catan without overflow', () => {
  const cubeW = 33.5;
  const cubeH = 33.5;
  const cubeD = 39.0;

  // Catan lying flat: 29.6 x 24.1 x 7.6 cm
  const catan: GameBox = { id: 'g-catan', name: 'Catan', width: 29.6, height: 24.1, depth: 7.6 };
  const pCatan: PlacedBox = { id: 'p-catan', gameId: 'g-catan', cubeRow: 0, cubeCol: 0, orientation: 'horizontal', rotation90: 0, order: 0 };

  // Azul lying flat: 26.0 x 26.0 x 7.0 cm
  const azul: GameBox = { id: 'g-azul', name: 'Azul', width: 26.0, height: 26.0, depth: 7.0 };
  const pAzul: PlacedBox = { id: 'p-azul', gameId: 'g-azul', cubeRow: 0, cubeCol: 0, orientation: 'horizontal', rotation90: 0, order: 1 };

  const gamesMap = { 'g-catan': catan, 'g-azul': azul };

  // Testing canGameFitInCube when Azul is added to cube with Catan
  const checkFit = canGameFitInCube(cubeW, cubeH, cubeD, [pCatan], azul, gamesMap);
  assert.equal(checkFit.canFit, true);

  // Stacking both in horizontal orientation
  const space = calculateCubeSpace(cubeW, cubeH, cubeD, [pCatan, pAzul], gamesMap);
  assert.equal(space.dominantLayout, 'horizontal');
  assert.equal(space.isOverflowing, false);
  // Total height is sum of heights: 7.6 + 7.0 = 14.6 cm <= 33.5 cm
  assert.equal(space.totalHeightUsed, 14.6);
  // Total width is max width: max(29.6, 26.0) = 29.6 cm <= 33.5 cm
  assert.equal(space.totalWidthUsed, 29.6);
});

test('checkPlacementAnomalies validates correct layout in vano 1,1 with Wingspan, Ticket to Ride, Everdell', () => {
  const cubeW = 33.5;
  const cubeH = 33.5;
  const cubeD = 39.0;

  const wingspan: GameBox = { id: 'g-wingspan', name: 'Wingspan', width: 29.6, height: 29.6, depth: 7.5 };
  const ticket: GameBox = { id: 'g-ticket', name: 'Ticket to Ride: Europa', width: 29.8, height: 29.8, depth: 7.2 };
  const everdell: GameBox = { id: 'g-everdell', name: 'Everdell', width: 29.7, height: 29.7, depth: 7.2 };

  const gamesMap = {
    'g-wingspan': wingspan,
    'g-ticket': ticket,
    'g-everdell': everdell,
  };

  const validPlaced: PlacedBox[] = [
    { id: 'p-w', gameId: 'g-wingspan', cubeRow: 0, cubeCol: 0, orientation: 'vertical', rotation90: 0, order: 0 },
    { id: 'p-t', gameId: 'g-ticket', cubeRow: 0, cubeCol: 0, orientation: 'vertical', rotation90: 0, order: 1 },
    { id: 'p-e', gameId: 'g-everdell', cubeRow: 0, cubeCol: 0, orientation: 'vertical', rotation90: 0, order: 2 },
  ];

  const checkValid = checkPlacementAnomalies(cubeW, cubeH, cubeD, validPlaced, gamesMap);
  assert.equal(checkValid.hasAnomalies, false);
});

test('checkPlacementAnomalies flags anomaly and blocks Fatto when Wingspan is set to horizontal in vano 1,1', () => {
  const cubeW = 33.5;
  const cubeH = 33.5;
  const cubeD = 39.0;

  const wingspan: GameBox = { id: 'g-wingspan', name: 'Wingspan', width: 29.6, height: 29.6, depth: 7.5 };
  const ticket: GameBox = { id: 'g-ticket', name: 'Ticket to Ride: Europa', width: 29.8, height: 29.8, depth: 7.2 };
  const everdell: GameBox = { id: 'g-everdell', name: 'Everdell', width: 29.7, height: 29.7, depth: 7.2 };

  const gamesMap = {
    'g-wingspan': wingspan,
    'g-ticket': ticket,
    'g-everdell': everdell,
  };

  // Wingspan horizontal (29.6 cm width) + Ticket (7.2 cm) + Everdell (7.2 cm) = 44.0 cm > 33.5 cm!
  const invalidPlaced: PlacedBox[] = [
    { id: 'p-w', gameId: 'g-wingspan', cubeRow: 0, cubeCol: 0, orientation: 'horizontal', rotation90: 0, order: 0 },
    { id: 'p-t', gameId: 'g-ticket', cubeRow: 0, cubeCol: 0, orientation: 'vertical', rotation90: 0, order: 1 },
    { id: 'p-e', gameId: 'g-everdell', cubeRow: 0, cubeCol: 0, orientation: 'vertical', rotation90: 0, order: 2 },
  ];

  const checkInvalid = checkPlacementAnomalies(cubeW, cubeH, cubeD, invalidPlaced, gamesMap);
  assert.equal(checkInvalid.hasAnomalies, true);
  assert.match(checkInvalid.reason || '', /Larghezza superata/);
});

test('checkPlacementAnomalies flags 2D box overlap anomalies', () => {
  const cubeW = 33.5;
  const cubeH = 33.5;
  const cubeD = 39.0;
  const box1: GameBox = { id: 'g1', name: 'Game 1', width: 20, height: 20, depth: 5 };
  const box2: GameBox = { id: 'g2', name: 'Game 2', width: 20, height: 20, depth: 5 };
  const gamesMap = { g1: box1, g2: box2 };

  const placed: PlacedBox[] = [
    { id: 'p1', gameId: 'g1', cubeRow: 0, cubeCol: 0, orientation: 'horizontal', rotation90: 0, order: 0 },
    { id: 'p2', gameId: 'g2', cubeRow: 0, cubeCol: 0, orientation: 'horizontal', rotation90: 0, order: 1 },
  ];

  // Overlapping 2D coordinates: both at (0, 0)
  const overlapping2D = [
    { id: 'p1', x: 0, y: 0, width: 20, height: 5 },
    { id: 'p2', x: 5, y: 2, width: 20, height: 5 },
  ];

  const check = checkPlacementAnomalies(cubeW, cubeH, cubeD, placed, gamesMap, overlapping2D);
  assert.equal(check.hasAnomalies, true);
  assert.match(check.reason || '', /Sovrapposizione rilevata/);
});

test('canChangeOrientationInCube works strictly on the single box without forcing other boxes in the cube to horizontal', () => {
  const cubeW = 33.5;
  const cubeH = 33.5;
  const cubeD = 39.0;

  // Compartment 1,1 with Wingspan, Ticket to Ride, Everdell (all vertical)
  const wingspan: GameBox = { id: 'g-w', name: 'Wingspan', width: 29.6, height: 29.6, depth: 7.5 };
  const ticket: GameBox = { id: 'g-t', name: 'Ticket', width: 29.8, height: 29.8, depth: 7.2 };
  const everdell: GameBox = { id: 'g-e', name: 'Everdell', width: 29.7, height: 29.7, depth: 7.2 };
  const gamesMap = { 'g-w': wingspan, 'g-t': ticket, 'g-e': everdell };

  const cube00: PlacedBox[] = [
    { id: 'p-w', gameId: 'g-w', cubeRow: 0, cubeCol: 0, orientation: 'vertical', rotation90: 0, order: 0 },
    { id: 'p-t', gameId: 'g-t', cubeRow: 0, cubeCol: 0, orientation: 'vertical', rotation90: 0, order: 1 },
    { id: 'p-e', gameId: 'g-e', cubeRow: 0, cubeCol: 0, orientation: 'vertical', rotation90: 0, order: 2 },
  ];

  // If a user clicks 'in pila' on Wingspan ALONE, it must NOT fit alone because 29.6 + 7.2 + 7.2 = 44.0 > 33.5 cm
  // and must NOT falsely return canChange: true by converting Ticket and Everdell to horizontal as well!
  const checkWingspanAlone = canChangeOrientationInCube(cubeW, cubeH, cubeD, cube00, 'p-w', 'horizontal', gamesMap);
  assert.equal(checkWingspanAlone.canChange, false);
  assert.match(checkWingspanAlone.reason || '', /superata/);

  // But for a smaller box that DOES fit beside the vertical boxes (e.g. Carcassonne in compartment 2,2):
  const cascadia: GameBox = { id: 'g-casc', name: 'Cascadia', width: 24.0, height: 24.0, depth: 7.0 };
  const duel: GameBox = { id: 'g-duel', name: 'Duel', width: 20.4, height: 20.4, depth: 5.2 };
  const carcassonne: GameBox = { id: 'g-carc', name: 'Carcassonne', width: 19.0, height: 27.5, depth: 6.8 };
  const gamesMap2 = { 'g-casc': cascadia, 'g-duel': duel, 'g-carc': carcassonne };

  const cube11: PlacedBox[] = [
    { id: 'p-casc', gameId: 'g-casc', cubeRow: 1, cubeCol: 1, orientation: 'vertical', rotation90: 0, order: 0 },
    { id: 'p-duel', gameId: 'g-duel', cubeRow: 1, cubeCol: 1, orientation: 'vertical', rotation90: 0, order: 1 },
    { id: 'p-carc', gameId: 'g-carc', cubeRow: 1, cubeCol: 1, orientation: 'vertical', rotation90: 0, order: 2 },
  ];

  // Carcassonne lying flat (19.0 cm width) beside Cascadia (7.0 cm) and Duel (5.2 cm) -> 19.0 + 7.0 + 5.2 = 31.2 cm <= 33.5 cm!
  // Setting Carcassonne alone to horizontal fits!
  const checkCarcassonneAlone = canChangeOrientationInCube(cubeW, cubeH, cubeD, cube11, 'p-carc', 'horizontal', gamesMap2);
  assert.equal(checkCarcassonneAlone.canChange, true);
  assert.equal(checkCarcassonneAlone.suggestedRotation, 0);
});

test('parseBgStatsExportDetails filters out wishlist, previously owned and unowned games from JSON', () => {
  const jsonWithOwnership = JSON.stringify({
    games: [
      { id: 1, name: 'Wingspan', bggId: 266192, isOwned: 1 },
      { id: 2, name: 'Root', bggId: 237182, isOwned: 1 },
      { id: 3, name: 'Gloomhaven', bggId: 174430, isOwned: 0, isWishlist: 1 },
      { id: 4, name: 'Scythe', bggId: 169786, isOwned: 0, isPrevOwned: 1 },
      { id: 5, name: 'Brass Birmingham', bggId: 224517, isOwned: 0, status: 'Non posseduto' },
      { id: 6, name: 'Everdell', bggId: 199792, copies: [{ own: true, status: 'own' }] },
      { id: 7, name: 'Azul', bggId: 230802, copies: [{ own: false, status: 'prevOwned' }] },
    ],
  });

  // Default behavior: onlyOwned = true
  const details = parseBgStatsExportDetails(jsonWithOwnership);
  assert.equal(details.totalFound, 7);
  assert.equal(details.skippedUnowned, 4); // Gloomhaven, Scythe, Brass, Azul
  assert.equal(details.games.length, 3); // Wingspan, Root, Everdell
  const importedNames = details.games.map((g) => g.name);
  assert.ok(importedNames.includes('Wingspan'));
  assert.ok(importedNames.includes('Root'));
  assert.ok(importedNames.includes('Everdell'));
  assert.ok(!importedNames.includes('Gloomhaven'));
  assert.ok(!importedNames.includes('Scythe'));
  assert.ok(!importedNames.includes('Brass Birmingham'));
  assert.ok(!importedNames.includes('Azul'));

  // parseBgStatsExport returns exactly the filtered games
  const directGames = parseBgStatsExport(jsonWithOwnership);
  assert.equal(directGames.length, 3);

  // When onlyOwned: false is specified, all 7 games are returned
  const allDetails = parseBgStatsExportDetails(jsonWithOwnership, { onlyOwned: false });
  assert.equal(allDetails.games.length, 7);
  assert.equal(allDetails.skippedUnowned, 0);
});

test('parseBgStatsExportDetails filters unowned games from CSV exports', () => {
  const csvData = `Name,BGG ID,Owned
"Catan",13,Yes
"Carcassonne",822,1
"Ticket to Ride",9209,No
"Terraforming Mars",167791,Wishlist
"Pandemic",30549,Posseduto`;

  const details = parseBgStatsExportDetails(csvData);
  assert.equal(details.totalFound, 5);
  assert.equal(details.skippedUnowned, 2); // Ticket to Ride (No) and Terraforming Mars (Wishlist)
  assert.equal(details.games.length, 3); // Catan, Carcassonne, Pandemic
  const names = details.games.map((g) => g.name);
  assert.ok(names.includes('Catan'));
  assert.ok(names.includes('Carcassonne'));
  assert.ok(names.includes('Pandemic'));
  assert.ok(!names.includes('Ticket to Ride'));
  assert.ok(!names.includes('Terraforming Mars'));
});

test('parseBgStatsExportDetails handles full BG Stats backup with root-level copies array', () => {
  const fullBackup = JSON.stringify({
    games: [
      { id: 1, uuid: 'uuid-1', name: 'Wingspan', bggId: 266192 },
      { id: 2, uuid: 'uuid-2', name: 'Root', bggId: 237182 },
      { id: 3, uuid: 'uuid-3', name: 'Ark Nova', bggId: 342942 },
    ],
    copies: [
      { gameId: 1, own: true },
      { gameId: 2, own: 1 },
    ],
  });

  const details = parseBgStatsExportDetails(fullBackup);
  assert.equal(details.totalFound, 3);
  assert.equal(details.skippedUnowned, 1); // Ark Nova has no copy in copies array
  assert.equal(details.games.length, 2); // Wingspan and Root
  const names = details.games.map((g) => g.name);
  assert.ok(names.includes('Wingspan'));
  assert.ok(names.includes('Root'));
  assert.ok(!names.includes('Ark Nova'));
});

test('parseBgStatsExportDetails handles Italian semicolon CSVs and invertFilter option', () => {
  const italianCsv = `Gioco;BGG ID;Stato
"Alpaca: Travel, English edition";384461;Posseduto
"Catan";13;In collezione
"Scythe";169786;Non in collezione
"Terraforming Mars";167791;Lista dei desideri`;

  // Normal: only owned
  const normal = parseBgStatsExportDetails(italianCsv, { onlyOwned: true, invertFilter: false });
  assert.equal(normal.totalFound, 4);
  assert.equal(normal.skippedUnowned, 2); // Scythe and Terraforming Mars
  assert.equal(normal.games.length, 2);
  const normalNames = normal.games.map((g) => g.name);
  assert.ok(normalNames.includes('Alpaca: Travel, English edition'));
  assert.ok(normalNames.includes('Catan'));

  // Inverted: invertFilter: true
  const inverted = parseBgStatsExportDetails(italianCsv, { onlyOwned: true, invertFilter: true });
  assert.equal(inverted.games.length, 2);
  const invertedNames = inverted.games.map((g) => g.name);
  assert.ok(invertedNames.includes('Scythe'));
  assert.ok(invertedNames.includes('Terraforming Mars'));
});

test('parseBgStatsExportDetails imports games with collectionStatus "Posseduto" and skips unowned', () => {
  const jsonWithCollectionStatus = JSON.stringify({
    games: [
      { id: 1, name: 'Wingspan', collectionStatus: 'Posseduto' },
      { id: 2, name: 'Catan', collectionStatus: 'Wishlist' },
      { id: 3, name: 'Root', status: 'Posseduto' },
      { id: 4, name: 'Spirit Island' }, // No status in a dataset with collection statuses
    ],
  });

  const details = parseBgStatsExportDetails(jsonWithCollectionStatus, { onlyOwned: true, invertFilter: false });
  assert.equal(details.totalFound, 4);
  assert.equal(details.detectedOwnedCount, 2);
  assert.equal(details.detectedUnownedCount, 2);
  assert.equal(details.skippedUnowned, 2); // Catan (Wishlist) and Spirit Island (no status)
  assert.equal(details.games.length, 2); // Wingspan and Root
  const names = details.games.map((g) => g.name);
  assert.ok(names.includes('Wingspan'));
  assert.ok(names.includes('Root'));
  assert.ok(!names.includes('Catan'));
  assert.ok(!names.includes('Spirit Island'));
});

test('parseBgStatsExportDetails imports games with status/collectionStatus and ignores tags', () => {
  const jsonStatusNotTags = JSON.stringify({
    games: [
      { id: 101, name: 'Everdell', collectionStatus: 'In collezione', tags: ['Euro'] },
      { id: 102, name: 'Azul', status: 'Owned', tags: 'Astratto' },
      { id: 103, name: 'Gloomhaven', collectionStatus: 'Wishlist', tags: ['Posseduto'] }, // Tag says Posseduto, but collectionStatus is Wishlist -> NOT owned!
      { id: 104, name: 'Nemesis', collectionStatus: 'Non posseduto' },
    ],
  });

  const details = parseBgStatsExportDetails(jsonStatusNotTags, { onlyOwned: true, invertFilter: false });
  assert.equal(details.totalFound, 4);
  assert.equal(details.detectedOwnedCount, 2);
  assert.equal(details.games.length, 2);
  const names = details.games.map((g) => g.name);
  assert.ok(names.includes('Everdell'));
  assert.ok(names.includes('Azul'));
  assert.ok(!names.includes('Gloomhaven'), 'Gloomhaven must not be imported when collectionStatus is Wishlist even if tag says Posseduto');
  assert.ok(!names.includes('Nemesis'));
});

test('parseBgStatsExportDetails imports CSV with collection status column and skips unowned', () => {
  const csvData = `Nome;BGG ID;Stato della collezione;Tags
"Alpaca: Travel";384461;Posseduto;"Carte"
"Dune: Imperium";316554;In collezione;""
"Blood Rage";170216;Wishlist;"Posseduto"
"Brass: Birmingham";224517;Da comprare;""
"Concordia";145940;;""`;

  const details = parseBgStatsExportDetails(csvData, { onlyOwned: true, invertFilter: false });
  assert.equal(details.totalFound, 5);
  assert.equal(details.detectedOwnedCount, 2);
  assert.equal(details.games.length, 2);
  const names = details.games.map((g) => g.name);
  assert.ok(names.includes('Alpaca: Travel'));
  assert.ok(names.includes('Dune: Imperium'));
  assert.ok(!names.includes('Blood Rage'));
  assert.ok(!names.includes('Brass: Birmingham'));
  assert.ok(!names.includes('Concordia'));
});

test('parseBgStatsExportDetails skips Agricola when it has generic non-ownership tags like Euro', () => {
  const jsonWithAgricolaUnowned = JSON.stringify({
    games: [
      { id: 1, name: 'Root', collectionStatus: 'Posseduto' },
      { id: 2, name: 'Wingspan', isOwned: 1 },
      { id: 3, name: 'Agricola', tags: ['Euro'] }, // Generic genre tag, not an ownership tag
      { id: 4, name: 'Terraforming Mars', collectionStatus: 'Wishlist' },
    ],
  });

  const details = parseBgStatsExportDetails(jsonWithAgricolaUnowned, { onlyOwned: true });
  assert.equal(details.totalFound, 4);
  assert.equal(details.games.length, 2); // Only Root and Wingspan
  const names = details.games.map((g) => g.name);
  assert.ok(names.includes('Root'));
  assert.ok(names.includes('Wingspan'));
  assert.ok(!names.includes('Agricola'), 'Agricola must not be imported when tag is just Euro');
  assert.ok(!names.includes('Terraforming Mars'));
});

test('parseBgStatsExportDetails imports games with ownership tags like Posseduto or Collezione', () => {
  const jsonWithTags = JSON.stringify({
    games: [
      { id: 1, name: 'Root', tags: ['Posseduto'] },
      { id: 2, name: 'Wingspan', tags: ['In collezione'] },
      { id: 3, name: 'Catan', tags: ['Owned'] },
      { id: 4, name: 'Terraforming Mars', tags: ['Wishlist'] },
    ],
  });

  const details = parseBgStatsExportDetails(jsonWithTags, { onlyOwned: true });
  assert.equal(details.totalFound, 4);
  assert.equal(details.games.length, 3);
  const names = details.games.map((g) => g.name);
  assert.ok(names.includes('Root'));
  assert.ok(names.includes('Wingspan'));
  assert.ok(names.includes('Catan'));
  assert.ok(!names.includes('Terraforming Mars'));
});

test('parseBgStatsExportDetails skips Agricola when other games are owned via copies/isOwned and Agricola has no owned status', () => {
  const jsonWithAgricolaNoCopy = JSON.stringify({
    games: [
      { id: 1, name: 'Root', isOwned: 1 },
      { id: 2, name: 'Wingspan', copies: [{ own: true }] },
      { id: 3, name: 'Agricola', copies: [] }, // No copy owned
      { id: 4, name: 'Catan' }, // No copy or isOwned
    ],
  });

  const details = parseBgStatsExportDetails(jsonWithAgricolaNoCopy, { onlyOwned: true });
  assert.equal(details.totalFound, 4);
  assert.equal(details.games.length, 2); // Root and Wingspan
  const names = details.games.map((g) => g.name);
  assert.ok(!names.includes('Agricola'), 'Agricola must not be imported when copies are empty');
  assert.ok(!names.includes('Catan'));
});

test('parseBgStatsExportDetails verifies statusOwned: true as owned in game object and skips statusOwned: false', () => {
  const jsonWithStatusOwned = JSON.stringify({
    games: [
      { id: 1, name: 'Wingspan', statusOwned: true, statusWishlist: false },
      { id: 2, name: 'Root', statusOwned: 1 },
      { id: 3, name: 'Everdell', statusOwned: 'true' },
      { id: 4, name: 'Catan', statusOwned: false, statusWishlist: true },
      { id: 5, name: 'Scythe', statusOwned: 0 },
      { id: 6, name: 'Terraforming Mars', statusWishlist: true },
    ],
  });

  const details = parseBgStatsExportDetails(jsonWithStatusOwned, { onlyOwned: true });
  assert.equal(details.totalFound, 6);
  assert.equal(details.skippedUnowned, 3); // Catan, Scythe, Terraforming Mars
  assert.equal(details.games.length, 3); // Wingspan, Root, Everdell
  const names = details.games.map((g) => g.name);
  assert.ok(names.includes('Wingspan'));
  assert.ok(names.includes('Root'));
  assert.ok(names.includes('Everdell'));
  assert.ok(!names.includes('Catan'));
  assert.ok(!names.includes('Scythe'));
  assert.ok(!names.includes('Terraforming Mars'));
});

test('parseBgStatsExportDetails verifies statusOwned: true in tag objects and string tags', () => {
  const jsonWithStatusOwnedTags = JSON.stringify({
    games: [
      { id: 1, name: 'Cascadia', tags: [{ name: 'BGG Sync', statusOwned: true }] },
      { id: 2, name: 'Ark Nova', tags: ['statusOwned'] },
      { id: 3, name: 'Dune Imperium', tags: [{ statusOwned: true }] },
      { id: 4, name: 'Brass Birmingham', tags: [{ name: 'Wishlist', statusOwned: false }] },
    ],
  });

  const details = parseBgStatsExportDetails(jsonWithStatusOwnedTags, { onlyOwned: true });
  assert.equal(details.totalFound, 4);
  assert.equal(details.games.length, 3);
  const names = details.games.map((g) => g.name);
  assert.ok(names.includes('Cascadia'));
  assert.ok(names.includes('Ark Nova'));
  assert.ok(names.includes('Dune Imperium'));
  assert.ok(!names.includes('Brass Birmingham'));
});

test('parseBgStatsExportDetails verifies statusOwned column in CSV', () => {
  const csvWithStatusOwned = `name,bggId,statusOwned
"Catan",13,true
"Carcassonne",822,1
"Ticket to Ride",9209,false
"Scythe",169786,0`;

  const details = parseBgStatsExportDetails(csvWithStatusOwned, { onlyOwned: true });
  assert.equal(details.totalFound, 4);
  assert.equal(details.skippedUnowned, 2);
  assert.equal(details.games.length, 2);
  const names = details.games.map((g) => g.name);
  assert.ok(names.includes('Catan'));
  assert.ok(names.includes('Carcassonne'));
  assert.ok(!names.includes('Ticket to Ride'));
  assert.ok(!names.includes('Scythe'));
});

test('parseBgStatsExportDetails imports games with statusOwned: true even when statusWantToPlay or statusForTrade is true', () => {
  const jsonWithMultiStatus = JSON.stringify({
    games: [
      { id: 1, name: 'Wingspan', statusOwned: true, statusWantToPlay: true },
      { id: 2, name: 'Root', statusOwned: true, statusForTrade: true },
      { id: 3, name: 'Ark Nova', statusOwned: false, statusWantToPlay: true },
    ],
  });

  const details = parseBgStatsExportDetails(jsonWithMultiStatus, { onlyOwned: true });
  assert.equal(details.totalFound, 3);
  assert.equal(details.games.length, 2);
  const names = details.games.map((g) => g.name);
  assert.ok(names.includes('Wingspan'));
  assert.ok(names.includes('Root'));
  assert.ok(!names.includes('Ark Nova'));
});

test('parseBgStatsExportDetails handles quoted and varied spacing in statusOwned tags', () => {
  const jsonWithFormattedTags = JSON.stringify({
    games: [
      { id: 1, name: 'Cascadia', tags: ['"statusOwned": true'] },
      { id: 2, name: 'Harmonies', tags: ['statusOwned : true'] },
      { id: 3, name: 'Trio', tags: ['"statusOwned":true'] },
      { id: 4, name: 'Agricola', tags: ['statusOwned: false'] },
    ],
  });

  const details = parseBgStatsExportDetails(jsonWithFormattedTags, { onlyOwned: true });
  assert.equal(details.totalFound, 4);
  assert.equal(details.games.length, 3);
  const names = details.games.map((g) => g.name);
  assert.ok(names.includes('Cascadia'));
  assert.ok(names.includes('Harmonies'));
  assert.ok(names.includes('Trio'));
  assert.ok(!names.includes('Agricola'));
});

test('parseBgStatsExportDetails assigns correct dimensionSource provenance', () => {
  const jsonWithSources = JSON.stringify({
    games: [
      { id: 1, name: 'Custom Game', statusOwned: true, width: 22.0, height: 18.0, depth: 5.0 },
      { id: 2, name: 'Game with Note', statusOwned: true, notes: 'Edition: 15.0 x 10.0 x 4.0 cm' },
      { id: 3, name: 'Wingspan', statusOwned: true }, // Recognized in BGG catalog
      { id: 4, name: 'Completely Unknown Game', statusOwned: true }, // Falls back to standard estimate
    ],
  });

  const details = parseBgStatsExportDetails(jsonWithSources, { onlyOwned: true });
  assert.equal(details.games.length, 4);

  const custom = details.games.find((g) => g.name === 'Custom Game');
  assert.equal(custom?.dimensionSource, 'BG Stats');
  assert.equal(custom?.width, 22.0);

  const noteGame = details.games.find((g) => g.name === 'Game with Note');
  assert.equal(noteGame?.dimensionSource, 'Note BG Stats');
  assert.equal(noteGame?.width, 15.0);

  const wingspan = details.games.find((g) => g.name === 'Wingspan');
  assert.equal(wingspan?.dimensionSource, 'BGG');
  assert.equal(wingspan?.width, 29.6);

  const unknown = details.games.find((g) => g.name === 'Completely Unknown Game');
  assert.equal(unknown?.dimensionSource, 'Stima standard');
});











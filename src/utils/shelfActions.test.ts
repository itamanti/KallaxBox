import test from 'node:test';
import assert from 'node:assert/strict';
import {
  clearAllShelvesPlacements,
  clearSingleShelfPlacements,
  countPlacedBoxesAcrossShelves,
} from './shelfActions';
import { ShelfUnit } from '../types/kallax';

const makeMockShelves = (): ShelfUnit[] => [
  {
    id: 'shelf-1',
    name: 'Kallax Sala',
    config: {
      name: 'Kallax Sala',
      rows: 2,
      cols: 2,
      cubeWidth: 33.5,
      cubeHeight: 33.5,
      cubeDepth: 39,
      shelfColor: 'black-brown',
    },
    placedBoxes: [
      { id: 'p1', gameId: 'g1', cubeRow: 0, cubeCol: 0, orientation: 'vertical', rotation90: 0, order: 0 },
      { id: 'p2', gameId: 'g2', cubeRow: 0, cubeCol: 1, orientation: 'horizontal', rotation90: 0, order: 0 },
    ],
  },
  {
    id: 'shelf-2',
    name: 'Kallax Studio',
    config: {
      name: 'Kallax Studio',
      rows: 2,
      cols: 2,
      cubeWidth: 33.5,
      cubeHeight: 33.5,
      cubeDepth: 39,
      shelfColor: 'white',
    },
    placedBoxes: [
      { id: 'p3', gameId: 'g3', cubeRow: 1, cubeCol: 0, orientation: 'vertical', rotation90: 0, order: 0 },
    ],
  },
];

test('countPlacedBoxesAcrossShelves sums placements across all shelves', () => {
  const shelves = makeMockShelves();
  assert.equal(countPlacedBoxesAcrossShelves(shelves), 3);
  assert.equal(countPlacedBoxesAcrossShelves([]), 0);
});

test('clearAllShelvesPlacements empties every shelf while preserving shelf configs and without mutating input', () => {
  const original = makeMockShelves();
  const { shelves, removedCount } = clearAllShelvesPlacements(original);

  assert.equal(removedCount, 3);
  assert.equal(shelves.length, 2);
  assert.equal(shelves[0].name, 'Kallax Sala');
  assert.equal(shelves[1].name, 'Kallax Studio');
  assert.deepEqual(shelves[0].placedBoxes, []);
  assert.deepEqual(shelves[1].placedBoxes, []);
  // Original remains unmutated
  assert.equal(original[0].placedBoxes.length, 2);
  assert.equal(original[1].placedBoxes.length, 1);
});

test('clearSingleShelfPlacements empties only the targeted shelf', () => {
  const original = makeMockShelves();
  const { shelves, removedCount } = clearSingleShelfPlacements(original, 'shelf-1');

  assert.equal(removedCount, 2);
  assert.deepEqual(shelves[0].placedBoxes, []);
  assert.equal(shelves[1].placedBoxes.length, 1);
  assert.equal(shelves[1].placedBoxes[0].gameId, 'g3');
});

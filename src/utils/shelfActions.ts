import { ShelfUnit } from '../types/kallax';

export function countPlacedBoxesAcrossShelves(shelves: ShelfUnit[]): number {
  return shelves.reduce((total, shelf) => total + shelf.placedBoxes.length, 0);
}

export function clearAllShelvesPlacements(shelves: ShelfUnit[]): {
  shelves: ShelfUnit[];
  removedCount: number;
} {
  let removedCount = 0;
  const nextShelves = shelves.map((shelf) => {
    removedCount += shelf.placedBoxes.length;
    if (shelf.placedBoxes.length === 0) {
      return shelf;
    }
    return {
      ...shelf,
      placedBoxes: [],
    };
  });

  return {
    shelves: nextShelves,
    removedCount,
  };
}

export function clearSingleShelfPlacements(
  shelves: ShelfUnit[],
  shelfId: string
): {
  shelves: ShelfUnit[];
  removedCount: number;
} {
  let removedCount = 0;
  const nextShelves = shelves.map((shelf) => {
    if (shelf.id !== shelfId) {
      return shelf;
    }
    removedCount = shelf.placedBoxes.length;
    return {
      ...shelf,
      placedBoxes: [],
    };
  });

  return {
    shelves: nextShelves,
    removedCount,
  };
}

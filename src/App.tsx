/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import {
  GameBox,
  PlacedBox,
  KallaxConfig,
  ShelfOrientation,
  ShelfUnit,
} from './types/kallax';
import { INITIAL_GAMES, INITIAL_PLACEMENTS } from './data/sampleGames';
import { lookupBoardGameInfo } from './data/boardGameDatabase';
import {
  autoOptimizeCubeLayout,
  canGameFitInCube,
  canRotateBoxInCube,
  canChangeOrientationInCube,
  getNextValidBoxPose,
} from './utils/kallaxMath';
import { syncCubePlacedBoxesPositions } from './utils/kallaxPhysics';
import { ShelfHeader } from './components/ShelfHeader';
import { ShelfOverview } from './components/ShelfOverview';
import { LibraryDrawer } from './components/LibraryDrawer';
import { CubeDetailModal } from './components/CubeDetailModal';
import { BoxEditModal } from './components/BoxEditModal';
import { BggSearchModal } from './components/BggSearchModal';
import { BgStatsImportModal } from './components/BgStatsImportModal';
import { KallaxConfigModal } from './components/KallaxConfigModal';
import { ShelfMenuModal } from './components/ShelfMenuModal';
import { AlertTriangle, CheckCircle2, X } from 'lucide-react';

const DEFAULT_CONFIG: KallaxConfig = {
  rows: 2,
  cols: 2,
  cubeWidth: 33.5,
  cubeHeight: 33.5,
  cubeDepth: 39.0,
  shelfColor: 'white',
  name: 'Kallax Sala Giochi',
};

function sanitizeThumbnail(url?: string): string | undefined {
  if (!url) return undefined;
  if (
    url.includes('scout.jpg') ||
    url.includes('pic5666597.jpg') ||
    url.includes('cascadia.jpg') ||
    url.includes('7wondersduel.jpg') ||
    url.includes('ti4.jpg') ||
    url.includes('burgundy.jpg') ||
    url.includes('splendorduel.jpg') ||
    url.includes('codenames.jpg') ||
    url.includes('justone.jpg') ||
    url.includes('nemesis.jpg') ||
    url.includes('__thumb/img/') ||
    url.includes('__original/img/') ||
    /[\u0900-\u097F]/.test(url)
  ) {
    return undefined;
  }
  return url;
}

export default function App() {
  // Load games state from localStorage or use defaults
  const [allGames, setAllGames] = useState<GameBox[]>(() => {
    try {
      const saved = localStorage.getItem('kallaxbox_games');
      if (saved) {
        const parsed: GameBox[] = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed.map((g) => ({
            ...g,
            thumbnail: sanitizeThumbnail(g.thumbnail),
            dimensionSource: g.dimensionSource || (g.bggId ? 'BGG' : 'Catalogo'),
          }));
        }
      }
      return INITIAL_GAMES;
    } catch {
      return INITIAL_GAMES;
    }
  });

  // Multi-shelf setup: supports multiple Kallax units with persistent storage
  const [shelves, setShelves] = useState<ShelfUnit[]>(() => {
    try {
      const saved = localStorage.getItem('kallaxbox_shelves');
      if (saved) {
        const parsed: ShelfUnit[] = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed.map((s, idx) => {
            const shelfName = typeof s?.name === 'string' && s.name.trim() ? s.name.trim() : `Kallax #${idx + 1}`;
            return {
              id: typeof s?.id === 'string' && s.id ? s.id : `shelf-${idx + 1}`,
              name: shelfName,
              config: {
                ...DEFAULT_CONFIG,
                ...(s?.config || {}),
                name: typeof s?.config?.name === 'string' && s.config.name.trim() ? s.config.name.trim() : shelfName,
                rows: typeof s?.config?.rows === 'number' && s.config.rows > 0 ? s.config.rows : 2,
                cols: typeof s?.config?.cols === 'number' && s.config.cols > 0 ? s.config.cols : 2,
                shelfColor: (['white', 'black-brown', 'oak', 'grey'] as const).includes(s?.config?.shelfColor as any) ? s.config.shelfColor : 'white',
              },
              placedBoxes: Array.isArray(s?.placedBoxes) ? s.placedBoxes : [],
            };
          });
        }
      }
    } catch (e) {
      console.warn('Could not load shelves from localStorage', e);
    }

    // Fallback: migrate from single config and placements if available
    let initialConfig = DEFAULT_CONFIG;
    try {
      const savedCfg = localStorage.getItem('kallaxbox_config');
      if (savedCfg) {
        initialConfig = { ...DEFAULT_CONFIG, ...JSON.parse(savedCfg) };
      }
    } catch {}

    let initialPlacements = INITIAL_PLACEMENTS;
    try {
      const savedPlacements = localStorage.getItem('kallaxbox_placements');
      if (savedPlacements) {
        initialPlacements = JSON.parse(savedPlacements);
      }
    } catch {}

    return [
      {
        id: 'shelf-1',
        name: initialConfig.name || 'Libreria Principale',
        config: initialConfig,
        placedBoxes: initialPlacements,
      },
    ];
  });

  const [activeShelfId, setActiveShelfId] = useState<string>(() => {
    try {
      const savedId = localStorage.getItem('kallaxbox_active_shelf_id');
      if (savedId) return savedId;
    } catch {}
    return 'shelf-1';
  });

  const activeShelf = shelves.find((s) => s.id === activeShelfId) || shelves[0] || {
    id: 'shelf-1',
    name: DEFAULT_CONFIG.name,
    config: DEFAULT_CONFIG,
    placedBoxes: [],
  };

  const config = activeShelf.config;
  const placedBoxes = activeShelf.placedBoxes;

  const setPlacedBoxes = (updater: PlacedBox[] | ((prev: PlacedBox[]) => PlacedBox[])) => {
    setShelves((prevShelves) => {
      const targetId = activeShelf.id;
      const hasTarget = prevShelves.some((s) => s.id === targetId);
      return prevShelves.map((s, idx) => {
        if (s.id === targetId || (!hasTarget && idx === 0)) {
          const nextBoxes = typeof updater === 'function' ? updater(s.placedBoxes) : updater;
          return { ...s, placedBoxes: nextBoxes };
        }
        return s;
      });
    });
  };

  const setConfig = (updater: KallaxConfig | ((prev: KallaxConfig) => KallaxConfig)) => {
    setShelves((prevShelves) => {
      const targetId = activeShelf.id;
      const hasTarget = prevShelves.some((s) => s.id === targetId);
      return prevShelves.map((s, idx) => {
        if (s.id === targetId || (!hasTarget && idx === 0)) {
          const nextConfig = typeof updater === 'function' ? updater(s.config) : updater;
          // Filter out placed boxes that exceed the new rows or columns
          const validBoxes = s.placedBoxes.filter(
            (p) => p.cubeRow < nextConfig.rows && p.cubeCol < nextConfig.cols
          );
          return { ...s, name: nextConfig.name, config: nextConfig, placedBoxes: validBoxes };
        }
        return s;
      });
    });
  };

  const [selectedBoxId, setSelectedBoxId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'2d' | '3d'>(() => {
    try {
      const savedMode = localStorage.getItem('kallaxbox_view_mode');
      return savedMode === '3d' ? '3d' : '2d';
    } catch {
      return '2d';
    }
  });
  const [toast, setToast] = useState<{ message: string; type: 'error' | 'warning' | 'success' } | null>(null);

  // Modals state
  const [cubeDetailCoords, setCubeDetailCoords] = useState<{ row: number; col: number } | null>(null);
  const [editingGame, setEditingGame] = useState<GameBox | null | 'new'>(null);
  const [isBggModalOpen, setIsBggModalOpen] = useState(false);
  const [isBgStatsModalOpen, setIsBgStatsModalOpen] = useState(false);
  const [isConfigModalOpen, setIsConfigModalOpen] = useState(false);
  const [isShelfMenuOpen, setIsShelfMenuOpen] = useState(false);
  const [isLibraryDrawerOpen, setIsLibraryDrawerOpen] = useState(false);

  // Persistence
  useEffect(() => {
    try {
      localStorage.setItem('kallaxbox_shelves', JSON.stringify(shelves));
      localStorage.setItem('kallaxbox_active_shelf_id', activeShelf.id);
      localStorage.setItem('kallaxbox_config', JSON.stringify(activeShelf.config));
      localStorage.setItem('kallaxbox_placements', JSON.stringify(activeShelf.placedBoxes));
    } catch (e) {
      console.warn('Could not save shelves to localStorage', e);
    }
  }, [shelves, activeShelf]);

  useEffect(() => {
    try {
      localStorage.setItem('kallaxbox_games', JSON.stringify(allGames));
    } catch (e) {
      console.warn('Could not save games to localStorage', e);
    }
  }, [allGames]);

  useEffect(() => {
    try {
      localStorage.setItem('kallaxbox_view_mode', viewMode);
    } catch (e) {
      console.warn('Could not save viewMode to localStorage', e);
    }
  }, [viewMode]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 4500);
    return () => clearTimeout(timer);
  }, [toast]);

  // Multi-shelf actions
  const handleAddShelf = (name?: string | unknown, rows = 2, cols = 2) => {
    const safeName = typeof name === 'string' && name.trim() ? name.trim() : undefined;
    const safeRows = typeof rows === 'number' && rows > 0 ? rows : 2;
    const safeCols = typeof cols === 'number' && cols > 0 ? cols : 2;
    const newId = `shelf-${Date.now()}`;
    const shelfNumber = shelves.length + 1;
    const newShelfName = safeName || `Kallax Mobile #${shelfNumber}`;
    const newShelf: ShelfUnit = {
      id: newId,
      name: newShelfName,
      config: {
        ...DEFAULT_CONFIG,
        name: newShelfName,
        rows: safeRows,
        cols: safeCols,
      },
      placedBoxes: [],
    };
    setShelves((prev) => [...prev, newShelf]);
    setActiveShelfId(newId);
    setSelectedBoxId(null);
    setToast({
      type: 'success',
      message: `Scaffale "${newShelfName}" aggiunto alla collezione!`,
    });
  };

  const handleSelectShelf = (shelfId: string) => {
    setActiveShelfId(shelfId);
    setSelectedBoxId(null);
  };

  const handleRenameShelf = (shelfId: string, newName: string) => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    setShelves((prevShelves) => {
      const hasMatch = prevShelves.some((s) => s.id === shelfId);
      return prevShelves.map((s, idx) => {
        if (s.id === shelfId || (!hasMatch && (s.id === activeShelf.id || idx === 0))) {
          return {
            ...s,
            name: trimmed,
            config: {
              ...s.config,
              name: trimmed,
            },
          };
        }
        return s;
      });
    });
    setToast({
      type: 'success',
      message: `Scaffale rinominato in "${trimmed}"!`,
    });
  };

  const handleDeleteShelf = (shelfIdToDelete?: string) => {
    const targetId = shelfIdToDelete || activeShelf.id;
    if (shelves.length <= 1) {
      setToast({
        type: 'warning',
        message: 'Impossibile eliminare l\'unico scaffale presente.',
      });
      return;
    }
    const remaining = shelves.filter((s) => s.id !== targetId);
    setShelves(remaining);
    setActiveShelfId(remaining[0].id);
    setSelectedBoxId(null);
    setToast({
      type: 'success',
      message: 'Scaffale eliminato. I giochi riposti qui sono tornati disponibili nella libreria.',
    });
  };

  const handleClearShelf = () => {
    setPlacedBoxes([]);
    setSelectedBoxId(null);
    setToast({
      type: 'success',
      message: `Scaffale "${config.name}" svuotato. Tutti i giochi sono tornati nella libreria.`,
    });
  };

  // Fast map lookup of games by ID
  const gamesMap = React.useMemo(() => {
    const map: Record<string, GameBox> = {};
    for (const g of allGames) {
      map[g.id] = g;
    }
    return map;
  }, [allGames]);

  const placedGameIds = new Set(shelves.flatMap((s) => s.placedBoxes.map((p) => p.gameId)));
  const unplacedGames = allGames.filter((g) => !placedGameIds.has(g.id));

  // Helper to synchronize all box positions in a specific cube so no boxes overlap
  const syncCubePlacements = (
    boxes: PlacedBox[],
    targetRow: number,
    targetCol: number
  ): PlacedBox[] => {
    const cubeBoxes = boxes.filter((p) => p.cubeRow === targetRow && p.cubeCol === targetCol);
    if (cubeBoxes.length === 0) return boxes;
    const synced = syncCubePlacedBoxesPositions(cubeBoxes, gamesMap, {
      width: config.cubeWidth,
      height: config.cubeHeight,
    });
    const syncedMap = new Map(synced.map((s) => [s.id, s]));
    return boxes.map((p) => syncedMap.get(p.id) || p);
  };

  // Quick rotation on any box (cycles 90° -> 180° -> 270° -> 0° or next valid pose)
  const handleRotateBox = (placedId: string, e?: React.MouseEvent | React.TouchEvent | React.PointerEvent) => {
    if (e && e.stopPropagation) e.stopPropagation();
    const placed = placedBoxes.find((p) => p.id === placedId);
    if (!placed) return;

    const game = gamesMap[placed.gameId];
    const cubeBoxes = placedBoxes.filter(
      (p) => p.cubeRow === placed.cubeRow && p.cubeCol === placed.cubeCol
    );

    const result = getNextValidBoxPose(
      config.cubeWidth,
      config.cubeHeight,
      config.cubeDepth,
      cubeBoxes,
      placed.id,
      gamesMap,
      'rotate'
    );

    if (!result.canChange) {
      setToast({
        type: 'warning',
        message: `Rotazione bloccata: ${result.reason || 'supera le dimensioni del vano'}`,
      });
      return;
    }

    setPlacedBoxes((prev) => {
      const updated = prev.map((p) =>
        p.id === placedId
          ? { ...p, orientation: result.orientation, rotation90: result.rotation90 }
          : p
      );
      return syncCubePlacements(updated, placed.cubeRow, placed.cubeCol);
    });

    const labelOri =
      result.orientation === 'vertical'
        ? 'in costa'
        : result.orientation === 'horizontal'
        ? 'in pila'
        : 'frontale';
    setToast({
      type: 'success',
      message: `"${game?.name || 'Scatola'}": ruotata a ${result.rotation90}° (${labelOri})`,
    });
  };

  // Toggle orientation: vertical -> horizontal -> frontal -> vertical
  const handleToggleOrientation = (placedId: string, e?: React.MouseEvent | React.TouchEvent | React.PointerEvent) => {
    if (e && e.stopPropagation) e.stopPropagation();
    const placed = placedBoxes.find((p) => p.id === placedId);
    if (!placed) return;

    const game = gamesMap[placed.gameId];
    const cubeBoxes = placedBoxes.filter(
      (p) => p.cubeRow === placed.cubeRow && p.cubeCol === placed.cubeCol
    );

    const result = getNextValidBoxPose(
      config.cubeWidth,
      config.cubeHeight,
      config.cubeDepth,
      cubeBoxes,
      placed.id,
      gamesMap,
      'toggleOrientation'
    );

    if (!result.canChange) {
      setToast({
        type: 'warning',
        message: `Cambio orientamento bloccato: ${result.reason || 'supera le dimensioni del vano'}`,
      });
      return;
    }

    setPlacedBoxes((prev) => {
      const updated = prev.map((p) =>
        p.id === placedId
          ? { ...p, orientation: result.orientation, rotation90: result.rotation90 }
          : p
      );
      return syncCubePlacements(updated, placed.cubeRow, placed.cubeCol);
    });

    const labelOri =
      result.orientation === 'vertical'
        ? 'in costa'
        : result.orientation === 'horizontal'
        ? 'in pila'
        : 'frontale';
    setToast({
      type: 'success',
      message: `"${game?.name || 'Scatola'}": orientamento impostato su ${labelOri}`,
    });
  };

  // Directly set physical orientation: 'vertical' (costa), 'horizontal' (pila), or 'frontal'
  const handleSetOrientation = (
    placedId: string,
    orientation: ShelfOrientation,
    e?: React.MouseEvent | React.TouchEvent | React.PointerEvent
  ) => {
    if (e && e.stopPropagation) e.stopPropagation();
    const placed = placedBoxes.find((p) => p.id === placedId);
    if (!placed) return;

    const game = gamesMap[placed.gameId];
    const cubeBoxes = placedBoxes.filter(
      (p) => p.cubeRow === placed.cubeRow && p.cubeCol === placed.cubeCol
    );

    const check = canChangeOrientationInCube(
      config.cubeWidth,
      config.cubeHeight,
      config.cubeDepth,
      cubeBoxes,
      placed.id,
      orientation,
      gamesMap
    );

    if (!check.canChange) {
      setToast({
        type: 'warning',
        message: `Orientamento bloccato: ${check.reason || 'supera le dimensioni del vano'}`,
      });
      return;
    }

    setPlacedBoxes((prev) => {
      const updated = prev.map((p) =>
        p.id === placedId
          ? {
              ...p,
              orientation,
              rotation90: check.suggestedRotation ?? p.rotation90,
              posX: undefined,
              posY: undefined,
            }
          : p
      );
      return syncCubePlacements(updated, placed.cubeRow, placed.cubeCol);
    });

    const labelOri =
      orientation === 'vertical'
        ? 'in costa (verticale)'
        : orientation === 'horizontal'
        ? 'in pila (orizzontale)'
        : 'frontale';
    setToast({
      type: 'success',
      message: `"${game?.name || 'Scatola'}": orientamento impostato su ${labelOri}`,
    });
  };

  // Auto-optimize single cube
  const handleAutoOptimizeCube = (row: number, col: number, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();

    const cubeBoxes = placedBoxes.filter((p) => p.cubeRow === row && p.cubeCol === col);
    if (cubeBoxes.length === 0) return;

    const gameObjects = cubeBoxes.map((p) => gamesMap[p.gameId]).filter(Boolean);
    const optimized = autoOptimizeCubeLayout(
      config.cubeWidth,
      config.cubeHeight,
      config.cubeDepth,
      gameObjects
    );

    setPlacedBoxes((prev) => {
      const updated = prev.map((p) => {
        if (p.cubeRow === row && p.cubeCol === col) {
          const idx = cubeBoxes.findIndex((cb) => cb.id === p.id);
          if (idx !== -1 && optimized[idx]) {
            return {
              ...p,
              orientation: optimized[idx].orientation,
              rotation90: optimized[idx].rotation90,
            };
          }
        }
        return p;
      });
      return syncCubePlacements(updated, row, col);
    });
  };

  // Auto-optimize all cubes across the entire Kallax shelf
  const handleAutoOptimizeAll = () => {
    for (let r = 0; r < config.rows; r++) {
      for (let c = 0; c < config.cols; c++) {
        handleAutoOptimizeCube(r, c);
      }
    }
  };

  // Drag and drop a game into a cube (strictly prevents insertion if dimensions are exceeded!)
  const handleDropGame = (
    gameId: string,
    row: number,
    col: number,
    preferredOrientation?: ShelfOrientation,
    preferredRotation?: number
  ) => {
    const game = gamesMap[gameId];
    if (!game) return;

    const existing = placedBoxes.find((p) => p.gameId === gameId);

    // If game is already placed in this exact cube and no orientation change requested:
    if (
      existing &&
      existing.cubeRow === row &&
      existing.cubeCol === col &&
      (!preferredOrientation || existing.orientation === preferredOrientation)
    ) {
      setToast({
        type: 'success',
        message: `"${game.name}" è già posizionato nel vano [${row + 1},${col + 1}].`,
      });
      return;
    }

    const targetCubeBoxes = placedBoxes.filter(
      (p) => p.cubeRow === row && p.cubeCol === col && p.gameId !== gameId
    );

    // If a preferred orientation is specified, use it; otherwise use existing or auto-detect
    const targetOrientation = preferredOrientation ?? (existing ? existing.orientation : undefined);
    const targetRotation = preferredRotation ?? (existing ? existing.rotation90 : undefined);

    const fit = canGameFitInCube(
      config.cubeWidth,
      config.cubeHeight,
      config.cubeDepth,
      targetCubeBoxes,
      game,
      gamesMap,
      targetOrientation,
      targetRotation,
      false
    );
    if (!fit.canFit) {
      setToast({
        type: 'error',
        message: `Inserimento bloccato nel vano [${row + 1},${col + 1}]: ${fit.reason || 'supera le dimensioni fisiche del vano'}`,
      });
      return;
    }

    if (existing) {
      setPlacedBoxes((prev) => {
        const updated = prev.map((p) =>
          p.id === existing.id
            ? {
                ...p,
                cubeRow: row,
                cubeCol: col,
                orientation: fit.suggestedOrientation ?? targetOrientation ?? existing.orientation,
                rotation90: fit.suggestedRotation ?? targetRotation ?? existing.rotation90,
                order: targetCubeBoxes.length,
                posX: undefined,
                posY: undefined,
              }
            : p
        );
        return syncCubePlacements(updated, row, col);
      });
    } else {
      const newPlaced: PlacedBox = {
        id: `placed-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
        gameId,
        cubeRow: row,
        cubeCol: col,
        orientation: fit.suggestedOrientation ?? targetOrientation ?? 'vertical',
        rotation90: fit.suggestedRotation ?? targetRotation ?? 0,
        order: targetCubeBoxes.length,
      };
      setPlacedBoxes((prev) => syncCubePlacements([...prev, newPlaced], row, col));
    }

    setToast({
      type: 'success',
      message: `"${game.name}" posizionato con successo nel vano [${row + 1},${col + 1}].`,
    });
  };

  const handleUpdatePlacement = (placedId: string, updates: Partial<PlacedBox>) => {
    setPlacedBoxes((prev) =>
      prev.map((p) => (p.id === placedId ? { ...p, ...updates } : p))
    );
  };

  const handleRemovePlacement = (placedId: string) => {
    setPlacedBoxes((prev) => prev.filter((p) => p.id !== placedId));
  };

  // Move a box to another cube (preserves orientation where possible, adapts if needed)
  const handleMoveToCube = (placedId: string, targetRow: number, targetCol: number) => {
    const placed = placedBoxes.find((p) => p.id === placedId);
    if (!placed) return;
    const game = gamesMap[placed.gameId];
    if (!game) return;

    // If moving to the SAME cube where it already is:
    if (placed.cubeRow === targetRow && placed.cubeCol === targetCol) {
      setToast({
        type: 'success',
        message: `"${game.name}" è già posizionato nel vano [${targetRow + 1},${targetCol + 1}].`,
      });
      return;
    }

    const targetCubeBoxes = placedBoxes.filter(
      (p) => p.cubeRow === targetRow && p.cubeCol === targetCol && p.id !== placedId
    );
    const fit = canGameFitInCube(
      config.cubeWidth,
      config.cubeHeight,
      config.cubeDepth,
      targetCubeBoxes,
      game,
      gamesMap,
      placed.orientation,
      placed.rotation90,
      false
    );
    if (!fit.canFit) {
      setToast({
        type: 'error',
        message: `Spostamento bloccato nel vano [${targetRow + 1},${targetCol + 1}]: ${fit.reason || 'supera le dimensioni fisiche del vano'}`,
      });
      return;
    }

    const oldRow = placed.cubeRow;
    const oldCol = placed.cubeCol;

    setPlacedBoxes((prev) => {
      const updated = prev.map((p) =>
        p.id === placedId
          ? {
              ...p,
              cubeRow: targetRow,
              cubeCol: targetCol,
              orientation: fit.suggestedOrientation ?? placed.orientation,
              rotation90: fit.suggestedRotation ?? placed.rotation90,
              order: targetCubeBoxes.length,
              posX: undefined,
              posY: undefined,
            }
          : p
      );
      const syncedTarget = syncCubePlacements(updated, targetRow, targetCol);
      return syncCubePlacements(syncedTarget, oldRow, oldCol);
    });

    setToast({
      type: 'success',
      message: `"${game.name}" spostato con successo nel vano [${targetRow + 1},${targetCol + 1}].`,
    });
  };

  const handleReorderBoxes = (reordered: PlacedBox[]) => {
    setPlacedBoxes((prev) => {
      const map = new Map(reordered.map((r) => [r.id, r]));
      return prev.map((p) => map.get(p.id) || p);
    });
  };

  const handleSaveGame = (savedGame: GameBox) => {
    setAllGames((prev) => {
      const exists = prev.some((g) => g.id === savedGame.id);
      if (exists) {
        return prev.map((g) => (g.id === savedGame.id ? savedGame : g));
      }
      return [savedGame, ...prev];
    });

    // If this game is placed inside any Kallax cube, resync the cube layout to match new dimensions
    setPlacedBoxes((prev) => {
      const affectedCubes = new Set<string>();
      for (const p of prev) {
        if (p.gameId === savedGame.id) {
          affectedCubes.add(`${p.cubeRow},${p.cubeCol}`);
        }
      }
      if (affectedCubes.size === 0) return prev;

      let current = [...prev];
      for (const key of affectedCubes) {
        const [r, c] = key.split(',').map(Number);
        current = syncCubePlacements(current, r, c);
      }
      return current;
    });

    setEditingGame(null);
    setToast({
      type: 'success',
      message: `Scheda BGG e dimensioni di "${savedGame.name}" salvate con successo.`,
    });
  };

  const handleDeleteGame = (gameId: string) => {
    const game = gamesMap[gameId];
    setAllGames((prev) => prev.filter((g) => g.id !== gameId));
    setPlacedBoxes((prev) => prev.filter((p) => p.gameId !== gameId));
    if (game) {
      setToast({
        type: 'success',
        message: `"${game.name}" rimosso dalla collezione.`,
      });
    }
  };

  const handleClearCollection = () => {
    setAllGames([]);
    setPlacedBoxes([]);
    setSelectedBoxId(null);
    localStorage.removeItem('kallaxbox_games');
    localStorage.removeItem('kallaxbox_placements');
    setToast({
      type: 'success',
      message: 'Collezione svuotata con successo. Tutti i vani sono stati liberati.',
    });
  };

  const handleResetSampleGames = () => {
    setAllGames(INITIAL_GAMES);
    setPlacedBoxes(INITIAL_PLACEMENTS);
    setSelectedBoxId(null);
    localStorage.setItem('kallaxbox_games', JSON.stringify(INITIAL_GAMES));
    localStorage.setItem('kallaxbox_placements', JSON.stringify(INITIAL_PLACEMENTS));
    setToast({
      type: 'success',
      message: 'Giochi e posizionamenti di esempio ripristinati.',
    });
  };

  const handleAddMultipleGames = async (newGames: GameBox[]) => {
    const enriched = newGames.map((g) => {
      const info = lookupBoardGameInfo({ bggId: g.bggId, name: g.name });
      const dimSource =
        g.dimensionSource ||
        (info.found
          ? 'BGG'
          : g.width && g.width !== 29.7
          ? 'BG Stats'
          : 'Stima standard');
      return {
        ...g,
        width: g.width && g.width !== 29.7 ? g.width : info.width,
        height: g.height && g.height !== 29.7 ? g.height : info.height,
        depth: g.depth && g.depth !== 7.2 ? g.depth : info.depth,
        dimensionSource: dimSource,
        thumbnail: g.thumbnail || info.thumbnail || undefined,
        image: g.image || info.image || undefined,
        rating: g.rating ?? info.rating,
        weight: g.weight ?? info.weight,
        description: g.description || info.description || undefined,
      };
    });

    setAllGames((prev) => {
      const existingNames = new Set(prev.map((g) => g.name.toLowerCase()));
      const toAdd = enriched.filter((g) => !existingNames.has(g.name.toLowerCase()));
      const combined = [...toAdd, ...prev];
      localStorage.setItem('kallaxbox_games', JSON.stringify(combined));
      return combined;
    });

    setToast({
      type: 'success',
      message: `${enriched.length} giochi importati con successo nella libreria!`,
    });

    // Se non vengono trovate le dimensioni della scatola su BGG/catalogo, cerchiamo in rete
    const needsWebSearch = enriched.filter((g) => {
      const info = lookupBoardGameInfo({ bggId: g.bggId, name: g.name });
      return !info.found;
    });

    if (needsWebSearch.length > 0) {
      try {
        const resp = await fetch('/api/games/batch-web-dimensions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: AbortSignal.timeout(10000),
          body: JSON.stringify({
            games: needsWebSearch.map((g) => ({
              id: g.id,
              name: g.name,
              bggId: g.bggId,
              year: g.year,
            })),
          }),
        });

        if (resp.ok) {
          const data = await resp.json();
          if (Array.isArray(data.results)) {
            const webFoundMap = new Map<string, { width: number; height: number; depth: number; source: string }>();
            for (const r of data.results) {
              if (r.foundOnWeb) {
                webFoundMap.set(r.id, r);
              }
            }

            if (webFoundMap.size > 0) {
              setAllGames((prev) => {
                const updated = prev.map((g) => {
                  const webResult = webFoundMap.get(g.id);
                  if (webResult) {
                    return {
                      ...g,
                      width: webResult.width,
                      height: webResult.height,
                      depth: webResult.depth,
                      dimensionSource: webResult.source || 'Ricerca Web',
                      description: g.description
                        ? `${g.description}\n[Dimensioni trovate in rete: ${webResult.width}×${webResult.height}×${webResult.depth} cm (${webResult.source})]`
                        : `Dimensioni reali trovate in rete (${webResult.width} × ${webResult.height} × ${webResult.depth} cm - ${webResult.source}).`,
                    };
                  }
                  return g;
                });
                localStorage.setItem('kallaxbox_games', JSON.stringify(updated));
                return updated;
              });

              setToast({
                type: 'success',
                message: `Dimensioni reali della scatola aggiornate online per ${webFoundMap.size} giochi!`,
              });
            }
          }
        }
      } catch {
        // Silently keep estimated dimensions if network is unavailable
      }
    }
  };

  const handleUpdateGrid = (newRows: number, newCols: number) => {
    setConfig((prev) => ({ ...prev, rows: newRows, cols: newCols }));
    // Move any boxes that fall outside the resized shelf back to unplaced library
    setPlacedBoxes((prev) =>
      prev.filter((p) => p.cubeRow < newRows && p.cubeCol < newCols)
    );
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans pb-16 md:pb-6">
      
      {/* Navigation Top Bar */}
      <ShelfHeader
        unplacedCount={unplacedGames.length}
        totalGamesCount={allGames.length}
        onOpenBggModal={() => setIsBggModalOpen(true)}
        onOpenBgStatsModal={() => setIsBgStatsModalOpen(true)}
        onOpenConfigModal={() => setIsShelfMenuOpen(true)}
        onToggleLibrary={() => setIsLibraryDrawerOpen((prev) => !prev)}
      />

      {/* Main Workspace: Shelf Overview + Library Tray */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-3 sm:p-6 flex flex-col lg:flex-row gap-6">
        
        {/* Left Column: Full Kallax Shelf Visualizer */}
        <ShelfOverview
          config={config}
          allGames={allGames}
          placedBoxes={placedBoxes}
          gamesMap={gamesMap}
          selectedBoxId={selectedBoxId}
          onSelectBox={setSelectedBoxId}
          onOpenCubeDetail={(r, c) => setCubeDetailCoords({ row: r, col: c })}
          onRotateBox={handleRotateBox}
          onToggleOrientation={handleToggleOrientation}
          onSetOrientation={handleSetOrientation}
          onAutoOptimizeCube={handleAutoOptimizeCube}
          onAutoOptimizeAll={handleAutoOptimizeAll}
          onDropGame={handleDropGame}
          onMoveBoxToCube={handleMoveToCube}
          onUpdatePlacement={handleUpdatePlacement}
          onReorderBoxes={handleReorderBoxes}
          onShowToast={(type, message) => setToast({ type, message })}
          onOpenConfigModal={() => setIsConfigModalOpen(true)}
          onOpenShelfMenu={() => setIsShelfMenuOpen(true)}
          onUpdateGrid={handleUpdateGrid}
          viewMode={viewMode}
          onToggleViewMode={() => setViewMode((prev) => (prev === '3d' ? '2d' : '3d'))}
          shelves={shelves}
          activeShelfId={activeShelf.id}
          onSelectShelf={handleSelectShelf}
          onAddShelf={handleAddShelf}
          onRenameShelf={handleRenameShelf}
        />

        {/* Right Column: Game Collection Drawer / Side Tray */}
        <LibraryDrawer
          allGames={allGames}
          placedBoxes={placedBoxes}
          config={config}
          isOpen={isLibraryDrawerOpen}
          onClose={() => setIsLibraryDrawerOpen(false)}
          onEditGame={(game) => setEditingGame(game)}
          onAddManualGame={() => setEditingGame('new')}
          onOpenBggModal={() => setIsBggModalOpen(true)}
          onOpenBgStatsModal={() => setIsBgStatsModalOpen(true)}
          onPlaceGameInCube={handleDropGame}
          onDeleteGame={handleDeleteGame}
          onClearCollection={handleClearCollection}
          onResetSampleGames={handleResetSampleGames}
        />
      </main>

      {/* Cube Inspector Modal */}
      {cubeDetailCoords && (
        <CubeDetailModal
          row={cubeDetailCoords.row}
          col={cubeDetailCoords.col}
          config={config}
          placedBoxes={placedBoxes
            .filter(
              (p) =>
                p.cubeRow === cubeDetailCoords.row &&
                p.cubeCol === cubeDetailCoords.col
            )
            .sort((a, b) => a.order - b.order)}
          allPlacedBoxes={placedBoxes}
          gamesMap={gamesMap}
          unplacedGames={unplacedGames}
          onClose={() => setCubeDetailCoords(null)}
          onUpdatePlacement={handleUpdatePlacement}
          onRemovePlacement={handleRemovePlacement}
          onAddPlacement={handleDropGame}
          onMoveToCube={handleMoveToCube}
          onReorderBoxes={handleReorderBoxes}
          onEditGame={(g) => setEditingGame(g)}
        />
      )}

      {/* Manual Box Creation or Edit Modal */}
      {editingGame && (
        <BoxEditModal
          game={editingGame === 'new' ? null : editingGame}
          onClose={() => setEditingGame(null)}
          onSave={handleSaveGame}
          onDelete={editingGame !== 'new' ? handleDeleteGame : undefined}
        />
      )}

      {/* BoardGameGeek Search & Import Modal */}
      {isBggModalOpen && (
        <BggSearchModal
          onClose={() => setIsBggModalOpen(false)}
          onAddGame={(game) => {
            handleSaveGame(game);
          }}
          onAddMultipleGames={handleAddMultipleGames}
        />
      )}

      {/* BG Stats Import Modal */}
      {isBgStatsModalOpen && (
        <BgStatsImportModal
          onClose={() => setIsBgStatsModalOpen(false)}
          onImportGames={handleAddMultipleGames}
        />
      )}

      {/* Kallax Shelf Config Modal */}
      {isConfigModalOpen && (
        <KallaxConfigModal
          config={config}
          onClose={() => setIsConfigModalOpen(false)}
          onSave={(newCfg) => setConfig(newCfg)}
        />
      )}

      {/* Dedicated Shelf Menu Modal */}
      <ShelfMenuModal
        isOpen={isShelfMenuOpen}
        onClose={() => setIsShelfMenuOpen(false)}
        config={config}
        onUpdateConfig={(newCfg) => setConfig(newCfg)}
        placedBoxes={placedBoxes}
        gamesMap={gamesMap}
        onAutoOptimizeAll={handleAutoOptimizeAll}
        onClearShelf={handleClearShelf}
        shelvesCount={shelves.length}
        onDeleteShelf={handleDeleteShelf}
        onAddShelf={handleAddShelf}
      />

      {/* Real-time Physical Dimension Overflow & Action Toast Alert */}
      {toast && (
        <div
          className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 max-w-md w-[92%] p-3.5 rounded-2xl bg-slate-900/95 border shadow-2xl backdrop-blur-md flex items-center justify-between gap-3 animate-in fade-in slide-in-from-bottom-5 ${
            toast.type === 'success'
              ? 'border-emerald-500/80 shadow-emerald-950/40'
              : toast.type === 'warning'
              ? 'border-amber-500/80 shadow-amber-950/40'
              : 'border-red-500/80 shadow-red-950/40'
          }`}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <div
              className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                toast.type === 'success'
                  ? 'bg-emerald-500/20 text-emerald-400'
                  : toast.type === 'warning'
                  ? 'bg-amber-500/20 text-amber-400'
                  : 'bg-red-500/20 text-red-400'
              }`}
            >
              {toast.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4" />
              ) : (
                <AlertTriangle className="w-4 h-4" />
              )}
            </div>
            <div className="min-w-0 text-xs">
              <span
                className={`font-bold block ${
                  toast.type === 'success'
                    ? 'text-emerald-300'
                    : toast.type === 'warning'
                    ? 'text-amber-300'
                    : 'text-red-300'
                }`}
              >
                {toast.type === 'success'
                  ? 'Operazione Completata'
                  : toast.type === 'warning'
                  ? 'Attenzione Dimensioni'
                  : 'Azione Bloccata'}
              </span>
              <span className="text-slate-200 leading-tight block mt-0.5">
                {toast.message}
              </span>
            </div>
          </div>
          <button
            onClick={() => setToast(null)}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors shrink-0"
            aria-label="Chiudi notifica"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}

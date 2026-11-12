import React, { useState } from 'react';
import {
  GameBox,
  PlacedBox,
  KallaxConfig,
  ShelfOrientation,
} from '../types/kallax';
import {
  calculateCubeSpace,
  getEffectiveDimensions,
  autoOptimizeCubeLayout,
  canGameFitInCube,
  canRotateBoxInCube,
  canChangeOrientationInCube,
  getNextValidBoxPose,
  checkPlacementAnomalies,
} from '../utils/kallaxMath';
import {
  Box2D,
  resolveCollisionsAndClamp,
  snapToSupportOrFloor,
  clampToShelf,
  resolveAllCubePositions,
  syncCubePlacedBoxesPositions,
  packAndAlignWithoutGaps,
  validateAndPackCubeBoxes,
} from '../utils/kallaxPhysics';
import {
  X,
  RotateCw,
  Sparkles,
  ArrowUp,
  ArrowDown,
  Trash2,
  AlertTriangle,
  MoveVertical,
  Layers,
  Eye,
  Plus,
  Box as BoxIcon,
  CheckCircle2,
  ArrowRightLeft,
  Lock,
  Unlock,
  Search,
} from 'lucide-react';
import { CubeOccupancyBar } from './CubeOccupancyBar';

interface CubeDetailModalProps {
  row: number;
  col: number;
  config: KallaxConfig;
  placedBoxes: PlacedBox[];
  allPlacedBoxes: PlacedBox[];
  gamesMap: Record<string, GameBox>;
  unplacedGames: GameBox[];
  onClose: () => void;
  onUpdatePlacement: (placedId: string, updates: Partial<PlacedBox>) => void;
  onRemovePlacement: (placedId: string) => void;
  onAddPlacement: (gameId: string, row: number, col: number, preferredOrientation?: ShelfOrientation, preferredRotation?: number) => void;
  onMoveToCube: (placedId: string, targetRow: number, targetCol: number) => void;
  onReorderBoxes: (newBoxes: PlacedBox[]) => void;
  onEditGame: (game: GameBox) => void;
}

export const CubeDetailModal: React.FC<CubeDetailModalProps> = ({
  row,
  col,
  config,
  placedBoxes,
  allPlacedBoxes,
  gamesMap,
  unplacedGames,
  onClose,
  onUpdatePlacement,
  onRemovePlacement,
  onAddPlacement,
  onMoveToCube,
  onReorderBoxes,
  onEditGame,
}) => {
  const [selectedGameToAdd, setSelectedGameToAdd] = useState<string>('');
  const [addGameSearch, setAddGameSearch] = useState<string>('');
  const [addOrientation, setAddOrientation] = useState<ShelfOrientation | 'auto'>('auto');
  const [transferBoxId, setTransferBoxId] = useState<string | null>(null);
  const [modalAlert, setModalAlert] = useState<{ type: 'error' | 'success'; message: string } | null>(null);

  React.useEffect(() => {
    if (!modalAlert || modalAlert.type !== 'success') return;
    const timer = setTimeout(() => setModalAlert(null), 3500);
    return () => clearTimeout(timer);
  }, [modalAlert]);

  const space = calculateCubeSpace(
    config.cubeWidth,
    config.cubeHeight,
    config.cubeDepth,
    placedBoxes,
    gamesMap
  );

  const handleRotate = (placed: PlacedBox) => {
    const result = getNextValidBoxPose(
      config.cubeWidth,
      config.cubeHeight,
      config.cubeDepth,
      placedBoxes,
      placed.id,
      gamesMap,
      'rotate'
    );
    if (!result.canChange) {
      setModalAlert({
        type: 'error',
        message: result.reason || 'Rotazione bloccata: le scatole non possono superare le misure del vano.',
      });
      return;
    }
    const labelOri =
      result.orientation === 'vertical'
        ? 'in costa'
        : result.orientation === 'horizontal'
        ? 'in pila'
        : 'frontale';
    const game = gamesMap[placed.gameId];
    setModalAlert({
      type: 'success',
      message: `"${game?.name || 'Scatola'}": ruotata a ${result.rotation90}° (${labelOri}).`,
    });
    const updated = placedBoxes.map((p) =>
      p.id === placed.id
        ? { ...p, orientation: result.orientation, rotation90: result.rotation90 }
        : p
    );
    const synced = syncCubePlacedBoxesPositions(updated, gamesMap, {
      width: config.cubeWidth,
      height: config.cubeHeight,
    });
    onReorderBoxes(synced);
  };

  const handleOrientation = (placed: PlacedBox, orientation: ShelfOrientation) => {
    const check = canChangeOrientationInCube(
      config.cubeWidth,
      config.cubeHeight,
      config.cubeDepth,
      placedBoxes,
      placed.id,
      orientation,
      gamesMap
    );
    if (!check.canChange) {
      setModalAlert({
        type: 'error',
        message: check.reason || 'Orientamento bloccato: le scatole non possono superare le misure del vano.',
      });
      return;
    }
    const labelOri =
      orientation === 'vertical'
        ? 'in costa (verticale)'
        : orientation === 'horizontal'
        ? 'in pila (orizzontale)'
        : 'frontale';
    const game = gamesMap[placed.gameId];
    setModalAlert({
      type: 'success',
      message: `"${game?.name || 'Scatola'}": orientamento impostato su ${labelOri}.`,
    });
    const updated = placedBoxes.map((p) =>
      p.id === placed.id
        ? {
            ...p,
            orientation,
            rotation90: check.suggestedRotation ?? p.rotation90,
            posX: undefined,
            posY: undefined,
          }
        : p
    );
    const synced = syncCubePlacedBoxesPositions(updated, gamesMap, {
      width: config.cubeWidth,
      height: config.cubeHeight,
    });
    onReorderBoxes(synced);
  };

  const handleAutoOptimize = () => {
    const boxes = placedBoxes.map((p) => gamesMap[p.gameId]).filter(Boolean);
    const optimized = autoOptimizeCubeLayout(
      config.cubeWidth,
      config.cubeHeight,
      config.cubeDepth,
      boxes
    );

    const updated = placedBoxes.map((placed, idx) => {
      if (optimized[idx]) {
        return {
          ...placed,
          orientation: optimized[idx].orientation,
          rotation90: optimized[idx].rotation90,
        };
      }
      return placed;
    });

    const synced = syncCubePlacedBoxesPositions(updated, gamesMap, {
      width: config.cubeWidth,
      height: config.cubeHeight,
    });
    onReorderBoxes(synced);
  };

  const handleMoveUp = (index: number) => {
    if (index === 0) return;
    const reordered = [...placedBoxes];
    const temp = reordered[index - 1];
    reordered[index - 1] = reordered[index];
    reordered[index] = temp;
    reordered.forEach((p, idx) => {
      p.order = idx;
    });
    const synced = syncCubePlacedBoxesPositions(reordered, gamesMap, {
      width: config.cubeWidth,
      height: config.cubeHeight,
    });
    onReorderBoxes(synced);
  };

  const handleMoveDown = (index: number) => {
    if (index >= placedBoxes.length - 1) return;
    const reordered = [...placedBoxes];
    const temp = reordered[index + 1];
    reordered[index + 1] = reordered[index];
    reordered[index] = temp;
    reordered.forEach((p, idx) => {
      p.order = idx;
    });
    const synced = syncCubePlacedBoxesPositions(reordered, gamesMap, {
      width: config.cubeWidth,
      height: config.cubeHeight,
    });
    onReorderBoxes(synced);
  };

  const [highlightedBoxId, setHighlightedBoxId] = useState<string | null>(null);
  // Lucchetto modalità ordinamento libero: se sbloccato (aperto), permette di muovere le scatole anche sovrapponendole.
  // Cliccando sul lucchetto per chiuderlo, le scatole vengono riordinate e affiancate perfettamente senza lasciare spazi.
  const [isFreeSortUnlocked, setIsFreeSortUnlocked] = useState<boolean>(false);

  // Toggle lucchetto: quando viene chiuso (bloccato), affianca in automatico tutte le scatole senza spazi
  const handleToggleFreeSortLock = () => {
    if (!isFreeSortUnlocked) {
      // Sblocca: memorizza per tutte le scatole la loro posizione 2D corrente visualizzata nel vano
      // in modo che se l'utente ne sposta solo alcune, le altre mantengano esattamente la loro posizione
      const initialized = placedBoxes.map((p) => {
        const b2d = current2DBoxes.find((b) => b.id === p.id);
        return {
          ...p,
          posX: b2d ? b2d.x : (p.posX ?? 0),
          posY: b2d ? b2d.y : (p.posY ?? 0),
        };
      });
      onReorderBoxes(initialized);
      setIsFreeSortUnlocked(true);
      setModalAlert(null);
    } else {
      // Blocca: raccoglie le posizioni visuali correnti e valida che non ci siano problemi
      const boxesWithPositions = placedBoxes.map((p) => {
        const b2d = current2DBoxes.find((b) => b.id === p.id);
        return {
          ...p,
          posX: b2d ? b2d.x : (p.posX ?? 0),
          posY: b2d ? b2d.y : (p.posY ?? 0),
        };
      });

      const validation = validateAndPackCubeBoxes(
        boxesWithPositions,
        gamesMap,
        { width: config.cubeWidth, height: config.cubeHeight },
        config.cubeDepth
      );

      if (!validation.isValid) {
        setModalAlert({
          type: 'error',
          message: `Errore di posizionamento: ${validation.errorMessage || 'Le scatole superano le dimensioni del vano'}`,
        });
        return;
      }

      if (validation.packedBoxes) {
        onReorderBoxes(validation.packedBoxes);
      }
      setIsFreeSortUnlocked(false);
      setModalAlert({
        type: 'success',
        message: 'Scatole riordinate e affiancate senza spazi.',
      });
    }
  };

  // 2D Interactive Physics & Free-Form Drag & Drop State
  const shelfContainerRef = React.useRef<HTMLDivElement | null>(null);
  const [draggingPlacedId, setDraggingPlacedId] = useState<string | null>(null);
  const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(null);
  const dragStartPointerRef = React.useRef<{ pointerX: number; pointerY: number; boxCmX: number; boxCmY: number }>({
    pointerX: 0,
    pointerY: 0,
    boxCmX: 0,
    boxCmY: 0,
  });

  // Calculate current 2D box representations in cm for all placed boxes
  const current2DBoxes = React.useMemo<Box2D[]>(() => {
    const horizBoxes = placedBoxes.filter((p) => p.orientation === 'horizontal');
    const rawBoxes: Box2D[] = placedBoxes.map((placed) => {
      const game = gamesMap[placed.gameId];
      const eff = game
        ? getEffectiveDimensions(game, placed.orientation, placed.rotation90)
        : { displayWidth: 10, displayHeight: 10, shelfDepth: 10 };

      let x = placed.posX;
      let y = placed.posY;

      if (x === undefined || y === undefined) {
        if (placed.orientation === 'horizontal') {
          let accumulatedY = 0;
          const sortedHoriz = [...horizBoxes].sort((a, b) => a.order - b.order);
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
          const nonHoriz = placedBoxes.filter((p) => p.orientation !== 'horizontal').sort((a, b) => a.order - b.order);
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

    // Se il lucchetto è aperto, mantieni le posizioni 2D grezze dell'utente permettendo la sovrapposizione temporanea
    if (isFreeSortUnlocked) {
      return rawBoxes;
    }

    return resolveAllCubePositions(rawBoxes, {
      width: config.cubeWidth,
      height: config.cubeHeight,
    });
  }, [placedBoxes, gamesMap, config.cubeWidth, config.cubeHeight, isFreeSortUnlocked]);

  // Check if there are any positioning anomalies (dimension overflow, boundary violation, or overlap)
  const placementCheck = React.useMemo(() => {
    return checkPlacementAnomalies(
      config.cubeWidth,
      config.cubeHeight,
      config.cubeDepth,
      placedBoxes,
      gamesMap,
      current2DBoxes
    );
  }, [config.cubeWidth, config.cubeHeight, config.cubeDepth, placedBoxes, gamesMap, current2DBoxes]);

  // Pointer Down on box inside miniature
  const handleBoxPointerDown = (e: React.PointerEvent<HTMLDivElement>, placed: PlacedBox) => {
    if (!shelfContainerRef.current) return;
    const currentBox2D = current2DBoxes.find((b) => b.id === placed.id);
    if (!currentBox2D) return;

    setDraggingPlacedId(placed.id);
    setHighlightedBoxId(placed.id);
    setDragPos({ x: currentBox2D.x, y: currentBox2D.y });

    dragStartPointerRef.current = {
      pointerX: e.clientX,
      pointerY: e.clientY,
      boxCmX: currentBox2D.x,
      boxCmY: currentBox2D.y,
    };

    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  // Pointer Move on shelf
  const handleShelfPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingPlacedId || !shelfContainerRef.current) return;

    const targetBox2D = current2DBoxes.find((b) => b.id === draggingPlacedId);
    if (!targetBox2D) return;

    const rect = shelfContainerRef.current.getBoundingClientRect();
    const pxPerCmX = rect.width / config.cubeWidth;
    const pxPerCmY = rect.height / config.cubeHeight;

    const deltaPixelX = e.clientX - dragStartPointerRef.current.pointerX;
    // Invert Y because screen coordinates go downward, while shelf height goes upward from floor
    const deltaPixelY = -(e.clientY - dragStartPointerRef.current.pointerY);

    const deltaCmX = deltaPixelX / pxPerCmX;
    const deltaCmY = deltaPixelY / pxPerCmY;

    const rawBox: Box2D = {
      ...targetBox2D,
      x: dragStartPointerRef.current.boxCmX + deltaCmX,
      y: dragStartPointerRef.current.boxCmY + deltaCmY,
    };

    // Se il lucchetto è aperto: movimento libero con solo confinamento ai bordi del vano (nessun blocco collisione)
    if (isFreeSortUnlocked) {
      const clamped = clampToShelf(rawBox, { width: config.cubeWidth, height: config.cubeHeight });
      setDragPos({ x: clamped.x, y: clamped.y });
      return;
    }

    // Se il lucchetto è chiuso: fisica AABB attiva con spinta minima di separazione
    const otherBoxes = current2DBoxes.filter((b) => b.id !== draggingPlacedId);
    const resolved = resolveCollisionsAndClamp(
      rawBox,
      otherBoxes,
      { width: config.cubeWidth, height: config.cubeHeight }
    );

    setDragPos({ x: resolved.x, y: resolved.y });
  };

  // Pointer Up / Drop
  const handleShelfPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingPlacedId) return;

    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      // Ignore if capture already lost
    }

    const currentBox2D = current2DBoxes.find((b) => b.id === draggingPlacedId);
    if (dragPos && currentBox2D) {
      if (isFreeSortUnlocked) {
        // Modalità libera con lucchetto aperto: salva direttamente la posizione senza respingere
        const clamped = clampToShelf(
          { ...currentBox2D, x: dragPos.x, y: dragPos.y },
          { width: config.cubeWidth, height: config.cubeHeight }
        );
        onUpdatePlacement(draggingPlacedId, {
          posX: Math.round(clamped.x * 10) / 10,
          posY: Math.round(clamped.y * 10) / 10,
          lastMovedAt: Date.now(),
        });
      } else {
        const otherBoxes = current2DBoxes.filter((b) => b.id !== draggingPlacedId);
        // Try snapping to shelf floor or top of box beneath
        const snapped = snapToSupportOrFloor(
          { ...currentBox2D, x: dragPos.x, y: dragPos.y },
          otherBoxes
        );

        // Final collision resolution pass to guarantee zero overlap
        const finalResolved = resolveCollisionsAndClamp(
          snapped,
          otherBoxes,
          { width: config.cubeWidth, height: config.cubeHeight }
        );

        // Save position to placement
        onUpdatePlacement(draggingPlacedId, {
          posX: finalResolved.x,
          posY: finalResolved.y,
          lastMovedAt: Date.now(),
        });
      }
    }

    setDraggingPlacedId(null);
    setDragPos(null);
  };

  // Shelf finish styling for the miniature
  const shelfFinishStyle =
    config.shelfColor === 'white'
      ? {
          outer: 'bg-white border-white',
          inner: 'bg-slate-900 text-slate-100',
        }
      : config.shelfColor === 'oak'
      ? {
          outer: 'bg-amber-950 border-amber-900',
          inner: 'bg-amber-950/40 text-amber-100',
        }
      : config.shelfColor === 'grey'
      ? {
          outer: 'bg-slate-800 border-slate-700',
          inner: 'bg-slate-900/90 text-slate-100',
        }
      : {
          outer: 'bg-neutral-900 border-neutral-800',
          inner: 'bg-neutral-900 text-neutral-100',
        };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        
        {/* Modal Header */}
        <div className="px-5 py-3.5 border-b border-slate-800 flex items-center justify-between bg-slate-900/80 sticky top-0 z-10">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center font-mono font-bold text-sm">
              {row + 1},{col + 1}
            </div>
            <div>
              <h2 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
                <span>Vano Kallax [{row + 1},{col + 1}]</span>
                <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-slate-800 text-amber-300 font-semibold">
                  {space.volumePercent}% occupato
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Misure interne: {config.cubeWidth} × {config.cubeHeight} × {config.cubeDepth} cm (43.8 L)
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {placedBoxes.length > 0 && (
              <button
                onClick={handleAutoOptimize}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-amber-500 text-slate-950 rounded-lg hover:bg-amber-400 transition-colors shadow-sm"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Auto-ottimizza</span>
              </button>
            )}
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              aria-label="Chiudi finestra"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-4 flex-1">
          
          {/* Dynamic Action Warning or Success Banner */}
          {modalAlert && (
            <div
              className={`flex items-center justify-between p-3 rounded-xl border text-xs shadow-lg animate-in fade-in ${
                modalAlert.type === 'success'
                  ? 'bg-emerald-950/80 border-emerald-500/60 text-emerald-200 shadow-emerald-950/30'
                  : 'bg-red-950/80 border-red-500/60 text-red-200 shadow-red-950/30'
              }`}
            >
              <div className="flex items-center gap-2">
                {modalAlert.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
                )}
                <span>{modalAlert.message}</span>
              </div>
              <button
                onClick={() => setModalAlert(null)}
                className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                aria-label="Chiudi notifica"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Miniature 3D Cube Visualizer with Free-Form 2D Drag-and-Drop & AABB Stacking Physics */}
          <div className="p-3.5 rounded-2xl bg-slate-950/80 border border-slate-800 flex flex-col items-center space-y-2">
            <div className="w-full flex items-center justify-between text-xs gap-2">
              <span className="font-bold text-slate-300 flex items-center gap-1.5">
                <BoxIcon className="w-3.5 h-3.5 text-amber-400" />
                <span>Organizzazione Manuale e Impilamento Libero</span>
              </span>
              
              {/* Pulsante Lucchetto per Ordinamento Libero con Sovrapposizione */}
              <button
                type="button"
                onClick={handleToggleFreeSortLock}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all flex items-center gap-1.5 border shadow-sm cursor-pointer ${
                  isFreeSortUnlocked
                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/60 hover:bg-amber-500/30 ring-1 ring-amber-500/40'
                    : 'bg-slate-900 text-slate-400 border-slate-700 hover:text-white hover:bg-slate-800'
                }`}
                title={
                  isFreeSortUnlocked
                    ? 'Lucchetto aperto: puoi spostare e sovrapporre liberamente le scatole. Clicca per bloccare e affiancare in automatico senza spazi.'
                    : 'Lucchetto chiuso: clicca per sbloccare e riordinare liberamente le scatole anche sovrapponendole.'
                }
              >
                {isFreeSortUnlocked ? (
                  <>
                    <Unlock className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
                    <span>Lucchetto Aperto (Riordina)</span>
                  </>
                ) : (
                  <>
                    <Lock className="w-3.5 h-3.5 text-slate-400" />
                    <span>Lucchetto Chiuso (Bloccato)</span>
                  </>
                )}
              </button>
            </div>

            {/* Hint sotto il pulsante */}
            <div className="w-full flex items-center justify-between text-[11px] text-slate-400">
              <span className="text-amber-400/90 font-medium">
                {isFreeSortUnlocked
                  ? 'Trascina le scatole per riordinarle (sovrapposizione consentita). Clicca sul lucchetto per affiancarle senza spazi.'
                  : 'Trascina le scatole per impilarle o affiancarle. Apri il lucchetto per riordinarle liberamente.'}
              </span>
            </div>

            {/* Miniature Cube Frame */}
            <div className="relative w-full max-w-[280px] sm:max-w-[320px]">
              {/* Top ruler */}
              <div className="flex justify-between items-center text-[10px] font-mono text-slate-500 px-1 mb-0.5">
                <span>0 cm</span>
                <span className="text-amber-400/90 font-bold">
                  {space.totalWidthUsed} cm usati ({config.cubeWidth} cm max)
                </span>
                <span>33.5 cm</span>
              </div>

              {/* Physical Kallax Miniature Compartment */}
              <div
                ref={shelfContainerRef}
                onPointerMove={handleShelfPointerMove}
                onPointerUp={handleShelfPointerUp}
                onPointerCancel={handleShelfPointerUp}
                className={`relative w-full aspect-square rounded-xl border-[6px] transition-all overflow-hidden shadow-2xl touch-none select-none ${shelfFinishStyle.outer} ${shelfFinishStyle.inner}`}
                style={{
                  boxShadow:
                    'inset 0 12px 28px -8px rgba(0, 0, 0, 0.8), inset 0 -6px 14px rgba(0, 0, 0, 0.5), 0 10px 25px -5px rgba(0,0,0,0.6)',
                }}
              >
                {/* Visual grid / floor guides */}
                <div className="absolute inset-0 pointer-events-none opacity-10 bg-[linear-gradient(to_right,#fff_1px,transparent_1px),linear-gradient(to_bottom,#fff_1px,transparent_1px)] bg-[size:10%_10%]" />

                {placedBoxes.length === 0 ? (
                  <div className="w-full h-full flex flex-col items-center justify-center text-center p-3 text-slate-500 text-xs">
                    <span className="font-semibold text-slate-400">Vano Vuoto</span>
                    <span className="text-[11px] text-slate-500 mt-1">
                      Usa il menu sotto per aggiungere giochi a questo vano
                    </span>
                  </div>
                ) : (
                  placedBoxes.map((placed) => {
                    const game = gamesMap[placed.gameId];
                    if (!game) return null;

                    const eff = getEffectiveDimensions(game, placed.orientation, placed.rotation90);
                    const isDragging = draggingPlacedId === placed.id;
                    const isHighlighted = highlightedBoxId === placed.id;

                    const boxW = eff.displayWidth;
                    const boxH = eff.displayHeight;

                    // Use collision-resolved 2D coordinates from current2DBoxes
                    const b2d = current2DBoxes.find((b) => b.id === placed.id);
                    let posCmX = b2d ? b2d.x : (placed.posX ?? 0);
                    let posCmY = b2d ? b2d.y : (placed.posY ?? 0);

                    if (isDragging && dragPos) {
                      posCmX = dragPos.x;
                      posCmY = dragPos.y;
                    }

                    // Convert cm to percentage within the Kallax cube (33.5 x 33.5 cm)
                    const leftPct = (posCmX / config.cubeWidth) * 100;
                    const bottomPct = (posCmY / config.cubeHeight) * 100;
                    const widthPct = (boxW / config.cubeWidth) * 100;
                    const heightPct = (boxH / config.cubeHeight) * 100;

                    return (
                      <div
                        key={placed.id}
                        onPointerDown={(e) => handleBoxPointerDown(e, placed)}
                        onClick={(e) => {
                          e.stopPropagation();
                          setHighlightedBoxId(isHighlighted ? null : placed.id);
                        }}
                        className={`group/mini absolute transition-[transform,box-shadow] cursor-grab active:cursor-grabbing rounded shrink-0 flex items-center justify-center select-none ${
                          isDragging
                            ? 'z-40 scale-[1.03] ring-2 ring-amber-400 brightness-125 shadow-2xl opacity-95'
                            : isHighlighted
                            ? 'ring-2 ring-amber-400 scale-[1.01] z-20 brightness-110 shadow-xl'
                            : 'hover:brightness-105 z-10 hover:shadow-lg'
                        }`}
                        style={{
                          backgroundColor: game.color || '#3B82F6',
                          left: `${leftPct}%`,
                          bottom: `${bottomPct}%`,
                          width: `${widthPct}%`,
                          height: `${heightPct}%`,
                          boxShadow:
                            '2px 4px 10px rgba(0,0,0,0.6), inset 1px 1px 1px rgba(255,255,255,0.3), inset -1px -1px 2px rgba(0,0,0,0.5)',
                        }}
                      >
                        {/* Title text */}
                        <div
                          className={`p-1 w-full h-full flex items-center justify-center overflow-hidden text-white font-bold text-[10px] leading-tight pointer-events-none select-none ${
                            placed.orientation === 'vertical'
                              ? `[writing-mode:vertical-rl] ${
                                  placed.rotation90 === 180 || placed.rotation90 === 270 ? 'rotate-0' : 'rotate-180'
                                } tracking-wide text-center uppercase`
                              : placed.orientation === 'horizontal'
                              ? `text-center truncate ${placed.rotation90 === 180 ? 'rotate-180' : ''}`
                              : `text-center truncate ${placed.rotation90 === 180 ? 'rotate-180' : ''}`
                          }`}
                          style={{ textShadow: '0 1px 3px rgba(0,0,0,0.9)' }}
                        >
                          <span className="truncate max-w-full drop-shadow">
                            {game.name}
                          </span>
                        </div>

                        {/* Quick rotate trigger on miniature - always visible on mobile, prominent on hover */}
                        <button
                          onPointerDown={(e) => e.stopPropagation()}
                          onTouchStart={(e) => e.stopPropagation()}
                          onMouseDown={(e) => e.stopPropagation()}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRotate(placed);
                          }}
                          title={`Ruota ${game.name} (${placed.rotation90}°)`}
                          className="absolute top-1 right-1 w-6 h-6 rounded-full bg-slate-950/90 text-amber-400 border border-amber-400/70 flex items-center justify-center opacity-90 sm:opacity-0 group-hover/mini:opacity-100 hover:scale-115 hover:bg-amber-500 hover:text-slate-950 transition-all shadow-md z-30 cursor-pointer"
                        >
                          <RotateCw className="w-3 h-3 text-amber-400" />
                        </button>

                        {/* Miniature rotation badge */}
                        {placed.rotation90 > 0 && (
                          <div className="absolute bottom-0.5 right-0.5 bg-slate-950/90 text-amber-300 border border-amber-400/50 rounded px-1 py-0.2 text-[8px] font-mono font-bold shadow pointer-events-none flex items-center gap-0.5 z-20">
                            <RotateCw className="w-2 h-2 text-amber-400" />
                            {placed.rotation90}°
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>

              {/* Bottom ruler & clearance badge */}
              <div className="flex justify-between items-center text-[10px] font-mono text-slate-400 mt-1 px-1">
                <span>
                  {space.remainingWidth > 0 ? `${space.remainingWidth} cm liberi a lato` : 'Pieno a lato'}
                </span>
                <span>
                  {space.remainingHeight > 0 ? `${space.remainingHeight} cm sopra` : 'Pieno in altezza'}
                </span>
              </div>
            </div>
          </div>

          {/* Visual Occupancy Bar with actual volume percentage and real-time sum of stacked or adjacent games */}
          <CubeOccupancyBar
            cubeWidth={config.cubeWidth}
            cubeHeight={config.cubeHeight}
            cubeDepth={config.cubeDepth}
            placedBoxes={placedBoxes}
            gamesMap={gamesMap}
            highlightedBoxId={highlightedBoxId}
            onSelectBox={setHighlightedBoxId}
          />

          {/* Warnings */}
          {space.isOverflowing && (
            <div className="flex items-center gap-2 p-2.5 rounded-lg bg-red-950/60 border border-red-500/40 text-red-300 text-xs">
              <AlertTriangle className="w-4 h-4 shrink-0 text-red-400" />
              <span>
                Attenzione: le scatole superano le dimensioni geometriche del vano Kallax! Prova a cliccare "Auto-ottimizza" o ruotare le scatole a 90°.
              </span>
            </div>
          )}

          {/* Quick Add Game to This Cube with Search and Dropdown */}
          {unplacedGames.length > 0 && (() => {
            const filteredUnplacedGames = unplacedGames.filter((g) => {
              if (!addGameSearch.trim()) return true;
              const q = addGameSearch.toLowerCase().trim();
              return (
                g.name.toLowerCase().includes(q) ||
                (g.year && String(g.year).includes(q)) ||
                (g.notes && g.notes.toLowerCase().includes(q)) ||
                `${g.width} ${g.height} ${g.depth}`.includes(q)
              );
            });

            const selectedGameObj = unplacedGames.find((g) => g.id === selectedGameToAdd);
            const targetOri = addOrientation === 'auto' ? undefined : addOrientation;
            const fitCheck = selectedGameObj
              ? canGameFitInCube(config.cubeWidth, config.cubeHeight, config.cubeDepth, placedBoxes, selectedGameObj, gamesMap, targetOri)
              : null;
            const canInsert = selectedGameObj && fitCheck?.canFit;

            const handleExecuteInsert = (gameIdToInsert: string) => {
              const gameObj = unplacedGames.find((g) => g.id === gameIdToInsert);
              if (!gameObj) return;
              const check = canGameFitInCube(config.cubeWidth, config.cubeHeight, config.cubeDepth, placedBoxes, gameObj, gamesMap, targetOri);
              if (check.canFit) {
                onAddPlacement(
                  gameIdToInsert,
                  row,
                  col,
                  check.suggestedOrientation ?? targetOri,
                  check.suggestedRotation
                );
                setSelectedGameToAdd('');
                setAddGameSearch('');
                setModalAlert({
                  type: 'success',
                  message: `"${gameObj.name}" inserito nel vano con successo!`,
                });
              } else {
                setModalAlert({
                  type: 'error',
                  message: `"${gameObj.name}" non entra in questo vano (${check.reason || 'supera misure geometriche'}).`,
                });
              }
            };

            return (
              <div className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-white flex items-center gap-1.5">
                    <Plus className="w-4 h-4 text-amber-400" />
                    Inserisci gioco in questo vano:
                  </span>
                  <span className="text-[11px] text-slate-400 font-mono">
                    {unplacedGames.length} {unplacedGames.length === 1 ? 'gioco disponibile' : 'giochi disponibili'}
                  </span>
                </div>

                {/* Search Bar */}
                <div className="relative">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                  <input
                    type="text"
                    value={addGameSearch}
                    onChange={(e) => setAddGameSearch(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && filteredUnplacedGames.length === 1) {
                        e.preventDefault();
                        handleExecuteInsert(filteredUnplacedGames[0].id);
                      }
                    }}
                    placeholder="Cerca gioco per nome, anno o dimensioni (es. Catan, 2021, 12x9...)"
                    className="w-full bg-slate-900 border border-slate-700 focus:border-amber-500 rounded-xl pl-9 pr-8 py-2 text-xs text-white placeholder-slate-500 focus:outline-none transition-colors"
                  />
                  {addGameSearch && (
                    <button
                      type="button"
                      onClick={() => setAddGameSearch('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-white rounded-md cursor-pointer"
                      title="Cancella ricerca"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {/* Dropdown list + Inserisci button */}
                <div className="flex flex-wrap sm:flex-nowrap items-center gap-2">
                  <select
                    value={selectedGameToAdd}
                    onChange={(e) => setSelectedGameToAdd(e.target.value)}
                    className="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
                  >
                    <option value="">
                      {addGameSearch
                        ? `-- Seleziona tra i ${filteredUnplacedGames.length} giochi trovati --`
                        : `-- Oppure seleziona dall'elenco a cascata (${unplacedGames.length}) --`}
                    </option>
                    {filteredUnplacedGames.map((g) => {
                      const fit = canGameFitInCube(config.cubeWidth, config.cubeHeight, config.cubeDepth, placedBoxes, g, gamesMap, targetOri);
                      return (
                        <option key={g.id} value={g.id}>
                          {g.name} ({g.width}×{g.height}×{g.depth} cm - da {g.dimensionSource || (g.bggId ? 'BGG' : 'Catalogo')}){!fit.canFit ? ' [NON ENTRA: supera vano]' : ' [Entra]'}
                        </option>
                      );
                    })}
                  </select>
                  <button
                    disabled={!canInsert}
                    onClick={() => {
                      if (selectedGameToAdd) handleExecuteInsert(selectedGameToAdd);
                    }}
                    className={`px-4 py-2 text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 shrink-0 ${
                      canInsert
                        ? 'bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-md shadow-amber-500/20 cursor-pointer active:scale-95'
                        : 'bg-slate-800 text-slate-500 cursor-not-allowed opacity-50'
                    }`}
                  >
                    <Plus className="w-3.5 h-3.5" /> Inserisci
                  </button>
                </div>

                {/* Instant Search Results Cards when typing in search bar */}
                {addGameSearch.trim() && (
                  <div className="pt-1">
                    <p className="text-[11px] font-semibold text-slate-400 mb-1.5 flex items-center justify-between">
                      <span>Risultati trovati ({filteredUnplacedGames.length}):</span>
                      {filteredUnplacedGames.length === 0 && (
                        <span className="text-amber-400/80 font-normal">Nessun gioco corrisponde alla ricerca</span>
                      )}
                    </p>
                    {filteredUnplacedGames.length > 0 && (
                      <div className="max-h-44 overflow-y-auto space-y-1.5 pr-1">
                        {filteredUnplacedGames.map((g) => {
                          const fit = canGameFitInCube(config.cubeWidth, config.cubeHeight, config.cubeDepth, placedBoxes, g, gamesMap, targetOri);
                          const isSelected = selectedGameToAdd === g.id;
                          return (
                            <div
                              key={g.id}
                              onClick={() => setSelectedGameToAdd(g.id)}
                              className={`p-2 rounded-xl border flex items-center justify-between gap-2.5 transition-all cursor-pointer ${
                                isSelected
                                  ? 'bg-amber-500/10 border-amber-500/60'
                                  : 'bg-slate-900/60 hover:bg-slate-900 border-slate-800 hover:border-slate-700'
                              }`}
                            >
                              <div className="flex items-center gap-2.5 min-w-0">
                                <div
                                  className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 text-[10px] font-bold text-white shadow-sm border border-white/20 relative overflow-hidden"
                                  style={{ backgroundColor: g.color || '#3b82f6' }}
                                >
                                  <span>{g.name.slice(0, 2).toUpperCase()}</span>
                                  {g.thumbnail && (
                                    <img
                                      src={g.thumbnail}
                                      alt={g.name}
                                      className="absolute inset-0 w-full h-full object-cover"
                                      onError={(e) => {
                                        (e.target as HTMLElement).style.display = 'none';
                                      }}
                                    />
                                  )}
                                </div>
                                <div className="min-w-0">
                                  <p className="text-xs font-semibold text-white truncate">
                                    {g.name}
                                  </p>
                                  <p className="text-[11px] text-slate-400 flex items-center gap-1.5 font-mono flex-wrap">
                                    <span>{g.width}×{g.height}×{g.depth} cm</span>
                                    <span className="px-1.5 py-0.2 rounded text-[9px] font-medium bg-slate-800 text-slate-300 border border-slate-700/60 inline-flex items-center gap-0.5">
                                      <span className="text-slate-400">da</span>
                                      <span className="text-amber-300 font-semibold">{g.dimensionSource || (g.bggId ? 'BGG' : 'Catalogo')}</span>
                                    </span>
                                    {g.year && <span>· Anno {g.year}</span>}
                                  </p>
                                </div>
                              </div>

                              <div className="flex items-center gap-2 shrink-0">
                                <span
                                  className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                                    fit.canFit
                                      ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                                      : 'bg-red-950 text-red-300 border border-red-900'
                                  }`}
                                >
                                  {fit.canFit ? 'Entra' : 'Supera vano'}
                                </span>
                                <button
                                  type="button"
                                  disabled={!fit.canFit}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleExecuteInsert(g.id);
                                  }}
                                  className={`px-2.5 py-1 text-xs font-bold rounded-lg flex items-center gap-1 transition-all ${
                                    fit.canFit
                                      ? 'bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-sm cursor-pointer active:scale-95'
                                      : 'bg-slate-800 text-slate-500 cursor-not-allowed opacity-40'
                                  }`}
                                >
                                  <Plus className="w-3 h-3" />
                                  <span>Inserisci</span>
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                {/* Optional Orientation Choice when Adding */}
                <div className="flex items-center gap-1.5 text-[11px] text-slate-400 flex-wrap">
                  <span className="text-slate-400">Orientamento inserimento:</span>
                  <div className="flex items-center gap-1 p-0.5 bg-slate-900 rounded-lg border border-slate-800">
                    <button
                      type="button"
                      onClick={() => setAddOrientation('auto')}
                      className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
                        addOrientation === 'auto'
                          ? 'bg-amber-500 text-slate-950 font-bold'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      Auto
                    </button>
                    <button
                      type="button"
                      onClick={() => setAddOrientation('vertical')}
                      className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
                        addOrientation === 'vertical'
                          ? 'bg-amber-500 text-slate-950 font-bold'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      In costa
                    </button>
                    <button
                      type="button"
                      onClick={() => setAddOrientation('horizontal')}
                      className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
                        addOrientation === 'horizontal'
                          ? 'bg-amber-500 text-slate-950 font-bold'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      In pila
                    </button>
                    <button
                      type="button"
                      onClick={() => setAddOrientation('frontal')}
                      className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
                        addOrientation === 'frontal'
                          ? 'bg-amber-500 text-slate-950 font-bold'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      Frontale
                    </button>
                  </div>
                </div>

                {selectedGameObj && !canInsert && fitCheck && (
                  <div className="flex items-center gap-2 p-2 rounded-lg bg-red-950/60 border border-red-500/40 text-red-300 text-xs animate-in fade-in">
                    <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
                    <span>
                      <strong>Inserimento bloccato:</strong> {fitCheck.reason}
                    </span>
                  </div>
                )}
              </div>
            );
          })()}

          {/* All games placed notice */}
          {unplacedGames.length === 0 && (
            <div className="p-3 rounded-xl bg-slate-950/40 border border-slate-800/80 flex items-center justify-between gap-3 text-xs text-slate-400">
              <span className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Tutti i giochi della collezione sono già posizionati nei vani dello scaffale.</span>
              </span>
            </div>
          )}

          {/* Placed Boxes List with Orientation and 90° Rotation controls */}
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs font-semibold text-slate-300">
              <span>Scatole nel Vano ({placedBoxes.length})</span>
              <span className="text-slate-500">Trascina o usa i pulsanti per ruotare e ordinare</span>
            </div>

            {placedBoxes.length === 0 ? (
              <div className="p-8 text-center border-2 border-dashed border-slate-800 rounded-xl text-slate-500 text-xs">
                Nessun gioco posizionato in questo vano.
              </div>
            ) : (
              placedBoxes.map((placed, index) => {
                const game = gamesMap[placed.gameId];
                if (!game) return null;

                const eff = getEffectiveDimensions(game, placed.orientation, placed.rotation90);

                return (
                  <div
                    key={placed.id}
                    className="p-3.5 rounded-xl bg-slate-950 border border-slate-800/80 hover:border-slate-700 transition-colors space-y-3"
                  >
                    {/* Top Row: Game Info & Actions */}
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div
                          className="w-4 h-9 rounded-sm shrink-0 shadow"
                          style={{ backgroundColor: game.color || '#3B82F6' }}
                        />
                        <div className="min-w-0">
                          <button
                            onClick={() => onEditGame(game)}
                            className="text-sm font-bold text-white hover:text-amber-400 transition-colors text-left truncate block"
                          >
                            {game.name}
                          </button>
                          <div className="text-[11px] font-mono text-slate-400 flex items-center gap-1.5 flex-wrap">
                            <span>Orig: {game.width} × {game.height} × {game.depth} cm</span>
                            <span className="px-1.5 py-0.2 rounded text-[9px] font-medium bg-slate-900 text-slate-300 border border-slate-700/60 inline-flex items-center gap-0.5">
                              <span className="text-slate-400">da</span>
                              <span className="text-amber-300 font-semibold">{game.dimensionSource || (game.bggId ? 'BGG' : 'Catalogo')}</span>
                            </span>
                            <span>· Nel vano: <span className="text-amber-300 font-semibold">{eff.displayWidth} × {eff.displayHeight} × {eff.shelfDepth} cm</span></span>
                          </div>
                        </div>
                      </div>

                      {/* Reorder and Delete Buttons */}
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          disabled={index === 0}
                          onClick={() => handleMoveUp(index)}
                          className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white disabled:opacity-30 transition-colors"
                          title="Sposta prima nell'ordine"
                          aria-label="Sposta prima"
                        >
                          <ArrowUp className="w-3.5 h-3.5" />
                        </button>
                        <button
                          disabled={index === placedBoxes.length - 1}
                          onClick={() => handleMoveDown(index)}
                          className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white disabled:opacity-30 transition-colors"
                          title="Sposta dopo nell'ordine"
                          aria-label="Sposta dopo"
                        >
                          <ArrowDown className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => onRemovePlacement(placed.id)}
                          className="p-1.5 rounded-lg bg-slate-900 hover:bg-red-500/20 text-slate-400 hover:text-red-400 transition-colors"
                          title="Rimuovi dal vano"
                          aria-label="Rimuovi scatola dal vano"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Bottom Row: Orientation Selection & 90° Rotation */}
                    <div className="pt-2 border-t border-slate-900 flex flex-wrap items-center justify-between gap-2 text-xs">
                      {/* Orientation Buttons */}
                      <div className="flex items-center gap-1 p-1 bg-slate-900 rounded-lg">
                        <button
                          onClick={() => handleOrientation(placed, 'vertical')}
                          className={`px-2.5 py-1 rounded-md text-[11px] font-medium flex items-center gap-1 transition-colors ${
                            placed.orientation === 'vertical'
                              ? 'bg-amber-500 text-slate-950 font-bold shadow-sm'
                              : 'text-slate-400 hover:text-white'
                          }`}
                        >
                          <MoveVertical className="w-3 h-3" />
                          Verticale (in costa)
                        </button>

                        <button
                          onClick={() => handleOrientation(placed, 'horizontal')}
                          className={`px-2.5 py-1 rounded-md text-[11px] font-medium flex items-center gap-1 transition-colors ${
                            placed.orientation === 'horizontal'
                              ? 'bg-amber-500 text-slate-950 font-bold shadow-sm'
                              : 'text-slate-400 hover:text-white'
                          }`}
                        >
                          <Layers className="w-3 h-3" />
                          Orizzontale (pila)
                        </button>

                        <button
                          onClick={() => handleOrientation(placed, 'frontal')}
                          className={`px-2.5 py-1 rounded-md text-[11px] font-medium flex items-center gap-1 transition-colors ${
                            placed.orientation === 'frontal'
                              ? 'bg-amber-500 text-slate-950 font-bold shadow-sm'
                              : 'text-slate-400 hover:text-white'
                          }`}
                        >
                          <Eye className="w-3 h-3" />
                          Frontale
                        </button>
                      </div>

                      {/* 90-degree Rotation Button */}
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleRotate(placed)}
                          className="flex items-center gap-1.5 px-3 py-1 bg-slate-900 hover:bg-slate-800 border border-slate-700 rounded-lg text-[11px] text-amber-300 font-semibold transition-colors shadow-sm"
                        >
                          <RotateCw className="w-3.5 h-3.5" />
                          <span>Ruota 90° ({placed.rotation90}°)</span>
                        </button>

                        {/* Quick Transfer Popover / Dropdown Controls */}
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => setTransferBoxId(transferBoxId === placed.id ? null : placed.id)}
                            className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all border ${
                              transferBoxId === placed.id
                                ? 'bg-sky-500 text-slate-950 border-sky-400 shadow-sm'
                                : 'bg-slate-900 hover:bg-slate-800 text-sky-400 border-slate-700'
                            }`}
                            title="Trasferisci questa scatola in un altro vano"
                          >
                            <ArrowRightLeft className="w-3 h-3" />
                            <span>Sposta vano</span>
                          </button>

                          {/* Fallback direct select */}
                          <select
                            value=""
                            onChange={(e) => {
                              if (e.target.value) {
                                const [tr, tc] = e.target.value.split(',').map(Number);
                                onMoveToCube(placed.id, tr, tc);
                              }
                            }}
                            className="bg-slate-900 border border-slate-800 rounded-lg px-2 py-1 text-[11px] text-slate-400 hover:text-white focus:outline-none"
                          >
                            <option value="">Destinazione...</option>
                            {Array.from({ length: config.rows }).map((_, r) =>
                              Array.from({ length: config.cols }).map((_, c) => {
                                if (r === row && c === col) return null;
                                const targetCubeBoxes = allPlacedBoxes.filter(
                                  (p) => p.cubeRow === r && p.cubeCol === c && p.id !== placed.id
                                );
                                const fit = canGameFitInCube(
                                  config.cubeWidth,
                                  config.cubeHeight,
                                  config.cubeDepth,
                                  targetCubeBoxes,
                                  game,
                                  gamesMap,
                                  placed.orientation,
                                  placed.rotation90
                                );
                                return (
                                  <option key={`${r},${c}`} value={`${r},${c}`} disabled={!fit.canFit}>
                                    Vano [{r + 1},{c + 1}]{!fit.canFit ? ' — Pieno (supera misure)' : ''}
                                  </option>
                                );
                              })
                            )}
                          </select>
                        </div>
                      </div>
                    </div>

                    {/* Inline Visual Vano Picker */}
                    {transferBoxId === placed.id && (
                      <div className="mt-2.5 p-2.5 rounded-xl bg-slate-950 border border-sky-500/40 text-xs animate-in fade-in zoom-in-95">
                        <div className="flex items-center justify-between pb-1.5 mb-2 border-b border-slate-800">
                          <span className="font-bold text-sky-300 flex items-center gap-1.5 text-[11px]">
                            <ArrowRightLeft className="w-3.5 h-3.5 text-sky-400" />
                            Seleziona vano di destinazione per {game.name}:
                          </span>
                          <button
                            onClick={() => setTransferBoxId(null)}
                            className="text-[10px] text-slate-400 hover:text-white"
                          >
                            Chiudi
                          </button>
                        </div>
                        <div className="grid grid-cols-4 sm:grid-cols-6 gap-1.5">
                          {Array.from({ length: config.rows }).map((_, r) =>
                            Array.from({ length: config.cols }).map((_, c) => {
                              const isCurrent = r === row && c === col;
                              const targetCubeBoxes = allPlacedBoxes.filter(
                                (p) => p.cubeRow === r && p.cubeCol === c && p.id !== placed.id
                              );
                              const fit = canGameFitInCube(
                                config.cubeWidth,
                                config.cubeHeight,
                                config.cubeDepth,
                                targetCubeBoxes,
                                game,
                                gamesMap,
                                placed.orientation,
                                placed.rotation90
                              );
                              const isDisabled = !isCurrent && !fit.canFit;

                              return (
                                <button
                                  key={`modal-transfer-${r}-${c}`}
                                  disabled={isDisabled}
                                  title={
                                    isCurrent
                                      ? `Vano attuale [${r + 1},${c + 1}] — "${game.name}" si trova già qui`
                                      : !fit.canFit
                                      ? `Non entra: ${fit.reason}`
                                      : `Sposta nel vano [${r + 1},${c + 1}]`
                                  }
                                  onClick={() => {
                                    onMoveToCube(placed.id, r, c);
                                    setTransferBoxId(null);
                                  }}
                                  className={`p-1.5 rounded-lg border text-center transition-all flex flex-col items-center justify-center ${
                                    isCurrent
                                      ? 'bg-emerald-950/60 border-emerald-500/60 text-emerald-300 hover:bg-emerald-900/50 cursor-pointer shadow-sm ring-1 ring-emerald-500/30'
                                      : !fit.canFit
                                      ? 'bg-red-950/30 border-red-900/40 text-red-400/50 cursor-not-allowed'
                                      : 'bg-slate-900 hover:bg-sky-500 hover:text-slate-950 border-slate-700 text-slate-200 cursor-pointer'
                                  }`}
                                >
                                  <div className="font-mono font-bold text-[11px]">
                                    [{r + 1},{c + 1}]
                                  </div>
                                  <div className="text-[9px] opacity-90 font-medium">
                                    {isCurrent ? (
                                      <span className="text-emerald-400 font-bold">Attuale</span>
                                    ) : !fit.canFit ? (
                                      'Pieno'
                                    ) : (
                                      `${targetCubeBoxes.length} g.`
                                    )}
                                  </div>
                                </button>
                              );
                            })
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Modal Footer with Anomaly Protection on Fatto Button */}
        <div className="p-3.5 sm:p-4 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3 bg-slate-900/95 sticky bottom-0 z-20">
          <div className="flex items-center gap-2 text-xs w-full sm:w-auto">
            {isFreeSortUnlocked ? (
              <div className="flex items-center gap-2 p-2 rounded-lg bg-amber-950/80 border border-amber-500/60 text-amber-200 w-full animate-in fade-in">
                <Unlock className="w-4 h-4 text-amber-400 shrink-0 animate-pulse" />
                <span className="font-semibold text-[11px] leading-tight">
                  Lucchetto aperto: chiudi il lucchetto per affiancare le scatole senza spazi e abilitare il tasto "Fatto"
                </span>
              </div>
            ) : placementCheck.hasAnomalies ? (
              <div className="flex items-center gap-2 p-2 rounded-lg bg-red-950/80 border border-red-500/50 text-red-300 w-full animate-in fade-in">
                <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
                <span className="font-semibold text-[11px] leading-tight">
                  {placementCheck.reason || 'Anomalia di posizionamento: correggi per confermare'}
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-slate-400">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span className="text-[11px]">
                  Disposizione valida · {placedBoxes.length} {placedBoxes.length === 1 ? 'scatola presente' : 'scatole presenti'}
                </span>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            {placementCheck.hasAnomalies && !isFreeSortUnlocked && (
              <button
                type="button"
                onClick={handleAutoOptimize}
                className="px-3 py-2 text-xs font-semibold bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 border border-amber-500/40 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
                title="Risolvi automaticamente l'anomalia di posizionamento"
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                <span>Auto-ottimizza</span>
              </button>
            )}
            <button
              type="button"
              disabled={isFreeSortUnlocked || placementCheck.hasAnomalies}
              onClick={onClose}
              title={
                isFreeSortUnlocked
                  ? 'Azione disattivata: chiudi il lucchetto per affiancare automaticamente le scatole prima di completare'
                  : placementCheck.hasAnomalies
                  ? `Azione disattivata: ${placementCheck.reason}`
                  : 'Conferma disposizione e chiudi'
              }
              className={`px-5 py-2 text-xs font-bold rounded-lg transition-all flex items-center gap-2 ${
                isFreeSortUnlocked || placementCheck.hasAnomalies
                  ? 'bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed opacity-50'
                  : 'bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-md shadow-amber-500/20 cursor-pointer active:scale-95'
              }`}
            >
              {isFreeSortUnlocked ? (
                <Lock className="w-3.5 h-3.5 text-slate-500" />
              ) : placementCheck.hasAnomalies ? (
                <AlertTriangle className="w-3.5 h-3.5 text-slate-500" />
              ) : null}
              <span>Fatto</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

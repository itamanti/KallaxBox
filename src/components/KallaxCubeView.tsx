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
  canGameFitInCube,
} from '../utils/kallaxMath';
import {
  Box2D,
  resolveCollisionsAndClamp,
  snapToSupportOrFloor,
  clampToShelf,
  resolveAllCubePositions,
  packAndAlignWithoutGaps,
  validateAndPackCubeBoxes,
} from '../utils/kallaxPhysics';
import {
  RotateCw,
  Maximize2,
  AlertTriangle,
  AlertCircle,
  MoveVertical,
  Layers,
  Eye,
  ArrowRightLeft,
  X,
  Lock,
  Unlock,
} from 'lucide-react';

interface KallaxCubeViewProps {
  row: number;
  col: number;
  config: KallaxConfig;
  placedBoxes: PlacedBox[];
  allPlacedBoxes?: PlacedBox[];
  gamesMap: Record<string, GameBox>;
  selectedBoxId: string | null;
  onSelectBox: (boxId: string | null) => void;
  onOpenCubeDetail: (row: number, col: number) => void;
  onRotateBox: (placedId: string, e: React.MouseEvent) => void;
  onToggleOrientation?: (placedId: string, e: React.MouseEvent) => void;
  onSetOrientation?: (placedId: string, orientation: ShelfOrientation, e: React.MouseEvent) => void;
  onAutoOptimizeCube?: (row: number, col: number, e: React.MouseEvent) => void;
  onDropGame: (gameId: string, row: number, col: number) => void;
  onMoveBoxToCube?: (placedId: string, targetRow: number, targetCol: number) => void;
  onUpdatePlacement?: (placedId: string, updates: Partial<PlacedBox>) => void;
  onReorderBoxes?: (newBoxes: PlacedBox[]) => void;
  onShowToast?: (type: 'success' | 'warning' | 'error', message: string) => void;
  isFreeSortUnlocked?: boolean;
  isDimmed?: boolean;
  onSetFreeSortUnlocked?: (unlocked: boolean) => void;
  viewMode: '2d' | '3d';
}

export const KallaxCubeView: React.FC<KallaxCubeViewProps> = ({
  row,
  col,
  config,
  placedBoxes,
  allPlacedBoxes,
  gamesMap,
  selectedBoxId,
  onSelectBox,
  onOpenCubeDetail,
  onRotateBox,
  onToggleOrientation,
  onSetOrientation,
  onAutoOptimizeCube,
  onDropGame,
  onMoveBoxToCube,
  onUpdatePlacement,
  onReorderBoxes,
  onShowToast,
  isFreeSortUnlocked: isFreeSortUnlockedProp,
  isDimmed = false,
  onSetFreeSortUnlocked,
  viewMode,
}) => {
  const [isDragOver, setIsDragOver] = useState(false);
  const [transferBoxId, setTransferBoxId] = useState<string | null>(null);
  const [isInfoOpen, setIsInfoOpen] = useState(false);
  const [isInfoPinned, setIsInfoPinned] = useState(false);
  const infoHoldTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const infoOpenedByHoldRef = React.useRef(false);
  const suppressInfoClickRef = React.useRef(false);
  const infoAreaRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    return () => {
      if (infoHoldTimerRef.current) clearTimeout(infoHoldTimerRef.current);
    };
  }, []);

  React.useEffect(() => {
    if (!isInfoPinned && !isInfoOpen) return;
    const handleGlobalRelease = () => {
      if (infoHoldTimerRef.current) {
        clearTimeout(infoHoldTimerRef.current);
        infoHoldTimerRef.current = null;
      }
      if (infoOpenedByHoldRef.current) {
        infoOpenedByHoldRef.current = false;
        suppressInfoClickRef.current = true;
        setIsInfoOpen(false);
        setIsInfoPinned(false);
      }
    };
    const handleOutsidePointerDown = (e: PointerEvent) => {
      if (infoAreaRef.current && !infoAreaRef.current.contains(e.target as Node)) {
        setIsInfoPinned(false);
        setIsInfoOpen(false);
      }
    };
    window.addEventListener('pointerup', handleGlobalRelease);
    window.addEventListener('pointercancel', handleGlobalRelease);
    document.addEventListener('pointerdown', handleOutsidePointerDown);
    return () => {
      window.removeEventListener('pointerup', handleGlobalRelease);
      window.removeEventListener('pointercancel', handleGlobalRelease);
      document.removeEventListener('pointerdown', handleOutsidePointerDown);
    };
  }, [isInfoPinned, isInfoOpen]);

  // Lucchetto modalità ordinamento libero: se sbloccato (aperto), permette di muovere le scatole anche sovrapponendole.
  // Cliccando sul lucchetto per chiuderlo, le scatole vengono riordinate e affiancate perfettamente senza lasciare spazi.
  const [localFreeSortUnlocked, setLocalFreeSortUnlocked] = useState<boolean>(false);
  const isFreeSortUnlocked = isFreeSortUnlockedProp !== undefined ? isFreeSortUnlockedProp : localFreeSortUnlocked;
  const setFreeSortUnlocked = (val: boolean) => {
    if (onSetFreeSortUnlocked) {
      onSetFreeSortUnlocked(val);
    } else {
      setLocalFreeSortUnlocked(val);
    }
  };

  // 2D Interactive Physics & Drag-and-Drop state inside this cube
  const interiorContainerRef = React.useRef<HTMLDivElement | null>(null);
  const [draggingPlacedId, setDraggingPlacedId] = useState<string | null>(null);
  const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(null);
  const dragStartPointerRef = React.useRef<{ pointerX: number; pointerY: number; boxCmX: number; boxCmY: number }>({
    pointerX: 0,
    pointerY: 0,
    boxCmX: 0,
    boxCmY: 0,
  });

  const space = calculateCubeSpace(
    config.cubeWidth,
    config.cubeHeight,
    config.cubeDepth,
    placedBoxes,
    gamesMap
  );

  // Calculate current 2D box representations in cm for all placed boxes in this cube
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

    // Se il lucchetto è aperto, mantieni le posizioni 2D grezze permettendo la sovrapposizione temporanea
    if (isFreeSortUnlocked) {
      return rawBoxes;
    }

    return resolveAllCubePositions(rawBoxes, {
      width: config.cubeWidth,
      height: config.cubeHeight,
    });
  }, [placedBoxes, gamesMap, config.cubeWidth, config.cubeHeight, isFreeSortUnlocked]);

  // Toggle lucchetto: quando viene chiuso (bloccato), valida che non ci siano problemi di posizionamento ed affianca senza spazi
  const handleToggleFreeSortLock = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!isFreeSortUnlocked) {
      // Sblocca: memorizza per tutte le scatole la loro posizione 2D corrente visualizzata nel vano
      const initialized = placedBoxes.map((p) => {
        const b2d = current2DBoxes.find((b) => b.id === p.id);
        return {
          ...p,
          posX: b2d ? b2d.x : (p.posX ?? 0),
          posY: b2d ? b2d.y : (p.posY ?? 0),
        };
      });
      onReorderBoxes?.(initialized);
      setFreeSortUnlocked(true);
      onShowToast?.(
        'warning',
        `Vano [${row + 1},${col + 1}]: Lucchetto aperto. Trascina le scatole per riordinarle liberamente (sovrapposizione consentita).`
      );
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
        // Problemi nel posizionamento! Mostra messaggio di errore e NON chiudere il lucchetto
        onShowToast?.(
          'error',
          `Errore vano [${row + 1},${col + 1}]: ${validation.errorMessage || 'Le scatole superano le dimensioni del vano'}`
        );
        return;
      }

      // Nessun problema: applica le posizioni affiancate compatte senza spazi
      if (validation.packedBoxes) {
        onReorderBoxes?.(validation.packedBoxes);
      }
      setFreeSortUnlocked(false);
      onShowToast?.(
        'success',
        `Vano [${row + 1},${col + 1}]: Scatole riordinate e affiancate senza spazi.`
      );
    }
  };

  // Pointer Down on box inside KallaxCubeView
  const handleBoxPointerDown = (e: React.PointerEvent<HTMLDivElement>, placed: PlacedBox) => {
    if (!interiorContainerRef.current) return;
    const currentBox2D = current2DBoxes.find((b) => b.id === placed.id);
    if (!currentBox2D) return;

    setDraggingPlacedId(placed.id);
    setDragPos({ x: currentBox2D.x, y: currentBox2D.y });

    dragStartPointerRef.current = {
      pointerX: e.clientX,
      pointerY: e.clientY,
      boxCmX: currentBox2D.x,
      boxCmY: currentBox2D.y,
    };

    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      // ignore
    }
  };

  // Pointer Move on shelf compartment
  const handleShelfPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingPlacedId || !interiorContainerRef.current) return;

    const targetBox2D = current2DBoxes.find((b) => b.id === draggingPlacedId);
    if (!targetBox2D) return;

    const rect = interiorContainerRef.current.getBoundingClientRect();
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

    // Run AABB minimum penetration push-away and boundary clamping
    const otherBoxes = current2DBoxes.filter((b) => b.id !== draggingPlacedId);
    const resolved = resolveCollisionsAndClamp(
      rawBox,
      otherBoxes,
      { width: config.cubeWidth, height: config.cubeHeight }
    );

    setDragPos({ x: resolved.x, y: resolved.y });
  };

  // Pointer Up / Drop on shelf compartment
  const handleShelfPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingPlacedId) return;

    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      // Ignore
    }

    const currentBox2D = current2DBoxes.find((b) => b.id === draggingPlacedId);
    if (dragPos && currentBox2D && onUpdatePlacement) {
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

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (!isDragOver) setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    // Only unset if leaving container
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsDragOver(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const placedId = e.dataTransfer.getData('application/placed-box-id');
    const gameId = e.dataTransfer.getData('text/plain') || e.dataTransfer.getData('application/json');
    if (placedId && onMoveBoxToCube) {
      onMoveBoxToCube(placedId, row, col);
    } else if (gameId) {
      onDropGame(gameId, row, col);
    }
  };

  // Color theme of the shelf
  const shelfBgClass =
    config.shelfColor === 'white'
      ? 'bg-slate-900 border-white text-slate-100 shadow-inner'
      : config.shelfColor === 'oak'
      ? 'bg-amber-950/40 border-amber-800/60 text-amber-100 shadow-inner'
      : config.shelfColor === 'grey'
      ? 'bg-slate-900/90 border-slate-700 text-slate-100 shadow-inner'
      : 'bg-neutral-900 border-neutral-800 text-neutral-100 shadow-inner';



  const renderBox = (placed: PlacedBox) => {
    const game = gamesMap[placed.gameId];
    if (!game) return null;

    const eff = getEffectiveDimensions(game, placed.orientation, placed.rotation90);
    const isSelected = selectedBoxId === placed.id;
    const isDragging = draggingPlacedId === placed.id;

    // Strict proportional sizing relative to Kallax cube (33.5 x 33.5 cm)
    const widthPct = (eff.displayWidth / config.cubeWidth) * 100;
    const heightPct = (eff.displayHeight / config.cubeHeight) * 100;

    // Use collision-resolved 2D coordinates from current2DBoxes
    const box2D = current2DBoxes.find((b) => b.id === placed.id);
    let posCmX = box2D ? box2D.x : (placed.posX ?? 0);
    let posCmY = box2D ? box2D.y : (placed.posY ?? 0);

    if (isDragging && dragPos) {
      posCmX = dragPos.x;
      posCmY = dragPos.y;
    }

    const leftPct = (posCmX / config.cubeWidth) * 100;
    const bottomPct = (posCmY / config.cubeHeight) * 100;

    const boxBg = game.color || '#3B82F6';

    return (
      <div
        key={placed.id}
        draggable={!isFreeSortUnlocked}
        onDragStart={(e) => {
          if (isFreeSortUnlocked) {
            e.preventDefault();
            return;
          }
          e.stopPropagation();
          e.dataTransfer.setData('application/placed-box-id', placed.id);
          e.dataTransfer.setData('text/plain', placed.gameId);
          e.dataTransfer.effectAllowed = 'move';
        }}
        onPointerDown={(e) => {
          // If clicking buttons inside box, don't start pointer drag
          if ((e.target as HTMLElement).closest('button')) return;
          handleBoxPointerDown(e, placed);
        }}
        onPointerMove={handleShelfPointerMove}
        onPointerUp={handleShelfPointerUp}
        onPointerCancel={handleShelfPointerUp}
        onClick={(e) => {
          e.stopPropagation();
          onSelectBox(isSelected ? null : placed.id);
        }}
        className={`group/box absolute transition-[transform,box-shadow] cursor-grab active:cursor-grabbing rounded shrink-0 flex items-center justify-center select-none shadow-md ${
          isDragging
            ? 'z-50 scale-[1.03] ring-2 ring-amber-400 brightness-125 shadow-2xl opacity-95'
            : isSelected
            ? 'ring-2 ring-amber-400 scale-[1.02] z-40 brightness-110 shadow-xl'
            : isFreeSortUnlocked
            ? 'border-2 border-white/60 hover:brightness-110 shadow-lg'
            : 'hover:brightness-110 z-10 hover:shadow-lg'
        }`}
        style={{
          backgroundColor: boxBg,
          left: `${leftPct}%`,
          bottom: `${bottomPct}%`,
          width: `${widthPct}%`,
          height: `${heightPct}%`,
          zIndex: isDragging ? 50 : isSelected ? 40 : isFreeSortUnlocked ? (placed.lastMovedAt ? 30 : 20) : 10,
          touchAction: 'none',
          boxShadow:
            viewMode === '3d'
              ? '2px 4px 10px rgba(0,0,0,0.5), inset 1px 1px 1px rgba(255,255,255,0.25), inset -1px -1px 2px rgba(0,0,0,0.4)'
              : '1px 2px 4px rgba(0,0,0,0.3)',
        }}
      >
        {/* Spine or Box Label with visible rotation response */}
        <div
          className={`p-1 w-full h-full flex items-center justify-center overflow-hidden text-white font-semibold text-[10px] leading-tight select-none pointer-events-none ${
            placed.orientation === 'vertical'
              ? `[writing-mode:vertical-rl] ${
                  placed.rotation90 === 180 || placed.rotation90 === 270 ? 'rotate-0' : 'rotate-180'
                } tracking-wide text-center uppercase`
              : placed.orientation === 'horizontal'
              ? `text-center truncate ${placed.rotation90 === 180 ? 'rotate-180' : ''}`
              : `text-center truncate ${placed.rotation90 === 180 ? 'rotate-180' : ''}`
          }`}
          style={{ textShadow: '0 1px 2px rgba(0,0,0,0.8)' }}
        >
          <span className="truncate max-w-full drop-shadow">
            {game.name}
          </span>
        </div>

        {/* 90-degree Rotation Button (right) - Always visible on touch/mobile and prominent on hover */}
        <button
          onPointerDown={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onRotateBox(placed.id, e);
          }}
          title={`Orientamento: ${placed.orientation} (${placed.rotation90}°). Clicca per ruotare`}
          className={`absolute top-1 right-1 w-3.5 h-3.5 sm:w-4 sm:h-4 rounded-full bg-slate-950/90 text-amber-400 border border-amber-400/80 flex items-center justify-center transition-all hover:scale-115 hover:bg-amber-500 hover:text-slate-950 shadow-md z-30 cursor-pointer ${
            isSelected
              ? 'opacity-100 ring-2 ring-amber-400 scale-110'
              : 'opacity-85 sm:opacity-0 group-hover/box:opacity-100'
          }`}
          aria-label={`Ruota 90 gradi ${game.name}`}
        >
          <RotateCw className="w-2 h-2" />
        </button>

        {/* Floating Action Bar when Box is selected ("solo icone per ruota e sposta. mentre per l'orientamento fisico mettili tutti") */}
        {isSelected && (
          <div
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            className="absolute -top-11 left-1/2 -translate-x-1/2 flex items-center gap-1.5 bg-slate-950/95 border border-amber-400/90 rounded-xl py-1 px-2.5 shadow-2xl z-50 whitespace-nowrap animate-in fade-in zoom-in-95"
          >
            {/* Solo icona per Ruota */}
            <button
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                onRotateBox(placed.id, e);
              }}
              title={`Ruota 90° (${placed.rotation90}°)`}
              aria-label="Ruota 90 gradi"
              className="p-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 transition-all flex items-center justify-center cursor-pointer shadow-sm active:scale-95"
            >
              <RotateCw className="w-3.5 h-3.5" />
            </button>

            {/* Solo icona per Sposta */}
            {onMoveBoxToCube && (
              <button
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  setTransferBoxId(transferBoxId === placed.id ? null : placed.id);
                }}
                title="Sposta in un altro vano"
                aria-label="Sposta in un altro vano"
                className={`p-1.5 rounded-lg transition-all flex items-center justify-center cursor-pointer shadow-sm active:scale-95 ${
                  transferBoxId === placed.id
                    ? 'bg-sky-500 text-slate-950 ring-2 ring-sky-300'
                    : 'bg-slate-800 hover:bg-sky-500 hover:text-slate-950 text-sky-400'
                }`}
              >
                <ArrowRightLeft className="w-3.5 h-3.5" />
              </button>
            )}

            <span className="text-slate-700">|</span>

            {/* Orientamento fisico: mettili tutti (Costa / Pila / Frontale) */}
            <div className="flex items-center gap-0.5 bg-slate-900 p-0.5 rounded-lg border border-slate-800">
              <button
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  if (onSetOrientation) onSetOrientation(placed.id, 'vertical', e);
                  else onToggleOrientation?.(placed.id, e);
                }}
                title="In costa (verticale)"
                className={`px-1.5 py-1 rounded text-[10px] font-semibold transition-colors flex items-center gap-1 cursor-pointer ${
                  placed.orientation === 'vertical'
                    ? 'bg-amber-500 text-slate-950 font-bold shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <MoveVertical className="w-2.5 h-2.5" />
                <span>Costa</span>
              </button>
              <button
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  if (onSetOrientation) onSetOrientation(placed.id, 'horizontal', e);
                  else onToggleOrientation?.(placed.id, e);
                }}
                title="In pila (orizzontale - impilata)"
                className={`px-1.5 py-1 rounded text-[10px] font-semibold transition-colors flex items-center gap-1 cursor-pointer ${
                  placed.orientation === 'horizontal'
                    ? 'bg-amber-500 text-slate-950 font-bold shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Layers className="w-2.5 h-2.5" />
                <span>Pila</span>
              </button>
              <button
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  if (onSetOrientation) onSetOrientation(placed.id, 'frontal', e);
                  else onToggleOrientation?.(placed.id, e);
                }}
                title="Frontale (copertina)"
                className={`px-1.5 py-1 rounded text-[10px] font-semibold transition-colors flex items-center gap-1 cursor-pointer ${
                  placed.orientation === 'frontal'
                    ? 'bg-amber-500 text-slate-950 font-bold shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Eye className="w-2.5 h-2.5" />
                <span>Frontale</span>
              </button>
            </div>
          </div>
        )}

        {/* Quick Transfer Popover */}
        {transferBoxId === placed.id && (
          <div
            onClick={(e) => e.stopPropagation()}
            className="absolute z-50 -bottom-2 sm:bottom-auto sm:top-full left-1/2 -translate-x-1/2 mt-1 p-2 bg-slate-900 border border-sky-500/60 rounded-xl shadow-2xl w-52 text-left animate-in fade-in zoom-in-95"
          >
            <div className="flex items-center justify-between pb-1.5 mb-1.5 border-b border-slate-800">
              <span className="text-[10px] font-bold text-sky-300 flex items-center gap-1">
                <ArrowRightLeft className="w-3 h-3 text-sky-400" />
                Sposta in vano:
              </span>
              <button
                onClick={() => setTransferBoxId(null)}
                className="p-0.5 rounded text-slate-400 hover:text-white hover:bg-slate-800"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
            <div className="grid grid-cols-3 gap-1 max-h-36 overflow-y-auto">
              {Array.from({ length: config.rows }).map((_, r) =>
                Array.from({ length: config.cols }).map((_, c) => {
                  const isCurrent = r === row && c === col;
                  const targetCubeBoxes = (allPlacedBoxes || []).filter(
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
                      key={`${r},${c}`}
                      disabled={isDisabled}
                      title={
                        isCurrent
                          ? `Vano attuale [${r + 1},${c + 1}]: "${game.name}" si trova già qui`
                          : !fit.canFit
                          ? `Non entra: ${fit.reason}`
                          : `Sposta nel vano [${r + 1},${c + 1}]`
                      }
                      onClick={() => {
                        onMoveBoxToCube?.(placed.id, r, c);
                        setTransferBoxId(null);
                      }}
                      className={`px-1.5 py-1 rounded text-[10px] font-mono font-medium transition-colors flex flex-col items-center ${
                        isCurrent
                          ? 'bg-emerald-950/60 text-emerald-300 border border-emerald-500/60 hover:bg-emerald-900/50 cursor-pointer shadow-sm ring-1 ring-emerald-500/30'
                          : !fit.canFit
                          ? 'bg-red-950/30 text-red-400/50 border border-red-900/40 cursor-not-allowed'
                          : 'bg-slate-800 hover:bg-sky-500 hover:text-slate-950 text-slate-200 border border-slate-700 cursor-pointer'
                      }`}
                    >
                      <span>{r + 1},{c + 1}</span>
                      {isCurrent ? (
                        <span className="text-[8px] text-emerald-400 font-sans font-semibold">Attuale</span>
                      ) : !fit.canFit ? (
                        <span className="text-[8px] text-red-400/70 font-sans">Pieno</span>
                      ) : null}
                    </button>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`relative group rounded-[4px] sm:rounded-md transition-all duration-300 border-2 aspect-square w-full min-h-[160px] sm:min-h-[200px] flex flex-col overflow-hidden select-none ${shelfBgClass} ${
        isFreeSortUnlocked
          ? 'ring-4 ring-amber-400 border-amber-400 bg-amber-500/15 shadow-2xl shadow-amber-500/30 brightness-110 z-20'
          : isDimmed
          ? 'opacity-35 brightness-50 contrast-85 filter grayscale-[20%] transition-all duration-300 pointer-events-auto'
          : isDragOver
          ? 'ring-2 ring-amber-400 border-amber-400 bg-amber-500/20 scale-[1.01]'
          : space.isOverflowing
          ? 'border-red-500 ring-2 ring-red-500/60'
          : 'border-white hover:border-amber-400'
      }`}
      style={{
        boxShadow:
          viewMode === '3d'
            ? 'inset 0 10px 25px -10px rgba(0, 0, 0, 0.7), inset 0 -4px 10px rgba(0, 0, 0, 0.4)'
            : 'inset 0 2px 6px rgba(0,0,0,0.3)',
      }}
    >
      {/* Top Header Bar ("la parte sopra, dove ci sono le icone") */}
      <div
        ref={infoAreaRef}
        className="w-full px-1 sm:px-1.5 py-[2px] sm:py-0.5 flex items-center justify-between gap-1 bg-slate-950/90 backdrop-blur-xs shrink-0 z-30 relative"
      >
        <div className="flex items-center gap-0.5 sm:gap-1 pointer-events-auto min-w-0">
          <span className="text-[7.5px] sm:text-[8.5px] font-sans font-bold tracking-tight px-1 py-[1px] leading-none rounded bg-slate-800 text-slate-100 border border-white/20 shadow-sm whitespace-nowrap shrink-0">
            {row + 1},{col + 1}
          </span>
        </div>

        {/* Quick Action Buttons / Icons (Padlock, Info !, Expand) */}
        <div className="flex items-center gap-0.5 pointer-events-auto shrink-0">
          {space.boxCount > 0 && (
            <button
              type="button"
              onClick={handleToggleFreeSortLock}
              title={
                isFreeSortUnlocked
                  ? 'Lucchetto aperto: puoi spostare e sovrapporre liberamente le scatole. Clicca per bloccare e affiancare in automatico senza spazi.'
                  : 'Lucchetto chiuso: clicca per sbloccare e riordinare liberamente le scatole anche sovrapponendole.'
              }
              className={`p-[2.5px] sm:p-[3px] rounded transition-all cursor-pointer shadow-sm border ${
                isFreeSortUnlocked
                  ? 'bg-amber-500 text-slate-950 border-amber-400 ring-2 ring-amber-400 font-bold'
                  : 'bg-slate-800/90 hover:bg-slate-700 text-slate-200 border-white/10'
              }`}
              aria-label={isFreeSortUnlocked ? 'Blocca lucchetto e affianca senza spazi' : 'Sblocca lucchetto per riordinare'}
            >
              {isFreeSortUnlocked ? (
                <Unlock className="w-2 h-2 sm:w-2.5 sm:h-2.5 text-slate-950 animate-pulse" />
              ) : (
                <Lock className="w-2 h-2 sm:w-2.5 sm:h-2.5 text-slate-300" />
              )}
            </button>
          )}

          {/* Exclamation Mark Info Button (hold on mobile / hover or click on desktop) */}
          <button
            type="button"
            aria-label={`Info vano ${row + 1},${col + 1} (tieni premuto su smartphone)`}
            onContextMenu={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            onPointerDown={(e) => {
              e.stopPropagation();
              if (e.pointerType !== 'mouse') {
                infoOpenedByHoldRef.current = false;
                suppressInfoClickRef.current = false;
                if (infoHoldTimerRef.current) clearTimeout(infoHoldTimerRef.current);
                infoHoldTimerRef.current = setTimeout(() => {
                  infoOpenedByHoldRef.current = true;
                  setIsInfoOpen(true);
                }, 160);
              }
            }}
            onPointerUp={(e) => {
              e.stopPropagation();
              if (infoHoldTimerRef.current) {
                clearTimeout(infoHoldTimerRef.current);
                infoHoldTimerRef.current = null;
              }
              if (e.pointerType !== 'mouse' && infoOpenedByHoldRef.current) {
                infoOpenedByHoldRef.current = false;
                suppressInfoClickRef.current = true;
                setIsInfoOpen(false);
                setIsInfoPinned(false);
              }
            }}
            onPointerCancel={(e) => {
              e.stopPropagation();
              if (infoHoldTimerRef.current) {
                clearTimeout(infoHoldTimerRef.current);
                infoHoldTimerRef.current = null;
              }
              if (infoOpenedByHoldRef.current) {
                infoOpenedByHoldRef.current = false;
                setIsInfoOpen(false);
              }
            }}
            onMouseEnter={() => setIsInfoOpen(true)}
            onMouseLeave={() => {
              if (!isInfoPinned) setIsInfoOpen(false);
            }}
            onClick={(e) => {
              e.stopPropagation();
              if (suppressInfoClickRef.current) {
                suppressInfoClickRef.current = false;
                return;
              }
              setIsInfoPinned((prev) => {
                const next = !prev;
                setIsInfoOpen(next);
                return next;
              });
            }}
            className={`p-[2.5px] sm:p-[3px] rounded transition-colors border shadow-sm cursor-pointer select-none touch-none ${
              space.isOverflowing
                ? 'bg-red-950/90 hover:bg-red-600 text-red-300 hover:text-white border-red-500/60'
                : space.isDepthOverflow
                ? 'bg-amber-950/90 hover:bg-amber-500 text-amber-300 hover:text-slate-950 border-amber-500/60'
                : isInfoOpen
                ? 'bg-amber-500 text-slate-950 border-amber-400'
                : 'bg-slate-800/90 hover:bg-amber-500 hover:text-slate-950 text-amber-300 border-white/10'
            }`}
          >
            <AlertCircle className="w-2 h-2 sm:w-2.5 sm:h-2.5" />
          </button>

          <button
            onClick={() => onOpenCubeDetail(row, col)}
            title="Dettagli e gestione vano"
            className="p-[2.5px] sm:p-[3px] rounded bg-slate-800/90 hover:bg-white hover:text-slate-950 text-slate-200 transition-colors border border-white/10 shadow-sm cursor-pointer"
            aria-label="Apri dettagli vano"
          >
            <Maximize2 className="w-2 h-2 sm:w-2.5 sm:h-2.5" />
          </button>
        </div>

        {/* Info Popover shown on hold / hover / tap on the ! button */}
        {isInfoOpen && (() => {
          const horizRawPct = Math.max(0, Math.round((space.totalWidthUsed / config.cubeWidth) * 100));
          const horizUsedPct = Math.min(100, horizRawPct);
          const horizFreePct = Math.max(0, 100 - horizUsedPct);
          const globalUsedPct = Math.min(100, Math.max(0, space.rawVolumePercent));
          const globalFreePct = Math.max(0, 100 - globalUsedPct);

          return (
            <div
              role="status"
              onClick={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
              className="absolute left-1 right-1 top-full mt-1 p-1.5 sm:p-2 rounded-lg sm:rounded-xl bg-slate-950/95 border border-amber-500/60 text-[7.5px] sm:text-[9.5px] text-slate-200 shadow-2xl backdrop-blur-md z-50 space-y-1.5 sm:space-y-2 pointer-events-auto animate-in fade-in zoom-in-95 duration-100"
            >
              {/* Horizontal Occupied / Free Bar */}
              <div className="space-y-0.5 sm:space-y-1">
                <div className="flex items-center justify-between gap-1 font-mono tracking-tighter sm:tracking-normal whitespace-nowrap">
                  <span className="text-slate-300 font-semibold">
                    <span className="sm:hidden">Orizz.</span>
                    <span className="hidden sm:inline">Orizzontale</span>
                  </span>
                  <span>
                    <span className={space.isWidthOverflow ? 'text-red-400 font-bold' : 'text-amber-300 font-bold'}>
                      {horizRawPct}% occ.
                    </span>
                    <span className="text-slate-500"> · </span>
                    <span className="text-emerald-300 font-semibold">{horizFreePct}% lib.</span>
                  </span>
                </div>
                <div className="w-full h-1.5 sm:h-2.5 rounded-full bg-emerald-500/20 border border-white/10 overflow-hidden flex">
                  {horizUsedPct > 0 && (
                    <div
                      className={`h-full transition-all ${
                        space.isWidthOverflow
                          ? 'bg-red-500'
                          : horizUsedPct > 75
                          ? 'bg-amber-400'
                          : 'bg-sky-400'
                      }`}
                      style={{ width: `${horizUsedPct}%` }}
                    />
                  )}
                </div>
              </div>

              {/* Global Compartment Volume Occupied / Free Bar */}
              <div className="space-y-0.5 sm:space-y-1">
                <div className="flex items-center justify-between gap-1 font-mono tracking-tighter sm:tracking-normal whitespace-nowrap">
                  <span className="text-slate-300 font-semibold">
                    <span className="sm:hidden">Globale</span>
                    <span className="hidden sm:inline">Globale vano</span>
                  </span>
                  <span>
                    <span className="text-amber-300 font-bold">{globalUsedPct}% occ.</span>
                    <span className="text-slate-500"> · </span>
                    <span className="text-emerald-300 font-semibold">{globalFreePct}% lib.</span>
                  </span>
                </div>
                <div className="w-full h-1.5 sm:h-2.5 rounded-full bg-emerald-500/20 border border-white/10 overflow-hidden flex">
                  {globalUsedPct > 0 && (
                    <div
                      className={`h-full transition-all ${
                        space.isOverflowing
                          ? 'bg-red-500'
                          : globalUsedPct > 75
                          ? 'bg-amber-400'
                          : 'bg-amber-500'
                      }`}
                      style={{ width: `${globalUsedPct}%` }}
                    />
                  )}
                </div>
              </div>
            </div>
          );
        })()}
      </div>

      {/* Dividing Line separating the top icon bar from the compartment shelf space */}
      <div className="w-full h-[2px] bg-white/40 shadow-[0_1px_2px_rgba(0,0,0,0.5)] shrink-0 z-20" />

      {/* Cube Interior Area: EXACT 1:1 PROPORTIONAL SPACE ("lo spazio del vano") */}
      <div
        ref={interiorContainerRef}
        onPointerMove={handleShelfPointerMove}
        onPointerUp={handleShelfPointerUp}
        onPointerCancel={handleShelfPointerUp}
        onClick={() => {
          if (!isFreeSortUnlocked) onOpenCubeDetail(row, col);
        }}
        className="relative flex-1 w-full min-h-0 flex items-end justify-start cursor-pointer overflow-hidden p-0 touch-none select-none"
        style={{
          background:
            viewMode === '3d'
              ? 'linear-gradient(180deg, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.18) 100%)'
              : 'rgba(0,0,0,0.18)',
        }}
      >
        {/* Free Sort Active Mode Overlay Banner */}
        {isFreeSortUnlocked && (
          <div
            onClick={(e) => e.stopPropagation()}
            className="absolute top-1 left-1 right-1 flex items-center justify-between gap-1 px-2 py-1 bg-amber-500 text-slate-950 rounded text-[10px] font-bold shadow-lg z-30 animate-in fade-in"
          >
            <div className="flex items-center gap-1 min-w-0">
              <Unlock className="w-3.5 h-3.5 shrink-0 text-slate-950 animate-pulse" />
              <span className="truncate">Lucchetto aperto: ordina</span>
            </div>
            <button
              type="button"
              onClick={handleToggleFreeSortLock}
              className="px-2 py-0.5 rounded bg-slate-950 text-amber-300 hover:bg-slate-900 text-[9px] font-bold shrink-0 transition-colors cursor-pointer flex items-center gap-1 shadow-sm"
              title="Blocca lucchetto e affianca senza spazi"
            >
              <Lock className="w-2.5 h-2.5" />
              <span>Affianca</span>
            </button>
          </div>
        )}
        {/* Overflow Warning Pill */}
        {space.isOverflowing && (
          <div className="absolute top-1 left-1.5 right-1.5 flex items-center gap-1 text-[10px] text-red-200 bg-red-950/90 border border-red-500/50 rounded px-1.5 py-0.5 z-25 animate-pulse shadow pointer-events-none">
            <AlertTriangle className="w-3 h-3 shrink-0 text-red-400" />
            <span className="truncate">
              {space.isWidthOverflow
                ? 'Larghezza superata'
                : space.isHeightOverflow
                ? 'Altezza superata'
                : 'Profondità superata'}
            </span>
          </div>
        )}

        {placedBoxes.length === 0 ? (
          <div className="w-full h-full flex flex-col items-center justify-center text-center p-3 text-slate-500 text-xs pointer-events-none">
            <span className="font-medium text-slate-400">Vano Vuoto</span>
            <span className="text-[10px] mt-0.5 text-slate-500">
              Trascina qui un gioco o tocca per inserire
            </span>
            <span className="text-[10px] font-mono text-slate-500 mt-1">
              33.5 x 33.5 x 39 cm
            </span>
          </div>
        ) : (
          placedBoxes.map((placed) => renderBox(placed))
        )}
      </div>
    </div>
  );
};

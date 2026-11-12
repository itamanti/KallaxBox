import React, { useState } from 'react';
import {
  GameBox,
  PlacedBox,
  KallaxConfig,
  ShelfOrientation,
  ShelfUnit,
} from '../types/kallax';
import { KallaxCubeView } from './KallaxCubeView';
import { Kallax3DScene } from './Kallax3DScene';
import { canGameFitInCube } from '../utils/kallaxMath';
import {
  Sparkles,
  SlidersHorizontal,
  Grid,
  Box as BoxIcon,
  Layers,
  RotateCw,
  Eye,
  Check,
  Plus,
  Minus,
  Info,
  ArrowRightLeft,
  X,
  MoveVertical,
  Lock,
  Unlock,
  PieChart,
  LayoutGrid,
  ChevronDown,
  Pencil,
} from 'lucide-react';

interface ShelfOverviewProps {
  config: KallaxConfig;
  allGames: GameBox[];
  placedBoxes: PlacedBox[];
  gamesMap: Record<string, GameBox>;
  selectedBoxId: string | null;
  onSelectBox: (boxId: string | null) => void;
  onOpenCubeDetail: (row: number, col: number) => void;
  onRotateBox: (placedId: string, e?: React.MouseEvent) => void;
  onToggleOrientation?: (placedId: string, e?: React.MouseEvent) => void;
  onSetOrientation?: (placedId: string, orientation: ShelfOrientation, e?: React.MouseEvent) => void;
  onAutoOptimizeCube: (row: number, col: number, e?: React.MouseEvent) => void;
  onAutoOptimizeAll: () => void;
  onDropGame: (gameId: string, row: number, col: number) => void;
  onMoveBoxToCube?: (placedId: string, targetRow: number, targetCol: number) => void;
  onUpdatePlacement?: (placedId: string, updates: Partial<PlacedBox>) => void;
  onReorderBoxes?: (newBoxes: PlacedBox[]) => void;
  onShowToast?: (type: 'success' | 'warning' | 'error', message: string) => void;
  onOpenConfigModal: () => void;
  onOpenShelfMenu: () => void;
  onUpdateGrid?: (rows: number, cols: number) => void;
  viewMode: '2d' | '3d';
  onToggleViewMode: () => void;
  shelves?: ShelfUnit[];
  activeShelfId?: string;
  onSelectShelf?: (shelfId: string) => void;
  onAddShelf?: () => void;
  onRenameShelf?: (shelfId: string, newName: string) => void;
}

// Official IKEA Kallax standard models
const KALLAX_OFFICIAL_MODELS = [
  { id: '1x1', label: '1 vano', rows: 1, cols: 1, subtitle: '1x1 Cubo' },
  { id: '1x2', label: '2 vani (1x2)', rows: 1, cols: 2, subtitle: '1x2 Panca' },
  { id: '2x1', label: '2 vani (2x1)', rows: 2, cols: 1, subtitle: '2x1 Colonna' },
  { id: '1x3', label: '3 vani (1x3)', rows: 1, cols: 3, subtitle: '1x3 Orizzontale' },
  { id: '3x1', label: '3 vani (3x1)', rows: 3, cols: 1, subtitle: '3x1 Torre' },
  { id: '1x4', label: '4 vani (1x4)', rows: 1, cols: 4, subtitle: '1x4 Panca/Parete' },
  { id: '4x1', label: '4 vani (4x1)', rows: 4, cols: 1, subtitle: '4x1 Torre' },
  { id: '2x2', label: '4 vani (2x2)', rows: 2, cols: 2, subtitle: '2x2 Classico' },
  { id: '2x3', label: '6 vani (2x3)', rows: 2, cols: 3, subtitle: '2x3 Medio' },
  { id: '3x2', label: '6 vani (3x2)', rows: 3, cols: 2, subtitle: '3x2 Verticale' },
  { id: '2x4', label: '8 vani (2x4)', rows: 2, cols: 4, subtitle: '2x4 Orizzontale' },
  { id: '4x2', label: '8 vani (4x2)', rows: 4, cols: 2, subtitle: '4x2 Verticale' },
  { id: '3x3', label: '9 vani (3x3)', rows: 3, cols: 3, subtitle: '3x3 Quadrato' },
  { id: '3x4', label: '12 vani (3x4)', rows: 3, cols: 4, subtitle: '3x4 Parete' },
  { id: '4x4', label: '16 vani (4x4)', rows: 4, cols: 4, subtitle: '4x4 Grande' },
  { id: '5x5', label: '25 vani (5x5)', rows: 5, cols: 5, subtitle: '5x5 Libreria Intera' },
];

export const ShelfOverview: React.FC<ShelfOverviewProps> = ({
  config,
  allGames,
  placedBoxes,
  gamesMap,
  selectedBoxId,
  onSelectBox,
  onOpenCubeDetail,
  onRotateBox,
  onToggleOrientation,
  onSetOrientation,
  onAutoOptimizeCube,
  onAutoOptimizeAll,
  onDropGame,
  onMoveBoxToCube,
  onUpdatePlacement,
  onReorderBoxes,
  onShowToast,
  onOpenConfigModal,
  onOpenShelfMenu,
  onUpdateGrid,
  viewMode,
  onToggleViewMode,
  shelves,
  activeShelfId,
  onSelectShelf,
  onAddShelf,
  onRenameShelf,
}) => {
  const [isRenaming, setIsRenaming] = useState(false);
  const [tempShelfName, setTempShelfName] = useState(config.name);

  // Synchronize when config.name or shelf changes
  React.useEffect(() => {
    setTempShelfName(config.name);
    setIsRenaming(false);
  }, [config.name, activeShelfId]);

  const handleSaveRename = () => {
    const trimmed = tempShelfName.trim();
    if (trimmed && activeShelfId && onRenameShelf) {
      onRenameShelf(activeShelfId, trimmed);
    }
    setIsRenaming(false);
  };

  const handleCancelRename = () => {
    setTempShelfName(config.name);
    setIsRenaming(false);
  };

  // Traccia quali vani hanno il lucchetto aperto: se ce ne sono, gli altri con il lucchetto chiuso vengono resi meno luminosi
  const [unlockedCubeKeys, setUnlockedCubeKeys] = useState<Set<string>>(new Set());

  const handleSetCubeUnlocked = (r: number, c: number, unlocked: boolean) => {
    const key = `${r}-${c}`;
    setUnlockedCubeKeys((prev) => {
      const next = new Set(prev);
      if (unlocked) {
        next.add(key);
      } else {
        next.delete(key);
      }
      return next;
    });
  };

  // Color palette for the outer frame and dividers (IKEA Kallax wood finishes)
  const frameStyle =
    config.shelfColor === 'white'
      ? {
          frameBg: 'bg-white',
          dividerBg: 'bg-white',
          borderColor: 'border-white',
        }
      : config.shelfColor === 'oak'
      ? {
          frameBg: 'bg-amber-950',
          dividerBg: 'bg-amber-900',
          borderColor: 'border-amber-900',
        }
      : config.shelfColor === 'grey'
      ? {
          frameBg: 'bg-slate-800',
          dividerBg: 'bg-slate-700',
          borderColor: 'border-slate-600',
        }
      : {
          frameBg: 'bg-neutral-900',
          dividerBg: 'bg-neutral-800',
          borderColor: 'border-neutral-950',
        };

  const selectedPlaced = selectedBoxId
    ? placedBoxes.find((p) => p.id === selectedBoxId)
    : null;
  const selectedGame = selectedPlaced ? gamesMap[selectedPlaced.gameId] : null;

  return (
    <div className="flex-1 flex flex-col space-y-3.5">
      
      {/* Shelf Control & Top Bar */}
      <div className="p-3.5 sm:p-4 rounded-2xl bg-slate-900 border border-slate-800 flex flex-wrap items-center justify-between gap-3 shadow-lg">
        {/* Left: Shelf Name or Dropdown Menu if multiple shelves exist */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center font-bold shrink-0">
            <Grid className="w-5 h-5" />
          </div>
          <div>
            {isRenaming ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSaveRename();
                }}
                className="flex items-center gap-1.5"
              >
                <input
                  type="text"
                  autoFocus
                  required
                  value={tempShelfName}
                  onChange={(e) => setTempShelfName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') {
                      e.preventDefault();
                      handleCancelRename();
                    }
                  }}
                  className="bg-slate-950 border border-amber-500 rounded-xl px-3 py-1.5 text-xs sm:text-sm font-bold text-white focus:outline-none focus:ring-2 focus:ring-amber-500/30 min-w-[170px] sm:min-w-[240px] shadow-sm"
                  placeholder="Nome dello scaffale..."
                />
                <button
                  type="submit"
                  className="p-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 transition-colors cursor-pointer shadow-sm active:scale-95"
                  title="Salva nuovo nome"
                >
                  <Check className="w-3.5 h-3.5 stroke-[3]" />
                </button>
                <button
                  type="button"
                  onClick={handleCancelRename}
                  className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors cursor-pointer active:scale-95"
                  title="Annulla"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </form>
            ) : shelves && shelves.length > 1 ? (
              <div className="flex items-center gap-2 flex-wrap">
                <div className="relative inline-flex items-center">
                  <select
                    value={activeShelfId || ''}
                    onChange={(e) => {
                      if (e.target.value === '__add_new__') {
                        onAddShelf?.();
                      } else {
                        onSelectShelf?.(e.target.value);
                      }
                    }}
                    className="text-sm sm:text-base font-bold text-white bg-slate-950 border border-slate-700 hover:border-amber-500/60 rounded-xl px-3 py-1.5 pr-8 appearance-none focus:outline-none focus:ring-2 focus:ring-amber-500/30 cursor-pointer shadow-sm transition-all"
                    aria-label="Seleziona libreria o scaffale"
                  >
                    {shelves.map((s) => (
                      <option key={s.id} value={s.id} className="bg-slate-900 text-white py-1">
                        {s.name}
                      </option>
                    ))}
                    <option value="__add_new__" className="bg-slate-900 text-amber-400 font-semibold py-1">
                      + Aggiungi un altro scaffale...
                    </option>
                  </select>
                  <ChevronDown className="w-4 h-4 text-amber-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>

                {onRenameShelf && (
                  <button
                    type="button"
                    onClick={() => {
                      setTempShelfName(config.name);
                      setIsRenaming(true);
                    }}
                    className="p-1.5 rounded-xl text-slate-400 hover:text-amber-300 hover:bg-slate-800 border border-transparent hover:border-slate-700 transition-colors cursor-pointer"
                    title="Modifica nome di questo scaffale"
                    aria-label="Modifica nome scaffale"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                )}

                {onAddShelf && (
                  <button
                    type="button"
                    onClick={() => onAddShelf()}
                    className="text-xs font-semibold text-slate-300 hover:text-amber-300 px-2.5 py-1.5 rounded-xl border border-slate-700 hover:border-amber-500/50 bg-slate-950/80 transition-colors flex items-center gap-1.5 cursor-pointer shadow-sm active:scale-95"
                    title="Aggiungi una nuova libreria o scaffale Kallax"
                  >
                    <Plus className="w-3.5 h-3.5 text-amber-400" />
                    <span className="hidden sm:inline">Nuovo scaffale</span>
                  </button>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-sm sm:text-base font-bold text-white tracking-tight">
                  {config.name}
                </h1>

                {onRenameShelf && (
                  <button
                    type="button"
                    onClick={() => {
                      setTempShelfName(config.name);
                      setIsRenaming(true);
                    }}
                    className="p-1.5 rounded-xl text-slate-400 hover:text-amber-300 hover:bg-slate-800 border border-transparent hover:border-slate-700 transition-colors cursor-pointer"
                    title="Modifica nome di questo scaffale"
                    aria-label="Modifica nome scaffale"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                )}

                {onAddShelf && (
                  <button
                    type="button"
                    onClick={() => onAddShelf()}
                    className="text-xs font-semibold text-slate-300 hover:text-amber-300 px-2.5 py-1.5 rounded-xl border border-slate-700 hover:border-amber-500/50 bg-slate-950/80 transition-colors flex items-center gap-1.5 cursor-pointer shadow-sm active:scale-95"
                    title="Aggiungi una nuova libreria o scaffale Kallax"
                  >
                    <Plus className="w-3.5 h-3.5 text-amber-400" />
                    <span>Nuovo scaffale</span>
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right: 2D/3D View Switch + Auto-ottimizza + Dedicated Shelf Menu */}
        <div className="flex flex-wrap items-center gap-2">
          {/* 2D / 3D Segmented Switch */}
          <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800 shadow-sm">
            <button
              type="button"
              onClick={() => {
                if (viewMode !== '2d') onToggleViewMode();
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer ${
                viewMode === '2d'
                  ? 'bg-amber-500 text-slate-950 font-bold shadow-md'
                  : 'text-slate-400 hover:text-white hover:bg-slate-900'
              }`}
              title="Vista 2D: Griglia ortografica per ordinare, misurare e posizionare"
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span>Vista 2D</span>
            </button>
            <button
              type="button"
              onClick={() => {
                if (viewMode !== '3d') onToggleViewMode();
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer ${
                viewMode === '3d'
                  ? 'bg-amber-500 text-slate-950 font-bold shadow-md'
                  : 'text-slate-400 hover:text-white hover:bg-slate-900'
              }`}
              title="Vista 3D: Modello tridimensionale interattivo a 360°"
            >
              <BoxIcon className="w-3.5 h-3.5" />
              <span>Vista 3D</span>
            </button>
          </div>

          {/* Auto-Optimize All Cubes */}
          <button
            onClick={onAutoOptimizeAll}
            className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold transition-colors flex items-center gap-1.5 shadow-sm cursor-pointer"
            title="Ottimizza orientamento scatole su tutti i vani per massimizzare lo spazio"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Auto-ottimizza</span>
            <span className="sm:hidden">Ottimizza</span>
          </button>

          {/* Dedicated Shelf Menu Button */}
          <button
            onClick={onOpenShelfMenu}
            className="px-3.5 py-1.5 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800 hover:border-amber-500/50 text-slate-200 hover:text-amber-300 text-xs font-semibold transition-all flex items-center gap-2 shadow-sm cursor-pointer"
            title="Apri menu scaffale: capienza, volume, formato vani e impostazioni"
          >
            <SlidersHorizontal className="w-3.5 h-3.5 text-amber-400" />
            <span>Menu Scaffale</span>
          </button>
        </div>
      </div>

      {/* Interactive Quick Transfer Bar when a box is selected */}
      {selectedPlaced && selectedGame && (
        <div className="p-3 sm:p-3.5 bg-slate-900 border-2 border-amber-500/80 rounded-xl flex flex-wrap items-center justify-between gap-3 shadow-xl animate-in fade-in slide-in-from-top-1">
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-lg flex items-center justify-center font-bold text-white text-xs shrink-0 shadow"
              style={{ backgroundColor: selectedGame.color || '#3B82F6' }}
            >
              <BoxIcon className="w-5 h-5 drop-shadow" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-bold text-white">{selectedGame.name}</span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 font-semibold">
                  Vano attuale: [{selectedPlaced.cubeRow + 1},{selectedPlaced.cubeCol + 1}]
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-0.5 flex items-center gap-1">
                <ArrowRightLeft className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                <span>Tocca un vano per trasferire, oppure ruota la scatola:</span>
              </p>
            </div>

            {/* Quick Rotate & Physical Orientation buttons ("solo icone per ruota e sposta. mentre per l'orientamento fisico mettili tutti") */}
            <div className="flex items-center gap-2 shrink-0 flex-wrap">
              {/* Ruota: solo icona e tooltip */}
              <button
                onClick={(e) => onRotateBox(selectedPlaced.id, e)}
                className="p-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 transition-all flex items-center justify-center shadow cursor-pointer active:scale-95"
                title={`Ruota 90° (${selectedPlaced.rotation90}°)`}
                aria-label={`Ruota ${selectedGame.name} di 90 gradi`}
              >
                <RotateCw className="w-4 h-4" />
              </button>

              {/* Orientamento fisico: mettili tutti (In Costa / In Pila / Frontale) */}
              <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800 text-xs">
                <span className="text-[10px] text-slate-400 px-1 font-semibold">Orientamento:</span>
                <button
                  onClick={(e) => onSetOrientation ? onSetOrientation(selectedPlaced.id, 'vertical', e) : onToggleOrientation?.(selectedPlaced.id, e)}
                  className={`px-2 py-1 rounded text-xs transition-colors flex items-center gap-1 font-medium cursor-pointer ${
                    selectedPlaced.orientation === 'vertical'
                      ? 'bg-amber-500 text-slate-950 font-bold shadow-sm'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800'
                  }`}
                  title="In costa (verticale - tipo libro)"
                >
                  <MoveVertical className="w-3 h-3" />
                  <span>In costa</span>
                </button>
                <button
                  onClick={(e) => onSetOrientation ? onSetOrientation(selectedPlaced.id, 'horizontal', e) : onToggleOrientation?.(selectedPlaced.id, e)}
                  className={`px-2 py-1 rounded text-xs transition-colors flex items-center gap-1 font-medium cursor-pointer ${
                    selectedPlaced.orientation === 'horizontal'
                      ? 'bg-amber-500 text-slate-950 font-bold shadow-sm'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800'
                  }`}
                  title="In pila (orizzontale - una sopra l'altra)"
                >
                  <Layers className="w-3 h-3" />
                  <span>In pila</span>
                </button>
                <button
                  onClick={(e) => onSetOrientation ? onSetOrientation(selectedPlaced.id, 'frontal', e) : onToggleOrientation?.(selectedPlaced.id, e)}
                  className={`px-2 py-1 rounded text-xs transition-colors flex items-center gap-1 font-medium cursor-pointer ${
                    selectedPlaced.orientation === 'frontal'
                      ? 'bg-amber-500 text-slate-950 font-bold shadow-sm'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800'
                  }`}
                  title="Frontale (copertina a vista)"
                >
                  <Eye className="w-3 h-3" />
                  <span>Frontale</span>
                </button>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5 flex-wrap">
            {Array.from({ length: config.rows }).map((_, r) =>
              Array.from({ length: config.cols }).map((_, c) => {
                const isCurrent = r === selectedPlaced.cubeRow && c === selectedPlaced.cubeCol;
                const targetCubeBoxes = placedBoxes.filter(
                  (p) => p.cubeRow === r && p.cubeCol === c && p.id !== selectedPlaced.id
                );
                const fit = canGameFitInCube(
                  config.cubeWidth,
                  config.cubeHeight,
                  config.cubeDepth,
                  targetCubeBoxes,
                  selectedGame,
                  gamesMap,
                  selectedPlaced.orientation,
                  selectedPlaced.rotation90
                );
                const isDisabled = !isCurrent && !fit.canFit;

                return (
                  <button
                    key={`transfer-to-${r}-${c}`}
                    disabled={isDisabled}
                    onClick={() => {
                      if (onMoveBoxToCube) {
                        onMoveBoxToCube(selectedPlaced.id, r, c);
                      }
                    }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition-all flex items-center gap-1.5 ${
                      isCurrent
                        ? 'bg-emerald-950/60 text-emerald-300 border border-emerald-500/60 hover:bg-emerald-900/50 cursor-pointer shadow-sm ring-1 ring-emerald-500/30'
                        : !fit.canFit
                        ? 'bg-red-950/40 text-red-400/60 border border-red-900/40 cursor-not-allowed'
                        : 'bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-md active:scale-95 cursor-pointer'
                    }`}
                    title={
                      isCurrent
                        ? `Vano attuale [${r + 1},${c + 1}] — "${selectedGame.name}" si trova già qui`
                        : !fit.canFit
                        ? `Non entra: ${fit.reason}`
                        : `Trasferisci nel vano [${r + 1},${c + 1}]`
                    }
                  >
                    <span>Vano {r + 1},{c + 1}</span>
                    {isCurrent ? (
                      <span className="text-[9px] text-emerald-400 font-sans font-semibold">Attuale</span>
                    ) : !fit.canFit ? (
                      <span className="text-[9px] text-red-400/80 font-normal">Pieno</span>
                    ) : null}
                  </button>
                );
              })
            )}
            <button
              onClick={() => onSelectBox(null)}
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors ml-1"
              title="Deseleziona scatola"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Shelf Display: Real Interactive 3D Model OR 2D Interactive Grid */}
      {viewMode === '3d' ? (
        <div className="w-full flex justify-center pb-2">
          <Kallax3DScene
            config={config}
            placedBoxes={placedBoxes}
            gamesMap={gamesMap}
            selectedBoxId={selectedBoxId}
            onSelectBox={onSelectBox}
            onOpenCubeDetail={onOpenCubeDetail}
            onRotateBox={(placedId) => onRotateBox(placedId)}
          />
        </div>
      ) : (
        /* Physical IKEA Kallax Shelf Representation: White frame and realistic dividers */
        <div className="w-full flex justify-center overflow-x-auto pb-4">
          <div
            className={`relative w-full max-w-4xl p-2.5 sm:p-3.5 rounded-xl sm:rounded-2xl transition-all duration-300 ${frameStyle.frameBg} ${frameStyle.borderColor} border-[8px] sm:border-[12px] shadow-2xl`}
            style={{
              maxWidth: '100%',
              boxShadow: '0 10px 25px -5px rgba(0,0,0,0.6)',
            }}
          >
            {/* Kallax Grid with Realistic Dividers */}
            <div
              className={`grid gap-2 sm:gap-2.5 ${frameStyle.dividerBg} rounded-lg p-0.5`}
              style={{
                gridTemplateColumns: `repeat(${config.cols}, minmax(130px, 1fr))`,
              }}
            >
              {Array.from({ length: config.rows }).map((_, r) =>
                Array.from({ length: config.cols }).map((_, c) => {
                  const cubeBoxes = placedBoxes
                    .filter((p) => p.cubeRow === r && p.cubeCol === c)
                    .sort((a, b) => a.order - b.order);

                  const cubeKey = `${r}-${c}`;
                  const isUnlocked = unlockedCubeKeys.has(cubeKey);
                  // Se ci sono vani con il lucchetto aperto e alcuni con il lucchetto chiuso, quelli con il lucchetto chiuso sono meno luminosi
                  const isDimmed = unlockedCubeKeys.size > 0 && !isUnlocked;

                  return (
                    <KallaxCubeView
                      key={`${r}-${c}`}
                      row={r}
                      col={c}
                      config={config}
                      placedBoxes={cubeBoxes}
                      allPlacedBoxes={placedBoxes}
                      gamesMap={gamesMap}
                      selectedBoxId={selectedBoxId}
                      onSelectBox={onSelectBox}
                      onOpenCubeDetail={onOpenCubeDetail}
                      onRotateBox={onRotateBox}
                      onToggleOrientation={onToggleOrientation}
                      onSetOrientation={onSetOrientation}
                      onAutoOptimizeCube={onAutoOptimizeCube}
                      onDropGame={onDropGame}
                      onMoveBoxToCube={onMoveBoxToCube}
                      onUpdatePlacement={onUpdatePlacement}
                      onReorderBoxes={onReorderBoxes}
                      onShowToast={onShowToast}
                      isFreeSortUnlocked={isUnlocked}
                      isDimmed={isDimmed}
                      onSetFreeSortUnlocked={(unlocked) => handleSetCubeUnlocked(r, c, unlocked)}
                      viewMode={viewMode}
                    />
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* Helpful Quick Tips Footer */}
      <div className="p-3 rounded-xl bg-slate-900/50 border border-slate-800/60 text-xs text-slate-400 flex flex-wrap items-center justify-between gap-2">
        {viewMode === '3d' ? (
          <div className="flex items-center gap-2">
            <Eye className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span>
              <strong>Vista 3D Reale:</strong> Trascina col mouse per ruotare lo scaffale a 360°, usa la rotellina per zoomare e clicca su qualsiasi scatola per vederne dettagli e orientamento.
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <RotateCw className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span>
              <strong>Vista 2D Griglia:</strong> Trascina le scatole per disporle, usa il lucchetto per la modalità libera con sovrapposizione e tocca il pulsante circolare per ruotarle a 90°.
            </span>
          </div>
        )}
        <div className="flex items-center gap-2 text-[11px] text-slate-400 font-mono">
          <span>Interno vano Kallax: 33.5 × 33.5 × 39 cm</span>
        </div>
      </div>
    </div>
  );
};


import React, { useState } from 'react';
import { GameBox, PlacedBox, KallaxConfig } from '../types/kallax';
import { canGameFitInCube } from '../utils/kallaxMath';
import {
  Search,
  Plus,
  Download,
  Smartphone,
  Sliders,
  MoveRight,
  GripVertical,
  Check,
  ChevronDown,
  Layers,
  Box as BoxIcon,
  Trash2,
  RotateCcw,
  Star,
  Zap,
  Users,
  Clock,
  FileText,
  Sparkles,
} from 'lucide-react';

interface LibraryDrawerProps {
  allGames: GameBox[];
  placedBoxes: PlacedBox[];
  config: KallaxConfig;
  isOpen: boolean;
  onClose: () => void;
  onEditGame: (game: GameBox) => void;
  onAddManualGame: () => void;
  onOpenBggModal: () => void;
  onOpenBgStatsModal: () => void;
  onPlaceGameInCube: (gameId: string, row: number, col: number) => void;
  onDeleteGame: (gameId: string) => void;
  onClearCollection: () => void;
  onResetSampleGames?: () => void;
}

export const LibraryDrawer: React.FC<LibraryDrawerProps> = ({
  allGames,
  placedBoxes,
  config,
  isOpen,
  onClose,
  onEditGame,
  onAddManualGame,
  onOpenBggModal,
  onOpenBgStatsModal,
  onPlaceGameInCube,
  onDeleteGame,
  onClearCollection,
  onResetSampleGames,
}) => {
  const [activeTab, setActiveTab] = useState<'unplaced' | 'all'>('unplaced');
  const [filterQuery, setFilterQuery] = useState('');
  const [touchTargetGame, setTouchTargetGame] = useState<GameBox | null>(null);
  const [gameToDelete, setGameToDelete] = useState<GameBox | null>(null);
  const [isConfirmEmptyOpen, setIsConfirmEmptyOpen] = useState(false);

  const placedGameIds = new Set(placedBoxes.map((p) => p.gameId));

  const unplacedGames = allGames.filter((g) => !placedGameIds.has(g.id));
  const currentList = activeTab === 'unplaced' ? unplacedGames : allGames;

  const filteredGames = currentList.filter((g) =>
    g.name.toLowerCase().includes(filterQuery.toLowerCase())
  );

  const handleDragStart = (e: React.DragEvent, gameId: string) => {
    e.dataTransfer.setData('text/plain', gameId);
    e.dataTransfer.setData('application/json', gameId);
    e.dataTransfer.effectAllowed = 'move';
  };

  return (
    <>
      {/* Mobile Backdrop */}
      {isOpen && (
        <div
          onClick={onClose}
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-30 lg:hidden"
        />
      )}

      {/* Drawer Container (Sliding sheet on mobile, sidebar/tray on desktop) */}
      <div
        className={`fixed lg:static top-0 right-0 h-full w-full max-w-md bg-slate-900 border-l border-slate-800 z-40 flex flex-col transition-transform duration-300 shadow-2xl lg:shadow-none ${
          isOpen ? 'translate-x-0' : 'translate-x-full lg:translate-x-0 hidden lg:flex'
        }`}
      >
        {/* Drawer Header */}
        <div className="p-4 border-b border-slate-800 bg-slate-900/90 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <BoxIcon className="w-5 h-5 text-amber-400" />
              <h2 className="text-sm font-bold text-white tracking-tight">
                Libreria Giochi da Tavolo
              </h2>
            </div>
            <div className="flex items-center gap-1.5">
              {allGames.length > 0 && (
                <button
                  type="button"
                  onClick={() => setIsConfirmEmptyOpen(true)}
                  className="px-2 py-1 rounded-lg text-xs font-semibold text-red-400 hover:text-red-300 hover:bg-red-950/40 border border-red-900/30 flex items-center gap-1 transition-colors cursor-pointer"
                  title="Svuota l'intera collezione"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Svuota</span>
                </button>
              )}
              <button
                onClick={onClose}
                className="p-1 rounded text-slate-400 hover:text-white lg:hidden"
              >
                <ChevronDown className="w-5 h-5 rotate-90" />
              </button>
            </div>
          </div>

          {/* Quick Import / Add Actions */}
          <div className="grid grid-cols-3 gap-1.5">
            <button
              onClick={onOpenBggModal}
              className="p-2 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800 text-xs font-semibold text-slate-200 hover:text-amber-300 flex flex-col items-center gap-1 transition-colors"
            >
              <Download className="w-4 h-4 text-amber-400" />
              <span>BGG</span>
            </button>
            <button
              onClick={onOpenBgStatsModal}
              className="p-2 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800 text-xs font-semibold text-slate-200 hover:text-emerald-300 flex flex-col items-center gap-1 transition-colors"
            >
              <Smartphone className="w-4 h-4 text-emerald-400" />
              <span>BG Stats</span>
            </button>
            <button
              onClick={onAddManualGame}
              className="p-2 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800 text-xs font-semibold text-slate-200 hover:text-blue-300 flex flex-col items-center gap-1 transition-colors"
            >
              <Plus className="w-4 h-4 text-blue-400" />
              <span>Manuale</span>
            </button>
          </div>

          {/* Search Bar */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={filterQuery}
              onChange={(e) => setFilterQuery(e.target.value)}
              placeholder="Filtra giochi nella libreria..."
              className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-8 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
            />
          </div>

          {/* Tabs */}
          <div className="flex border-b border-slate-800 gap-4 text-xs font-semibold">
            <button
              onClick={() => setActiveTab('unplaced')}
              className={`pb-2 border-b-2 transition-colors ${
                activeTab === 'unplaced'
                  ? 'border-amber-400 text-amber-300 font-bold'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              Da Posizionare ({unplacedGames.length})
            </button>
            <button
              onClick={() => setActiveTab('all')}
              className={`pb-2 border-b-2 transition-colors ${
                activeTab === 'all'
                  ? 'border-amber-400 text-amber-300 font-bold'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              Tutti ({allGames.length})
            </button>
          </div>
        </div>

        {/* Games List */}
        <div className="p-3 overflow-y-auto flex-1 space-y-2">
          {filteredGames.length === 0 ? (
            <div className="p-8 text-center text-slate-500 text-xs border border-dashed border-slate-800 rounded-xl space-y-3">
              <p>
                {filterQuery
                  ? 'Nessun gioco corrisponde alla ricerca.'
                  : activeTab === 'unplaced' && allGames.length > 0
                  ? 'Tutti i giochi sono posizionati nello scaffale Kallax! Ottimo lavoro.'
                  : 'Nessun gioco in libreria. Aggiungi con BGG o BG Stats!'}
              </p>
              {allGames.length === 0 && onResetSampleGames && (
                <button
                  type="button"
                  onClick={onResetSampleGames}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-amber-300 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Ripristina giochi di esempio</span>
                </button>
              )}
            </div>
          ) : (
            filteredGames.map((game) => {
              const isPlaced = placedGameIds.has(game.id);

              return (
                <div
                  key={game.id}
                  draggable
                  onDragStart={(e) => handleDragStart(e, game.id)}
                  className="group/item p-3 rounded-xl bg-slate-950/90 border border-slate-800/80 hover:border-amber-500/50 transition-all flex flex-col gap-2 shadow-sm hover:shadow-md cursor-grab active:cursor-grabbing hover:bg-slate-950"
                >
                  <div className="flex items-start justify-between gap-2.5">
                    <div
                      className="flex items-start gap-2.5 min-w-0 flex-1 cursor-pointer"
                      onClick={() => onEditGame(game)}
                      title={`Clicca per aprire la scheda BGG di ${game.name}`}
                    >
                      <GripVertical className="w-3.5 h-3.5 text-slate-600 group-hover/item:text-slate-400 shrink-0 mt-1" />
                      
                      {/* Game Cover Thumbnail with Monogram Fallback */}
                      <div
                        className="w-10 h-10 rounded-lg flex items-center justify-center text-white font-bold text-xs shrink-0 shadow border border-white/20 relative overflow-hidden"
                        style={{ backgroundColor: game.color || '#3B82F6' }}
                      >
                        <span>{game.name.charAt(0).toUpperCase()}</span>
                        {game.thumbnail && (
                          <img
                            src={game.thumbnail}
                            alt={game.name}
                            className="absolute inset-0 w-full h-full object-cover"
                            onError={(e) => {
                              (e.target as HTMLElement).style.display = 'none';
                            }}
                          />
                        )}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-xs font-bold text-white group-hover/item:text-amber-300 transition-colors">
                            {game.name}
                          </span>
                          {game.year && (
                            <span className="text-[10px] text-slate-500 font-mono">
                              ({game.year})
                            </span>
                          )}
                          {isPlaced && (
                            <span className="px-1.5 py-0.2 rounded bg-emerald-950 text-emerald-400 text-[9px] font-semibold border border-emerald-800/50">
                              Posizionato
                            </span>
                          )}
                        </div>

                        {/* Dimensions and Source */}
                        <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                          <span className="text-[11px] font-mono text-amber-400/90 font-semibold">
                            {game.width} × {game.height} × {game.depth} cm
                          </span>
                          <span
                            className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-slate-800 text-slate-300 border border-slate-700/60 inline-flex items-center gap-1"
                            title={`Fonte dimensioni: ${game.dimensionSource || (game.bggId ? 'BGG' : 'Catalogo')}`}
                          >
                            <span className="text-slate-400 font-normal">da</span>
                            <span className="text-amber-300 font-semibold">{game.dimensionSource || (game.bggId ? 'BGG' : 'Catalogo')}</span>
                          </span>
                        </div>

                        {/* BGG Stats Badges */}
                        <div className="flex items-center gap-2 mt-1 flex-wrap text-[10px]">
                          {game.rating !== undefined && (
                            <span className="flex items-center gap-0.5 text-amber-300 font-semibold" title="Voto BoardGameGeek">
                              <Star className="w-2.5 h-2.5 fill-amber-300 text-amber-300" />
                              <span>{game.rating}</span>
                            </span>
                          )}
                          {game.weight !== undefined && (
                            <span className="flex items-center gap-0.5 text-purple-300 font-semibold" title="Complessità / Peso BGG">
                              <Zap className="w-2.5 h-2.5 text-purple-300" />
                              <span>{game.weight}</span>
                            </span>
                          )}
                          {game.players && (
                            <span className="flex items-center gap-0.5 text-emerald-300" title="Giocatori">
                              <Users className="w-2.5 h-2.5 text-emerald-300" />
                              <span>{game.players}</span>
                            </span>
                          )}
                          {game.playtime && (
                            <span className="flex items-center gap-0.5 text-blue-300" title="Durata partita">
                              <Clock className="w-2.5 h-2.5 text-blue-300" />
                              <span>{game.playtime}m</span>
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Trash Button */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setGameToDelete(game);
                      }}
                      className="p-1 rounded text-slate-500 hover:text-red-400 hover:bg-red-950/50 transition-colors shrink-0 cursor-pointer"
                      title={`Elimina "${game.name}" dalla collezione`}
                      aria-label={`Elimina ${game.name}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Bottom Action Bar */}
                  <div className="flex items-center justify-between gap-1.5 pt-1.5 border-t border-slate-900">
                    <button
                      type="button"
                      onClick={() => onEditGame(game)}
                      className="px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-amber-300 border border-slate-800 text-[11px] font-semibold transition-colors flex items-center gap-1.5 cursor-pointer"
                      title="Apri scheda dettagliata BGG ed edita informazioni"
                    >
                      <FileText className="w-3 h-3 text-amber-400" />
                      <span>Scheda Gioco</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setTouchTargetGame(game)}
                      className="px-2.5 py-1 bg-slate-800 hover:bg-amber-500 hover:text-slate-950 text-slate-200 text-[11px] font-bold rounded-lg transition-colors flex items-center gap-1 cursor-pointer"
                      title="Posiziona in un vano Kallax"
                    >
                      <MoveRight className="w-3 h-3" />
                      <span>Posiziona</span>
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer info & Svuota Collezione */}
        <div className="p-3 border-t border-slate-800 bg-slate-900/90 text-xs flex items-center justify-between gap-2">
          <div className="text-[11px] text-slate-400">
            <span className="font-bold text-slate-200">{allGames.length}</span> giochi{' '}
            <span className="text-slate-500">({unplacedGames.length} liberi)</span>
          </div>
          {allGames.length > 0 && (
            <button
              type="button"
              onClick={() => setIsConfirmEmptyOpen(true)}
              className="px-2.5 py-1 text-xs font-semibold text-red-400 hover:text-red-300 hover:bg-red-950/50 border border-red-900/40 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer shadow-sm active:scale-95"
              title="Elimina tutti i giochi e svuota la collezione"
            >
              <Trash2 className="w-3.5 h-3.5 text-red-400" />
              <span>Svuota collezione</span>
            </button>
          )}
        </div>
      </div>

      {/* Smartphone Touch Placement Modal (when user taps "Posiziona") */}
      {touchTargetGame && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-sm p-4 shadow-2xl space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-white">
                  Seleziona Vano per "{touchTargetGame.name}"
                </h3>
                <p className="text-xs text-slate-400">
                  Tocca il vano dello scaffale in cui inserire la scatola:
                </p>
              </div>
              <button
                onClick={() => setTouchTargetGame(null)}
                className="p-1 text-slate-400 hover:text-white"
              >
                <ChevronDown className="w-5 h-5" />
              </button>
            </div>

            {/* Grid selector */}
            <div
              className="grid gap-2 p-2 bg-slate-950 rounded-xl border border-slate-800"
              style={{
                gridTemplateColumns: `repeat(${config.cols}, minmax(0, 1fr))`,
              }}
            >
              {Array.from({ length: config.rows }).map((_, r) =>
                Array.from({ length: config.cols }).map((_, c) => {
                  const isCurrent = placedBoxes.some(
                    (p) => p.gameId === touchTargetGame.id && p.cubeRow === r && p.cubeCol === c
                  );
                  const cubeBoxes = placedBoxes.filter(
                    (p) => p.cubeRow === r && p.cubeCol === c && p.gameId !== touchTargetGame.id
                  );
                  const gamesMap = Object.fromEntries(allGames.map((g) => [g.id, g]));
                  const fit = canGameFitInCube(
                    config.cubeWidth,
                    config.cubeHeight,
                    config.cubeDepth,
                    cubeBoxes,
                    touchTargetGame,
                    gamesMap
                  );
                  const isDisabled = !isCurrent && !fit.canFit;

                  return (
                    <button
                      key={`${r},${c}`}
                      disabled={isDisabled}
                      title={
                        isCurrent
                          ? `Vano attuale [${r + 1},${c + 1}] — "${touchTargetGame.name}" si trova già qui`
                          : !fit.canFit
                          ? fit.reason
                          : `Inserisci nel vano [${r + 1},${c + 1}]`
                      }
                      onClick={() => {
                        onPlaceGameInCube(touchTargetGame.id, r, c);
                        setTouchTargetGame(null);
                      }}
                      className={`p-3 rounded-lg font-mono text-xs font-bold border transition-colors flex flex-col items-center justify-center gap-1 ${
                        isCurrent
                          ? 'bg-emerald-950/60 border-emerald-500/60 text-emerald-300 hover:bg-emerald-900/50 cursor-pointer shadow-sm ring-1 ring-emerald-500/30'
                          : !fit.canFit
                          ? 'bg-slate-950 text-slate-600 border-red-950/40 cursor-not-allowed opacity-40'
                          : 'bg-slate-900 hover:bg-amber-500 hover:text-slate-950 text-slate-300 border-slate-800 active:scale-95 cursor-pointer'
                      }`}
                    >
                      <span>[{r + 1},{c + 1}]</span>
                      {isCurrent ? (
                        <span className="text-[9px] text-emerald-400 font-sans font-semibold">Attuale</span>
                      ) : !fit.canFit ? (
                        <span className="text-[9px] text-red-400 font-sans font-normal">Non entra</span>
                      ) : (
                        <span className="text-[9px] text-slate-500 font-sans font-normal">
                          {cubeBoxes.length > 0 ? `${cubeBoxes.length} g.` : 'Libero'}
                        </span>
                      )}
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal Conferma Eliminazione Singolo Gioco */}
      {gameToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-sm p-5 shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-red-500/20 text-red-400 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">Elimina Gioco</h3>
                <p className="text-xs text-slate-400">Rimuovi dalla collezione</p>
              </div>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              Sei sicuro di voler eliminare <strong className="text-white">"{gameToDelete.name}"</strong>? Verrà rimosso sia dalla libreria sia da qualsiasi vano Kallax in cui si trova.
            </p>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setGameToDelete(null)}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-300 hover:bg-slate-800 transition-colors cursor-pointer"
              >
                Annulla
              </button>
              <button
                type="button"
                onClick={() => {
                  onDeleteGame(gameToDelete.id);
                  setGameToDelete(null);
                }}
                className="px-3 py-1.5 rounded-lg text-xs font-bold bg-red-600 hover:bg-red-500 text-white transition-colors flex items-center gap-1.5 shadow-md shadow-red-600/20 cursor-pointer active:scale-95"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Elimina</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Conferma Svuota Collezione */}
      {isConfirmEmptyOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-slate-900 border border-red-500/40 rounded-2xl w-full max-w-sm p-5 shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-red-500/20 text-red-400 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">Svuota Collezione</h3>
                <p className="text-xs text-red-400 font-semibold">Operazione irreversibile</p>
              </div>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              Sei sicuro di voler eliminare tutti i <strong className="text-white">{allGames.length} giochi</strong> presenti nella collezione? Anche lo scaffale Kallax verrà completamente svuotato.
            </p>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsConfirmEmptyOpen(false)}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-300 hover:bg-slate-800 transition-colors cursor-pointer"
              >
                Annulla
              </button>
              <button
                type="button"
                onClick={() => {
                  onClearCollection();
                  setIsConfirmEmptyOpen(false);
                }}
                className="px-3 py-1.5 rounded-lg text-xs font-bold bg-red-600 hover:bg-red-500 text-white transition-colors flex items-center gap-1.5 shadow-md shadow-red-600/30 cursor-pointer active:scale-95"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Svuota tutta la collezione</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

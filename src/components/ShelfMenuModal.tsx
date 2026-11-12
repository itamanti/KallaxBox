import React, { useState } from 'react';
import {
  KallaxConfig,
  PlacedBox,
  GameBox,
} from '../types/kallax';
import {
  X,
  PieChart,
  Grid,
  Palette,
  Check,
  Save,
  Sparkles,
  Lock,
  PackageOpen,
  Trash2,
  Plus,
  SlidersHorizontal,
  Info,
  Download,
} from 'lucide-react';

interface ShelfMenuModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: KallaxConfig;
  onUpdateConfig: (newConfig: KallaxConfig) => void;
  placedBoxes: PlacedBox[];
  gamesMap: Record<string, GameBox>;
  onAutoOptimizeAll: () => void;
  onClearShelf?: () => void;
  shelvesCount: number;
  onDeleteShelf?: () => void;
  onAddShelf?: () => void;
}

const SHELF_PRESETS = [
  { name: '1×1 (1 vano)', rows: 1, cols: 1 },
  { name: '1×2 (2 vani)', rows: 1, cols: 2 },
  { name: '2×1 (2 vani)', rows: 2, cols: 1 },
  { name: '1×3 (3 vani)', rows: 1, cols: 3 },
  { name: '3×1 (3 vani)', rows: 3, cols: 1 },
  { name: '1×4 (4 vani)', rows: 1, cols: 4 },
  { name: '4×1 (4 vani)', rows: 4, cols: 1 },
  { name: '2×2 (4 vani)', rows: 2, cols: 2 },
  { name: '2×3 (6 vani)', rows: 2, cols: 3 },
  { name: '3×2 (6 vani)', rows: 3, cols: 2 },
  { name: '2×4 (8 vani)', rows: 2, cols: 4 },
  { name: '4×2 (8 vani)', rows: 4, cols: 2 },
  { name: '3×3 (9 vani)', rows: 3, cols: 3 },
  { name: '3×4 (12 vani)', rows: 3, cols: 4 },
  { name: '4×4 (16 vani)', rows: 4, cols: 4 },
  { name: '5×5 (25 vani)', rows: 5, cols: 5 },
];

const SHELF_COLORS: { id: KallaxConfig['shelfColor']; name: string; bg: string; border: string }[] = [
  { id: 'white', name: 'Bianco', bg: '#FFFFFF', border: '#CBD5E1' },
  { id: 'black-brown', name: 'Marrone-Nero', bg: '#171717', border: '#334155' },
  { id: 'oak', name: 'Effetto Rovere', bg: '#78350F', border: '#92400E' },
  { id: 'grey', name: 'Grigio Antracite', bg: '#334155', border: '#475569' },
];

export const ShelfMenuModal: React.FC<ShelfMenuModalProps> = ({
  isOpen,
  onClose,
  config,
  onUpdateConfig,
  placedBoxes,
  gamesMap,
  onAutoOptimizeAll,
  onClearShelf,
  shelvesCount,
  onDeleteShelf,
  onAddShelf,
}) => {
  const [activeTab, setActiveTab] = useState<'capacity' | 'format' | 'actions'>('capacity');
  const [shelfName, setShelfName] = useState(config.name);
  const [rows, setRows] = useState(config.rows);
  const [cols, setCols] = useState(config.cols);
  const [shelfColor, setShelfColor] = useState<KallaxConfig['shelfColor']>(config.shelfColor);
  const [hasUnsavedFormat, setHasUnsavedFormat] = useState(false);

  React.useEffect(() => {
    if (isOpen) {
      setShelfName(config.name);
      setRows(config.rows);
      setCols(config.cols);
      setShelfColor(config.shelfColor);
      setHasUnsavedFormat(false);
    }
  }, [config.name, config.rows, config.cols, config.shelfColor, isOpen]);

  if (!isOpen) return null;

  // Shelf volume and capacity statistics calculations
  const totalCubes = config.rows * config.cols;
  const singleCubeLiters = (config.cubeWidth * config.cubeHeight * config.cubeDepth) / 1000; // ~43.8 L
  const totalShelfVolumeLiters = Math.round(totalCubes * singleCubeLiters * 10) / 10;

  let emptyCubesCount = 0;
  for (let r = 0; r < config.rows; r++) {
    for (let c = 0; c < config.cols; c++) {
      const hasBox = placedBoxes.some((p) => p.cubeRow === r && p.cubeCol === c);
      if (!hasBox) emptyCubesCount++;
    }
  }
  const occupiedCubesCount = totalCubes - emptyCubesCount;

  let totalVolumeUsedCm3 = 0;
  for (const placed of placedBoxes) {
    const game = gamesMap[placed.gameId];
    if (game) {
      totalVolumeUsedCm3 += game.width * game.height * game.depth;
    }
  }
  const totalVolumeUsedLiters = Math.round((totalVolumeUsedCm3 / 1000) * 10) / 10;
  const availableVolumeLiters = Math.max(0, Math.round((totalShelfVolumeLiters - totalVolumeUsedLiters) * 10) / 10);
  const overallPercent = Math.min(
    100,
    Math.round((totalVolumeUsedCm3 / (totalCubes * config.cubeWidth * config.cubeHeight * config.cubeDepth)) * 100)
  );
  const availablePercent = Math.max(0, 100 - overallPercent);

  const handleApplyPreset = (p: typeof SHELF_PRESETS[0]) => {
    setRows(p.rows);
    setCols(p.cols);
    setHasUnsavedFormat(true);
  };

  const handleSaveConfig = () => {
    onUpdateConfig({
      ...config,
      name: shelfName.trim() || config.name,
      rows: Math.max(1, Math.min(8, rows)),
      cols: Math.max(1, Math.min(8, cols)),
      shelfColor,
    });
    setHasUnsavedFormat(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        
        {/* Modal Header */}
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/95 sticky top-0 z-10">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center font-bold">
              <SlidersHorizontal className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
                <span>Menu Scaffale:</span>
                <span className="text-amber-400">{config.name}</span>
              </h2>
              <p className="text-xs text-slate-400">
                Capienza, statistiche volume e configurazione mobile
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
            aria-label="Chiudi menu scaffale"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-800 bg-slate-950 px-4 pt-2 gap-2 text-xs font-semibold">
          <button
            onClick={() => setActiveTab('capacity')}
            className={`pb-2.5 px-3 border-b-2 flex items-center gap-1.5 transition-colors cursor-pointer ${
              activeTab === 'capacity'
                ? 'border-amber-400 text-amber-400 font-bold'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <PieChart className="w-4 h-4" />
            <span>Capienza & Volume</span>
          </button>
          <button
            onClick={() => setActiveTab('format')}
            className={`pb-2.5 px-3 border-b-2 flex items-center gap-1.5 transition-colors cursor-pointer ${
              activeTab === 'format'
                ? 'border-amber-400 text-amber-400 font-bold'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Grid className="w-4 h-4" />
            <span>Formato & Vani</span>
            {hasUnsavedFormat && (
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
            )}
          </button>
          <button
            onClick={() => setActiveTab('actions')}
            className={`pb-2.5 px-3 border-b-2 flex items-center gap-1.5 transition-colors cursor-pointer ${
              activeTab === 'actions'
                ? 'border-amber-400 text-amber-400 font-bold'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Sparkles className="w-4 h-4" />
            <span>Azioni Scaffale</span>
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 overflow-y-auto flex-1 space-y-5">
          
          {/* TAB 1: CAPIENZA & VOLUME */}
          {activeTab === 'capacity' && (
            <div className="space-y-4">
              {/* Header Box */}
              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-[10px] uppercase font-bold tracking-wider text-amber-400 block">
                      Riepilogo Volume Complessivo
                    </span>
                    <h3 className="text-lg font-extrabold text-white">
                      {totalVolumeUsedLiters} L <span className="text-xs text-slate-400 font-normal">occupati su {totalShelfVolumeLiters} L totali</span>
                    </h3>
                  </div>
                  <div className="text-right">
                    <span className="text-2xl font-black text-amber-400">{overallPercent}%</span>
                    <span className="text-[10px] text-slate-400 block font-mono">occupazione</span>
                  </div>
                </div>

                {/* Dual Progress Bar */}
                <div className="space-y-1.5">
                  <div className="w-full h-3.5 rounded-full bg-slate-900 border border-slate-800 overflow-hidden flex">
                    <div
                      className="h-full bg-gradient-to-r from-amber-500 to-amber-400 transition-all duration-300"
                      style={{ width: `${overallPercent}%` }}
                      title={`Volume Occupato: ${overallPercent}% (${totalVolumeUsedLiters} L)`}
                    />
                    <div
                      className="h-full bg-emerald-500/30 transition-all duration-300"
                      style={{ width: `${availablePercent}%` }}
                      title={`Spazio Disponibile: ${availablePercent}% (${availableVolumeLiters} L)`}
                    />
                  </div>
                  <div className="flex items-center justify-between text-xs font-mono">
                    <div className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
                      <span className="text-slate-300">Occupato:</span>
                      <span className="text-amber-300 font-bold">{totalVolumeUsedLiters} L ({overallPercent}%)</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
                      <span className="text-slate-300">Libero:</span>
                      <span className="text-emerald-400 font-bold">{availableVolumeLiters} L ({availablePercent}%)</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Vani Details Cards */}
              <div className="grid grid-cols-3 gap-2.5 text-center">
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                  <span className="text-[10px] text-slate-400 block uppercase font-bold tracking-wider">
                    Vani Totali
                  </span>
                  <span className="text-xl font-black text-white font-mono">
                    {totalCubes}
                  </span>
                  <span className="text-[10px] text-slate-500 block">
                    {config.rows}×{config.cols} vani
                  </span>
                </div>

                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                  <span className="text-[10px] text-slate-400 block uppercase font-bold tracking-wider">
                    Vani Occupati
                  </span>
                  <span className="text-xl font-black text-amber-400 font-mono">
                    {occupiedCubesCount}
                  </span>
                  <span className="text-[10px] text-slate-500 block">
                    con {placedBoxes.length} scatole
                  </span>
                </div>

                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                  <span className="text-[10px] text-slate-400 block uppercase font-bold tracking-wider">
                    Vani Vuoti
                  </span>
                  <span className={`text-xl font-black font-mono ${emptyCubesCount > 0 ? 'text-emerald-400' : 'text-slate-500'}`}>
                    {emptyCubesCount}
                  </span>
                  <span className="text-[10px] text-slate-500 block">
                    disponibili
                  </span>
                </div>
              </div>

              {/* Guideline info */}
              <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/80 text-xs text-slate-300 space-y-1.5">
                <div className="flex items-center gap-2 text-amber-300 font-semibold">
                  <Lock className="w-4 h-4 text-amber-400 shrink-0" />
                  <span>Lucchetto & Ordinamento Libero</span>
                </div>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  In ciascun vano dello scaffale puoi cliccare sul lucchetto: quando è aperto, puoi trascinare le scatole liberamente con sovrapposizione consentita per simulare disposizioni particolari. Cliccando nuovamente, le scatole vengono allineate e compattate automaticamente senza lasciare spazi vuoti.
                </p>
              </div>
            </div>
          )}

          {/* TAB 2: FORMATO & VANI */}
          {activeTab === 'format' && (
            <div className="space-y-4">
              {/* Shelf Name Input */}
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">
                  Nome dello Scaffale:
                </label>
                <input
                  type="text"
                  value={shelfName}
                  onChange={(e) => {
                    setShelfName(e.target.value);
                    setHasUnsavedFormat(true);
                  }}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
                  placeholder="Es. Kallax Soggiorno, Libreria Studio..."
                />
              </div>

              {/* Presets Grid */}
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1.5">
                  Formati Predefiniti IKEA Kallax:
                </label>
                <div className="grid grid-cols-4 sm:grid-cols-4 gap-1.5 max-h-48 overflow-y-auto pr-1">
                  {SHELF_PRESETS.map((p, idx) => {
                    const isSelected = rows === p.rows && cols === p.cols;
                    return (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => handleApplyPreset(p)}
                        className={`p-2 rounded-xl border text-center transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-amber-500/20 border-amber-400 text-amber-300 ring-1 ring-amber-400/40 font-bold'
                            : 'bg-slate-950 hover:bg-slate-800 border-slate-800 text-slate-300'
                        }`}
                      >
                        <div className="font-bold text-xs">{p.rows}×{p.cols}</div>
                        <div className="text-[10px] text-slate-400 truncate mt-0.5">{p.name.split('(')[1]?.replace(')', '') || `${p.rows * p.cols} vani`}</div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Custom Rows and Columns */}
              <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800">
                <span className="text-xs font-bold text-slate-200 block mb-2">
                  Personalizza Righe e Colonne:
                </span>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] text-slate-400 block mb-1 font-mono">Righe (Altezza)</label>
                    <input
                      type="number"
                      min="1"
                      max="8"
                      value={rows}
                      onChange={(e) => {
                        setRows(parseInt(e.target.value, 10) || 1);
                        setHasUnsavedFormat(true);
                      }}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white font-mono focus:outline-none focus:border-amber-500"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-400 block mb-1 font-mono">Colonne (Larghezza)</label>
                    <input
                      type="number"
                      min="1"
                      max="8"
                      value={cols}
                      onChange={(e) => {
                        setCols(parseInt(e.target.value, 10) || 1);
                        setHasUnsavedFormat(true);
                      }}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white font-mono focus:outline-none focus:border-amber-500"
                    />
                  </div>
                </div>
                <div className="text-[11px] text-slate-400 mt-2">
                  Totale vani selezionati: <strong className="text-amber-400">{rows * cols}</strong> ({((rows * cols * singleCubeLiters)).toFixed(0)} L di capacità)
                </div>
              </div>

              {/* Color Finish */}
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1.5 flex items-center gap-1.5">
                  <Palette className="w-3.5 h-3.5 text-slate-400" /> Finitura Scaffale:
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {SHELF_COLORS.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => {
                        setShelfColor(c.id);
                        setHasUnsavedFormat(true);
                      }}
                      className={`p-2 rounded-xl border flex items-center gap-2 transition-all cursor-pointer ${
                        shelfColor === c.id
                          ? 'border-amber-400 ring-2 ring-amber-400/20 bg-slate-800'
                          : 'border-slate-800 bg-slate-950 hover:bg-slate-800/60'
                      }`}
                    >
                      <div
                        className="w-4 h-4 rounded-md border shrink-0"
                        style={{ backgroundColor: c.bg, borderColor: c.border }}
                      />
                      <span className="text-xs font-medium text-slate-200 truncate">
                        {c.name}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Save Format Button */}
              {hasUnsavedFormat && (
                <div className="pt-2 flex justify-end">
                  <button
                    type="button"
                    onClick={handleSaveConfig}
                    className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold rounded-xl flex items-center gap-1.5 shadow cursor-pointer transition-all active:scale-95"
                  >
                    <Save className="w-4 h-4" />
                    <span>Applica Modifiche Scaffale</span>
                  </button>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: AZIONI SCAFFALE */}
          {activeTab === 'actions' && (
            <div className="space-y-3">
              {/* Auto-optimize All */}
              <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between gap-3">
                <div>
                  <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4 text-amber-400" />
                    Auto-ottimizza Tutti i Vani
                  </h4>
                  <p className="text-[11px] text-slate-400">
                    Dispone automaticamente le scatole nell'orientamento più compatto per massimizzare lo spazio residuo.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    onAutoOptimizeAll();
                    onClose();
                  }}
                  className="px-3.5 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold transition-all shadow-sm shrink-0 cursor-pointer"
                >
                  Ottimizza
                </button>
              </div>

              {/* Clear Shelf */}
              {onClearShelf && placedBoxes.length > 0 && (
                <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between gap-3">
                  <div>
                    <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
                      <PackageOpen className="w-4 h-4 text-sky-400" />
                      Svuota Scaffale
                    </h4>
                    <p className="text-[11px] text-slate-400">
                      Rimuove tutti i giochi da questo scaffale riportandoli nella libreria (nessun gioco verrà eliminato).
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      if (window.confirm('Vuoi davvero svuotare questo scaffale? I giochi rimarranno nella libreria non riposti.')) {
                        onClearShelf();
                        onClose();
                      }
                    }}
                    className="px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition-all shrink-0 cursor-pointer"
                  >
                    Svuota
                  </button>
                </div>
              )}

              {/* Add New Shelf */}
              {onAddShelf && (
                <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between gap-3">
                  <div>
                    <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
                      <Plus className="w-4 h-4 text-emerald-400" />
                      Aggiungi un Altro Scaffale Kallax
                    </h4>
                    <p className="text-[11px] text-slate-400">
                      Crea una nuova libreria o mobile aggiuntivo per organizzare altri giochi.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      onAddShelf();
                      onClose();
                    }}
                    className="px-3.5 py-1.5 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 text-xs font-bold transition-all shrink-0 cursor-pointer"
                  >
                    + Nuovo Scaffale
                  </button>
                </div>
              )}

              {/* Export ZIP per GitHub */}
              <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between gap-3">
                <div>
                  <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
                    <Download className="w-4 h-4 text-amber-400" />
                    Scarica ZIP Progetto (per GitHub)
                  </h4>
                  <p className="text-[11px] text-slate-400">
                    Archivio completo pronto all'uso con sorgenti, server, configurazioni e README per pubblicare l'app su GitHub.
                  </p>
                </div>
                <a
                  href="/api/download-zip"
                  download="kallaxbox-github.zip"
                  className="px-3.5 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold transition-all shadow-sm shrink-0 flex items-center gap-1.5 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Scarica ZIP</span>
                </a>
              </div>

              {/* Delete Shelf (only if more than 1 shelf exists) */}
              {onDeleteShelf && shelvesCount > 1 && (
                <div className="p-3.5 rounded-xl bg-red-950/20 border border-red-900/40 flex items-center justify-between gap-3">
                  <div>
                    <h4 className="text-xs font-bold text-red-300 flex items-center gap-1.5">
                      <Trash2 className="w-4 h-4 text-red-400" />
                      Elimina Questo Scaffale
                    </h4>
                    <p className="text-[11px] text-slate-400">
                      Elimina solo questo scaffale. I giochi riposti qui torneranno nella libreria generale.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      if (window.confirm(`Sei sicuro di voler eliminare lo scaffale "${config.name}"?`)) {
                        onDeleteShelf();
                        onClose();
                      }
                    }}
                    className="px-3.5 py-1.5 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-bold transition-all shrink-0 cursor-pointer"
                  >
                    Elimina Scaffale
                  </button>
                </div>
              )}
            </div>
          )}

        </div>

        {/* Modal Footer */}
        <div className="px-5 py-3 border-t border-slate-800 flex items-center justify-between bg-slate-900/90 text-xs">
          <span className="text-[11px] text-slate-400">
            {config.rows}×{config.cols} vani ({totalShelfVolumeLiters} L)
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold transition-colors cursor-pointer"
          >
            Chiudi
          </button>
        </div>

      </div>
    </div>
  );
};

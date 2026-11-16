import React, { useState } from 'react';
import { KallaxConfig } from '../types/kallax';
import {
  X,
  Settings,
  Grid,
  Palette,
  Check,
  Save,
} from 'lucide-react';

interface KallaxConfigModalProps {
  config: KallaxConfig;
  onClose: () => void;
  onSave: (newConfig: KallaxConfig) => void;
}

const SHELF_PRESETS = [
  { name: '1 x 1 (1 vano cubo)', rows: 1, cols: 1 },
  { name: '1 x 2 (2 vani panca)', rows: 1, cols: 2 },
  { name: '2 x 1 (2 vani colonna)', rows: 2, cols: 1 },
  { name: '1 x 3 (3 vani orizzontale)', rows: 1, cols: 3 },
  { name: '3 x 1 (3 vani torre)', rows: 3, cols: 1 },
  { name: '1 x 4 (4 vani panca/parete)', rows: 1, cols: 4 },
  { name: '4 x 1 (4 vani torre)', rows: 4, cols: 1 },
  { name: '2 x 2 (4 vani classico)', rows: 2, cols: 2 },
  { name: '2 x 3 (6 vani medio)', rows: 2, cols: 3 },
  { name: '3 x 2 (6 vani verticale)', rows: 3, cols: 2 },
  { name: '2 x 4 (8 vani orizzontale)', rows: 2, cols: 4 },
  { name: '4 x 2 (8 vani verticale)', rows: 4, cols: 2 },
  { name: '3 x 3 (9 vani quadrato)', rows: 3, cols: 3 },
  { name: '3 x 4 (12 vani parete)', rows: 3, cols: 4 },
  { name: '4 x 4 (16 vani grande)', rows: 4, cols: 4 },
  { name: '5 x 5 (25 vani intera parete)', rows: 5, cols: 5 },
];

const SHELF_COLORS: { id: KallaxConfig['shelfColor']; name: string; bg: string; border: string }[] = [
  { id: 'black-brown', name: 'Marrone-Nero', bg: '#171717', border: '#262626' },
  { id: 'white', name: 'Bianco', bg: '#FFFFFF', border: '#FFFFFF' },
  { id: 'oak', name: 'Effetto Rovere', bg: '#78350F', border: '#92400E' },
  { id: 'grey', name: 'Grigio Antracite', bg: '#334155', border: '#475569' },
];

export const KallaxConfigModal: React.FC<KallaxConfigModalProps> = ({
  config,
  onClose,
  onSave,
}) => {
  const [rows, setRows] = useState(config.rows);
  const [cols, setCols] = useState(config.cols);
  const [shelfColor, setShelfColor] = useState<KallaxConfig['shelfColor']>(config.shelfColor);
  const [cubeWidth, setCubeWidth] = useState(config.cubeWidth);
  const [cubeHeight, setCubeHeight] = useState(config.cubeHeight);
  const [cubeDepth, setCubeDepth] = useState(config.cubeDepth);
  const [shelfName, setShelfName] = useState(config.name || 'Il Mio Kallax');

  const handleApplyPreset = (preset: typeof SHELF_PRESETS[0]) => {
    setRows(preset.rows);
    setCols(preset.cols);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      rows: Math.max(1, Math.min(8, rows)),
      cols: Math.max(1, Math.min(8, cols)),
      cubeWidth: Math.max(10, cubeWidth),
      cubeHeight: Math.max(10, cubeHeight),
      cubeDepth: Math.max(10, cubeDepth),
      shelfColor,
      name: shelfName.trim() || 'Il Mio Kallax',
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/80 sticky top-0 z-10">
          <div>
            <h2 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
              <Settings className="w-4 h-4 text-amber-400" />
              Configurazione Scaffale IKEA Kallax
            </h2>
            <p className="text-xs text-slate-400">
              Personalizza griglia vani, finitura e misure
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            aria-label="Chiudi finestra"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSave} className="p-5 overflow-y-auto flex-1 space-y-4">
          
          {/* Preset Buttons */}
          <div>
            <label className="text-xs font-semibold text-slate-300 block mb-1.5">
              Formati IKEA Kallax Predefiniti:
            </label>
            <div className="grid grid-cols-2 gap-1.5">
              {SHELF_PRESETS.map((p, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleApplyPreset(p)}
                  className={`p-2 rounded-lg border text-left text-xs transition-colors flex items-center justify-between ${
                    rows === p.rows && cols === p.cols
                      ? 'bg-amber-500/20 border-amber-500/60 text-amber-300 font-semibold'
                      : 'bg-slate-950 hover:bg-slate-800 border-slate-800 text-slate-300'
                  }`}
                >
                  <span>{p.name}</span>
                  {rows === p.rows && cols === p.cols && (
                    <Check className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Custom Grid Dimensions */}
          <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
            <span className="text-xs font-bold text-slate-200 block">
              Griglia Personalizzata Vani (Righe x Colonne):
            </span>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] text-slate-400 block mb-1">
                  Righe (Altezza scaffale)
                </label>
                <input
                  type="number"
                  min="1"
                  max="8"
                  value={rows}
                  onChange={(e) => setRows(parseInt(e.target.value, 10) || 1)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white font-mono focus:outline-none focus:border-amber-500"
                />
              </div>
              <div>
                <label className="text-[10px] text-slate-400 block mb-1">
                  Colonne (Larghezza scaffale)
                </label>
                <input
                  type="number"
                  min="1"
                  max="8"
                  value={cols}
                  onChange={(e) => setCols(parseInt(e.target.value, 10) || 1)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white font-mono focus:outline-none focus:border-amber-500"
                />
              </div>
            </div>
            <div className="text-[11px] text-slate-500 pt-1">
              Totale vani nello scaffale: <span className="text-amber-400 font-bold">{rows * cols} vani</span> (Capacità ~{(rows * cols * 43.8).toFixed(0)} Litri)
            </div>
          </div>

          {/* Color Finish */}
          <div>
            <label className="text-xs font-semibold text-slate-300 block mb-1.5 flex items-center gap-1.5">
              <Palette className="w-3.5 h-3.5 text-slate-400" /> Finitura Mobile IKEA:
            </label>
            <div className="grid grid-cols-2 gap-2">
              {SHELF_COLORS.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setShelfColor(c.id)}
                  className={`p-2.5 rounded-xl border flex items-center gap-2.5 transition-all ${
                    shelfColor === c.id
                      ? 'border-amber-400 ring-2 ring-amber-400/20 bg-slate-800'
                      : 'border-slate-800 bg-slate-950 hover:bg-slate-800/60'
                  }`}
                >
                  <div
                    className="w-5 h-5 rounded-md border shrink-0"
                    style={{ backgroundColor: c.bg, borderColor: c.border }}
                  />
                  <span className="text-xs font-medium text-slate-200 truncate">
                    {c.name}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Cube Internal Measurements */}
          <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
            <span className="text-xs font-bold text-slate-200 block">
              Misure Interne Singolo Vano (cm):
            </span>
            <div className="grid grid-cols-3 gap-2 font-mono">
              <div>
                <label className="text-[10px] text-slate-400 block mb-1">Larghezza</label>
                <input
                  type="number"
                  step="0.5"
                  value={cubeWidth}
                  onChange={(e) => setCubeWidth(parseFloat(e.target.value) || 33.5)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-xs text-white text-center"
                />
              </div>
              <div>
                <label className="text-[10px] text-slate-400 block mb-1">Altezza</label>
                <input
                  type="number"
                  step="0.5"
                  value={cubeHeight}
                  onChange={(e) => setCubeHeight(parseFloat(e.target.value) || 33.5)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-xs text-white text-center"
                />
              </div>
              <div>
                <label className="text-[10px] text-slate-400 block mb-1">Profondità</label>
                <input
                  type="number"
                  step="0.5"
                  value={cubeDepth}
                  onChange={(e) => setCubeDepth(parseFloat(e.target.value) || 39.0)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-xs text-white text-center"
                />
              </div>
            </div>
            <p className="text-[10px] text-slate-500">
              Standard ufficiale IKEA Kallax: 33.5 x 33.5 x 39.0 cm. Modifica solo se usi inserti divisori.
            </p>
          </div>

          {/* Footer Save */}
          <div className="pt-2 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white transition-colors"
            >
              Annulla
            </button>
            <button
              type="submit"
              className="px-5 py-2 text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-xl transition-colors flex items-center gap-1.5 shadow-sm"
            >
              <Save className="w-3.5 h-3.5" /> Salva Configurazione
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

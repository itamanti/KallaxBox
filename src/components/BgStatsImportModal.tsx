import React, { useState } from 'react';
import { GameBox } from '../types/kallax';
import { parseBgStatsExportDetails } from '../utils/kallaxMath';
import {
  X,
  Upload,
  FileText,
  Check,
  AlertCircle,
  Sparkles,
  Smartphone,
  Filter,
  ArrowUpDown,
} from 'lucide-react';

interface BgStatsImportModalProps {
  onClose: () => void;
  onImportGames: (games: GameBox[]) => void;
}

const DEMO_BG_STATS_JSON = JSON.stringify(
  {
    games: [
      { id: 201, name: 'Root', bggId: 237182, collectionStatus: 'Posseduto', isOwned: 1, width: 29.0, height: 22.5, depth: 5.5 },
      { id: 202, name: 'Spirit Island', bggId: 162886, collectionStatus: 'Posseduto', isOwned: 1, width: 29.6, height: 29.6, depth: 8.5 },
      { id: 203, name: 'Clank!', bggId: 201808, collectionStatus: 'Posseduto', width: 31.0, height: 31.0, depth: 8.0 },
      { id: 204, name: 'Viticulture Essential', bggId: 180263, collectionStatus: 'In collezione', width: 26.8, height: 21.6, depth: 5.2 },
      { id: 205, name: 'Concordia', bggId: 145940, status: 'Owned', isOwned: 1, width: 39.5, height: 28.0, depth: 5.0 },
      { id: 206, name: 'Heat: Pedal to the Metal', bggId: 366013, collectionStatus: 'Posseduto', width: 29.8, height: 29.8, depth: 7.5 },
      { id: 207, name: 'The Crew: Mission Deep Sea', bggId: 324856, collectionStatus: 'Posseduto', width: 12.3, height: 17.8, depth: 3.8 },
      { id: 208, name: 'Scout', bggId: 291453, collectionStatus: 'Posseduto', width: 11.0, height: 6.5, depth: 3.5 },
      { id: 209, name: 'Ark Nova (Wishlist)', bggId: 342942, collectionStatus: 'Wishlist', isWishlist: 1 },
      { id: 210, name: 'Gloomhaven (Ex Posseduto)', bggId: 174430, collectionStatus: 'Precedentemente posseduto', isPrevOwned: 1 },
      { id: 211, name: 'Agricola (Non posseduto)', bggId: 31260, collectionStatus: 'Non posseduto', isOwned: 0 },
    ],
  },
  null,
  2
);

export const BgStatsImportModal: React.FC<BgStatsImportModalProps> = ({
  onClose,
  onImportGames,
}) => {
  const [inputText, setInputText] = useState('');
  const [parsedPreview, setParsedPreview] = useState<GameBox[]>([]);
  const [totalFound, setTotalFound] = useState<number>(0);
  const [skippedCount, setSkippedCount] = useState<number>(0);
  const [detectedOwnedCount, setDetectedOwnedCount] = useState<number>(0);
  const [detectedTags, setDetectedTags] = useState<{ tag: string; count: number }[]>([]);
  const [detectedStatuses, setDetectedStatuses] = useState<{ status: string; count: number }[]>([]);
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [onlyOwned, setOnlyOwned] = useState<boolean>(true);
  const [invertFilter, setInvertFilter] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showTagInfo, setShowTagInfo] = useState<boolean>(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const handleProcessText = (
    text: string,
    filterOwned: boolean = onlyOwned,
    invert: boolean = invertFilter,
    activeTag: string | null = selectedTag
  ) => {
    setInputText(text);
    setErrorMessage(null);
    setIsSuccess(false);

    if (!text.trim()) {
      setParsedPreview([]);
      setTotalFound(0);
      setSkippedCount(0);
      setDetectedOwnedCount(0);
      setDetectedTags([]);
      setDetectedStatuses([]);
      return;
    }

    try {
      const result = parseBgStatsExportDetails(text, {
        onlyOwned: filterOwned,
        invertFilter: invert,
        selectedTag: activeTag || undefined,
      });

      setTotalFound(result.totalFound);
      setSkippedCount(result.skippedUnowned);
      setDetectedOwnedCount(result.detectedOwnedCount);
      setDetectedTags(result.allDetectedTags || []);
      setDetectedStatuses(result.allDetectedStatuses || []);

      if (result.games.length === 0) {
        if (result.totalFound > 0 && filterOwned) {
          setErrorMessage(
            `Nessun gioco corrisponde al filtro "${activeTag ? `Tag: ${activeTag}` : 'Posseduto'}". Trovati ${result.totalFound} giochi nel file, ma tutti esclusi dal filtro.`
          );
        } else {
          setErrorMessage(
            'Nessun gioco valido trovato nel testo fornito. Assicurati che sia un export JSON o CSV di BG Stats.'
          );
        }
        setParsedPreview([]);
      } else {
        setParsedPreview(result.games);
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Errore nella lettura del file BG Stats.');
      setParsedPreview([]);
      setTotalFound(0);
      setSkippedCount(0);
      setDetectedTags([]);
      setDetectedStatuses([]);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      handleProcessText(content, onlyOwned, invertFilter, selectedTag);
    };
    reader.readAsText(file);
  };

  const handleLoadDemo = () => {
    setSelectedTag(null);
    handleProcessText(DEMO_BG_STATS_JSON, onlyOwned, invertFilter, null);
  };

  const handleToggleOnlyOwned = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVal = e.target.checked;
    setOnlyOwned(newVal);
    if (inputText.trim()) {
      handleProcessText(inputText, newVal, invertFilter, selectedTag);
    }
  };

  const handleToggleInvert = () => {
    const newInvert = !invertFilter;
    setInvertFilter(newInvert);
    if (inputText.trim()) {
      handleProcessText(inputText, onlyOwned, newInvert, selectedTag);
    }
  };

  const handleSelectTag = (tag: string | null) => {
    setSelectedTag(tag);
    if (inputText.trim()) {
      handleProcessText(inputText, tag ? true : onlyOwned, invertFilter, tag);
    }
  };

  const handleImportAllWithoutFilter = () => {
    setOnlyOwned(false);
    setSelectedTag(null);
    setInvertFilter(false);
    if (inputText.trim()) {
      handleProcessText(inputText, false, false, null);
    }
  };

  const handleConfirmImport = () => {
    if (parsedPreview.length === 0) return;
    onImportGames(parsedPreview);
    setIsSuccess(true);
    setTimeout(() => {
      onClose();
    }, 800);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/80 sticky top-0 z-10">
          <div>
            <h2 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
              <Smartphone className="w-4 h-4 text-emerald-400" />
              Importa da BG Stats (Board Game Stats)
            </h2>
            <p className="text-xs text-slate-400">
              Importa i tuoi giochi esportati dall'app mobile BG Stats (.json o .csv)
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

        {/* Content */}
        <div className="p-5 overflow-y-auto flex-1 space-y-4">
          
          {/* Instructions and File Selector */}
          <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-200">
                Seleziona file di export BG Stats:
              </span>
              <button
                type="button"
                onClick={handleLoadDemo}
                className="text-xs text-amber-400 hover:text-amber-300 font-semibold flex items-center gap-1 hover:underline cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5" />
                Carica Demo BG Stats
              </button>
            </div>

            <label className="flex flex-col items-center justify-center border-2 border-dashed border-slate-700 hover:border-amber-500/80 rounded-xl p-4 cursor-pointer transition-colors bg-slate-900/50 group">
              <Upload className="w-6 h-6 text-slate-400 group-hover:text-amber-400 transition-colors mb-1.5" />
              <span className="text-xs text-slate-300 font-medium text-center">
                Trascina o clicca per caricare file <span className="font-mono text-amber-400">.json</span> o <span className="font-mono text-amber-400">.csv</span>
              </span>
              <span className="text-[10px] text-slate-500 mt-1">
                Generato da BG Stats &rarr; Impostazioni &rarr; Esporta Dati
              </span>
              <input
                type="file"
                accept=".json,.csv,.txt"
                onChange={handleFileUpload}
                className="hidden"
              />
            </label>
          </div>

          {/* Paste raw option */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5 text-slate-400" /> Oppure incolla contenuto JSON o CSV:
            </label>
            <textarea
              rows={3}
              value={inputText}
              onChange={(e) => handleProcessText(e.target.value, onlyOwned, invertFilter, selectedTag)}
              placeholder='{"games": [{"name": "Wingspan", "bggId": 266192, "isOwned": 1}]}'
              className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs font-mono text-slate-200 focus:outline-none focus:border-amber-500"
            />
          </div>

          {/* Ownership Filter Options & Tag Discovery */}
          <div className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800 space-y-2.5 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={onlyOwned}
                  onChange={handleToggleOnlyOwned}
                  className="w-4 h-4 rounded text-amber-500 bg-slate-900 border-slate-700 focus:ring-0 focus:ring-offset-0 cursor-pointer accent-amber-500"
                />
                <span className="text-slate-300 font-medium flex items-center gap-1.5">
                  <Filter className="w-3.5 h-3.5 text-amber-400" />
                  Filtro <span className="text-emerald-400 font-bold">"Posseduto" / In Collezione</span>
                </span>
              </label>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setShowTagInfo(!showTagInfo)}
                  className="px-2 py-0.5 text-[11px] text-slate-400 hover:text-amber-300 hover:underline cursor-pointer"
                >
                  {showTagInfo ? 'Nascondi tag supportati' : 'Quali tag riconosce?'}
                </button>

                <button
                  type="button"
                  onClick={handleToggleInvert}
                  className={`px-2 py-1 text-[11px] rounded-lg border font-medium flex items-center gap-1 transition-colors cursor-pointer ${
                    invertFilter
                      ? 'bg-amber-500/20 text-amber-300 border-amber-500/50'
                      : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-white hover:bg-slate-800'
                  }`}
                  title="Inverti la logica del filtro (se il file ha stati contrari)"
                >
                  <ArrowUpDown className="w-3 h-3 text-amber-400" />
                  {invertFilter ? 'Invertito' : 'Inverti'}
                </button>
              </div>
            </div>

            {/* Explanatory banner for recognized tags */}
            {showTagInfo && (
              <div className="p-3 rounded-lg bg-slate-900/90 border border-slate-800 space-y-2 text-[11px] text-slate-300">
                <div>
                  <strong className="text-emerald-400">Tag & stati riconosciuti come POSSEDUTI:</strong>
                  <p className="text-slate-400 mt-0.5">
                    <span className="text-emerald-300 font-mono font-semibold">statusOwned: true</span> (oppure 1, &quot;true&quot;, tag o colonna &quot;statusOwned&quot;).
                  </p>
                  <p className="text-slate-400 mt-0.5">
                    <span className="text-slate-200">Italiano:</span> posseduto, in possesso, in collezione, collezione, la mia collezione, i miei giochi, miei, mio, libreria, scaffale, kallax, acquistato, comprato, mia copia, a casa, presente, sì, true, 1.
                  </p>
                  <p className="text-slate-400 mt-0.5">
                    <span className="text-slate-200">Inglese:</span> owned, own, collection, my collection, shelf, yes, true.
                  </p>
                </div>
                <div>
                  <strong className="text-red-400">Tag & stati ESCLUSI (non posseduti):</strong>
                  <p className="text-slate-400 mt-0.5">
                    <span className="text-red-300 font-mono font-semibold">statusOwned: false</span>, statusWishlist, statusPrevOwned, wishlist, desideri, lista desideri, want, non posseduto, non in collezione, venduto, sold, scambiato, in prestito, da provare, no, false, 0.
                  </p>
                </div>
                <div className="pt-1.5 border-t border-slate-800 text-[10.5px] text-amber-300/90 flex items-start gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                  <span>
                    <strong>Ricerca dimensioni in rete:</strong> se le dimensioni della scatola non sono presenti su BGG, il sistema le cerca automaticamente online per assegnare le misure reali allo scaffale.
                  </span>
                </div>
              </div>
            )}

            {/* Detected tags in uploaded file */}
            {detectedTags.length > 0 && (
              <div className="space-y-1.5 pt-1 border-t border-slate-900">
                <span className="text-[11px] text-slate-400 font-semibold block">
                  Tag trovati nel tuo file ({detectedTags.length}):
                </span>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => handleSelectTag(null)}
                    className={`px-2 py-0.5 rounded-md text-[11px] font-medium transition-colors cursor-pointer ${
                      selectedTag === null
                        ? 'bg-amber-500 text-slate-950 font-bold'
                        : 'bg-slate-900 text-slate-300 border border-slate-800 hover:bg-slate-800'
                    }`}
                  >
                    Tutti i giochi ({totalFound})
                  </button>
                  {detectedTags.map((dt) => (
                    <button
                      key={dt.tag}
                      type="button"
                      onClick={() => handleSelectTag(dt.tag)}
                      className={`px-2 py-0.5 rounded-md text-[11px] font-medium transition-colors flex items-center gap-1 cursor-pointer ${
                        selectedTag === dt.tag
                          ? 'bg-emerald-500 text-slate-950 font-bold'
                          : 'bg-slate-900 text-slate-300 border border-slate-800 hover:border-emerald-500/50 hover:text-white'
                      }`}
                    >
                      <span>{dt.tag}</span>
                      <span className="text-[10px] opacity-75">({dt.count})</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Zero match helper callout */}
            {parsedPreview.length === 0 && totalFound > 0 && (
              <div className="p-3 rounded-xl bg-amber-950/40 border border-amber-600/40 text-amber-200 text-xs space-y-2 mt-2">
                <p className="font-semibold flex items-center gap-1.5">
                  <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
                  Trovati {totalFound} giochi nel file, ma nessuno con stato "Posseduto" esplicito.
                </p>
                <p className="text-[11px] text-slate-300 leading-relaxed">
                  I tuoi giochi potrebbero non avere la sincronizzazione della collezione BGG attiva o usare tag personalizzati. Puoi importarli tutti subito con un solo click:
                </p>
                <div className="flex items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={handleImportAllWithoutFilter}
                    className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-lg transition-colors cursor-pointer shadow flex items-center gap-1.5 active:scale-95"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>Importa tutti i {totalFound} giochi</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Error Message */}
          {errorMessage && parsedPreview.length === 0 && totalFound === 0 && (
            <div className="p-3 rounded-xl bg-red-950/60 border border-red-500/30 text-red-300 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Parsed Preview */}
          {parsedPreview.length > 0 && (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-1 text-xs">
                <span className="font-semibold text-emerald-400 flex items-center gap-1.5">
                  <Check className="w-3.5 h-3.5" />
                  {parsedPreview.length} {parsedPreview.length === 1 ? 'gioco pronto' : 'giochi pronti'} per l'importazione
                </span>
                {skippedCount > 0 && (
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] text-amber-400 font-medium bg-amber-950/50 border border-amber-800/40 px-2 py-0.5 rounded-full">
                      {skippedCount} esclusi ({invertFilter ? 'posseduti' : 'non posseduti / wishlist'})
                    </span>
                    <button
                      type="button"
                      onClick={handleImportAllWithoutFilter}
                      className="text-[11px] text-amber-400 hover:text-amber-300 underline font-medium cursor-pointer"
                    >
                      Importa tutti ({totalFound})
                    </button>
                  </div>
                )}
              </div>

              <div className="max-h-44 overflow-y-auto space-y-1.5 rounded-xl border border-slate-800 bg-slate-950 p-2 text-xs font-mono">
                {parsedPreview.map((game, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between px-2.5 py-1.5 rounded bg-slate-900/70 border border-slate-800/60 text-slate-300 hover:bg-slate-800/50 transition-colors"
                  >
                    <div className="flex items-center gap-2 truncate">
                      <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0"></span>
                      <span className="truncate font-sans font-medium text-slate-200">{game.name}</span>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0 ml-2">
                      <span className="text-[11px] text-slate-400 bg-slate-800/80 px-1.5 py-0.5 rounded border border-slate-700/50">
                        {game.width} × {game.height} × {game.depth} cm
                      </span>
                      <span className="text-[9px] text-amber-300 font-semibold bg-slate-800 px-1.5 py-0.5 rounded border border-slate-700/50">
                        da {game.dimensionSource || (game.bggId ? 'BGG' : 'Catalogo')}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800 flex items-center justify-between bg-slate-900/90">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white transition-colors cursor-pointer"
          >
            Annulla
          </button>
          <button
            disabled={parsedPreview.length === 0}
            onClick={handleConfirmImport}
            className="px-5 py-2 text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-xl disabled:opacity-40 transition-colors flex items-center gap-1.5 shadow-sm cursor-pointer active:scale-95"
          >
            {isSuccess ? (
              <>
                <Check className="w-3.5 h-3.5" /> Importati!
              </>
            ) : (
              <>
                <Upload className="w-3.5 h-3.5" /> Importa {parsedPreview.length > 0 ? `(${parsedPreview.length})` : ''}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

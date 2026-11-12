import React, { useState } from 'react';
import { GameBox } from '../types/kallax';
import { generateBoxColor } from '../utils/kallaxMath';
import {
  lookupBoardGameInfo,
  parseDimensionsFromText,
  parseBggEditionText,
} from '../data/boardGameDatabase';
import {
  X,
  Save,
  Trash2,
  Sliders,
  Check,
  AlertTriangle,
  ExternalLink,
  RefreshCw,
  Star,
  Zap,
  Users,
  Clock,
  Calendar,
  Sparkles,
  Info,
  Image as ImageIcon,
  CheckCircle2,
  FileText,
  ClipboardPaste,
} from 'lucide-react';

interface BoxEditModalProps {
  game: GameBox | null; // null for creating new manual box
  onClose: () => void;
  onSave: (game: GameBox) => void;
  onDelete?: (gameId: string) => void;
}

const PRESET_SIZES = [
  { name: 'Standard Quadrato (Ticket to Ride)', width: 29.7, height: 29.7, depth: 7.2 },
  { name: 'Rettangolare Medio (Catan / Carcassonne)', width: 29.6, height: 24.1, depth: 7.6 },
  { name: 'Tascabile / Travel (Alpaca / GateOnGames)', width: 12.0, height: 9.0, depth: 3.0 },
  { name: 'Scatola Piccola (Splendor / 7 Wonders Duel)', width: 21.5, height: 27.5, depth: 6.5 },
  { name: 'Grande Formato (Scythe / Ark Nova)', width: 36.5, height: 30.0, depth: 9.9 },
  { name: 'Gioco di Carte (The Crew / Scout)', width: 12.3, height: 17.8, depth: 4.0 },
  { name: 'Big Box / Colosso (Gloomhaven)', width: 30.0, height: 41.2, depth: 19.1 },
];

const COLOR_OPTIONS = [
  '#3B82F6', // Blue
  '#06B6D4', // Cyan
  '#10B981', // Emerald
  '#F59E0B', // Amber
  '#F97316', // Orange
  '#EF4444', // Red
  '#8B5CF6', // Purple
  '#EC4899', // Pink
  '#64748B', // Slate
  '#84CC16', // Lime
];

export const BoxEditModal: React.FC<BoxEditModalProps> = ({
  game,
  onClose,
  onSave,
  onDelete,
}) => {
  const isEditing = !!game;

  const [activeTab, setActiveTab] = useState<'sheet' | 'dimensions' | 'notes'>('sheet');
  const [name, setName] = useState(game?.name || '');
  const [bggId, setBggId] = useState<string>(game?.bggId ? String(game.bggId) : '');
  const [thumbnail, setThumbnail] = useState(game?.thumbnail || '');
  const [image, setImage] = useState(game?.image || '');
  const [width, setWidth] = useState<number>(game?.width || 29.7);
  const [height, setHeight] = useState<number>(game?.height || 29.7);
  const [depth, setDepth] = useState<number>(game?.depth || 7.2);
  const [color, setColor] = useState<string>(game?.color || (game ? generateBoxColor(game.name) : '#3B82F6'));
  const [year, setYear] = useState<string>(game?.year ? String(game.year) : '');
  const [players, setPlayers] = useState(game?.players || '1-4');
  const [playtime, setPlaytime] = useState<string>(game?.playtime ? String(game.playtime) : '60');
  const [minAge, setMinAge] = useState<string>(game?.minAge ? String(game.minAge) : '10');
  const [rating, setRating] = useState<string>(game?.rating !== undefined ? String(game.rating) : '7.5');
  const [weight, setWeight] = useState<string>(game?.weight !== undefined ? String(game.weight) : '2.5');
  const [description, setDescription] = useState(game?.description || '');
  const [notes, setNotes] = useState(game?.notes || '');
  const [dimensionSource, setDimensionSource] = useState<string>(
    game?.dimensionSource || (game?.bggId ? 'BGG' : 'Manuale')
  );

  // BGG live fetch status
  const [isFetchingBgg, setIsFetchingBgg] = useState(false);
  const [bggSyncMessage, setBggSyncMessage] = useState<{ text: string; success: boolean } | null>(null);

  // Quick BGG snippet paste tool
  const [showPasteTool, setShowPasteTool] = useState(false);
  const [pasteSnippet, setPasteSnippet] = useState('');

  const boxVolumeCm3 = width * height * depth;
  const boxVolumeLiters = Math.round((boxVolumeCm3 / 1000) * 10) / 10;

  // Check if box fits inside standard Kallax cube (33.5 x 33.5 x 39 cm) in at least one orientation
  const canFitInKallax =
    (width <= 33.5 && height <= 33.5 && depth <= 39.0) ||
    (width <= 33.5 && depth <= 33.5 && height <= 39.0) ||
    (height <= 33.5 && depth <= 33.5 && width <= 39.0);

  // Apply parsed BGG snippet text (e.g. from clipboard or paste tool)
  const handleApplyPasteSnippet = (raw: string) => {
    setPasteSnippet(raw);
    if (!raw.trim()) return;

    const parsedEdition = parseBggEditionText(raw);
    if (parsedEdition) {
      if (parsedEdition.title) setName(parsedEdition.title);
      if (parsedEdition.year) setYear(String(parsedEdition.year));
      if (parsedEdition.dimensions) {
        setWidth(parsedEdition.dimensions.width);
        setHeight(parsedEdition.dimensions.height);
        setDepth(parsedEdition.dimensions.depth);
      } else {
        const info = lookupBoardGameInfo({ name: parsedEdition.title });
        setWidth(info.width);
        setHeight(info.height);
        setDepth(info.depth);
      }
      if (parsedEdition.publisher) {
        setNotes((prev) => (prev ? `${prev} | Editore: ${parsedEdition.publisher}` : `Editore: ${parsedEdition.publisher}`));
      }
      setDimensionSource('Note BGG');
      const finalDims = parsedEdition.dimensions || lookupBoardGameInfo({ name: parsedEdition.title });
      setBggSyncMessage({
        text: `Misure reali e dati versione estratti con successo (${finalDims.width} × ${finalDims.height} × ${finalDims.depth} cm)!`,
        success: true,
      });
      setShowPasteTool(false);
      setPasteSnippet('');
      return;
    }

    const dimsOnly = parseDimensionsFromText(raw);
    if (dimsOnly) {
      setWidth(dimsOnly.width);
      setHeight(dimsOnly.height);
      setDepth(dimsOnly.depth);
      setDimensionSource('Note BGG');
      setBggSyncMessage({
        text: `Misure reali estratte con successo: ${dimsOnly.width} × ${dimsOnly.height} × ${dimsOnly.depth} cm!`,
        success: true,
      });
      setShowPasteTool(false);
      setPasteSnippet('');
    }
  };

  const handleNameInputChange = (val: string) => {
    if (val.includes('Size:') || val.includes('\n') || val.includes('inches') || val.match(/\d+\.?\d*\s*[x×]\s*\d+\.?\d*\s*[x×]\s*\d+\.?\d*/i)) {
      handleApplyPasteSnippet(val);
      return;
    }
    setName(val);
    const info = lookupBoardGameInfo({ name: val.trim() });
    if (info.found) {
      setWidth(info.width);
      setHeight(info.height);
      setDepth(info.depth);
      if (info.year && !year) setYear(String(info.year));
      if (info.thumbnail && !thumbnail) setThumbnail(info.thumbnail);
    }
  };

  // Fetch or refresh data and real dimensions from BGG / verified database
  const handleFetchFromBgg = async () => {
    setIsFetchingBgg(true);
    setBggSyncMessage(null);

    // 0. Check if current name or notes has embedded edition text (e.g. "Size: 4.72 x 3.54 x 1.18 inches or 12.0 x 9.0 x 3.0 cm")
    const editionFromText = parseBggEditionText(name) || parseBggEditionText(notes);
    if (editionFromText && editionFromText.dimensions) {
      if (editionFromText.title && editionFromText.title !== name) {
        setName(editionFromText.title);
      }
      if (editionFromText.year) setYear(String(editionFromText.year));
      setWidth(editionFromText.dimensions.width);
      setHeight(editionFromText.dimensions.height);
      setDepth(editionFromText.dimensions.depth);
      if (editionFromText.publisher) {
        setNotes((prev) => (prev ? `${prev} | Editore: ${editionFromText.publisher}` : `Editore: ${editionFromText.publisher}`));
      }
      setBggSyncMessage({
        text: `Dimensioni reali rilevate dalla scheda BGG (${editionFromText.dimensions.width} × ${editionFromText.dimensions.height} × ${editionFromText.dimensions.depth} cm)!`,
        success: true,
      });
      setIsFetchingBgg(false);
      return;
    }

    const parsedBggId = bggId && parseInt(bggId, 10) > 0 ? parseInt(bggId, 10) : undefined;
    const trimmedName = name.trim();

    if (!parsedBggId && !trimmedName) {
      setBggSyncMessage({ text: 'Inserisci un titolo o un BGG ID per recuperare i dati.', success: false });
      setIsFetchingBgg(false);
      return;
    }

    try {
      // 1. Try local verified dimension database first for instant and reliable recovery
      const localInfo = lookupBoardGameInfo({ bggId: parsedBggId, name: trimmedName });
      if (localInfo.found || localInfo.width !== 29.7) {
        if (!trimmedName && localInfo.name) setName(localInfo.name);
        if (localInfo.bggId) setBggId(String(localInfo.bggId));
        setWidth(localInfo.width);
        setHeight(localInfo.height);
        setDepth(localInfo.depth);
        if (localInfo.thumbnail) setThumbnail(localInfo.thumbnail);
        if (localInfo.image) setImage(localInfo.image);
        if (localInfo.year) setYear(String(localInfo.year));
        if (localInfo.minPlayers && localInfo.maxPlayers) {
          setPlayers(
            localInfo.minPlayers === localInfo.maxPlayers
              ? `${localInfo.minPlayers}`
              : `${localInfo.minPlayers}-${localInfo.maxPlayers}`
          );
        }
        if (localInfo.playingTime) setPlaytime(String(localInfo.playingTime));
        if (localInfo.minAge) setMinAge(String(localInfo.minAge));
        if (localInfo.rating !== undefined) setRating(String(localInfo.rating));
        if (localInfo.weight !== undefined) setWeight(String(localInfo.weight));
        if (localInfo.description) setDescription(localInfo.description);

        setBggSyncMessage({
          text: `Dimensioni reali e scheda BGG sincronizzate con successo (${localInfo.width} × ${localInfo.height} × ${localInfo.depth} cm)!`,
          success: true,
        });
        setIsFetchingBgg(false);
        return;
      }

      // 2. Query backend API endpoint
      let url = '';
      if (parsedBggId) {
        url = trimmedName
          ? `/api/bgg/game/${parsedBggId}?name=${encodeURIComponent(trimmedName)}`
          : `/api/bgg/game/${parsedBggId}`;
      } else {
        url = `/api/bgg/lookup-by-name?name=${encodeURIComponent(trimmedName)}`;
      }

      const res = await fetch(url);
      if (!res.ok) {
        throw new Error('Impossibile recuperare i dati da BGG');
      }

      const data = await res.json();

      if (data.name && !trimmedName) setName(data.name);
      if (data.bggId) setBggId(String(data.bggId));
      if (data.width) setWidth(data.width);
      if (data.height) setHeight(data.height);
      if (data.depth) setDepth(data.depth);
      if (data.thumbnail) setThumbnail(data.thumbnail);
      if (data.image) setImage(data.image);
      if (data.year) setYear(String(data.year));
      if (data.minPlayers || data.maxPlayers) {
        setPlayers(data.minPlayers === data.maxPlayers ? `${data.minPlayers}` : `${data.minPlayers}-${data.maxPlayers}`);
      }
      if (data.playingTime) setPlaytime(String(data.playingTime));
      if (data.minAge) setMinAge(String(data.minAge));
      if (data.rating !== undefined) setRating(String(data.rating));
      if (data.weight !== undefined) setWeight(String(data.weight));
      if (data.description) setDescription(data.description);

      const isFromWeb = data.description?.includes('trovate in rete');
      setDimensionSource(data.dimensionSource || (isFromWeb ? 'Ricerca Web' : 'BGG'));
      setBggSyncMessage({
        text: isFromWeb
          ? `Dimensioni reali della scatola cercate e trovate in rete (${data.width} × ${data.height} × ${data.depth} cm)!`
          : `Dimensioni reali e scheda BGG sincronizzate con successo (${data.width} × ${data.height} × ${data.depth} cm)!`,
        success: true,
      });
    } catch (err: any) {
      setBggSyncMessage({ text: err.message || 'Errore durante il recupero da BGG.', success: false });
    } finally {
      setIsFetchingBgg(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    const savedGame: GameBox = {
      id: game?.id || `manual-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      name: name.trim(),
      bggId: bggId && parseInt(bggId, 10) > 0 ? parseInt(bggId, 10) : undefined,
      width: Math.max(1, !isNaN(Number(width)) && Number(width) > 0 ? Math.round(Number(width) * 10) / 10 : 29.7),
      height: Math.max(1, !isNaN(Number(height)) && Number(height) > 0 ? Math.round(Number(height) * 10) / 10 : 29.7),
      depth: Math.max(1, !isNaN(Number(depth)) && Number(depth) > 0 ? Math.round(Number(depth) * 10) / 10 : 7.2),
      dimensionSource: dimensionSource.trim() || undefined,
      thumbnail: thumbnail.trim() || undefined,
      image: image.trim() || undefined,
      color,
      year: year && parseInt(year, 10) > 0 ? parseInt(year, 10) : undefined,
      players: players.trim() || undefined,
      playtime: playtime && parseInt(playtime, 10) > 0 ? parseInt(playtime, 10) : undefined,
      minAge: minAge && parseInt(minAge, 10) > 0 ? parseInt(minAge, 10) : undefined,
      rating: rating && !isNaN(parseFloat(rating)) ? Math.round(parseFloat(rating) * 10) / 10 : undefined,
      weight: weight && !isNaN(parseFloat(weight)) ? Math.round(parseFloat(weight) * 10) / 10 : undefined,
      description: description.trim() || undefined,
      notes: notes.trim() || undefined,
    };

    onSave(savedGame);
  };

  const applyPreset = (preset: typeof PRESET_SIZES[0]) => {
    setWidth(preset.width);
    setHeight(preset.height);
    setDepth(preset.depth);
    setDimensionSource('Preset Kallax');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        
        {/* Header with Game Visual & BGG Sync Action */}
        <div className="px-5 py-4 border-b border-slate-800 bg-slate-950/80 flex items-center justify-between gap-3 sticky top-0 z-20">
          <div className="flex items-center gap-3 min-w-0">
            {thumbnail ? (
              <img
                src={thumbnail}
                alt={name}
                className="w-12 h-12 rounded-xl object-cover bg-slate-800 border border-slate-700 shrink-0 shadow-md"
                onError={(e) => {
                  (e.target as HTMLElement).style.display = 'none';
                }}
              />
            ) : (
              <div
                className="w-12 h-12 rounded-xl flex items-center justify-center text-white font-bold text-base shrink-0 shadow-md border border-white/20"
                style={{ backgroundColor: color }}
              >
                {name.charAt(0).toUpperCase() || 'G'}
              </div>
            )}
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-white tracking-tight truncate">
                  {name || (isEditing ? 'Scheda Gioco' : 'Nuovo Gioco')}
                </h2>
                {bggId && (
                  <a
                    href={`https://boardgamegeek.com/boardgame/${bggId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 text-[10px] font-bold border border-amber-500/40 transition-colors shrink-0"
                    title="Vedi su BoardGameGeek"
                  >
                    <span>BGG #{bggId}</span>
                    <ExternalLink className="w-2.5 h-2.5" />
                  </a>
                )}
              </div>
              <p className="text-xs text-slate-400 flex items-center gap-2 mt-0.5 flex-wrap">
                <span className="font-mono text-amber-400 font-semibold">{width} × {height} × {depth} cm</span>
                <span className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-slate-800 text-slate-300 border border-slate-700/60 inline-flex items-center gap-1">
                  <span className="text-slate-400 font-normal">da</span>
                  <span className="text-amber-300 font-semibold">{dimensionSource || (bggId ? 'BGG' : 'Manuale')}</span>
                </span>
                <span>·</span>
                <span>{boxVolumeLiters} L</span>
                {year && <span>· Anno {year}</span>}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* Quick Paste BGG Version Snippet Button */}
            <button
              type="button"
              onClick={() => setShowPasteTool((prev) => !prev)}
              className={`px-3 py-1.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer active:scale-95 ${
                showPasteTool
                  ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-md'
                  : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-200'
              }`}
              title="Incolla scheda versione o testo dimensioni BGG (es. 'Size: 12.0 x 9.0 x 3.0 cm' o '4.72 x 3.54 x 1.18 inches')"
            >
              <ClipboardPaste className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Incolla Misure BGG</span>
            </button>

            {/* Quick BGG Live Fetch Button */}
            <button
              type="button"
              onClick={handleFetchFromBgg}
              disabled={isFetchingBgg}
              className="px-3 py-1.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-300 hover:text-amber-200 text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer active:scale-95 disabled:opacity-50"
              title="Recupera o aggiorna scheda completa e dimensioni della scatola direttamente da BGG"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isFetchingBgg ? 'animate-spin text-amber-400' : ''}`} />
              <span className="hidden sm:inline">Recupera da BGG</span>
            </button>

            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              aria-label="Chiudi finestra"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Paste BGG Version Snippet Panel */}
        {showPasteTool && (
          <div className="px-5 py-3.5 bg-amber-950/40 border-b border-amber-500/30 text-xs animate-in fade-in duration-150">
            <div className="flex items-center justify-between mb-1.5">
              <span className="font-bold text-amber-300 flex items-center gap-1.5">
                <ClipboardPaste className="w-4 h-4 text-amber-400" />
                Incolla scheda versione o dimensioni BGG (es. Alpaca Travel / GateOnGames)
              </span>
              <button
                type="button"
                onClick={() => setShowPasteTool(false)}
                className="text-slate-400 hover:text-white text-[11px]"
              >
                Chiudi
              </button>
            </div>
            <p className="text-[11px] text-slate-300 mb-2">
              Copia e incolla direttamente il testo dalla scheda versione su BGG (es. <code className="bg-slate-900 px-1 py-0.5 rounded text-amber-200 font-mono">Size: 4.72 x 3.54 x 1.18 inches or 12.0 x 9.0 x 3.0 cm</code> o l&apos;intero blocco con Editore e Anno). Le dimensioni reali in cm vengono estratte all&apos;istante.
            </p>
            <div className="flex flex-col sm:flex-row gap-2">
              <textarea
                value={pasteSnippet}
                onChange={(e) => setPasteSnippet(e.target.value)}
                placeholder="Incolla qui (es: Alpaca: Travel ‐ English edition (2025)&#10;Publisher: GateOnGames&#10;Size: 4.72 x 3.54 x 1.18 inches or 12.0 x 9.0 x 3.0 cm)"
                rows={3}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-mono placeholder-slate-500 focus:outline-none focus:border-amber-400"
              />
              <button
                type="button"
                onClick={() => handleApplyPasteSnippet(pasteSnippet)}
                disabled={!pasteSnippet.trim()}
                className="sm:w-36 shrink-0 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold px-3 py-2 rounded-xl transition-all cursor-pointer disabled:opacity-50 flex items-center justify-center gap-1.5 shadow-sm active:scale-95"
              >
                <Check className="w-4 h-4" />
                <span>Estrai Misure</span>
              </button>
            </div>
          </div>
        )}

        {/* Sync notification message */}
        {bggSyncMessage && (
          <div
            className={`px-5 py-2 text-xs flex items-center gap-2 border-b ${
              bggSyncMessage.success
                ? 'bg-emerald-950/60 text-emerald-300 border-emerald-900/60'
                : 'bg-red-950/60 text-red-300 border-red-900/60'
            }`}
          >
            {bggSyncMessage.success ? (
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
            ) : (
              <AlertTriangle className="w-4 h-4 shrink-0 text-red-400" />
            )}
            <span>{bggSyncMessage.text}</span>
          </div>
        )}

        {/* Navigation Tabs */}
        <div className="px-5 pt-3 border-b border-slate-800 bg-slate-900 flex items-center gap-4 text-xs font-semibold">
          <button
            type="button"
            onClick={() => setActiveTab('sheet')}
            className={`pb-2.5 border-b-2 flex items-center gap-1.5 transition-colors cursor-pointer ${
              activeTab === 'sheet'
                ? 'border-amber-400 text-amber-300 font-bold'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            <span>Scheda BGG & Informazioni</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('dimensions')}
            className={`pb-2.5 border-b-2 flex items-center gap-1.5 transition-colors cursor-pointer ${
              activeTab === 'dimensions'
                ? 'border-amber-400 text-amber-300 font-bold'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Sliders className="w-3.5 h-3.5 text-blue-400" />
            <span>Dimensioni Scatola Kallax</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('notes')}
            className={`pb-2.5 border-b-2 flex items-center gap-1.5 transition-colors cursor-pointer ${
              activeTab === 'notes'
                ? 'border-amber-400 text-amber-300 font-bold'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Info className="w-3.5 h-3.5 text-emerald-400" />
            <span>Sinossi & Note Personali</span>
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 overflow-y-auto flex-1 space-y-4">
          
          {/* TAB 1: SCHEDA BGG & INFORMAZIONI */}
          {activeTab === 'sheet' && (
            <div className="space-y-4 animate-in fade-in duration-150">
              {/* Primary Identity */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2">
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-semibold text-slate-300">
                      Titolo del Gioco *
                    </label>
                    <button
                      type="button"
                      onClick={() => setShowPasteTool((prev) => !prev)}
                      className="text-[11px] text-amber-400 hover:text-amber-300 font-medium flex items-center gap-1 cursor-pointer transition-colors"
                    >
                      <ClipboardPaste className="w-3 h-3" />
                      <span>Incolla scheda / misure BGG</span>
                    </button>
                  </div>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => handleNameInputChange(e.target.value)}
                    placeholder="Es. Wingspan, Alpaca: Travel, Catan..."
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500 font-semibold"
                  />
                  <p className="text-[10px] text-slate-500 mt-1">
                    Puoi incollare anche la riga dimensioni BGG (es. <span className="font-mono text-slate-400">&quot;Size: 12.0 x 9.0 x 3.0 cm&quot;</span> o pollici) per impostarle in automatico.
                  </p>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">
                    ID BoardGameGeek (BGG)
                  </label>
                  <input
                    type="number"
                    value={bggId}
                    onChange={(e) => setBggId(e.target.value)}
                    placeholder="Es. 266192"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              {/* BGG Stats Cards (Ratings, Weight, Players, Time, Age) */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                {/* Rating */}
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex flex-col gap-1">
                  <div className="flex items-center gap-1.5 text-[11px] font-semibold text-amber-400">
                    <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                    <span>Voto BGG</span>
                  </div>
                  <input
                    type="number"
                    step="0.1"
                    min="1"
                    max="10"
                    value={rating}
                    onChange={(e) => setRating(e.target.value)}
                    placeholder="8.0"
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2 py-1 text-xs text-white font-mono font-bold focus:outline-none focus:border-amber-500"
                  />
                  <span className="text-[10px] text-slate-500">Scala 1 - 10</span>
                </div>

                {/* Weight / Complexity */}
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex flex-col gap-1">
                  <div className="flex items-center gap-1.5 text-[11px] font-semibold text-purple-400">
                    <Zap className="w-3.5 h-3.5 text-purple-400" />
                    <span>Complessità</span>
                  </div>
                  <input
                    type="number"
                    step="0.1"
                    min="1"
                    max="5"
                    value={weight}
                    onChange={(e) => setWeight(e.target.value)}
                    placeholder="2.5"
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2 py-1 text-xs text-white font-mono font-bold focus:outline-none focus:border-purple-500"
                  />
                  <span className="text-[10px] text-slate-500">Peso BGG 1.0 - 5.0</span>
                </div>

                {/* Players */}
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex flex-col gap-1">
                  <div className="flex items-center gap-1.5 text-[11px] font-semibold text-emerald-400">
                    <Users className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Giocatori</span>
                  </div>
                  <input
                    type="text"
                    value={players}
                    onChange={(e) => setPlayers(e.target.value)}
                    placeholder="1-4"
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2 py-1 text-xs text-white font-bold focus:outline-none focus:border-emerald-500"
                  />
                  <span className="text-[10px] text-slate-500">Es. 1-4, 2-5</span>
                </div>

                {/* Playtime */}
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex flex-col gap-1">
                  <div className="flex items-center gap-1.5 text-[11px] font-semibold text-blue-400">
                    <Clock className="w-3.5 h-3.5 text-blue-400" />
                    <span>Durata (min)</span>
                  </div>
                  <input
                    type="number"
                    value={playtime}
                    onChange={(e) => setPlaytime(e.target.value)}
                    placeholder="60"
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2 py-1 text-xs text-white font-mono font-bold focus:outline-none focus:border-blue-500"
                  />
                  <span className="text-[10px] text-slate-500">Minuti partita</span>
                </div>
              </div>

              {/* Year & Min Age & Cover URL */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">
                    Anno di Uscita
                  </label>
                  <div className="relative">
                    <Calendar className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="number"
                      value={year}
                      onChange={(e) => setYear(e.target.value)}
                      placeholder="2020"
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-8 pr-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-amber-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">
                    Età Minima Consigliata
                  </label>
                  <input
                    type="number"
                    value={minAge}
                    onChange={(e) => setMinAge(e.target.value)}
                    placeholder="10"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">
                    URL Copertina / Thumbnail
                  </label>
                  <div className="relative">
                    <ImageIcon className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="url"
                      value={thumbnail}
                      onChange={(e) => setThumbnail(e.target.value)}
                      placeholder="https://..."
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-8 pr-3 py-2 text-xs text-white font-mono truncate focus:outline-none focus:border-amber-500"
                    />
                  </div>
                </div>
              </div>

              {/* Quick Box Dimensions Summary */}
              <div className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800 flex items-center justify-between gap-3">
                <div>
                  <span className="text-[11px] font-semibold text-slate-400 block">
                    Dimensioni Scatola associate su BGG:
                  </span>
                  <div className="text-sm font-bold text-white font-mono mt-0.5">
                    {width} × {height} × {depth} cm{' '}
                    <span className="text-xs font-normal text-amber-400">({boxVolumeLiters} L)</span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTab('dimensions')}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  <Sliders className="w-3.5 h-3.5 text-blue-400" />
                  <span>Modifica misure</span>
                </button>
              </div>
            </div>
          )}

          {/* TAB 2: DIMENSIONI SCATOLA KALLAX */}
          {activeTab === 'dimensions' && (
            <div className="space-y-4 animate-in fade-in duration-150">
              
              {/* Presets */}
              <div>
                <span className="text-[11px] font-semibold text-slate-400 block mb-1.5">
                  Preset Dimensioni Standard da Tavolo:
                </span>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                  {PRESET_SIZES.map((preset, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => applyPreset(preset)}
                      className="p-2 rounded-lg bg-slate-950 hover:bg-slate-800 border border-slate-800 text-left transition-colors text-[11px] cursor-pointer"
                    >
                      <div className="font-semibold text-slate-300 truncate">{preset.name}</div>
                      <div className="text-[10px] text-amber-400 font-mono mt-0.5">
                        {preset.width} × {preset.height} × {preset.depth} cm
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Exact Dimensions Inputs */}
              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3.5">
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-200">
                      Misure Fisiche della Scatola (cm)
                    </span>
                    <span className="px-2 py-0.5 rounded bg-blue-500/20 text-blue-300 text-[10px] font-semibold border border-blue-500/30">
                      Recuperate da BGG
                    </span>
                  </div>
                  <span className="font-mono text-amber-400 text-xs font-bold">
                    {boxVolumeLiters} Litri ({Math.round(boxVolumeCm3)} cm³)
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-3 font-mono">
                  <div>
                    <label className="text-[10px] text-slate-400 block mb-1 uppercase tracking-wider font-semibold">
                      Larghezza (cm)
                    </label>
                    <input
                      type="number"
                      step="0.1"
                      min="1"
                      max="100"
                      required
                      value={width}
                      onChange={(e) => setWidth(parseFloat(e.target.value) || 0)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500 font-bold"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] text-slate-400 block mb-1 uppercase tracking-wider font-semibold">
                      Altezza (cm)
                    </label>
                    <input
                      type="number"
                      step="0.1"
                      min="1"
                      max="100"
                      required
                      value={height}
                      onChange={(e) => setHeight(parseFloat(e.target.value) || 0)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500 font-bold"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] text-slate-400 block mb-1 uppercase tracking-wider font-semibold">
                      Spessore / Profondità (cm)
                    </label>
                    <input
                      type="number"
                      step="0.1"
                      min="1"
                      max="100"
                      required
                      value={depth}
                      onChange={(e) => setDepth(parseFloat(e.target.value) || 0)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500 font-bold"
                    />
                  </div>
                </div>

                {/* Dimension Source Info */}
                <div className="flex items-center justify-between text-xs text-slate-300 bg-slate-900/80 p-3 rounded-xl border border-slate-800">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-slate-400">Fonte delle misure:</span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-800 text-amber-300 border border-slate-700">
                      da {dimensionSource || 'Manuale'}
                    </span>
                  </div>
                  <input
                    type="text"
                    value={dimensionSource}
                    onChange={(e) => setDimensionSource(e.target.value)}
                    placeholder="Es. BGG, Ricerca Web, BG Stats, Manuale..."
                    className="bg-slate-950 border border-slate-700/80 rounded-lg px-2.5 py-1 text-xs text-white focus:outline-none focus:border-amber-500 w-48 text-right"
                    title="Modifica o specifica la fonte delle dimensioni"
                  />
                </div>

                {/* Kallax compatibility status */}
                {!canFitInKallax ? (
                  <div className="flex items-start gap-2 text-xs text-red-400 pt-1.5 p-2.5 rounded-lg bg-red-950/30 border border-red-900/40">
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                    <div>
                      <strong className="block">Dimensioni superiori al vano standard:</strong>
                      La scatola eccede l'apertura utile di un vano IKEA Kallax (33.5 × 33.5 × 39 cm).
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-xs text-emerald-400 pt-1.5 p-2.5 rounded-lg bg-emerald-950/30 border border-emerald-900/40">
                    <Check className="w-4 h-4 shrink-0" />
                    <span>
                      Scatola perfettamente compatibile con i vani IKEA Kallax (33.5 × 33.5 × 39 cm).
                    </span>
                  </div>
                )}
              </div>

              {/* Color & Visual Spine Selector */}
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1.5">
                  Colore Costa della Scatola (Visualizzazione 2D & 3D)
                </label>
                <div className="flex items-center gap-2 flex-wrap">
                  {COLOR_OPTIONS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setColor(c)}
                      className={`w-8 h-8 rounded-xl transition-all cursor-pointer ${
                        color === c ? 'scale-110 ring-2 ring-white shadow-lg' : 'opacity-70 hover:opacity-100'
                      }`}
                      style={{ backgroundColor: c }}
                      aria-label={`Colore ${c}`}
                    />
                  ))}
                  <div className="ml-2 flex items-center gap-1.5 bg-slate-950 px-2.5 py-1.5 rounded-xl border border-slate-800">
                    <span className="text-[10px] text-slate-400 font-mono">Hex:</span>
                    <input
                      type="text"
                      value={color}
                      onChange={(e) => setColor(e.target.value)}
                      className="w-16 bg-transparent text-xs text-white font-mono uppercase focus:outline-none"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: SINOSSI & NOTE PERSONALI */}
          {activeTab === 'notes' && (
            <div className="space-y-4 animate-in fade-in duration-150">
              {/* Description from BGG */}
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1 flex items-center justify-between">
                  <span>Sinossi / Descrizione (Recuperata da BGG)</span>
                  <span className="text-[10px] text-slate-500 font-normal">Editabile</span>
                </label>
                <textarea
                  rows={5}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Descrizione del gioco, ambientazione e meccaniche recuperate da BoardGameGeek..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-amber-500 leading-relaxed font-sans"
                />
              </div>

              {/* Personal Notes / Edition */}
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">
                  Note Personali, Edizione o Espansioni Incluse
                </label>
                <textarea
                  rows={3}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Es. Edizione Kickstarter, include espansione, carte imbustate Premium con bustine Mayday..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-amber-500"
                />
              </div>
            </div>
          )}

          {/* Action buttons */}
          <div className="pt-3 border-t border-slate-800 flex items-center justify-between gap-3">
            {isEditing && onDelete ? (
              <button
                type="button"
                onClick={() => {
                  if (confirm(`Eliminare "${game.name}" dalla collezione?`)) {
                    onDelete(game.id);
                    onClose();
                  }
                }}
                className="px-3 py-2 text-xs font-semibold text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-xl transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Elimina Gioco</span>
              </button>
            ) : <div />}

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white transition-colors cursor-pointer"
              >
                Annulla
              </button>
              <button
                type="submit"
                className="px-5 py-2 text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-xl transition-all flex items-center gap-1.5 shadow-md shadow-amber-500/20 cursor-pointer active:scale-95"
              >
                <Save className="w-3.5 h-3.5" />
                <span>Salva Scheda & Dimensioni</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

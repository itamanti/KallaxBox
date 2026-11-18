import React, { useState } from 'react';
import { GameBox } from '../types/kallax';
import { generateBoxColor } from '../utils/kallaxMath';
import { lookupBoardGameInfo, BOARD_GAME_CATALOG, normalizeGameName } from '../data/boardGameDatabase';
import { pickDisplayCoverUrl, sanitizeBoxImageUrl } from '../utils/boxCover';
import {
  X,
  Search,
  Download,
  Loader2,
  Check,
  AlertCircle,
  Users,
  Clock,
  Sparkles,
  ExternalLink,
} from 'lucide-react';

interface BggSearchModalProps {
  onClose: () => void;
  onAddGame: (game: GameBox) => void;
  onAddMultipleGames: (games: GameBox[]) => void;
}

export const BggSearchModal: React.FC<BggSearchModalProps> = ({
  onClose,
  onAddGame,
  onAddMultipleGames,
}) => {
  const [activeTab, setActiveTab] = useState<'search' | 'collection'>('search');
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [loadingGameKey, setLoadingGameKey] = useState<string | null>(null);
  const [importedGameKeys, setImportedGameKeys] = useState<Set<string>>(new Set());
  const [failedCoverUrls, setFailedCoverUrls] = useState<Set<string>>(() => new Set());

  // Collection import state
  const [bggUsername, setBggUsername] = useState('');
  const [isImportingCollection, setIsImportingCollection] = useState(false);
  const [collectionCount, setCollectionCount] = useState<number | null>(null);
  const [collectionError, setCollectionError] = useState<string | null>(null);

  const getItemKey = (item: any) => (item.bggId && item.bggId > 0 ? `id:${item.bggId}` : `name:${normalizeGameName(item.name || '')}`);

  const handleSearch = async (e?: React.FormEvent, overrideQuery?: string) => {
    if (e) e.preventDefault();
    const effectiveQuery = (overrideQuery ?? searchQuery).trim();
    if (!effectiveQuery) return;

    setIsSearching(true);
    setSearchError(null);
    setSearchResults([]);

    try {
      const res = await fetch(`/api/bgg/search?query=${encodeURIComponent(effectiveQuery)}`);
      if (res.ok) {
        const data = await res.json();
        setSearchResults(data.results || []);
        if ((data.results || []).length === 0) {
          setSearchError('Nessun gioco trovato su BoardGameGeek con questo nome.');
        }
      } else {
        throw new Error('Fallback al catalogo offline');
      }
    } catch {
      // Offline / GitHub Pages fallback: search local catalog directly
      const normQuery = normalizeGameName(effectiveQuery);
      const words = normQuery.split(' ').filter(Boolean);
      const localMatches = BOARD_GAME_CATALOG.filter((g) => {
        const normName = normalizeGameName(g.name);
        if (normName.includes(normQuery)) return true;
        if (words.every((w) => normName.includes(w))) return true;
        if (g.aliases) {
          return g.aliases.some((a) => {
            const normA = normalizeGameName(a);
            return normA.includes(normQuery) || words.every((w) => normA.includes(w));
          });
        }
        return false;
      }).map((g) => ({
        bggId: g.bggId,
        name: g.name,
        year: g.year,
        width: g.width,
        height: g.height,
        depth: g.depth,
        dimensionSource: 'BGG',
        thumbnail: g.thumbnail,
      }));

      setSearchResults(localMatches);
      if (localMatches.length === 0) {
        setSearchError('Nessun gioco trovato nel catalogo locale per "' + effectiveQuery + '".');
      }
    } finally {
      setIsSearching(false);
    }
  };

  const handleSelectGame = async (item: any) => {
    const key = getItemKey(item);
    const numericBggId = item.bggId && item.bggId > 0 ? item.bggId : 0;
    const itemName = (item.name || '').trim();
    setLoadingGameKey(key);
    try {
      // 1. Try local verified lookup only when truly matched in verified catalog
      const localInfo = lookupBoardGameInfo({
        bggId: numericBggId > 0 ? numericBggId : undefined,
        name: itemName,
      });
      let details: any = localInfo.found ? { ...localInfo } : null;

      if (!details) {
        try {
          const url =
            numericBggId > 0
              ? `/api/bgg/game/${numericBggId}?name=${encodeURIComponent(itemName)}`
              : `/api/bgg/lookup-by-name?name=${encodeURIComponent(itemName)}`;
          const res = await fetch(url);
          if (res.ok) {
            details = await res.json();
          }
        } catch {
          // API unreachable, use search item + local heuristic
        }
      } else if (!sanitizeBoxImageUrl(details.thumbnail) && !sanitizeBoxImageUrl(item.thumbnail)) {
        try {
          const coverResp = await fetch('/api/games/batch-covers', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              games: [{ id: 'tmp', name: details.name || itemName, bggId: details.bggId || numericBggId }],
            }),
          });
          if (coverResp.ok) {
            const coverData = await coverResp.json();
            const hit = coverData.results?.[0];
            if (hit?.thumbnail || hit?.image) {
              details.thumbnail = hit.thumbnail || details.thumbnail;
              details.image = hit.image || details.image;
            }
          }
        } catch {
          // ignore
        }
      }

      const d = details || {};
      const resolvedBggId = d.bggId || (numericBggId > 0 ? numericBggId : undefined);
      const info = lookupBoardGameInfo({ bggId: resolvedBggId, name: d.name || itemName });

      const resolvedWidth = d.width || item.width || info.width;
      const resolvedHeight = d.height || item.height || info.height;
      const resolvedDepth = d.depth || item.depth || info.depth;
      const resolvedSource =
        d.dimensionSource ||
        (info.found ? 'Database verificato' : item.dimensionSource || 'Stima standard');

      const resolvedThumb =
        sanitizeBoxImageUrl(d.thumbnail) ||
        sanitizeBoxImageUrl(item.thumbnail) ||
        sanitizeBoxImageUrl(info.thumbnail);
      const resolvedImage =
        sanitizeBoxImageUrl(d.image) ||
        sanitizeBoxImageUrl(item.image) ||
        sanitizeBoxImageUrl(info.image) ||
        resolvedThumb;

      const newGame: GameBox = {
        id: `bgg-${resolvedBggId || 'web'}-${Date.now().toString(36)}`,
        name: d.name || itemName || info.name,
        bggId: resolvedBggId,
        width: resolvedWidth,
        height: resolvedHeight,
        depth: resolvedDepth,
        dimensionSource: resolvedSource,
        thumbnail: resolvedThumb,
        image: resolvedImage,
        year: d.year || item.year || info.year,
        players:
          d.players ||
          (d.minPlayers && d.maxPlayers
            ? `${d.minPlayers}-${d.maxPlayers}`
            : info.minPlayers && info.maxPlayers
            ? `${info.minPlayers}-${info.maxPlayers}`
            : undefined),
        playtime: d.playingTime || d.playtime || info.playingTime,
        minAge: d.minAge || info.minAge,
        weight: d.weight ?? info.weight,
        rating: d.rating ?? info.rating,
        color: generateBoxColor(d.name || itemName || info.name),
        description: d.description || info.description,
        notes: d.description ? d.description.slice(0, 150) + '...' : undefined,
      };

      onAddGame(newGame);
      setImportedGameKeys((prev) => new Set(prev).add(key));
    } catch (err: any) {
      setSearchError(`Errore importazione gioco: ${err.message}`);
    } finally {
      setLoadingGameKey(null);
    }
  };

  const handleImportCollection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bggUsername.trim()) return;

    setIsImportingCollection(true);
    setCollectionError(null);
    setCollectionCount(null);

    try {
      const res = await fetch(`/api/bgg/user/${encodeURIComponent(bggUsername.trim())}`);
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Errore caricamento collezione BGG');
      }

      const games: GameBox[] = (data.games || []).map((g: any) => {
        const info = lookupBoardGameInfo({ bggId: g.bggId, name: g.name });
        return {
          ...g,
          width: g.width && g.width !== 29.7 ? g.width : info.width,
          height: g.height && g.height !== 29.7 ? g.height : info.height,
          depth: g.depth && g.depth !== 7.2 ? g.depth : info.depth,
          dimensionSource: g.dimensionSource || (info.found ? 'BGG' : (g.width && g.width !== 29.7 ? 'BGG' : 'Stima standard')),
          rating: g.rating ?? info.rating,
          weight: g.weight ?? info.weight,
          description: g.description || info.description,
          color: generateBoxColor(g.name),
        };
      });

      if (games.length === 0) {
        setCollectionError(`Nessun gioco posseduto trovato per l'utente "${bggUsername}". Assicurati che i giochi siano contrassegnati come "Own" su BGG.`);
      } else {
        onAddMultipleGames(games);
        setCollectionCount(games.length);
      }
    } catch (err: any) {
      setCollectionError(err.message || 'Errore nella connessione a BGG.');
    } finally {
      setIsImportingCollection(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        
        {/* Modal Header */}
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/80 sticky top-0 z-10">
          <div>
            <h2 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
              <Download className="w-4 h-4 text-amber-400" />
              Importa da BoardGameGeek (BGG)
            </h2>
            <p className="text-xs text-slate-400">
              Scarica metadati ufficiali e dimensioni scatole dal database mondiale
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

        {/* Tab Switcher */}
        <div className="px-5 pt-3 pb-0 flex border-b border-slate-800 gap-4 text-xs font-semibold">
          <button
            onClick={() => setActiveTab('search')}
            className={`pb-2.5 transition-colors border-b-2 ${
              activeTab === 'search'
                ? 'border-amber-400 text-amber-300'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            Cerca Singolo Gioco
          </button>
          <button
            onClick={() => setActiveTab('collection')}
            className={`pb-2.5 transition-colors border-b-2 ${
              activeTab === 'collection'
                ? 'border-amber-400 text-amber-300'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            Importa Collezione Utente
          </button>
        </div>

        {/* Tab Content */}
        <div className="p-5 overflow-y-auto flex-1 space-y-4">
          {activeTab === 'search' ? (
            <>
              {/* Search Form */}
              <form onSubmit={handleSearch} className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Es. Scythe, Terraforming Mars, Wingspan..."
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-4 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
                  />
                </div>
                <button
                  type="submit"
                  disabled={isSearching || !searchQuery.trim()}
                  className="px-4 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl text-xs disabled:opacity-50 transition-colors flex items-center gap-1.5 shadow-sm shrink-0"
                >
                  {isSearching ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Cerca...
                    </>
                  ) : (
                    <>
                      <Search className="w-3.5 h-3.5" />
                      Cerca
                    </>
                  )}
                </button>
              </form>

              {/* Quick suggestions */}
              <div className="flex flex-wrap gap-1.5 items-center text-[11px] text-slate-400">
                <span className="text-slate-500">Popolari:</span>
                {['Wingspan', 'Catan', 'Azul', 'Everdell', 'Brass Birmingham', 'Ark Nova'].map((name) => (
                  <button
                    key={name}
                    type="button"
                    onClick={() => {
                      setSearchQuery(name);
                      handleSearch(undefined, name);
                    }}
                    className="px-2 py-0.5 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
                  >
                    {name}
                  </button>
                ))}
              </div>

              {/* Error state */}
              {searchError && (
                <div className="p-3 rounded-xl bg-amber-950/40 border border-amber-600/30 text-amber-200 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
                  <span>{searchError}</span>
                </div>
              )}

              {/* Results List */}
              <div className="space-y-2 mt-2">
                {searchResults.map((item, idx) => {
                  const key = getItemKey(item);
                  const isImported = importedGameKeys.has(key);
                  const isLoading = loadingGameKey === key;

                  return (
                    <div
                      key={`${item.bggId || 0}-${item.name}-${idx}`}
                      className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between gap-3 hover:border-slate-700 transition-colors"
                    >
                      <div className="flex items-center gap-2.5 min-w-0 flex-1">
                        {(() => {
                          const previewUrl = pickDisplayCoverUrl(item, failedCoverUrls);
                          return (
                            <div
                              className="w-10 h-10 rounded-lg flex items-center justify-center text-white font-bold text-xs shrink-0 shadow border border-white/20 relative overflow-hidden"
                              style={{ backgroundColor: generateBoxColor(item.name || 'G') }}
                            >
                              <span>{(item.name || 'G').charAt(0).toUpperCase()}</span>
                              {previewUrl && (
                                <img
                                  src={previewUrl}
                                  alt={item.name}
                                  referrerPolicy="no-referrer"
                                  className="absolute inset-0 w-full h-full object-cover"
                                  onError={() => {
                                    setFailedCoverUrls((prev) => {
                                      const next = new Set(prev);
                                      next.add(previewUrl);
                                      return next;
                                    });
                                  }}
                                />
                              )}
                            </div>
                          );
                        })()}
                        <div className="min-w-0 flex-1">
                          <div className="font-bold text-xs text-white truncate">
                            {item.name}
                          </div>
                          <div className="text-[11px] text-slate-400 font-mono flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-0.5">
                            <span>
                              {item.bggId > 0 ? `BGG #${item.bggId}` : 'Ricerca Web'}
                              {item.year ? ` · Anno ${item.year}` : ''}
                            </span>
                            {item.width && item.height && item.depth && (
                              <span className="text-amber-300 font-semibold">
                                {item.width} × {item.height} × {item.depth} cm
                                {item.dimensionSource ? ` · ${item.dimensionSource}` : ''}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <button
                        disabled={isLoading || isImported}
                        onClick={() => handleSelectGame(item)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors shrink-0 ${
                          isImported
                            ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-500/30 cursor-default'
                            : 'bg-slate-800 hover:bg-amber-500 hover:text-slate-950 text-white'
                        }`}
                      >
                        {isLoading ? (
                          <>
                            <Loader2 className="w-3 h-3 animate-spin" />
                            Scarico...
                          </>
                        ) : isImported ? (
                          <>
                            <Check className="w-3 h-3" />
                            Aggiunto
                          </>
                        ) : (
                          <>
                            <Download className="w-3 h-3" />
                            Importa
                          </>
                        )}
                      </button>
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            /* Collection Tab */
            <form onSubmit={handleImportCollection} className="space-y-4">
              <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                <label className="text-xs font-semibold text-slate-200 block">
                  Nome Utente BoardGameGeek:
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={bggUsername}
                    onChange={(e) => setBggUsername(e.target.value)}
                    placeholder="Es. il tuo username BGG"
                    className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
                  />
                  <button
                    type="submit"
                    disabled={isImportingCollection || !bggUsername.trim()}
                    className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-lg text-xs disabled:opacity-50 transition-colors flex items-center gap-1.5 shadow-sm shrink-0"
                  >
                    {isImportingCollection ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        Scaricamento...
                      </>
                    ) : (
                      <>
                        <Download className="w-3.5 h-3.5" />
                        Sincronizza
                      </>
                    )}
                  </button>
                </div>
                <p className="text-[11px] text-slate-400">
                  Verranno importati tutti i giochi contrassegnati come "Owned" nel tuo profilo BGG con le relative dimensioni stimate per scaffale Kallax.
                </p>
              </div>

              {collectionCount !== null && (
                <div className="p-3 rounded-xl bg-emerald-950/60 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2">
                  <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>
                    Importati con successo <strong>{collectionCount}</strong> giochi nella tua libreria! Ora puoi trascinarli nei vani Kallax.
                  </span>
                </div>
              )}

              {collectionError && (
                <div className="p-3 rounded-xl bg-red-950/60 border border-red-500/30 text-red-300 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                  <span>{collectionError}</span>
                </div>
              )}
            </form>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-slate-800 flex items-center justify-between bg-slate-900/90 text-xs text-slate-400">
          <span>Dati e dimensioni scatole da BGG / Ricerca Web</span>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg transition-colors font-semibold"
          >
            Chiudi
          </button>
        </div>
      </div>
    </div>
  );
};

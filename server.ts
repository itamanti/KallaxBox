import 'dotenv/config';
import express, { Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { XMLParser } from 'fast-xml-parser';
import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import {
  lookupBoardGameInfo,
  BOARD_GAME_CATALOG,
  normalizeGameName,
  parseDimensionsFromText,
} from './src/data/boardGameDatabase.ts';
import {
  selectBestGeekdoVersionDimensions,
  scoreWikidataCandidates,
  extractBggAndWikidataFromWikipediaPages,
  extractAmazonAsinsFromSearchHtml,
  extractAmazonProductDimensions,
  parseGeminiJsonDimensions,
  isGeminiRateLimitError,
} from './src/utils/dimensionSearch.ts';
import { isAllowedProxyImageHost } from './src/utils/boxCover.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Parse port and host from CLI args (e.g. --port 3000 --host 0.0.0.0) or environment
const portArgIndex = process.argv.indexOf('--port');
const portFromArg = portArgIndex !== -1 && process.argv[portArgIndex + 1] ? process.argv[portArgIndex + 1] : null;
const port = parseInt(portFromArg || process.env.PORT || '3000', 10);

const hostArgIndex = process.argv.indexOf('--host');
const hostFromArg = hostArgIndex !== -1 && process.argv[hostArgIndex + 1] ? process.argv[hostArgIndex + 1] : null;
const host = hostFromArg || process.env.HOST || '0.0.0.0';

app.use(express.json({ limit: '10mb' }));

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
});

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const WIKI_UA = 'KallaxBox/1.0 (https://kallaxbox.app; boardgame-shelf-manager)';

/**
 * Resolves real BoardGameGeek IDs from Wikidata (P2339) and multi-language Wikipedia (en, fr, de, it).
 */
async function resolveBggIdsFromWeb(gameName: string): Promise<number[]> {
  const cleanName = (gameName || '').replace(/(\(.*?\)|\[.*?\])/g, '').trim();
  if (!cleanName) return [];

  const foundIds: number[] = [];
  const addId = (id?: number) => {
    if (id && id > 0 && !foundIds.includes(id)) {
      foundIds.push(id);
    }
  };

  const fetchP2339ForWikidataIds = async (qIds: string[]): Promise<number[]> => {
    if (qIds.length === 0) return [];
    try {
      const uniqueIds = [...new Set(qIds)].slice(0, 12);
      const eRes = await fetch(
        `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${uniqueIds.join('|')}&props=claims&format=json`,
        { headers: { 'User-Agent': WIKI_UA }, signal: AbortSignal.timeout(3000) }
      ).catch(() => null);
      if (!eRes || !eRes.ok) return [];
      const ed = await eRes.json();
      const ids: number[] = [];
      for (const qId of uniqueIds) {
        const val = ed.entities?.[qId]?.claims?.P2339?.[0]?.mainsnak?.datavalue?.value;
        if (val) {
          const parsed = parseInt(String(val), 10);
          if (parsed > 0) ids.push(parsed);
        }
      }
      return ids;
    } catch {
      return [];
    }
  };

  // Run Wikidata search (en) and Wikipedia search (en, fr, it, de) in parallel
  const searchVariants = [cleanName];
  if (cleanName.includes(':')) {
    searchVariants.push(cleanName.split(':')[0].trim());
  }

  const wikidataTask = (async () => {
    try {
      const allRanked: Array<{ id: string; score: number }> = [];
      for (const variant of searchVariants.slice(0, 2)) {
        const searchUrl = `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(
          variant
        )}&language=en&limit=20&format=json`;
        const wRes = await fetch(searchUrl, {
          headers: { 'User-Agent': WIKI_UA },
          signal: AbortSignal.timeout(3000),
        }).catch(() => null);
        if (!wRes || !wRes.ok) continue;
        const wd = await wRes.json();
        const ranked = scoreWikidataCandidates(wd.search || [], variant);
        allRanked.push(...ranked);
        if (ranked.some((r) => r.score >= 30)) break;
      }
      allRanked.sort((a, b) => b.score - a.score);
      const topQIds = allRanked.filter((r) => r.score >= 0).slice(0, 8).map((r) => r.id);
      return await fetchP2339ForWikidataIds(topQIds);
    } catch {
      return [] as number[];
    }
  })();

  const wikipediaTask = (async () => {
    try {
      const langs = ['en', 'fr', 'de', 'it'];
      const wikiHits = await Promise.all(
        langs.map(async (lang) => {
          const suffix = lang === 'it' ? 'gioco da tavolo' : lang === 'fr' ? 'jeu de société' : lang === 'de' ? 'Brettspiel' : 'board game';
          const q = lang === 'en' ? `${cleanName}` : `${cleanName} ${suffix}`;
          const url = `https://${lang}.wikipedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(
            q
          )}&gsrlimit=4&prop=pageprops|extlinks&ellimit=25&format=json`;
          const resp = await fetch(url, {
            headers: { 'User-Agent': WIKI_UA },
            signal: AbortSignal.timeout(3000),
          }).catch(() => null);
          if (!resp || !resp.ok) return { bggIds: [], wikibaseItems: [] };
          const data = await resp.json();
          return extractBggAndWikidataFromWikipediaPages(data.query?.pages, cleanName);
        })
      );

      const directBggIds = wikiHits.flatMap((h) => h.bggIds);
      const qIds = wikiHits.flatMap((h) => h.wikibaseItems);
      const resolvedFromQ = await fetchP2339ForWikidataIds(qIds);
      return [...directBggIds, ...resolvedFromQ];
    } catch {
      return [] as number[];
    }
  })();

  const [wdIds, wpIds] = await Promise.all([wikidataTask, wikipediaTask]);
  for (const id of wdIds) addId(id);
  for (const id of wpIds) addId(id);

  return foundIds;
}

/**
 * Fetches rich metadata and real retail box dimensions from BGG's public Geekdo JSON API.
 */
async function fetchGeekdoGameDetails(
  bggId: number,
  queryName: string = ''
): Promise<{
  bggId: number;
  name: string;
  year?: number;
  minPlayers: number;
  maxPlayers: number;
  playingTime: number;
  minAge: number;
  rating: number;
  weight: number;
  thumbnail: string;
  image: string;
  description: string;
  width?: number;
  height?: number;
  depth?: number;
  dimensionSource?: string;
} | null> {
  if (!bggId || bggId <= 0) return null;

  try {
    const [itemResp, versionsResp] = await Promise.all([
      fetch(`https://api.geekdo.com/api/geekitems?objectid=${bggId}&objecttype=thing`, {
        headers: { 'User-Agent': BROWSER_UA, Accept: 'application/json' },
        signal: AbortSignal.timeout(3500),
      }).catch(() => null),
      fetch(
        `https://api.geekdo.com/api/geekitem/linkeditems?objectid=${bggId}&objecttype=thing&linkdata_index=boardgameversion&pageid=1&showcount=50`,
        {
          headers: { 'User-Agent': BROWSER_UA, Accept: 'application/json' },
          signal: AbortSignal.timeout(3500),
        }
      ).catch(() => null),
    ]);

    if (!itemResp || !itemResp.ok) return null;
    const itemData = await itemResp.json();
    const item = itemData?.item;
    if (!item || !item.name) return null;

    const cleanDesc = typeof item.description === 'string'
      ? item.description.replace(/<[^>]+>/g, ' ').replace(/&quot;/g, '"').replace(/&#10;/g, '\n').replace(/\s+/g, ' ').trim()
      : '';

    let width: number | undefined;
    let height: number | undefined;
    let depth: number | undefined;
    let dimensionSource: string | undefined;

    if (versionsResp && versionsResp.ok) {
      const vData = await versionsResp.json();
      const bestDims = selectBestGeekdoVersionDimensions(vData.items || [], queryName || item.name);
      if (bestDims) {
        width = bestDims.width;
        height = bestDims.height;
        depth = bestDims.depth;
        dimensionSource = 'BGG Edizioni Reali';
      }
    }

    if (!width) {
      const textToScan = [item.description, item.short_description, item.wiki].filter(Boolean).join('\n');
      const parsed = parseDimensionsFromText(textToScan);
      if (parsed) {
        width = parsed.width;
        height = parsed.height;
        depth = parsed.depth;
        dimensionSource = 'BGG Database';
      }
    }

    const rawThumb = item.images?.previewthumb || item.images?.thumb || item.images?.square200 || item.imageurl || '';
    const rawImg = item.images?.original || item.images?.previewthumb || item.images?.square200 || rawThumb;
    const ratingVal = parseFloat(item.stats?.average);
    const weightVal = parseFloat(item.stats?.avgweight);

    return {
      bggId,
      name: String(item.name),
      year: item.yearpublished ? parseInt(String(item.yearpublished), 10) : undefined,
      minPlayers: item.minplayers ? parseInt(String(item.minplayers), 10) : 1,
      maxPlayers: item.maxplayers ? parseInt(String(item.maxplayers), 10) : 4,
      playingTime: item.maxplaytime ? parseInt(String(item.maxplaytime), 10) : (item.minplaytime ? parseInt(String(item.minplaytime), 10) : 60),
      minAge: item.minage ? parseInt(String(item.minage), 10) : 10,
      rating: !isNaN(ratingVal) && ratingVal > 0 ? Math.round(ratingVal * 10) / 10 : 7.5,
      weight: !isNaN(weightVal) && weightVal > 0 ? Math.round(weightVal * 10) / 10 : 2.2,
      thumbnail: rawThumb,
      image: rawImg,
      description: cleanDesc.slice(0, 320),
      width,
      height,
      depth,
      dimensionSource,
    };
  } catch {
    return null;
  }
}

interface CoverImageResult {
  bggId?: number;
  thumbnail: string;
  image: string;
}

const coverImagesCache = new Map<string, { result: CoverImageResult | null; expiresAt: number }>();

async function fetchOnlineCoverImages(
  gameName: string,
  bggId?: number
): Promise<CoverImageResult | null> {
  const cleanName = (gameName || '').replace(/(\(.*?\)|\[.*?\])/g, '').trim();
  if ((!bggId || bggId <= 0) && !cleanName) return null;

  const cacheKey = `${bggId && bggId > 0 ? bggId : 0}:${normalizeGameName(cleanName)}`;
  const cached = coverImagesCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.result;
  }

  let resolvedBggId = bggId && bggId > 0 ? bggId : undefined;
  if (!resolvedBggId && cleanName) {
    const local = lookupBoardGameInfo({ name: cleanName });
    if (local.found && local.bggId) {
      resolvedBggId = local.bggId;
    } else {
      const resolvedIds = await resolveBggIdsFromWeb(cleanName);
      if (resolvedIds[0]) resolvedBggId = resolvedIds[0];
    }
  }

  if (resolvedBggId && resolvedBggId > 0) {
    try {
      const itemResp = await fetch(
        `https://api.geekdo.com/api/geekitems?objectid=${resolvedBggId}&objecttype=thing`,
        {
          headers: { 'User-Agent': BROWSER_UA, Accept: 'application/json' },
          signal: AbortSignal.timeout(3500),
        }
      ).catch(() => null);

      if (itemResp && itemResp.ok) {
        const itemData = await itemResp.json();
        const item = itemData?.item;
        const thumb =
          item?.images?.previewthumb ||
          item?.images?.thumb ||
          item?.images?.square200 ||
          item?.imageurl ||
          '';
        const img =
          item?.images?.original ||
          item?.images?.previewthumb ||
          item?.images?.square200 ||
          thumb;
        if (thumb || img) {
          const hit: CoverImageResult = {
            bggId: resolvedBggId,
            thumbnail: thumb || img,
            image: img || thumb,
          };
          coverImagesCache.set(cacheKey, { result: hit, expiresAt: Date.now() + 24 * 60 * 60_000 });
          return hit;
        }
      }
    } catch {
      // Fall through to Wikipedia pageimages fallback
    }
  }

  // Fallback: Wikipedia pageimages (free, fast, no key)
  if (cleanName) {
    try {
      const wikiUrl = `https://en.wikipedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(
        `"${cleanName}" "board game"`
      )}&gsrlimit=2&prop=pageimages&pithumbsize=400&format=json`;
      const resp = await fetch(wikiUrl, {
        headers: { 'User-Agent': WIKI_UA, Accept: 'application/json' },
        signal: AbortSignal.timeout(2500),
      }).catch(() => null);
      if (resp && resp.ok) {
        const data = await resp.json();
        const pages = Object.values(data.query?.pages || {}) as any[];
        for (const p of pages) {
          const src = p?.thumbnail?.source;
          if (typeof src === 'string' && src.startsWith('https://')) {
            const hit: CoverImageResult = {
              bggId: resolvedBggId,
              thumbnail: src,
              image: src,
            };
            coverImagesCache.set(cacheKey, { result: hit, expiresAt: Date.now() + 6 * 60 * 60_000 });
            return hit;
          }
        }
      }
    } catch {
      // Ignore fallback error
    }
  }

  coverImagesCache.set(cacheKey, { result: null, expiresAt: Date.now() + 10 * 60_000 });
  return null;
}

// Search games via local catalog, BGG XMLAPI2 (if token present), and Wikidata/Wikipedia -> Geekdo
app.get('/api/bgg/search', async (req: Request, res: Response) => {
  const query = (((req.query.query || req.query.q) as string) || '').trim();
  if (!query) {
    return res.status(400).json({ error: 'Query parameter required' });
  }

  const normQuery = normalizeGameName(query);
  const words = normQuery.split(' ').filter(Boolean);

  // 1. Search local verified catalog
  const catalogMatches = BOARD_GAME_CATALOG.filter((g) => {
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

  const remoteResults: any[] = [];

  // 2. Try BGG XMLAPI2 search if token configured
  if (process.env.BGG_API_TOKEN) {
    try {
      const url = `https://boardgamegeek.com/xmlapi2/search?query=${encodeURIComponent(query)}&type=boardgame`;
      const headers: Record<string, string> = {
        'User-Agent': BROWSER_UA,
        Accept: 'application/xml,text/xml,*/*',
        Authorization: `Bearer ${process.env.BGG_API_TOKEN}`,
      };
      const response = await fetch(url, { headers, signal: AbortSignal.timeout(3500) }).catch(() => null);
      if (response && response.ok) {
        const xmlText = await response.text();
        const parsed = xmlParser.parse(xmlText);
        const items = parsed.items?.item;
        if (items) {
          const rawList = Array.isArray(items) ? items : [items];
          for (const item of rawList.slice(0, 8)) {
            const bggId = parseInt(item['@_id'], 10);
            let name = '';
            if (Array.isArray(item.name)) {
              const primary = item.name.find((n: any) => n['@_type'] === 'primary') || item.name[0];
              name = primary['@_value'];
            } else if (item.name) {
              name = item.name['@_value'] || item.name;
            }
            const year = item.yearpublished ? parseInt(item.yearpublished['@_value'], 10) : undefined;
            const info = lookupBoardGameInfo({ bggId, name });
            remoteResults.push({
              bggId,
              name: name || info.name,
              year: year || info.year,
              width: info.found ? info.width : undefined,
              height: info.found ? info.height : undefined,
              depth: info.found ? info.depth : undefined,
              dimensionSource: info.found ? 'BGG' : undefined,
            });
          }
        }
      }
    } catch {
      // Fall through to Wikidata/Wikipedia -> Geekdo
    }
  }

  // 3. If no exact local catalog match and no XMLAPI2 results, resolve via Wikidata/Wikipedia -> Geekdo
  const hasExactLocal = catalogMatches.some(
    (m) => normalizeGameName(m.name) === normQuery
  );
  if (remoteResults.length === 0 && !hasExactLocal) {
    try {
      const resolvedIds = await resolveBggIdsFromWeb(query);
      const hydrated = await Promise.all(
        resolvedIds.slice(0, 4).map((id) => fetchGeekdoGameDetails(id, query))
      );
      for (const h of hydrated) {
        if (h) {
          remoteResults.push({
            bggId: h.bggId,
            name: h.name,
            year: h.year,
            width: h.width,
            height: h.height,
            depth: h.depth,
            dimensionSource: h.dimensionSource,
            thumbnail: h.thumbnail,
          });
        }
      }
    } catch {
      // Handled gracefully below
    }
  }

  // Merge results without duplicates
  const seenIds = new Set<number>();
  const combined: any[] = [];

  for (const item of catalogMatches) {
    if (!seenIds.has(item.bggId)) {
      seenIds.add(item.bggId);
      combined.push(item);
    }
  }

  for (const item of remoteResults) {
    if (!seenIds.has(item.bggId)) {
      seenIds.add(item.bggId);
      combined.push(item);
    }
  }

  if (combined.length > 0) {
    await Promise.all(
      combined.slice(0, 6).map(async (item) => {
        if (!item.thumbnail && item.bggId > 0) {
          const cover = await fetchOnlineCoverImages(item.name, item.bggId);
          if (cover) {
            item.thumbnail = cover.thumbnail;
            item.image = cover.image;
          }
        }
      })
    );
    return res.json({ results: combined });
  }

  // Fallback unlinked search entry (bggId: 0 so we never pollute lookups with a fake ID)
  const [webDims, fallbackCover] = await Promise.all([
    searchWebBoxDimensions(query),
    fetchOnlineCoverImages(query),
  ]);
  const info = lookupBoardGameInfo({ name: query });
  const fallbackResult = {
    bggId: webDims?.bggId || fallbackCover?.bggId || 0,
    name: query.charAt(0).toUpperCase() + query.slice(1),
    year: new Date().getFullYear(),
    width: webDims ? webDims.width : info.width,
    height: webDims ? webDims.height : info.height,
    depth: webDims ? webDims.depth : info.depth,
    thumbnail: fallbackCover?.thumbnail || '',
    image: fallbackCover?.image || '',
    dimensionSource: webDims ? webDims.source : 'Stima standard',
    isEstimate: !webDims,
  };

  return res.json({ results: [fallbackResult] });
});

interface WebDimResult {
  width: number;
  height: number;
  depth: number;
  source: string;
  bggId?: number;
  rateLimited?: boolean;
}

const webDimensionsCache = new Map<string, { result: WebDimResult | null; expiresAt: number }>();
let geminiCooldownUntil = 0;
let geminiLastCallAt = 0;
let geminiChain: Promise<unknown> = Promise.resolve();

function runSerializedGemini<T>(fn: () => Promise<T>): Promise<T> {
  const next = geminiChain.then(async () => {
    const elapsed = Date.now() - geminiLastCallAt;
    if (elapsed < 1000) {
      await new Promise((r) => setTimeout(r, 1000 - elapsed));
    }
    geminiLastCallAt = Date.now();
    return fn();
  });
  geminiChain = next.catch(() => undefined);
  return next;
}

/**
 * Search the web for actual board game box dimensions (width, height, depth in cm).
 * Tier 1: Resolve BGG ID (if not provided) via Wikidata P2339 + multi-lang Wikipedia -> Geekdo boardgameversion.
 * Tier 2: Wikipedia article extract text dimension parsing.
 * Tier 3: Amazon.it product search & specification table parsing (free, no quota).
 * Tier 4: Gemini 4 Hydrogen with Google Search Grounding (if GEMINI_API_KEY is available, serialized + cooldown on 429).
 */
async function searchWebBoxDimensions(
  gameName: string,
  bggId?: number,
  year?: number
): Promise<WebDimResult | null> {
  const cleanName = (gameName || '').replace(/(\(.*?\)|\[.*?\])/g, '').trim();
  if (!cleanName && (!bggId || bggId <= 0)) return null;

  const cacheKey = `${bggId && bggId > 0 ? bggId : 0}:${normalizeGameName(cleanName)}`;
  const cached = webDimensionsCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.result;
  }

  let resolvedBggIds: number[] = bggId && bggId > 0 ? [bggId] : [];
  if (resolvedBggIds.length === 0 && cleanName) {
    resolvedBggIds = await resolveBggIdsFromWeb(cleanName);
  }

  // Tier 1: Check BGG Geekdo boardgameversion linkeditems & description for resolved BGG IDs
  for (const candidateBggId of resolvedBggIds.slice(0, 2)) {
    try {
      const [vResp, geekResp] = await Promise.all([
        fetch(
          `https://api.geekdo.com/api/geekitem/linkeditems?objectid=${candidateBggId}&objecttype=thing&linkdata_index=boardgameversion&pageid=1&showcount=50`,
          {
            headers: { 'User-Agent': BROWSER_UA, Accept: 'application/json' },
            signal: AbortSignal.timeout(3500),
          }
        ).catch(() => null),
        fetch(
          `https://api.geekdo.com/api/geekitems?objectid=${candidateBggId}&objecttype=thing`,
          {
            headers: { 'User-Agent': BROWSER_UA, Accept: 'application/json' },
            signal: AbortSignal.timeout(3000),
          }
        ).catch(() => null),
      ]);

      if (vResp && vResp.ok) {
        const vData = await vResp.json();
        const bestDims = selectBestGeekdoVersionDimensions(vData.items || [], cleanName);
        if (bestDims) {
          const hit: WebDimResult = {
            width: bestDims.width,
            height: bestDims.height,
            depth: bestDims.depth,
            source: 'BGG Edizioni Reali',
            bggId: candidateBggId,
          };
          webDimensionsCache.set(cacheKey, { result: hit, expiresAt: Date.now() + 30 * 60_000 });
          return hit;
        }
      }

      if (geekResp && geekResp.ok) {
        const gData = await geekResp.json();
        const textToScan = [
          gData.item?.description,
          gData.item?.short_description,
          gData.item?.wiki,
        ]
          .filter(Boolean)
          .join('\n');
        const parsedDims = parseDimensionsFromText(textToScan);
        if (parsedDims) {
          const hit: WebDimResult = {
            width: parsedDims.width,
            height: parsedDims.height,
            depth: parsedDims.depth,
            source: 'BGG Database',
            bggId: candidateBggId,
          };
          webDimensionsCache.set(cacheKey, { result: hit, expiresAt: Date.now() + 30 * 60_000 });
          return hit;
        }
      }
    } catch {
      // Continue to next source
    }
  }

  // Tier 2: Wikipedia Search + Article Extract API
  if (cleanName) {
    try {
      const wikiUrl = `https://en.wikipedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(
        `"${cleanName}" "board game"`
      )}&gsrlimit=2&prop=extracts&explaintext=1&exchars=4000&format=json`;
      const resp = await fetch(wikiUrl, {
        headers: { 'User-Agent': WIKI_UA, Accept: 'application/json' },
        signal: AbortSignal.timeout(2500),
      }).catch(() => null);

      if (resp && resp.ok) {
        const data = await resp.json();
        const pages = Object.values(data.query?.pages || {}) as any[];
        for (const p of pages) {
          const parsedDims = parseDimensionsFromText(p.extract || '');
          if (parsedDims) {
            const hit: WebDimResult = {
              width: parsedDims.width,
              height: parsedDims.height,
              depth: parsedDims.depth,
              source: 'Wikipedia',
              bggId: resolvedBggIds[0],
            };
            webDimensionsCache.set(cacheKey, { result: hit, expiresAt: Date.now() + 30 * 60_000 });
            return hit;
          }
        }
      }
    } catch {
      // Continue to Amazon / Gemini
    }
  }

  // Tier 3: Amazon.it Product Search & Specification Table (no LLM quota consumed)
  if (cleanName) {
    try {
      const searchUrl = `https://www.amazon.it/s?k=${encodeURIComponent(`${cleanName} gioco da tavolo`)}`;
      const sResp = await fetch(searchUrl, {
        headers: {
          'User-Agent': BROWSER_UA,
          'Accept-Language': 'it-IT,it;q=0.9,en;q=0.8',
        },
        signal: AbortSignal.timeout(4000),
      }).catch(() => null);

      if (sResp && sResp.ok) {
        const searchHtml = await sResp.text();
        const asins = extractAmazonAsinsFromSearchHtml(searchHtml, cleanName);
        for (const asin of asins) {
          const dpResp = await fetch(`https://www.amazon.it/dp/${asin}`, {
            headers: {
              'User-Agent': BROWSER_UA,
              'Accept-Language': 'it-IT,it;q=0.9,en;q=0.8',
            },
            signal: AbortSignal.timeout(4000),
          }).catch(() => null);
          if (dpResp && dpResp.ok) {
            const dpHtml = await dpResp.text();
            const parsedDims = extractAmazonProductDimensions(dpHtml);
            if (parsedDims) {
              const hit: WebDimResult = {
                width: parsedDims.width,
                height: parsedDims.height,
                depth: parsedDims.depth,
                source: 'Ricerca Web (Amazon)',
                bggId: resolvedBggIds[0],
              };
              webDimensionsCache.set(cacheKey, { result: hit, expiresAt: Date.now() + 30 * 60_000 });
              return hit;
            }
          }
        }
      }
    } catch {
      // Continue to Gemini fallback
    }
  }

  // Tier 4: Gemini 4 Hydrogen with Google Search Grounding (serialized + backoff + 60s cooldown on 429)
  if (process.env.GEMINI_API_KEY && cleanName && Date.now() >= geminiCooldownUntil) {
    try {
      const ai = new GoogleGenAI({
        apiKey: process.env.GEMINI_API_KEY,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      });

      const prompt = `Search for the exact physical retail box dimensions (width, height, depth in centimeters) of the board game "${cleanName}"${year ? ` (${year})` : ''}.
Convert inches or millimeters to centimeters (1 inch = 2.54 cm, rounded to 1 decimal place).
Reply ONLY with a valid JSON object on one line:
{"found": true, "width": 29.6, "height": 29.6, "depth": 7.5}
If you cannot verify the real box dimensions from search results or reliable knowledge, reply with:
{"found": false}`;

      const timeoutPromise = new Promise<null>((resolve) => setTimeout(() => resolve(null), 11000));
      const geminiTask = runSerializedGemini(async () => {
        if (Date.now() < geminiCooldownUntil) return null;

        const modelsToTry: Array<{ model: string; useSearch: boolean }> = [
          { model: 'gemini-4-hydrogen', useSearch: true },
          { model: 'gemini-3.1-flash-lite', useSearch: false },
        ];

        for (const attempt of modelsToTry) {
          if (Date.now() < geminiCooldownUntil) break;

          const config: any = attempt.useSearch
            ? {
                tools: [{ googleSearch: {} }],
                thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
              }
            : {
                responseMimeType: 'application/json',
              };

          for (let retry = 0; retry < 2; retry++) {
            try {
              const response = await ai.models.generateContent({
                model: attempt.model,
                contents: prompt,
                config,
              });

              const parsed = parseGeminiJsonDimensions(response.text || '');
              if (parsed) {
                return {
                  width: parsed.width,
                  height: parsed.height,
                  depth: parsed.depth,
                  source: 'Gemini AI (Google Search)',
                  bggId: resolvedBggIds[0],
                } as WebDimResult;
              }
              break;
            } catch (err: any) {
              if (isGeminiRateLimitError(err)) {
                if (retry === 0) {
                  await new Promise((r) => setTimeout(r, 1500));
                  continue;
                }
                geminiCooldownUntil = Date.now() + 60_000;
                break;
              }
              break;
            }
          }
        }

        return null;
      });

      const geminiResult = await Promise.race([geminiTask, timeoutPromise]);
      if (geminiResult) {
        webDimensionsCache.set(cacheKey, { result: geminiResult, expiresAt: Date.now() + 30 * 60_000 });
        return geminiResult;
      }
    } catch {
      // Fall through cleanly
    }
  }

  const missTtl = Date.now() < geminiCooldownUntil ? 60_000 : 5 * 60_000;
  webDimensionsCache.set(cacheKey, { result: null, expiresAt: Date.now() + missTtl });
  return null;
}

// Single game web dimension search endpoint
app.get('/api/games/web-dimensions', async (req: Request, res: Response) => {
  const name = ((req.query.name as string) || '').trim();
  const rawBggId = req.query.bggId ? parseInt(req.query.bggId as string, 10) : undefined;
  const bggId = rawBggId && rawBggId > 0 ? rawBggId : undefined;
  const year = req.query.year ? parseInt(req.query.year as string, 10) : undefined;

  if (!name && !bggId) {
    return res.status(400).json({ error: 'Name or bggId parameter required' });
  }

  // 1. Check exact local verified catalog first
  const local = lookupBoardGameInfo({ bggId, name });
  if (local.found) {
    const cover = !local.thumbnail ? await fetchOnlineCoverImages(local.name || name, local.bggId) : null;
    return res.json({
      found: true,
      foundOnWeb: true,
      width: local.width,
      height: local.height,
      depth: local.depth,
      bggId: local.bggId,
      thumbnail: local.thumbnail || cover?.thumbnail || undefined,
      image: local.image || cover?.image || undefined,
      source: 'Database verificato KallaxBox',
    });
  }

  // 2. Search live web sources + cover image in parallel
  const [webDims, cover] = await Promise.all([
    searchWebBoxDimensions(name || local.name, bggId, year),
    fetchOnlineCoverImages(name || local.name, bggId),
  ]);
  if (webDims) {
    return res.json({
      found: true,
      foundOnWeb: true,
      width: webDims.width,
      height: webDims.height,
      depth: webDims.depth,
      bggId: webDims.bggId || cover?.bggId || bggId,
      thumbnail: cover?.thumbnail || undefined,
      image: cover?.image || undefined,
      source: webDims.source,
    });
  }

  return res.json({
    found: false,
    foundOnWeb: false,
    rateLimited: Date.now() < geminiCooldownUntil,
    width: local.width,
    height: local.height,
    depth: local.depth,
    bggId: cover?.bggId || bggId,
    thumbnail: cover?.thumbnail || undefined,
    image: cover?.image || undefined,
    source: 'Stima standard',
  });
});

// Batch web dimension search endpoint for imported collections
app.post('/api/games/batch-web-dimensions', async (req: Request, res: Response) => {
  const games = Array.isArray(req.body.games) ? req.body.games : [];
  if (games.length === 0) {
    return res.json({ results: [] });
  }

  const MAX_ONLINE_SEARCHES = 48;
  let onlineSearchesCount = 0;

  const results: any[] = [];
  const chunkSize = 4;

  for (let i = 0; i < games.length; i += chunkSize) {
    const chunk = games.slice(i, i + chunkSize);
    const chunkPromises = chunk.map(async (g: any) => {
      try {
        const gName = (g.name || '').trim();
        const rawBggId = g.bggId ? parseInt(g.bggId, 10) : undefined;
        const bggId = rawBggId && rawBggId > 0 ? rawBggId : undefined;
        const year = g.year ? parseInt(g.year, 10) : undefined;

        const local = lookupBoardGameInfo({ bggId, name: gName });
        if (local.found) {
          const cover = !local.thumbnail ? await fetchOnlineCoverImages(gName, local.bggId) : null;
          return {
            id: g.id,
            name: gName,
            bggId: local.bggId,
            width: local.width,
            height: local.height,
            depth: local.depth,
            thumbnail: local.thumbnail || cover?.thumbnail || undefined,
            image: local.image || cover?.image || undefined,
            foundOnWeb: true,
            source: 'BGG / Catalogo',
          };
        }

        if (onlineSearchesCount < MAX_ONLINE_SEARCHES) {
          onlineSearchesCount++;
          const [webDims, cover] = await Promise.all([
            searchWebBoxDimensions(gName, bggId, year),
            fetchOnlineCoverImages(gName, bggId),
          ]);
          if (webDims) {
            return {
              id: g.id,
              name: gName,
              bggId: webDims.bggId || cover?.bggId || bggId,
              width: webDims.width,
              height: webDims.height,
              depth: webDims.depth,
              thumbnail: cover?.thumbnail || undefined,
              image: cover?.image || undefined,
              foundOnWeb: true,
              source: webDims.source,
            };
          }
          return {
            id: g.id,
            name: gName,
            bggId: cover?.bggId || bggId,
            width: local.width,
            height: local.height,
            depth: local.depth,
            thumbnail: cover?.thumbnail || undefined,
            image: cover?.image || undefined,
            foundOnWeb: false,
            source: 'Stima standard',
          };
        }

        return {
          id: g.id,
          name: gName,
          width: local.width,
          height: local.height,
          depth: local.depth,
          foundOnWeb: false,
          source: 'Stima standard',
        };
      } catch {
        return {
          id: g.id,
          name: g.name || '',
          width: 29.7,
          height: 29.7,
          depth: 7.2,
          foundOnWeb: false,
          source: 'Stima standard',
        };
      }
    });

    const chunkResults = await Promise.all(chunkPromises);
    results.push(...chunkResults);
  }

  return res.json({ results });
});

// Batch online cover image lookup for existing / imported shelf & library boxes
app.post('/api/games/batch-covers', async (req: Request, res: Response) => {
  const games = Array.isArray(req.body.games) ? req.body.games : [];
  if (games.length === 0) {
    return res.json({ results: [] });
  }

  const results: Array<{ id: string; bggId?: number; thumbnail?: string; image?: string }> = [];
  const chunkSize = 6;
  const capped = games.slice(0, 60);

  for (let i = 0; i < capped.length; i += chunkSize) {
    const chunk = capped.slice(i, i + chunkSize);
    const chunkResults = await Promise.all(
      chunk.map(async (g: any) => {
        try {
          const gName = (g.name || '').trim();
          const rawBggId = g.bggId ? parseInt(String(g.bggId), 10) : undefined;
          const bggId = rawBggId && rawBggId > 0 ? rawBggId : undefined;
          const cover = await fetchOnlineCoverImages(gName, bggId);
          return {
            id: String(g.id || ''),
            bggId: cover?.bggId || bggId,
            thumbnail: cover?.thumbnail || undefined,
            image: cover?.image || undefined,
          };
        } catch {
          return { id: String(g.id || '') };
        }
      })
    );
    results.push(...chunkResults);
  }

  return res.json({ results });
});

// CORS-safe image proxy for rendering online box art inside 3D WebGL canvas textures
app.get('/api/image-proxy', async (req: Request, res: Response) => {
  const rawUrl = typeof req.query.url === 'string' ? req.query.url.trim() : '';
  if (!rawUrl) {
    return res.status(400).send('Missing url');
  }

  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return res.status(400).send('Invalid url');
  }

  if (parsed.protocol !== 'https:' || !isAllowedProxyImageHost(parsed.hostname)) {
    return res.status(403).send('Host not allowed');
  }

  try {
    const upstream = await fetch(parsed.toString(), {
      headers: {
        'User-Agent': BROWSER_UA,
        Accept: 'image/avif,image/webp,image/png,image/jpeg,image/*,*/*;q=0.8',
      },
      signal: AbortSignal.timeout(7000),
    });

    if (!upstream.ok) {
      return res.status(upstream.status).send('Upstream error');
    }

    const contentType = upstream.headers.get('content-type') || 'image/jpeg';
    if (!contentType.startsWith('image/')) {
      return res.status(415).send('Not an image');
    }

    const buf = Buffer.from(await upstream.arrayBuffer());
    res.setHeader('Content-Type', contentType);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    return res.send(buf);
  } catch {
    return res.status(504).send('Image fetch timeout');
  }
});

// Fetch detailed game info and real box dimensions
app.get('/api/bgg/game/:id', async (req: Request, res: Response) => {
  const bggIdParam = req.params.id;
  if (!bggIdParam) {
    return res.status(400).json({ error: 'Game ID required' });
  }

  const numericId = parseInt(bggIdParam, 10);
  const nameQuery = typeof req.query.name === 'string' ? req.query.name.trim() : undefined;
  const catalogLookup = lookupBoardGameInfo({ bggId: numericId > 0 ? numericId : undefined, name: nameQuery });

  if (catalogLookup.found) {
    const cover =
      !catalogLookup.thumbnail && (catalogLookup.bggId || catalogLookup.name)
        ? await fetchOnlineCoverImages(catalogLookup.name, catalogLookup.bggId)
        : null;
    return res.json({
      bggId: catalogLookup.bggId,
      name: catalogLookup.name,
      thumbnail: catalogLookup.thumbnail || cover?.thumbnail || '',
      image: catalogLookup.image || cover?.image || '',
      year: catalogLookup.year,
      minPlayers: catalogLookup.minPlayers,
      maxPlayers: catalogLookup.maxPlayers,
      playingTime: catalogLookup.playingTime,
      minAge: catalogLookup.minAge,
      rating: catalogLookup.rating,
      weight: catalogLookup.weight,
      width: catalogLookup.width,
      height: catalogLookup.height,
      depth: catalogLookup.depth,
      dimensionSource: 'BGG',
      foundOnWeb: true,
      description: catalogLookup.description || '',
    });
  }

  // 1. Try BGG XMLAPI2 only if token is configured
  if (numericId > 0 && process.env.BGG_API_TOKEN) {
    try {
      const url = `https://boardgamegeek.com/xmlapi2/thing?id=${bggIdParam}&stats=1`;
      const response = await fetch(url, {
        headers: {
          'User-Agent': BROWSER_UA,
          Accept: 'application/xml,text/xml,*/*',
          Authorization: `Bearer ${process.env.BGG_API_TOKEN}`,
        },
        signal: AbortSignal.timeout(3500),
      }).catch(() => null);

      if (response && response.ok) {
        const xmlText = await response.text();
        const parsed = xmlParser.parse(xmlText);
        const item = parsed.items?.item;

        if (item) {
          let name = '';
          if (Array.isArray(item.name)) {
            const primary = item.name.find((n: any) => n['@_type'] === 'primary') || item.name[0];
            name = primary['@_value'];
          } else if (item.name) {
            name = item.name['@_value'] || item.name;
          }

          const thumbnail = item.thumbnail || item.image || '';
          const image = item.image || item.thumbnail || '';
          const year = item.yearpublished ? parseInt(item.yearpublished['@_value'], 10) : undefined;
          const minPlayers = item.minplayers ? parseInt(item.minplayers['@_value'], 10) : 1;
          const maxPlayers = item.maxplayers ? parseInt(item.maxplayers['@_value'], 10) : 4;
          const playingTime = item.playingtime ? parseInt(item.playingtime['@_value'], 10) : 60;
          const minAge = item.minage ? parseInt(item.minage['@_value'], 10) : 10;

          const stats = item.statistics?.ratings;
          const rating = stats?.average ? parseFloat(stats.average['@_value']) : 7.5;
          const weight = stats?.averageweight ? parseFloat(stats.averageweight['@_value']) : 2.2;

          const info = lookupBoardGameInfo({ bggId: numericId, name });
          let finalWidth = info.width;
          let finalHeight = info.height;
          let finalDepth = info.depth;
          let dimensionSource = info.found ? 'BGG' : 'Stima standard';
          let foundOnWeb = info.found;
          let finalDesc =
            typeof item.description === 'string'
              ? item.description.replace(/&#10;/g, '\n').replace(/&quot;/g, '"').slice(0, 300)
              : info.description || '';

          if (!info.found) {
            const webResult = await searchWebBoxDimensions(name || nameQuery || '', numericId, year);
            if (webResult) {
              finalWidth = webResult.width;
              finalHeight = webResult.height;
              finalDepth = webResult.depth;
              dimensionSource = webResult.source;
              foundOnWeb = true;
              finalDesc = `${finalDesc}\n[Dimensioni trovate in rete: ${webResult.width}×${webResult.height}×${webResult.depth} cm (${webResult.source})]`;
            }
          }

          return res.json({
            bggId: numericId,
            name: name || info.name,
            thumbnail: thumbnail || info.thumbnail,
            image: image || info.image,
            year: year || info.year,
            minPlayers,
            maxPlayers,
            playingTime,
            minAge,
            rating: Math.round(rating * 10) / 10,
            weight: Math.round(weight * 10) / 10,
            width: finalWidth,
            height: finalHeight,
            depth: finalDepth,
            dimensionSource,
            foundOnWeb,
            description: finalDesc,
          });
        }
      }
    } catch {
      // Handled below by Geekdo API
    }
  }

  // 2. Try Geekdo public JSON API directly (works without BGG API token!)
  if (numericId > 0) {
    const geekdo = await fetchGeekdoGameDetails(numericId, nameQuery || '');
    if (geekdo) {
      let finalWidth = geekdo.width;
      let finalHeight = geekdo.height;
      let finalDepth = geekdo.depth;
      let dimensionSource = geekdo.dimensionSource;
      let foundOnWeb = Boolean(finalWidth && finalHeight && finalDepth);

      if (!foundOnWeb) {
        const webFallback = await searchWebBoxDimensions(geekdo.name || nameQuery || '', numericId, geekdo.year);
        if (webFallback) {
          finalWidth = webFallback.width;
          finalHeight = webFallback.height;
          finalDepth = webFallback.depth;
          dimensionSource = webFallback.source;
          foundOnWeb = true;
        }
      }

      const heuristic = lookupBoardGameInfo({ name: geekdo.name || nameQuery });
      return res.json({
        bggId: numericId,
        name: geekdo.name,
        thumbnail: geekdo.thumbnail,
        image: geekdo.image,
        year: geekdo.year || 2023,
        minPlayers: geekdo.minPlayers,
        maxPlayers: geekdo.maxPlayers,
        playingTime: geekdo.playingTime,
        minAge: geekdo.minAge,
        rating: geekdo.rating,
        weight: geekdo.weight,
        width: finalWidth ?? heuristic.width,
        height: finalHeight ?? heuristic.height,
        depth: finalDepth ?? heuristic.depth,
        dimensionSource: dimensionSource || 'Stima standard',
        foundOnWeb,
        description: geekdo.description || heuristic.description,
      });
    }
  }

  // 3. Name-based web search fallback when BGG ID is absent or unresolved
  const lookupName = nameQuery || (catalogLookup.name !== 'Gioco da Tavolo' ? catalogLookup.name : '');
  const webResult = lookupName ? await searchWebBoxDimensions(lookupName, numericId > 0 ? numericId : undefined) : null;
  const resolvedBggId = webResult?.bggId || (numericId > 0 ? numericId : undefined);
  const geekdoFromWeb = resolvedBggId && resolvedBggId !== numericId
    ? await fetchGeekdoGameDetails(resolvedBggId, lookupName)
    : null;
  const fallbackCover =
    !geekdoFromWeb?.thumbnail && !catalogLookup.thumbnail && (lookupName || resolvedBggId)
      ? await fetchOnlineCoverImages(lookupName || catalogLookup.name, resolvedBggId)
      : null;

  const finalWidth = webResult ? webResult.width : geekdoFromWeb?.width ?? catalogLookup.width;
  const finalHeight = webResult ? webResult.height : geekdoFromWeb?.height ?? catalogLookup.height;
  const finalDepth = webResult ? webResult.depth : geekdoFromWeb?.depth ?? catalogLookup.depth;
  const finalSource = webResult ? webResult.source : (geekdoFromWeb?.dimensionSource || 'Stima standard');
  const foundOnWeb = Boolean(webResult || geekdoFromWeb?.width);
  const finalDesc = foundOnWeb
    ? `Dimensioni reali trovate in rete (${finalWidth} × ${finalHeight} × ${finalDepth} cm - ${finalSource}).`
    : catalogLookup.description || 'Dimensioni stimate per scaffalatura Kallax.';

  return res.json({
    bggId: resolvedBggId || fallbackCover?.bggId,
    name: geekdoFromWeb?.name || lookupName || catalogLookup.name,
    thumbnail: geekdoFromWeb?.thumbnail || catalogLookup.thumbnail || fallbackCover?.thumbnail || '',
    image: geekdoFromWeb?.image || catalogLookup.image || fallbackCover?.image || '',
    year: geekdoFromWeb?.year || catalogLookup.year || new Date().getFullYear(),
    minPlayers: geekdoFromWeb?.minPlayers || catalogLookup.minPlayers || 2,
    maxPlayers: geekdoFromWeb?.maxPlayers || catalogLookup.maxPlayers || 4,
    playingTime: geekdoFromWeb?.playingTime || catalogLookup.playingTime || 60,
    minAge: geekdoFromWeb?.minAge || catalogLookup.minAge || 10,
    rating: geekdoFromWeb?.rating || catalogLookup.rating || 7.5,
    weight: geekdoFromWeb?.weight || catalogLookup.weight || 2.2,
    width: finalWidth,
    height: finalHeight,
    depth: finalDepth,
    dimensionSource: finalSource,
    foundOnWeb,
    description: finalDesc,
  });
});

// Lookup game sheet and real dimensions by name
app.get('/api/bgg/lookup-by-name', async (req: Request, res: Response) => {
  const query = ((req.query.name as string) || '').trim();
  if (!query) {
    return res.status(400).json({ error: 'Name parameter required' });
  }

  const info = lookupBoardGameInfo({ name: query });
  if (info.found) {
    const cover = !info.thumbnail
      ? await fetchOnlineCoverImages(info.name, info.bggId)
      : null;
    return res.json({
      bggId: info.bggId,
      name: info.name,
      thumbnail: info.thumbnail || cover?.thumbnail || '',
      image: info.image || cover?.image || '',
      year: info.year || new Date().getFullYear(),
      minPlayers: info.minPlayers || 1,
      maxPlayers: info.maxPlayers || 4,
      playingTime: info.playingTime || 60,
      minAge: info.minAge || 10,
      rating: info.rating || 7.5,
      weight: info.weight || 2.2,
      width: info.width,
      height: info.height,
      depth: info.depth,
      dimensionSource: 'BGG',
      foundOnWeb: true,
      description: info.description || '',
    });
  }

  // Try resolving BGG ID -> full Geekdo metadata & dimensions
  const resolvedIds = await resolveBggIdsFromWeb(query);
  let geekdo = resolvedIds[0] ? await fetchGeekdoGameDetails(resolvedIds[0], query) : null;
  let webResult = geekdo?.width
    ? {
        width: geekdo.width,
        height: geekdo.height!,
        depth: geekdo.depth!,
        source: geekdo.dimensionSource || 'BGG Edizioni Reali',
        bggId: geekdo.bggId,
      }
    : await searchWebBoxDimensions(query, resolvedIds[0]);

  const finalWidth = webResult ? webResult.width : info.width;
  const finalHeight = webResult ? webResult.height : info.height;
  const finalDepth = webResult ? webResult.depth : info.depth;
  const foundOnWeb = Boolean(webResult);
  const dimensionSource = webResult ? webResult.source : 'Stima standard';
  const finalDesc = geekdo?.description
    || (webResult
      ? `Dimensioni reali trovate in rete (${webResult.width} × ${webResult.height} × ${webResult.depth} cm - ${webResult.source}).`
      : info.description || 'Dimensioni stimate per scaffalatura Kallax.');

  const resolvedBgg = geekdo?.bggId || webResult?.bggId || resolvedIds[0];
  const fallbackCover =
    !geekdo?.thumbnail && !info.thumbnail
      ? await fetchOnlineCoverImages(geekdo?.name || query, resolvedBgg)
      : null;

  return res.json({
    bggId: resolvedBgg || fallbackCover?.bggId,
    name: geekdo?.name || info.name,
    thumbnail: geekdo?.thumbnail || info.thumbnail || fallbackCover?.thumbnail || '',
    image: geekdo?.image || info.image || fallbackCover?.image || '',
    year: geekdo?.year || info.year || new Date().getFullYear(),
    minPlayers: geekdo?.minPlayers || info.minPlayers || 1,
    maxPlayers: geekdo?.maxPlayers || info.maxPlayers || 4,
    playingTime: geekdo?.playingTime || info.playingTime || 60,
    minAge: geekdo?.minAge || info.minAge || 10,
    rating: geekdo?.rating || info.rating || 7.5,
    weight: geekdo?.weight || info.weight || 2.2,
    width: finalWidth,
    height: finalHeight,
    depth: finalDepth,
    dimensionSource,
    foundOnWeb,
    description: finalDesc,
  });
});

// Import user collection from BGG with immediate real box dimensions
app.get('/api/bgg/user/:username', async (req: Request, res: Response) => {
  const username = req.params.username;
  if (!username) {
    return res.status(400).json({ error: 'Username required' });
  }

  try {
    const url = `https://boardgamegeek.com/xmlapi2/collection?username=${encodeURIComponent(username)}&own=1&stats=1`;
    const headers: Record<string, string> = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 KallaxBox/1.0',
      'Accept': 'application/xml,text/xml,*/*',
    };
    if (process.env.BGG_API_TOKEN) {
      headers['Authorization'] = `Bearer ${process.env.BGG_API_TOKEN}`;
    }

    let response = await fetch(url, { headers, signal: AbortSignal.timeout(5000) }).catch(() => null);

    if (response && response.status === 202) {
      await new Promise((r) => setTimeout(r, 1500));
      response = await fetch(url, { headers, signal: AbortSignal.timeout(5000) }).catch(() => null);
    }

    if (response && response.ok) {
      const xmlText = await response.text();
      const parsed = xmlParser.parse(xmlText);

      if (!parsed.errors && parsed.items?.item) {
        const rawList = Array.isArray(parsed.items.item) ? parsed.items.item : [parsed.items.item];
        const games = rawList.slice(0, 50).map((item: any) => {
          const bggId = parseInt(item['@_objectid'], 10);
          let name = '';
          if (typeof item.name === 'object') {
            name = item.name['#text'] || item.name['@_value'] || '';
          } else {
            name = item.name || '';
          }

          const thumbnail = item.thumbnail || item.image || '';
          const image = item.image || item.thumbnail || '';
          const year = item.yearpublished ? parseInt(item.yearpublished, 10) : undefined;
          const stats = item.stats;
          const minPlayers = stats?.['@_minplayers'] ? parseInt(stats['@_minplayers'], 10) : 1;
          const maxPlayers = stats?.['@_maxplayers'] ? parseInt(stats['@_maxplayers'], 10) : 4;
          const playingTime = stats?.['@_playingtime'] ? parseInt(stats['@_playingtime'], 10) : 60;

          // Immediately assign real box dimensions
          const info = lookupBoardGameInfo({ bggId, name });

          return {
            id: `bgg-${bggId}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
            bggId,
            name: name || info.name,
            thumbnail: thumbnail || info.thumbnail,
            image: image || info.image,
            year: year || info.year,
            minPlayers,
            maxPlayers,
            playingTime,
            width: info.width,
            height: info.height,
            depth: info.depth,
            dimensionSource: info.found ? 'BGG' : 'Stima standard',
            rating: info.rating,
            weight: info.weight,
            description: info.description,
          };
        });

        return res.json({ games });
      }
    }
  } catch {
    // Handled below by curated fallback
  }

  // Curated popular collection fallback with verified real dimensions
  const fallbackGames = BOARD_GAME_CATALOG.slice(0, 14).map((g) => ({
    id: `bgg-${g.bggId}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    bggId: g.bggId,
    name: g.name,
    thumbnail: g.thumbnail,
    image: g.image,
    year: g.year,
    minPlayers: g.minPlayers,
    maxPlayers: g.maxPlayers,
    playingTime: g.playingTime,
    minAge: g.minAge,
    rating: g.rating,
    weight: g.weight,
    width: g.width,
    height: g.height,
    depth: g.depth,
    dimensionSource: 'BGG',
    description: g.description,
  }));

  return res.json({ games: fallbackGames });
});

// Download repository zip archive for GitHub
app.get(['/api/download-zip', '/kallaxbox-github.zip'], async (_req: Request, res: Response) => {
  const zipPath = path.resolve(__dirname, 'kallaxbox-github.zip');
  if (!fs.existsSync(zipPath)) {
    try {
      const { execSync } = await import('child_process');
      execSync(
        `python3 -c "import zipfile, os; exclude_dirs={'.git','node_modules','.cache','.npm','dist','aistudio'}; exclude_files={'kallaxbox-github.zip','kallaxbox-github-pages-pronto.zip'}; z=zipfile.ZipFile('kallaxbox-github.zip','w',zipfile.ZIP_DEFLATED);\nfor root,dirs,files in os.walk('.'):\n dirs[:]=[d for d in dirs if d not in exclude_dirs]\n for f in files:\n  if f not in exclude_files: z.write(os.path.join(root,f), os.path.relpath(os.path.join(root,f),'.'))\nz.close()"`,
        { cwd: __dirname, stdio: 'ignore' }
      );
    } catch {
      // fallback below
    }
  }
  if (fs.existsSync(zipPath)) {
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename="kallaxbox-github.zip"');
    return res.sendFile(zipPath);
  }
  return res.status(404).json({ error: 'Zip file not found on server' });
});

// Download ready-to-use compiled zip for GitHub Pages (zero build required, flat 7 files)
app.get(['/api/download-pages-zip', '/kallaxbox-github-pages-pronto.zip'], async (_req: Request, res: Response) => {
  const zipPath = path.resolve(__dirname, 'kallaxbox-github-pages-pronto.zip');
  if (!fs.existsSync(zipPath)) {
    try {
      const { execSync } = await import('child_process');
      execSync('npm run build', { cwd: __dirname, stdio: 'ignore' });
      execSync(
        `python3 -c "import zipfile, os, shutil, time; v=str(int(time.time())); html=open('dist/index.html').read().replace('./kallaxbox-app.js','./kallaxbox-app.js?v='+v).replace('./kallaxbox-app.css','./kallaxbox-app.css?v='+v); open('dist/index.html','w').write(html); shutil.copyfile('dist/index.html','dist/404.html'); open('dist/.nojekyll','w').close(); z=zipfile.ZipFile('kallaxbox-github-pages-pronto.zip','w',zipfile.ZIP_DEFLATED);\nfor f in ['index.html','404.html','.nojekyll','manifest.json','icon.svg','kallaxbox-app.js','kallaxbox-app.css']:\n if os.path.exists(os.path.join('dist',f)): z.write(os.path.join('dist',f), f)\nz.close()"`,
        { cwd: __dirname, stdio: 'ignore' }
      );
    } catch {
      // fallback below
    }
  }
  if (fs.existsSync(zipPath)) {
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename="kallaxbox-github-pages-pronto.zip"');
    return res.sendFile(zipPath);
  }
  return res.status(404).json({ error: 'Pages zip file not found on server' });
});

// Setup Vite in dev or static files in production
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  }
  
  // Global unhandled error handling
  app.use((err: any, _req: Request, res: Response, _next: any) => {
    console.error('Unhandled server error:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Internal Server Error' });
    }
  });

  app.listen(port, host, () => {
    console.log(`KallaxBox server running at http://${host}:${port}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

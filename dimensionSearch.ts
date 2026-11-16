import { normalizeGameName, parseDimensionsFromText } from '../data/boardGameDatabase';

export interface GeekdoBoxDimensions {
  width: number;
  height: number;
  depth: number;
  editionName: string;
}

/**
 * Selects the best realistic retail box dimensions from BGG Geekdo `boardgameversion` items.
 * Converts inches to cm rounded to 1 decimal place.
 * Prefers English/Italian/Multilingual standard editions over mini/promo/deluxe unless requested.
 */
export function selectBestGeekdoVersionDimensions(
  items: any[],
  queryName: string = ''
): GeekdoBoxDimensions | null {
  if (!Array.isArray(items) || items.length === 0) return null;

  const toCm = (inches: string | number) =>
    Math.round(parseFloat(String(inches)) * 2.54 * 10) / 10;

  const qLower = queryName.toLowerCase();
  const wantsSpecialVariant =
    /travel|compact|mini|pocket|deluxe|collector|big box|mega|giant|duel/i.test(qLower);

  const candidates: Array<GeekdoBoxDimensions & { score: number }> = [];

  for (const item of items) {
    const rawW = parseFloat(String(item?.width ?? '0'));
    const rawL = parseFloat(String(item?.length ?? '0'));
    const rawD = parseFloat(String(item?.depth ?? '0'));

    if (!(rawW > 0.5 && rawL > 0.5 && rawD > 0.2)) continue;

    const w = toCm(rawW);
    const h = toCm(rawL);
    const d = toCm(rawD);

    const sorted = [w, h, d].sort((a, b) => a - b);
    if (sorted[0] < 0.8 || sorted[1] < 3.0 || sorted[2] > 120) continue;

    const edName = String(item?.name || '');
    const edLower = edName.toLowerCase();
    let score = 0;

    if (/\b(english|italian|italiano|multilingual|international)\b/i.test(edLower)) {
      score += 15;
    } else if (/\b(french|german|spanish|first|retail|standard)\b/i.test(edLower)) {
      score += 8;
    }

    if (
      !wantsSpecialVariant &&
      /\b(travel|compact|mini|pocket|deluxe|collector|big box|mega|giant|kickstarter|all-in|promo)\b/i.test(
        edLower
      )
    ) {
      score -= 12;
    }

    candidates.push({
      width: w,
      height: h,
      depth: d,
      editionName: edName || 'Edizione BGG',
      score,
    });
  }

  if (candidates.length === 0) return null;

  candidates.sort((a, b) => b.score - a.score);
  const best = candidates[0];
  return {
    width: best.width,
    height: best.height,
    depth: best.depth,
    editionName: best.editionName,
  };
}

/**
 * Ranks Wikidata wbsearchentities results to prioritize board/card/tabletop games
 * over unrelated songs, albums, films, or cities with the same title.
 */
export function scoreWikidataCandidates(
  candidates: any[],
  targetName: string
): Array<{ id: string; label: string; description: string; score: number }> {
  if (!Array.isArray(candidates) || candidates.length === 0) return [];

  const targetNorm = normalizeGameName(targetName);
  const targetWords = targetNorm.split(' ').filter((w) => w.length > 1);

  return candidates
    .filter((c) => c && c.id)
    .map((c) => {
      const label = String(c.label || c.display?.label?.value || '');
      const desc = String(c.description || c.display?.description?.value || '');
      const labelNorm = normalizeGameName(label);
      const descLower = desc.toLowerCase();

      let score = 0;

      if (labelNorm === targetNorm) {
        score += 30;
      } else if (labelNorm.startsWith(targetNorm) || targetNorm.startsWith(labelNorm)) {
        score += 18;
      } else if (targetWords.length > 0 && targetWords.every((w) => labelNorm.includes(w))) {
        score += 12;
      }

      if (
        /board\s*game|card\s*game|tabletop|strategy\s*game|dice\s*game|party\s*game|gioco\s*da\s*tavolo|gioco\s*di\s*carte|brettspiel|jeu\s*de\s*soci/i.test(
          descLower
        )
      ) {
        score += 40;
      } else if (/\bgame\b|\bgioco\b|\bspiel\b|\bjeu\b/i.test(descLower) && !/video\s*game/i.test(descLower)) {
        score += 15;
      }

      if (
        /video\s*game|film|movie|album|song|band|singer|actor|actress|sculpture|airline|street|motorcycle|television|episode|novel|book/i.test(
          descLower
        )
      ) {
        score -= 40;
      }

      return {
        id: String(c.id),
        label,
        description: desc,
        score,
      };
    })
    .sort((a, b) => b.score - a.score);
}

/**
 * Extracts BGG IDs (from external links) and Wikidata Q-IDs (from pageprops)
 * out of a MediaWiki `query.pages` object.
 */
export function extractBggAndWikidataFromWikipediaPages(
  pagesObj: Record<string, any> | undefined,
  targetName: string
): { bggIds: number[]; wikibaseItems: string[] } {
  if (!pagesObj || typeof pagesObj !== 'object') {
    return { bggIds: [], wikibaseItems: [] };
  }

  const targetNorm = normalizeGameName(targetName);
  const targetWords = targetNorm.split(' ').filter((w) => w.length > 2);

  const scoredPages = Object.values(pagesObj)
    .filter((p: any) => p && typeof p === 'object')
    .map((p: any) => {
      const title = String(p.title || '');
      const titleNorm = normalizeGameName(title.replace(/\(.*?\)/g, ''));
      const shortDesc = String(p.pageprops?.['wikibase-shortdesc'] || '').toLowerCase();

      let score = 0;
      if (titleNorm === targetNorm) score += 30;
      else if (targetWords.length > 0 && targetWords.every((w) => titleNorm.includes(w))) score += 18;
      else if (titleNorm.includes(targetNorm) || targetNorm.includes(titleNorm)) score += 10;

      if (/board\s*game|card\s*game|tabletop|gioco\s*da\s*tavolo|brettspiel|jeu\s*de\s*soci/i.test(title + ' ' + shortDesc)) {
        score += 35;
      }
      if (/video\s*game|film|episode|disambiguation|list\s+of|bioregion|region|album|song|band|river|city|municipality/i.test(title + ' ' + shortDesc)) {
        score -= 30;
      }
      return { page: p, score };
    })
    .sort((a, b) => b.score - a.score);

  const bggIds: number[] = [];
  const wikibaseItems: string[] = [];
  const topScore = scoredPages[0]?.score ?? 0;
  const minScore = topScore >= 50 ? 45 : 5;

  for (const { page, score } of scoredPages) {
    if (score < minScore && scoredPages.length > 1) continue;

    const extlinks: any[] = Array.isArray(page.extlinks) ? page.extlinks : [];
    for (const link of extlinks) {
      const url = String(link?.['*'] || link?.url || '');
      const match = url.match(/boardgamegeek\.com\/boardgame(?:expansion)?\/(\d+)/i);
      if (match) {
        const id = parseInt(match[1], 10);
        if (id > 0 && !bggIds.includes(id)) {
          bggIds.push(id);
        }
      }
    }

    const qId = page.pageprops?.wikibase_item;
    if (typeof qId === 'string' && /^Q\d+$/.test(qId) && !wikibaseItems.includes(qId)) {
      wikibaseItems.push(qId);
    }
  }

  return { bggIds, wikibaseItems };
}

/**
 * Extracts matching product ASINs from Amazon search result HTML.
 * Only selects products whose card text matches the game's significant words and avoids sleeves/inserts/accessories.
 */
export function extractAmazonAsinsFromSearchHtml(html: string, gameName: string): string[] {
  if (!html || !gameName) return [];

  const targetNorm = normalizeGameName(gameName);
  const targetWords = targetNorm.split(' ').filter((w) => w.length > 1);
  if (targetWords.length === 0) return [];

  const matches: Array<{ asin: string; score: number }> = [];
  const seen = new Set<string>();

  // Split by search result blocks containing data-asin
  const blocks = html.split(/data-asin="/g).slice(1);
  for (const block of blocks.slice(0, 20)) {
    const asinMatch = block.match(/^([A-Z0-9]{10})"/);
    if (!asinMatch) continue;
    const asin = asinMatch[1];
    if (seen.has(asin)) continue;
    seen.add(asin);

    // Inspect heading/title text inside this result card
    const cardSnippet = block.slice(0, 4000).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    const cardNorm = normalizeGameName(cardSnippet);

    const matchedWords = targetWords.filter((w) => cardNorm.includes(w));
    if (matchedWords.length < Math.max(1, Math.ceil(targetWords.length * 0.6))) continue;

    let score = matchedWords.length * 10;
    if (cardNorm.includes(targetNorm)) score += 20;
    if (/bustine|sleeves|organizer|insert|inserto|playmat|tappetino|espansione|expansion/i.test(cardSnippet) &&
        !/espansione|expansion/i.test(gameName)) {
      score -= 25;
    }

    matches.push({ asin, score });
  }

  matches.sort((a, b) => b.score - a.score);
  return matches.filter((m) => m.score > 0).slice(0, 2).map((m) => m.asin);
}

/**
 * Extracts box dimensions from an Amazon product detail page HTML.
 * Prioritizes explicit "Dimensioni prodotto" / "Dimensioni articolo" / "Product Dimensions" tables.
 */
export function extractAmazonProductDimensions(
  html: string
): { width: number; height: number; depth: number } | null {
  if (!html) return null;

  const cleanText = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ');

  // Priority 1: Look specifically near "Dimensioni prodotto / articolo / collo" or "Product / Package Dimensions"
  const specPattern = /(?:Dimensioni\s+(?:prodotto|articolo|del\s+collo|imballo)|Product\s+Dimensions|Package\s+Dimensions)[^.;]{0,120}/gi;
  const specMatches = cleanText.match(specPattern) || [];
  for (const snippet of specMatches) {
    const parsed = parseDimensionsFromText(snippet);
    if (parsed && parsed.width > 0 && parsed.height > 0 && parsed.depth > 0) {
      return parsed;
    }
  }

  return null;
}

/**
 * Parses Gemini JSON response text for box dimensions, supporting markdown fences and extra prose.
 */
export function parseGeminiJsonDimensions(
  text: string
): { width: number; height: number; depth: number } | null {
  if (!text) return null;

  const cleaned = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
  const jsonBlocks = cleaned.match(/\{[\s\S]*?\}/g) || [];
  for (const block of jsonBlocks) {
    try {
      const data = JSON.parse(block);
      if (data.found === false) continue;
      const w = parseFloat(String(data.width).replace(',', '.'));
      const h = parseFloat(String(data.height).replace(',', '.'));
      const d = parseFloat(String(data.depth).replace(',', '.'));
      if (w >= 2 && h >= 2 && d >= 0.5 && w <= 120 && h <= 120 && d <= 60) {
        return {
          width: Math.round(w * 10) / 10,
          height: Math.round(h * 10) / 10,
          depth: Math.round(d * 10) / 10,
        };
      }
    } catch {
      // Try next JSON block or regex fallback
    }
  }

  return parseDimensionsFromText(cleaned);
}

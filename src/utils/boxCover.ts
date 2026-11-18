export interface CoverCapableGame {
  thumbnail?: string;
  image?: string;
}

const BROKEN_PLACEHOLDER_PATTERNS = [
  'scout.jpg',
  'pic5666597.jpg',
  'cascadia.jpg',
  '7wondersduel.jpg',
  'ti4.jpg',
  'burgundy.jpg',
  'splendorduel.jpg',
  'codenames.jpg',
  'justone.jpg',
  'nemesis.jpg',
];

const ALLOWED_PROXY_HOST_SUFFIXES = [
  'cf.geekdo-images.com',
  'geekdo-images.com',
  'boardgamegeek.com',
  'upload.wikimedia.org',
  'm.media-amazon.com',
  'images-na.ssl-images-amazon.com',
];

export function isValidBoxImageUrl(url?: string): boolean {
  if (!url || typeof url !== 'string') return false;
  const trimmed = url.trim();
  if (!trimmed) return false;

  // Reject devanagari / corrupted placeholder strings
  if (/[\u0900-\u097F]/.test(trimmed)) return false;

  const lower = trimmed.toLowerCase();
  if (BROKEN_PLACEHOLDER_PATTERNS.some((p) => lower.includes(p))) {
    return false;
  }

  // Allow relative local assets
  if (trimmed.startsWith('/')) {
    return true;
  }

  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

export function sanitizeBoxImageUrl(url?: string): string | undefined {
  if (!isValidBoxImageUrl(url)) return undefined;
  return url!.trim();
}

export function resolveBoxCoverUrl(
  game: CoverCapableGame | undefined | null,
  preferHighRes = false
): string | undefined {
  if (!game) return undefined;
  const thumb = sanitizeBoxImageUrl(game.thumbnail);
  const img = sanitizeBoxImageUrl(game.image);
  if (preferHighRes) {
    return img || thumb;
  }
  return thumb || img;
}

export function shouldShowBoxCoverImage(
  showBoxColors: boolean,
  coverUrl?: string
): boolean {
  return !showBoxColors && isValidBoxImageUrl(coverUrl);
}

export function isAllowedProxyImageHost(hostname: string): boolean {
  if (!hostname) return false;
  const lower = hostname.toLowerCase();
  return ALLOWED_PROXY_HOST_SUFFIXES.some(
    (allowed) => lower === allowed || lower.endsWith(`.${allowed}`)
  );
}

export function buildProxyImageUrl(url: string): string {
  return `/api/image-proxy?url=${encodeURIComponent(url)}`;
}

export function mergeBoxCoverFields<T extends CoverCapableGame>(
  existing: T,
  incoming?: CoverCapableGame | null,
  preferIncoming = false
): T {
  const existingThumb = sanitizeBoxImageUrl(existing.thumbnail);
  const existingImage = sanitizeBoxImageUrl(existing.image);
  const incomingThumb = sanitizeBoxImageUrl(incoming?.thumbnail);
  const incomingImage = sanitizeBoxImageUrl(incoming?.image);

  const nextThumbnail = preferIncoming
    ? incomingThumb || incomingImage || existingThumb || existingImage
    : existingThumb || incomingThumb || incomingImage || existingImage;
  const nextImage = preferIncoming
    ? incomingImage || incomingThumb || existingImage || existingThumb
    : existingImage || incomingImage || incomingThumb || existingThumb;

  return {
    ...existing,
    thumbnail: nextThumbnail,
    image: nextImage,
  };
}

export function pickDisplayCoverUrl(
  game: CoverCapableGame | undefined | null,
  failedUrls?: ReadonlySet<string> | null
): string | undefined {
  if (!game) return undefined;
  const primary = resolveBoxCoverUrl(game, false);
  const fallback = resolveBoxCoverUrl(game, true);
  if (primary && !(failedUrls && failedUrls.has(primary))) {
    return primary;
  }
  if (fallback && !(failedUrls && failedUrls.has(fallback))) {
    return fallback;
  }
  return undefined;
}


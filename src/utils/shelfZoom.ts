export const MIN_SHELF_ZOOM = 0.5;
export const MAX_SHELF_ZOOM = 3.0;
export const SHELF_ZOOM_STEP = 0.2;

export function clampShelfZoom(zoom: number): number {
  if (!Number.isFinite(zoom)) return 1;
  const clamped = Math.min(MAX_SHELF_ZOOM, Math.max(MIN_SHELF_ZOOM, zoom));
  return Math.round(clamped * 100) / 100;
}

export function stepShelfZoom(
  currentZoom: number,
  direction: 'in' | 'out',
  step: number = SHELF_ZOOM_STEP
): number {
  const delta = direction === 'in' ? step : -step;
  return clampShelfZoom(currentZoom + delta);
}

export interface ShelfFitLayoutInput {
  viewportWidth: number;
  cols: number;
  isDesktop: boolean;
}

export interface ShelfFitLayoutResult {
  naturalShelfWidth: number;
  fitScale: number;
}

export function computeShelfFitLayout({
  viewportWidth,
  cols,
  isDesktop,
}: ShelfFitLayoutInput): ShelfFitLayoutResult {
  const safeViewport = Math.max(240, Number.isFinite(viewportWidth) ? viewportWidth : 360);
  const safeCols = Math.max(1, Math.floor(Number.isFinite(cols) ? cols : 1));

  // Must match ShelfOverview frame border + padding + grid padding + gaps
  const frameOverhead = isDesktop ? 56 : 32;
  const gap = isDesktop ? 10 : 6;
  const minCubeWidth = isDesktop ? 140 : 120;
  const maxShelfWidth = isDesktop ? 896 : 640;

  if (safeCols === 1) {
    const targetSingle = Math.min(safeViewport, isDesktop ? 360 : 320);
    const naturalShelfWidth = Math.max(minCubeWidth + frameOverhead, targetSingle);
    const fitScale = Math.max(0.25, Math.min(1, safeViewport / naturalShelfWidth));
    return { naturalShelfWidth, fitScale };
  }

  const totalOverhead = frameOverhead + (safeCols - 1) * gap;
  const requiredMinWidth = safeCols * minCubeWidth + totalOverhead;
  const targetMaxWidth = Math.min(safeViewport, maxShelfWidth);

  if (targetMaxWidth >= requiredMinWidth) {
    return {
      naturalShelfWidth: targetMaxWidth,
      fitScale: 1,
    };
  }

  const fitScale = Math.max(0.25, Math.min(1, safeViewport / requiredMinWidth));
  return {
    naturalShelfWidth: requiredMinWidth,
    fitScale,
  };
}

export interface PinchZoomInput {
  startZoom: number;
  startScale: number;
  startDist: number;
  currentDist: number;
  startScrollLeft: number;
  startScrollTop: number;
  startMidpointX: number;
  startMidpointY: number;
  currentMidpointX: number;
  currentMidpointY: number;
  fitScale: number;
}

export interface PinchZoomResult {
  nextZoom: number;
  nextScale: number;
  nextScrollLeft: number;
  nextScrollTop: number;
}

export function computePinchZoomAndScroll({
  startZoom,
  startScale,
  startDist,
  currentDist,
  startScrollLeft,
  startScrollTop,
  startMidpointX,
  startMidpointY,
  currentMidpointX,
  currentMidpointY,
  fitScale,
}: PinchZoomInput): PinchZoomResult {
  const safeStartDist = Math.max(1, startDist);
  const ratio = Math.max(0.1, currentDist / safeStartDist);
  const nextZoom = clampShelfZoom(startZoom * ratio);
  const safeFit = Math.max(0.1, fitScale);
  const safeStartScale = Math.max(0.1, startScale);
  const nextScale = safeFit * nextZoom;

  const contentX = (startScrollLeft + startMidpointX) / safeStartScale;
  const contentY = (startScrollTop + startMidpointY) / safeStartScale;

  const nextScrollLeft = Math.max(0, contentX * nextScale - currentMidpointX);
  const nextScrollTop = Math.max(0, contentY * nextScale - currentMidpointY);

  return {
    nextZoom,
    nextScale,
    nextScrollLeft,
    nextScrollTop,
  };
}

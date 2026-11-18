import type { ShelfOrientation } from '../types/kallax';

export interface BoxLabelStyleInput {
  widthPct: number;
  heightPct: number;
  orientation: ShelfOrientation;
  nameLength: number;
}

export interface BoxLabelStyleResult {
  fontSizePx: number;
  paddingPx: number;
  lineHeight: number;
}

export function computeBoxLabelStyle({
  widthPct,
  heightPct,
  orientation,
  nameLength,
}: BoxLabelStyleInput): BoxLabelStyleResult {
  const safeW = Number.isFinite(widthPct) ? Math.max(0, widthPct) : 20;
  const safeH = Number.isFinite(heightPct) ? Math.max(0, heightPct) : 20;
  const safeLen = Number.isFinite(nameLength) ? Math.max(0, nameLength) : 0;

  const isVertical = orientation === 'vertical';
  // Minor axis perpendicular to text flow (thickness of the spine or box face height)
  const thicknessPct = isVertical ? safeW : safeH;
  // Major axis along which the title text runs
  const spanPct = isVertical ? safeH : safeW;

  let fontSizePx = 10;
  if (thicknessPct < 8) {
    fontSizePx = 5.5;
  } else if (thicknessPct < 11) {
    fontSizePx = 6.5;
  } else if (thicknessPct < 15) {
    fontSizePx = 7.5;
  } else if (thicknessPct < 20) {
    fontSizePx = 8.5;
  }

  // Also shrink slightly if the running span is very short or the name is long inside a medium-narrow box
  if (spanPct < 26) {
    fontSizePx = Math.min(fontSizePx, 7.0);
  } else if (spanPct < 34) {
    fontSizePx = Math.max(5.5, fontSizePx - 1.5);
  } else if (spanPct < 55 && safeLen > 12) {
    fontSizePx = Math.max(5.5, fontSizePx - 1);
  }
  if (!isVertical && safeW < 28) {
    fontSizePx = Math.min(fontSizePx, 7.0);
  }

  const paddingPx = thicknessPct < 14 ? 1 : thicknessPct < 22 ? 2 : 4;
  const lineHeight = fontSizePx <= 8 ? 1 : 1.15;

  return {
    fontSizePx,
    paddingPx,
    lineHeight,
  };
}

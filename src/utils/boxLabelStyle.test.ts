import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { computeBoxLabelStyle } from './boxLabelStyle.ts';

describe('computeBoxLabelStyle', () => {
  it('keeps standard 10px font for normal/wide boxes', () => {
    const res = computeBoxLabelStyle({
      widthPct: 28,
      heightPct: 90,
      orientation: 'vertical',
      nameLength: 14,
    });
    assert.equal(res.fontSizePx, 10);
    assert.equal(res.paddingPx, 4);
  });

  it('reduces font size and padding for narrow vertical spines', () => {
    const mediumNarrow = computeBoxLabelStyle({
      widthPct: 13.5, // ~4.5cm spine
      heightPct: 60,
      orientation: 'vertical',
      nameLength: 15,
    });
    assert.equal(mediumNarrow.fontSizePx, 7.5);
    assert.equal(mediumNarrow.paddingPx, 1);

    const veryNarrow = computeBoxLabelStyle({
      widthPct: 7.5, // ~2.5cm ultra-thin spine
      heightPct: 60,
      orientation: 'vertical',
      nameLength: 10,
    });
    assert.equal(veryNarrow.fontSizePx, 5.5);
    assert.equal(veryNarrow.paddingPx, 1);
  });

  it('reduces font size for thin horizontal stacked boxes and compact widths', () => {
    const thinStack = computeBoxLabelStyle({
      widthPct: 88,
      heightPct: 9.5, // ~3.2cm flat box
      orientation: 'horizontal',
      nameLength: 12,
    });
    assert.equal(thinStack.fontSizePx, 6.5);
    assert.equal(thinStack.paddingPx, 1);

    const narrowHorizontal = computeBoxLabelStyle({
      widthPct: 24,
      heightPct: 24,
      orientation: 'horizontal',
      nameLength: 10,
    });
    assert.equal(narrowHorizontal.fontSizePx, 7);
  });
});

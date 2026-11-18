import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  MIN_SHELF_ZOOM,
  MAX_SHELF_ZOOM,
  clampShelfZoom,
  stepShelfZoom,
  computeShelfFitLayout,
  computePinchZoomAndScroll,
} from './shelfZoom.ts';

describe('shelfZoom math utilities', () => {
  it('clamps zoom safely between min and max bounds', () => {
    assert.equal(clampShelfZoom(0.1), MIN_SHELF_ZOOM);
    assert.equal(clampShelfZoom(5.2), MAX_SHELF_ZOOM);
    assert.equal(clampShelfZoom(1.456), 1.46);
    assert.equal(clampShelfZoom(Number.NaN), 1);
  });

  it('steps zoom in and out cleanly without float drift', () => {
    let z = 1;
    z = stepShelfZoom(z, 'in');
    assert.equal(z, 1.2);
    z = stepShelfZoom(z, 'in');
    assert.equal(z, 1.4);
    z = stepShelfZoom(z, 'out');
    assert.equal(z, 1.2);
    z = stepShelfZoom(MIN_SHELF_ZOOM, 'out');
    assert.equal(z, MIN_SHELF_ZOOM);
    z = stepShelfZoom(MAX_SHELF_ZOOM, 'in');
    assert.equal(z, MAX_SHELF_ZOOM);
  });

  it('fits wide shelves (4 cols and 5 cols) inside smartphone portrait viewport without overflow', () => {
    // Typical Android portrait inner width: 336px
    const layout4Cols = computeShelfFitLayout({ viewportWidth: 336, cols: 4, isDesktop: false });
    assert.ok(layout4Cols.fitScale < 1);
    assert.ok(Math.round(layout4Cols.naturalShelfWidth * layout4Cols.fitScale) <= 336);

    const layout5Cols = computeShelfFitLayout({ viewportWidth: 336, cols: 5, isDesktop: false });
    assert.ok(layout5Cols.fitScale < 1);
    assert.ok(Math.round(layout5Cols.naturalShelfWidth * layout5Cols.fitScale) <= 336);

    // 2 cols on 366px iPhone portrait fits natively at 1:1
    const layout2Cols = computeShelfFitLayout({ viewportWidth: 366, cols: 2, isDesktop: false });
    assert.equal(layout2Cols.fitScale, 1);
    assert.equal(layout2Cols.naturalShelfWidth, 366);
  });

  it('computes 2-finger pinch zoom and keeps focal content anchored', () => {
    const res = computePinchZoomAndScroll({
      startZoom: 1,
      startScale: 0.65,
      startDist: 100,
      currentDist: 150,
      startScrollLeft: 0,
      startScrollTop: 0,
      startMidpointX: 130,
      startMidpointY: 65,
      currentMidpointX: 130,
      currentMidpointY: 65,
      fitScale: 0.65,
    });
    assert.equal(res.nextZoom, 1.5);
    assert.ok(Math.abs(res.nextScale - 0.975) < 0.001);
    // Point at contentX = 130 / 0.65 = 200 should now lie at scrollLeft + 130 = 200 * 0.975 = 195 => scrollLeft = 65
    assert.ok(Math.abs(res.nextScrollLeft - 65) < 0.01);
    assert.ok(Math.abs(res.nextScrollTop - 32.5) < 0.01);
  });

  it('allows 2-finger pinch-in to shrink shelf below default fit', () => {
    const res = computePinchZoomAndScroll({
      startZoom: 1,
      startScale: 1,
      startDist: 200,
      currentDist: 120,
      startScrollLeft: 0,
      startScrollTop: 0,
      startMidpointX: 150,
      startMidpointY: 150,
      currentMidpointX: 150,
      currentMidpointY: 150,
      fitScale: 1,
    });
    assert.equal(res.nextZoom, 0.6);
    assert.equal(res.nextScale, 0.6);
  });
});

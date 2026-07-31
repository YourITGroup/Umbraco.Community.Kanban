import { describe, it, expect } from 'vitest';
import {
  isZoomGesture,
  KANBAN_ZOOM_MAX,
  KANBAN_ZOOM_MIN,
  nextZoom,
  wheelDeltaPixels,
  zoomScrollOffset,
} from './zoom.model.js';

describe('isZoomGesture', () => {
  it('treats ctrl + wheel as zoom, which is also what a trackpad pinch arrives as', () => {
    expect(isZoomGesture({ ctrlKey: true, metaKey: false })).toBe(true);
  });

  it('treats cmd + wheel as zoom, so the browser does not spend it on zooming the backoffice', () => {
    expect(isZoomGesture({ ctrlKey: false, metaKey: true })).toBe(true);
  });

  it('leaves a plain wheel alone, which is a scroll', () => {
    expect(isZoomGesture({ ctrlKey: false, metaKey: false })).toBe(false);
  });
});

describe('wheelDeltaPixels', () => {
  it('passes a pixel delta through', () => {
    expect(wheelDeltaPixels(120, 0)).toBe(120);
  });

  it('converts a line delta, as Firefox reports', () => {
    expect(wheelDeltaPixels(3, 1)).toBe(48);
  });

  it('converts a page delta', () => {
    expect(wheelDeltaPixels(-1, 2)).toBe(-400);
  });
});

describe('nextZoom', () => {
  it('zooms in when the wheel is pushed away from the user', () => {
    expect(nextZoom(1, -100)).toBeGreaterThan(1);
  });

  it('zooms out when the wheel is pulled towards the user', () => {
    expect(nextZoom(1, 100)).toBeLessThan(1);
  });

  it('is proportional, so a notch in and the same notch out cancel out', () => {
    // The point of the exponential: a fixed additive step would not come back to where it started, and
    // would feel coarse when zoomed out and glacial when zoomed in.
    expect(nextZoom(nextZoom(1, -100), 100)).toBe(1);
    expect(nextZoom(nextZoom(0.6, -100), 100)).toBe(0.6);
  });

  it('clamps rather than running away at either end', () => {
    expect(nextZoom(KANBAN_ZOOM_MIN, 5000)).toBe(KANBAN_ZOOM_MIN);
    expect(nextZoom(KANBAN_ZOOM_MAX, -5000)).toBe(KANBAN_ZOOM_MAX);
  });

  it('still moves for the small deltas a trackpad pinch sends', () => {
    // Rounded, but not so coarsely that a gentle pinch rounds away to nothing and the gesture sticks.
    expect(nextZoom(1, -2)).toBeGreaterThan(1);
  });
});

describe('zoomScrollOffset', () => {
  it('keeps the content under the pointer under the pointer when zooming in', () => {
    // The pointer sits 100px into the viewport with the canvas already scrolled 100px, so it is over
    // canvas coordinate 200. At double the scale that coordinate is at 400, which must still show 100px
    // in: scroll 300.
    expect(zoomScrollOffset({ scroll: 100, pointerOffset: 100, from: 1, to: 2 })).toBe(300);
  });

  it('keeps the content under the pointer under the pointer when zooming out', () => {
    expect(zoomScrollOffset({ scroll: 300, pointerOffset: 100, from: 2, to: 1 })).toBe(100);
  });

  it('anchors from a canvas already zoomed, not only from 1', () => {
    expect(zoomScrollOffset({ scroll: 60, pointerOffset: 40, from: 0.5, to: 1 })).toBe(160);
  });

  it('does not move the scroll when the scale does not change', () => {
    expect(zoomScrollOffset({ scroll: 137, pointerOffset: 42, from: 1.25, to: 1.25 })).toBe(137);
  });

  it('never returns a negative offset, which the browser would clamp behind our back', () => {
    expect(zoomScrollOffset({ scroll: 0, pointerOffset: 200, from: 1, to: 0.5 })).toBe(0);
  });
});

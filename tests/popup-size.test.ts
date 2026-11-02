import { describe, expect, it } from 'vitest';
import { popupDimensions } from '../src/ui/popup-size';
describe('Chrome popup intrinsic dimensions', () => {
  it.each([
    { width: 1, height: 1 },
    { width: 32, height: 16 },
    { width: 384, height: 560 },
  ])('never uses the initial extension viewport %j', (viewport) => {
    expect(popupDimensions(true, { width: 1366, height: 768 }, viewport)).toEqual({
      width: 384,
      height: 560,
    });
  });
  it('adapts extension dimensions to available screen, not popup viewport', () => {
    expect(popupDimensions(true, { width: 320, height: 480 }, { width: 32, height: 16 })).toEqual({
      width: 288,
      height: 300,
    });
  });
  it('keeps web preview dimensions responsive', () => {
    expect(
      popupDimensions(false, { width: 1366, height: 768 }, { width: 320, height: 320 }),
    ).toEqual({ width: 320, height: 320 });
  });
});

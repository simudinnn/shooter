const SIZES = [8, 16, 24, 32];

/** Preload GamePixel (from assets/fonts/ascii.png) so HUD text is not monospace fallback. */
export function preloadPixelFont() {
  if (!document.fonts?.load) return Promise.resolve();
  return Promise.all(
    SIZES.map((px) => document.fonts.load(`${px}px GamePixel`)),
  ).catch(() => {});
}

preloadPixelFont();

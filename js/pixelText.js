const ATLAS_SRC = 'assets/fonts/ascii.png';
const CELL = 8;
const COLS = 16;
const SPACE_ADVANCE_PX = 4;
const TRAIL_PAD_PX = 1;

/** Default on-screen scale for atlas text (8px cell height × scale). */
export const PIXEL_TEXT_SCALE = 3;
export const PIXEL_TEXT_SCALE_SM = 2;
export const PIXEL_TEXT_SCALE_XS = 2;
const TEXT_SHADOW_OFFSET = 2;
const LINE_GAP_PX = 1;

let atlas = null;
let atlasPromise = null;
/** @type {Map<number, number> | null} */
let advances = null;

function isInk(r, g, b, a) {
  if (a < 32) return false;
  return (r + g + b) / 3 > 64;
}

function initAdvances(img) {
  const probe = document.createElement('canvas');
  probe.width = CELL;
  probe.height = CELL;
  const g = probe.getContext('2d');
  if (!g) return;
  const table = new Map();
  for (let code = 0; code < 256; code++) {
    if (code === 32) {
      table.set(code, SPACE_ADVANCE_PX);
      continue;
    }
    const col = code % COLS;
    const row = Math.floor(code / COLS);
    g.clearRect(0, 0, CELL, CELL);
    g.drawImage(img, col * CELL, row * CELL, CELL, CELL, 0, 0, CELL, CELL);
    const data = g.getImageData(0, 0, CELL, CELL).data;
    let maxX = -1;
    for (let y = 0; y < CELL; y++) {
      for (let x = 0; x < CELL; x++) {
        const i = (y * CELL + x) * 4;
        if (isInk(data[i], data[i + 1], data[i + 2], data[i + 3])) maxX = Math.max(maxX, x);
      }
    }
    if (maxX < 0) table.set(code, 4);
    else table.set(code, maxX + 1 + TRAIL_PAD_PX);
  }
  advances = table;
}

function loadAtlas() {
  if (atlas) return Promise.resolve(atlas);
  if (!atlasPromise) {
    atlasPromise = new Promise((resolve, reject) => {
      const img = new Image();
      img.decoding = 'sync';
      img.onload = () => {
        atlas = img;
        initAdvances(img);
        resolve(atlas);
      };
      img.onerror = reject;
      img.src = ATLAS_SRC;
    });
  }
  return atlasPromise;
}

function charAdvance(ch, scale) {
  const code = ch.charCodeAt(0) & 255;
  const base = advances?.get(code) ?? (code === 32 ? SPACE_ADVANCE_PX : CELL);
  return base * scale;
}

function drawGlyphRun(ctx, text, scale, img, offsetX, offsetY, { shadow = false } = {}) {
  let x = offsetX;
  const height = CELL * scale;
  for (const ch of text) {
    if (ch !== ' ') {
      const code = ch.charCodeAt(0) & 255;
      const sx = (code % COLS) * CELL;
      const sy = Math.floor(code / COLS) * CELL;
      if (shadow) {
        ctx.filter = 'brightness(0)';
        ctx.globalAlpha = 0.88;
        ctx.drawImage(img, sx, sy, CELL, CELL, x, offsetY, CELL * scale, height);
        ctx.filter = 'none';
        ctx.globalAlpha = 1;
      } else {
        ctx.drawImage(img, sx, sy, CELL, CELL, x, offsetY, CELL * scale, height);
      }
    }
    x += charAdvance(ch, scale);
  }
}

/** @param {string} text */
export function measurePixelText(text, scale = PIXEL_TEXT_SCALE) {
  let width = 0;
  for (const ch of text) width += charAdvance(ch, scale);
  const pad = TEXT_SHADOW_OFFSET * scale;
  return { width: Math.max(1, width + pad), height: CELL * scale + pad };
}

function wrapPixelLines(text, maxWidth, scale) {
  const words = String(text).split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const lines = [];
  let current = '';
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (measurePixelText(next, scale).width <= maxWidth) {
      current = next;
      continue;
    }
    if (current) lines.push(current);
    if (measurePixelText(word, scale).width > maxWidth) {
      let chunk = '';
      for (const ch of word) {
        const probe = chunk + ch;
        if (measurePixelText(probe, scale).width > maxWidth && chunk) {
          lines.push(chunk);
          chunk = ch;
        } else {
          chunk = probe;
        }
      }
      current = chunk;
    } else {
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

/** @param {string} text */
export function renderWrappedPixelTextCanvas(text, maxWidth, scale = PIXEL_TEXT_SCALE, img = atlas) {
  const lines = wrapPixelLines(text, maxWidth, scale);
  if (!lines.length) return renderPixelTextCanvas('', scale, img);
  const lineHeight = CELL * scale + LINE_GAP_PX * scale;
  const shadowPad = TEXT_SHADOW_OFFSET * scale;
  let width = 0;
  for (const line of lines) {
    width = Math.max(width, measurePixelText(line, scale).width);
  }
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, width);
  canvas.height = Math.max(1, lines.length * lineHeight + shadowPad);
  const ctx = canvas.getContext('2d');
  if (!ctx || !img) return canvas;
  ctx.imageSmoothingEnabled = false;
  lines.forEach((line, i) => {
    const y = i * lineHeight;
    drawGlyphRun(ctx, line, scale, img, shadowPad, y + shadowPad, { shadow: true });
    drawGlyphRun(ctx, line, scale, img, 0, y, { shadow: false });
  });
  return canvas;
}

/** Replace element contents with wrapped atlas text. */
export function setElementWrappedPixelText(el, text, maxWidth, scale = PIXEL_TEXT_SCALE) {
  if (!el) return;
  el.textContent = '';
  el.style.color = 'transparent';
  el.style.fontSize = '0';
  el.style.lineHeight = '0';
  if (!text) return;
  const img = document.createElement('img');
  img.className = 'inv-pixel-text-img';
  img.alt = '';
  img.draggable = false;
  img.decoding = 'sync';
  const apply = () => {
    img.src = renderWrappedPixelTextCanvas(text, maxWidth, scale).toDataURL('image/png');
    img.style.maxWidth = '100%';
    img.style.height = 'auto';
  };
  if (atlas && advances) apply();
  else loadAtlas().then(apply).catch(() => {});
  el.appendChild(img);
}

/** @param {string} text */
export function renderPixelTextCanvas(text, scale = PIXEL_TEXT_SCALE, img = atlas) {
  const { width, height } = measurePixelText(text, scale);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx || !img) return canvas;
  ctx.imageSmoothingEnabled = false;
  const shadowOff = TEXT_SHADOW_OFFSET * scale;
  drawGlyphRun(ctx, text, scale, img, shadowOff, shadowOff, { shadow: true });
  drawGlyphRun(ctx, text, scale, img, 0, 0, { shadow: false });
  return canvas;
}

/** @param {string} text */
export function createPixelTextImg(text, scale = PIXEL_TEXT_SCALE) {
  const img = document.createElement('img');
  img.className = 'inv-pixel-text-img';
  img.alt = '';
  img.draggable = false;
  img.decoding = 'sync';
  const apply = () => {
    img.src = renderPixelTextCanvas(text, scale).toDataURL('image/png');
  };
  if (atlas && advances) apply();
  else loadAtlas().then(apply).catch(() => {});
  return img;
}

/** Replace element contents with colored atlas text. */
export function setElementPixelText(el, text, scale = PIXEL_TEXT_SCALE) {
  if (!el) return;
  el.textContent = '';
  el.style.color = 'transparent';
  el.style.fontSize = '0';
  el.style.lineHeight = '0';
  if (!text) return;
  el.appendChild(createPixelTextImg(text, scale));
}

/** Draw atlas text on a 2D canvas (world/HUD). */
export function drawPixelText(ctx, text, x, y, scale = PIXEL_TEXT_SCALE, align = 'left') {
  if (!ctx || !text || !atlas) return;
  const { width } = measurePixelText(text, scale);
  let penX = x;
  if (align === 'center') penX = x - width * 0.5;
  else if (align === 'right') penX = x - width;
  const shadowOff = TEXT_SHADOW_OFFSET * scale;
  ctx.imageSmoothingEnabled = false;
  drawGlyphRun(ctx, text, scale, atlas, Math.round(penX) + shadowOff, Math.round(y) + shadowOff, { shadow: true });
  drawGlyphRun(ctx, text, scale, atlas, Math.round(penX), Math.round(y), { shadow: false });
}

export function preloadPixelTextAtlas() {
  return loadAtlas();
}

preloadPixelTextAtlas();

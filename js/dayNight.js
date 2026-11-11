/** In-game day length: 1 real second = 1 game minute (full day in 24 minutes). */
export const MINUTES_PER_DAY = 24 * 60;
const START_MINUTES = 12 * 60;

/** Dawn fade — sun rises 04:00 → 06:00. */
const DAWN_START_H = 4;
const DAWN_END_H = 6;
/** Dusk fade — darkens 19:00 → 21:00. */
const DUSK_START_H = 19;
const DUSK_END_H = 21;

export class DayNightCycle {
  constructor() {
    this.timeMinutes = START_MINUTES;
    this.day = 1;
  }

  reset() {
    this.timeMinutes = START_MINUTES;
    this.day = 1;
  }

  update(dt) {
    const prev = this.timeMinutes;
    this.timeMinutes = (this.timeMinutes + dt) % MINUTES_PER_DAY;
    if (this.timeMinutes < 0) this.timeMinutes += MINUTES_PER_DAY;
    if (this.timeMinutes < prev) this.day += 1;
  }

  getHours() {
    return Math.floor(this.timeMinutes / 60) % 24;
  }

  getMinutes() {
    return Math.floor(this.timeMinutes % 60);
  }

  formatClock() {
    const h = this.getHours();
    const m = this.getMinutes();
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  formatDay() {
    return `Day ${this.day}`;
  }

  /** 0 = full daylight, 1 = deepest night. */
  getNightFactor() {
    const h = this.timeMinutes / 60;
    if (h >= DAWN_START_H && h < DAWN_END_H) {
      return 1 - (h - DAWN_START_H) / (DAWN_END_H - DAWN_START_H);
    }
    if (h >= DAWN_END_H && h < DUSK_START_H) return 0;
    if (h >= DUSK_START_H && h < DUSK_END_H) {
      return (h - DUSK_START_H) / (DUSK_END_H - DUSK_START_H);
    }
    return 1;
  }
}

/** Darken the scene — subtle cool tint, mostly darkness. */
export function applyNightOverlay(ctx, w, h, nightFactor) {
  if (nightFactor <= 0.01) return;
  ctx.save();
  ctx.fillStyle = `rgba(0, 1, 6, ${nightFactor * 0.78})`;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = `rgba(18, 24, 38, ${nightFactor * 0.1})`;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

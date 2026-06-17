/** In-game day length: 1 real second = 1 game minute (full day in 24 minutes). */
export const MINUTES_PER_DAY = 24 * 60;
const START_MINUTES = 12 * 60;

export class DayNightCycle {
  constructor() {
    this.timeMinutes = START_MINUTES;
  }

  reset() {
    this.timeMinutes = START_MINUTES;
  }

  update(dt) {
    this.timeMinutes = (this.timeMinutes + dt) % MINUTES_PER_DAY;
    if (this.timeMinutes < 0) this.timeMinutes += MINUTES_PER_DAY;
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

  /** 0 = daylight, 1 = deepest night. */
  getNightFactor() {
    const dayT = this.timeMinutes / MINUTES_PER_DAY;
    const sun = Math.cos((dayT - 0.5) * Math.PI * 2);
    if (sun > -0.12) return 0;
    return Math.min(1, Math.max(0, (-sun - 0.12) / 0.88));
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

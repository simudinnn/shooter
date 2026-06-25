import { TILE } from './worldGen.js';
import { getItemSpriteName, getItemDisplayName } from './loot.js';
import { normalizeAmmoItem } from './ammo.js';
import { normalizeMaterialItem } from './materials.js';

export const GROUND_DROP_INTERACT_DIST = 2.4;
/** Logical pixel resolution of the downsampled ground-item bitmap (16→10 nearest-neighbor). */
export const GROUND_DROP_RES_PX = 10;
/** On-screen size — integer upscale of RES bitmap (10×1.6 ≈ chunky 16px). */
export const GROUND_DROP_DISPLAY_PX = 16;
export const GROUND_DROP_MIN_SEP = 0.62;
export const GROUND_DROP_MAX = 64;

function cloneItem(item) {
  if (!item) return null;
  if (item.kind === 'ammo') return normalizeAmmoItem({ ...item });
  if (item.kind === 'material') return normalizeMaterialItem({ ...item });
  if (item.kind === 'bandage') return { kind: 'bandage', amount: item.amount ?? 1 };
  if (item.kind === 'weapon') return { kind: 'weapon', key: item.key, ammo: item.ammo };
  if (item.kind === 'melee') return { kind: 'melee', key: item.key };
  return { ...item };
}

export class GroundDropManager {
  constructor(world) {
    this.world = world;
    this.drops = [];
  }

  _isDropPointClear(x, z) {
    if (this.world.checkCollision(x, z, 0.22)) return false;
    for (const drop of this.drops) {
      if (Math.hypot(drop.x - x, drop.z - z) < GROUND_DROP_MIN_SEP) return false;
    }
    return true;
  }

  /** Find a clear spot near the requested world point (spiral from player). */
  _resolveDropPoint(px, pz, player) {
    const maxFromPlayer = 2.6;
    let x = px;
    let z = pz;
    if (player) {
      const dx = x - player.x;
      const dz = z - player.z;
      const d = Math.hypot(dx, dz) || 1;
      if (d > maxFromPlayer) {
        x = player.x + (dx / d) * maxFromPlayer;
        z = player.z + (dz / d) * maxFromPlayer;
      }
    }
    const tests = [
      { x, z },
      { x: player?.x ?? x, z: player?.z ?? z },
    ];
    for (let ring = 0; ring < 6; ring++) {
      const r = 0.35 + ring * 0.28;
      for (let a = 0; a < 8; a++) {
        const ang = (a / 8) * Math.PI * 2;
        tests.push({
          x: (player?.x ?? x) + Math.sin(ang) * r,
          z: (player?.z ?? z) + Math.cos(ang) * r,
        });
      }
    }
    for (const t of tests) {
      if (this._isDropPointClear(t.x, t.z)) {
        return { x: t.x, z: t.z };
      }
    }
    return { x: player?.x ?? x, z: player?.z ?? z };
  }

  dropAt(x, z, item, player) {
    const cloned = cloneItem(item);
    if (!cloned) return null;
    const pos = this._resolveDropPoint(x, z, player);
    const drop = {
      x: pos.x,
      z: pos.z,
      item: cloned,
      sprite: getItemSpriteName(cloned),
      label: getItemDisplayName(cloned),
      sortZ: pos.z + TILE * 0.12,
      bobPhase: Math.random() * Math.PI * 2,
    };
    this.drops.push(drop);
    while (this.drops.length > GROUND_DROP_MAX) this.drops.shift();
    return drop;
  }

  remove(drop) {
    const i = this.drops.indexOf(drop);
    if (i >= 0) this.drops.splice(i, 1);
  }

  getNearby(player, maxDist = GROUND_DROP_INTERACT_DIST) {
    let best = null;
    let bestD = maxDist + player.radius;
    for (const drop of this.drops) {
      const d = Math.hypot(player.x - drop.x, player.z - drop.z);
      if (d < bestD) {
        bestD = d;
        best = drop;
      }
    }
    return best;
  }

  isInPickupRange(player, drop) {
    return Math.hypot(player.x - drop.x, player.z - drop.z) <= GROUND_DROP_INTERACT_DIST + player.radius;
  }

  getHovered(mouse, game) {
    if (!this.drops.length) return null;
    let best = null;
    let bestD = Infinity;
    const hitR = GROUND_DROP_DISPLAY_PX * 0.85 + 4;
    for (const drop of this.drops) {
      const s = game._worldToScreen(drop.x, drop.z);
      const dx = mouse.sx - s.x;
      const dy = mouse.sy - s.y;
      const d = dx * dx + dy * dy;
      if (d > hitR * hitR) continue;
      if (d < bestD) {
        bestD = d;
        best = drop;
      }
    }
    return best;
  }

  stackAmount(item) {
    if (item?.kind === 'ammo') return item.amount ?? 0;
    if (item?.kind === 'bandage' || item?.kind === 'material') return item.amount ?? 1;
    return 0;
  }
}
